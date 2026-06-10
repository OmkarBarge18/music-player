class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;

        // Dual audio elements for gapless and crossfaded playback
        this.audioA = new Audio();
        this.audioB = new Audio();
        this.audioA.crossOrigin = "anonymous";
        this.audioB.crossOrigin = "anonymous";

        this.activeAudio = this.audioA;
        this.inactiveAudio = this.audioB;

        // Routing nodes
        this.srcA = this.ctx.createMediaElementSource(this.audioA);
        this.srcB = this.ctx.createMediaElementSource(this.audioB);

        this.gainA = this.ctx.createGain();
        this.gainB = this.ctx.createGain();
        this.mainGain = this.ctx.createGain(); // Controls master volume + ReplayGain

        // Equalizer bands (60Hz, 230Hz, 910Hz, 4kHz, 14kHz)
        this.eqFrequencies = [60, 230, 910, 4000, 14000];
        this.filters = this.eqFrequencies.map(freq => {
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1.0;
            filter.gain.value = 0; // Flat response initially
            return filter;
        });

        // Web Audio Routing Connections:
        // AudioA -> GainA \
        //                   --> EQ [0] -> EQ [1] -> EQ [2] -> EQ [3] -> EQ [4] -> Analyser -> MainGain -> Speakers
        // AudioB -> GainB /
        this.srcA.connect(this.gainA);
        this.srcB.connect(this.gainB);

        this.gainA.connect(this.filters[0]);
        this.gainB.connect(this.filters[0]);

        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }

        this.filters[this.filters.length - 1].connect(this.analyser);
        this.analyser.connect(this.mainGain);
        this.mainGain.connect(this.ctx.destination);

        // State variables
        this.volume = 0.8;
        this.replayGainDB = 0;
        this.crossfadeDuration = 4; // default 4 seconds
        this.isFading = false;
        this.playRate = 1.0;
        this.sleepTimeoutId = null;

        // Initialize gain states
        this.gainA.gain.value = 1.0;
        this.gainB.gain.value = 0.0;
        this.updateMasterVolume();

        // Audio state unlock on first user gesture
        document.body.addEventListener('click', () => {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }, { once: true });
    }

    // Set master volume combined with ReplayGain normalization
    updateMasterVolume() {
        // ReplayGain adjustment formula: gain = 10^(db_change / 20)
        const rgMultiplier = Math.pow(10, this.replayGainDB / 20);
        const targetGain = this.volume * rgMultiplier;
        
        // Set gain with smooth exponential ramp
        this.mainGain.gain.setValueAtTime(this.mainGain.gain.value, this.ctx.currentTime);
        this.mainGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetGain), this.ctx.currentTime + 0.1);
    }

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        this.updateMasterVolume();
    }

    setReplayGain(db) {
        this.replayGainDB = db || 0;
        this.updateMasterVolume();
    }

    setPlaybackSpeed(speed) {
        this.playRate = speed;
        this.audioA.playbackRate = speed;
        this.audioB.playbackRate = speed;
    }

    setEQBand(index, gain) {
        if (this.filters[index]) {
            this.filters[index].gain.setValueAtTime(gain, this.ctx.currentTime);
        }
    }

    applyEQPreset(presetGains) {
        presetGains.forEach((gain, index) => {
            this.setEQBand(index, gain);
        });
    }

    setBitPerfectMode(enabled) {
        if (enabled) {
            // Bit-perfect bypasses equalizer, sets volumes exactly, and resets EQ to flat
            this.filters.forEach(filter => {
                filter.gain.setValueAtTime(0, this.ctx.currentTime);
            });
            this.setReplayGain(0);
        }
    }

    async setOutputDevice(deviceId) {
        try {
            if (this.audioA.setSinkId) await this.audioA.setSinkId(deviceId);
            if (this.audioB.setSinkId) await this.audioB.setSinkId(deviceId);
            return true;
        } catch (err) {
            console.error("Error setting output device destination:", err);
            return false;
        }
    }

    loadTrack(src, replayGain = 0) {
        if (this.isFading) return; // Prevent loading during active crossfade
        
        this.replayGainDB = replayGain;
        this.updateMasterVolume();

        this.activeAudio.src = src;
        this.activeAudio.load();
        this.activeAudio.playbackRate = this.playRate;
    }

    play() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.activeAudio.play();
    }

    pause() {
        this.activeAudio.pause();
    }

    // Triggers crossfade to a new track source
    crossfadeTo(nextSrc, nextReplayGain = 0, onCompleteCallback = null) {
        if (this.isFading) return;
        this.isFading = true;

        const fadeTime = this.crossfadeDuration;
        const now = this.ctx.currentTime;

        // Set up the inactive player
        this.inactiveAudio.src = nextSrc;
        this.inactiveAudio.load();
        this.inactiveAudio.playbackRate = this.playRate;

        // Start playing the incoming track silently
        this.inactiveAudio.volume = 1; // Always keep element volume at 1, let Web Audio GainNode manage the crossfade
        
        // Reset gain states explicitly
        this.gainA.gain.setValueAtTime(this.activeAudio === this.audioA ? 1.0 : 0.0, now);
        this.gainB.gain.setValueAtTime(this.activeAudio === this.audioB ? 1.0 : 0.0, now);

        this.inactiveAudio.play().then(() => {
            // Apply ReplayGain update to the master channel for the incoming track
            this.replayGainDB = nextReplayGain;
            this.updateMasterVolume();

            // Perform the crossfade curves
            if (this.activeAudio === this.audioA) {
                // Fade out A, Fade in B
                this.gainA.gain.linearRampToValueAtTime(0.0, now + fadeTime);
                this.gainB.gain.linearRampToValueAtTime(1.0, now + fadeTime);
            } else {
                // Fade out B, Fade in A
                this.gainB.gain.linearRampToValueAtTime(0.0, now + fadeTime);
                this.gainA.gain.linearRampToValueAtTime(1.0, now + fadeTime);
            }

            // After crossfade completes:
            setTimeout(() => {
                this.activeAudio.pause();
                
                // Swap active and inactive pointers
                const temp = this.activeAudio;
                this.activeAudio = this.inactiveAudio;
                this.inactiveAudio = temp;
                
                this.isFading = false;
                
                if (onCompleteCallback) {
                    onCompleteCallback();
                }
            }, fadeTime * 1000);
        }).catch(err => {
            console.error("Crossfade playback start failed, forcing direct swap:", err);
            this.isFading = false;
            this.activeAudio.pause();
            this.activeAudio = this.inactiveAudio;
            this.activeAudio.src = nextSrc;
            this.activeAudio.load();
            this.activeAudio.play();
            if (onCompleteCallback) onCompleteCallback();
        });
    }

    // Sleep timer with volume fade-out
    startSleepTimer(minutes, onComplete) {
        if (this.sleepTimeoutId) {
            clearTimeout(this.sleepTimeoutId);
        }

        const msTime = minutes * 60 * 1000;
        const fadeStartTime = Math.max(0, msTime - 10000); // Start fading 10s before timer finishes

        this.sleepTimeoutId = setTimeout(() => {
            // Start 10s volume fade out
            const now = this.ctx.currentTime;
            this.mainGain.gain.setValueAtTime(this.mainGain.gain.value, now);
            this.mainGain.gain.linearRampToValueAtTime(0.0001, now + 10);

            // Turn off playback completely at end
            setTimeout(() => {
                this.pause();
                this.setVolume(this.volume); // Reset volume gain
                if (onComplete) onComplete();
            }, 10000);

        }, fadeStartTime);
    }

    cancelSleepTimer() {
        if (this.sleepTimeoutId) {
            clearTimeout(this.sleepTimeoutId);
            this.sleepTimeoutId = null;
            this.updateMasterVolume();
        }
    }
}
window.AudioEngine = AudioEngine;
