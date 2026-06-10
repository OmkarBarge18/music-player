// --- FRONT-END ROUTING & CONTROL ENGINE (3-COLUMN CONSOLE) ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // UX detailing states
    let showRemainingTime = false;
    let lastVolume = 80;
    let isMuted = false;

    // Support extensions list for browser file picker fallback
    const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.opus', '.m4a'];

    // 1. Audio Engine Setup
    const audioEngine = new AudioEngine();

    // Focus Mode DOM Elements
    const focusModeBtn = document.getElementById('focusModeBtn');
    const exitFocusBtn = document.getElementById('exitFocusBtn');
    const focusModeOverlay = document.getElementById('focusModeOverlay');
    const focusModeBg = document.getElementById('focusModeBg');
    const focusArtwork = document.getElementById('focusArtwork');
    const focusTitle = document.getElementById('focus-title');
    const focusArtist = document.getElementById('focus-artist');
    const focusProgressBar = document.getElementById('focusProgressBar');
    const focusProgressFill = document.getElementById('focusProgressFill');
    const focusTimeCurrent = document.getElementById('focus-time-current');
    const focusTimeTotal = document.getElementById('focus-time-total');
    
    const focusPlayPauseBtn = document.getElementById('focusPlayPauseBtn');
    const focusPrevBtn = document.getElementById('focusPrevBtn');
    const focusNextBtn = document.getElementById('focusNextBtn');
    const focusShuffleBtn = document.getElementById('focusShuffleBtn');
    const focusRepeatBtn = document.getElementById('focusRepeatBtn');
    
    // Heart/Like button control
    const likeBtn = document.getElementById('likeBtn');

    // Bottom bar Queue & Lyrics page router bindings
    const barQueueBtn = document.getElementById('barQueueBtn');
    const barLyricsBtn = document.getElementById('barLyricsBtn');

    if (barQueueBtn) {
        barQueueBtn.addEventListener('click', () => {
            switchView('queue');
            navItems.forEach(n => n.classList.remove('active'));
            const qItem = Array.from(navItems).find(n => n.getAttribute('data-view') === 'queue');
            if (qItem) qItem.classList.add('active');
        });
    }

    if (barLyricsBtn) {
        barLyricsBtn.addEventListener('click', () => {
            switchView('lyrics');
            navItems.forEach(n => n.classList.remove('active'));
            const lItem = Array.from(navItems).find(n => n.getAttribute('data-view') === 'lyrics');
            if (lItem) lItem.classList.add('active');
        });
    }

    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            likeBtn.classList.toggle('liked');
            const isLiked = likeBtn.classList.contains('liked');
            likeBtn.innerHTML = isLiked ? '<i data-lucide="heart" fill="var(--accent)" style="color:var(--accent)"></i>' : '<i data-lucide="heart"></i>';
            lucide.createIcons();
        });
    }

    if (focusModeBtn) {
        focusModeBtn.addEventListener('click', () => {
            if (focusModeOverlay) {
                focusModeOverlay.classList.remove('hidden');
                document.body.classList.add('focus-mode-active');
                syncFocusModeDetails();
            }
        });
    }

    if (exitFocusBtn) {
        exitFocusBtn.addEventListener('click', () => {
            if (focusModeOverlay) {
                focusModeOverlay.classList.add('hidden');
                document.body.classList.remove('focus-mode-active');
            }
        });
    }

    function syncFocusModeDetails() {
        if (!focusModeOverlay || focusModeOverlay.classList.contains('hidden')) return;
        const currentTrack = playlistQueue[currentTrackIndex];
        if (!currentTrack) return;
        
        const title = currentTrack.title || currentTrack.name;
        const artist = currentTrack.artist || 'Unknown Artist';
        const artUrl = (currentTrack.id && !currentTrack.id.startsWith('web-')) ? `/api/tracks/${currentTrack.id}/art` : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=250&h=250&q=80';
        
        if (focusTitle) focusTitle.textContent = title;
        if (focusArtist) focusArtist.textContent = artist;
        if (focusArtwork) focusArtwork.src = artUrl;
        if (focusModeBg) focusModeBg.style.backgroundImage = `url('${artUrl}')`;
        
        updateFocusControlsUI();
    }

    function updateFocusControlsUI() {
        if (!focusModeOverlay || focusModeOverlay.classList.contains('hidden')) return;
        if (focusPlayPauseBtn) {
            focusPlayPauseBtn.innerHTML = window.isPlaying ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
        }
        if (focusShuffleBtn) {
            focusShuffleBtn.classList.toggle('active', isShuffle);
            focusShuffleBtn.style.color = isShuffle ? 'var(--accent)' : 'rgba(255,255,255,0.6)';
        }
        if (focusRepeatBtn) {
            focusRepeatBtn.classList.toggle('active', repeatMode !== 'none');
            focusRepeatBtn.style.color = repeatMode !== 'none' ? 'var(--accent)' : 'rgba(255,255,255,0.6)';
        }
        lucide.createIcons();
    }

    if (focusPlayPauseBtn) {
        focusPlayPauseBtn.addEventListener('click', () => {
            playBtn.click();
            setTimeout(updateFocusControlsUI, 50);
        });
    }
    if (focusPrevBtn) {
        focusPrevBtn.addEventListener('click', () => {
            prevBtn.click();
            setTimeout(syncFocusModeDetails, 100);
        });
    }
    if (focusNextBtn) {
        focusNextBtn.addEventListener('click', () => {
            nextBtn.click();
            setTimeout(syncFocusModeDetails, 100);
        });
    }
    if (focusShuffleBtn) {
        focusShuffleBtn.addEventListener('click', () => {
            shuffleBtn.click();
            setTimeout(updateFocusControlsUI, 50);
        });
    }
    if (focusRepeatBtn) {
        focusRepeatBtn.addEventListener('click', () => {
            repeatBtn.click();
            setTimeout(updateFocusControlsUI, 50);
        });
    }


    // Global application state queues
    let playlistQueue = [];
    let currentTrackIndex = -1;
    let isShuffle = false;
    let repeatMode = 'none'; // 'none', 'one', 'all'
    let isCrossfadeTriggered = false;

    // Real-time synchronization state
    let ws = null;
    let currentRoom = null;
    let isSyncHost = false;

    // User session profile state
    let currentUser = null;
    let availableUsers = [];

    // Core DOM Elements
    const views = document.querySelectorAll('.subview');
    const navItems = document.querySelectorAll('.nav-item');
    const playBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    
    // Now playing displays (Left Sidebar Card)
    const titleLeft = document.getElementById('ui-title');
    const artistLeft = document.getElementById('ui-artist');
    const formatLeft = document.getElementById('ui-format');
    
    // Now playing displays (Bottom Footer Bar)
    const titleFooter = document.getElementById('footer-title');
    const artistFooter = document.getElementById('footer-artist');

    // Scrubber elements
    const progressFill = document.getElementById('progressFill');
    const progressBar = document.getElementById('uiProgressBar');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    
    // Volume & Speed sliders
    const volumeSlider = document.getElementById('volumeSlider');
    const speedSelector = document.getElementById('playbackSpeedSelector');
    const volumeIcon = document.getElementById('volumeIcon');
    const capsuleArt = document.querySelector('.capsule-left');
    
    // Floating panels triggers
    const sleepBtn = document.getElementById('sleepTimerBtn');
    const eqToggleBtn = document.getElementById('eqToggleBtn');
    
    // File inputs
    const addFolderBtn = document.getElementById('addFolderBtn');
    const settingsAddFolderBtn = document.getElementById('settingsAddFolderBtn');
    const webFolderInput = document.getElementById('webFolderInput');

    // Windows Titlebar button events
    const appTitleBar = document.getElementById('appTitleBar');
    const winMinBtn = document.getElementById('winMinBtn');
    const winMaxBtn = document.getElementById('winMaxBtn');
    const winCloseBtn = document.getElementById('winCloseBtn');

    // Detect Electron environment
    const isElectron = !!window.electronAPI;
    if (isElectron) {
        winMinBtn.addEventListener('click', () => window.electronAPI.minimize());
        winMaxBtn.addEventListener('click', () => window.electronAPI.maximize());
        winCloseBtn.addEventListener('click', () => window.electronAPI.close());
    } else {
        // Hide native frame title bar if opened in web browser
        appTitleBar.style.display = 'none';
        document.querySelector('.app-container').style.paddingTop = '0px';
    }



    // --- VIEW SWITCHER ROUTING ---
    let previousView = 'home';
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            switchView(targetView);
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    function switchView(viewId) {
        if (viewId !== 'nowplaying') {
            previousView = viewId;
        }
        views.forEach(v => v.classList.remove('active'));
        const activeView = document.getElementById(`view-${viewId}`);
        if (activeView) {
            activeView.classList.add('active');
            // Trigger subview updates
            if (viewId === 'stats') loadStatsDashboard();
            if (viewId === 'playlists') loadPlaylistsLayout();
            if (viewId === 'audiobooks') loadAudiobooksLayout();
            if (viewId === 'settings') loadSettingsLayout();
        }
    }

    // --- UNIVERSAL FILE/DIRECTORY SCANNING BACKFALL ---
    
    // Bind Add Folder buttons
    [addFolderBtn, settingsAddFolderBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (isElectron) {
                    // Electron native IPC dialogue picker
                    window.electronAPI.openFolder().then(scannedTracks => {
                        if (scannedTracks && scannedTracks.length > 0) {
                            playlistQueue = scannedTracks;
                            renderQueueSidebar();
                            triggerSearch(); // Reload Search table
                        }
                    });
                } else {
                    // Standard web browser fallback trigger hidden file input selector
                    webFolderInput.click();
                }
            });
        }
    });

    // Handle web browser directory files selection
    webFolderInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const webTracks = Array.from(files).filter(file => {
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            return SUPPORTED_EXTENSIONS.includes(ext);
        }).map((file, idx) => {
            const ext = file.name.substring(file.name.lastIndexOf('.'));
            return {
                id: `web-${idx}-${Date.now()}`,
                title: file.name.replace(/\.[^/.]+$/, ""),
                name: file.name.replace(/\.[^/.]+$/, ""),
                artist: 'Local Browser File',
                album: 'Imported Folder',
                path: URL.createObjectURL(file), // Generate session blob URL
                format: ext.substring(1).toUpperCase(),
                sampleRate: 44100,
                bitrate: 192000,
                isDuplicate: false,
                lyrics: ''
            };
        });

        if (webTracks.length > 0) {
            alert(`Successfully loaded ${webTracks.length} tracks into browser sandbox playback!`);
            playlistQueue = webTracks;
            renderQueueSidebar();
            
            // Swap to search view and populate the table
            switchView('search');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelector('[data-view="search"]').classList.add('active');
            
            renderTracksTable(webTracks);
            loadAndPlayTrack(0);
        }
    });

    // --- MULTI-USER LOGIN MANAGER ---
    const profileSelector = document.getElementById('profileSelector');
    const userAvatar = document.getElementById('user-avatar');
    const userDisplayName = document.getElementById('user-display-name');
    const userRoleBadge = document.getElementById('user-role-badge');
    const userLoginModal = document.getElementById('userLoginModal');
    const loginProfilesList = document.getElementById('loginProfilesList');
    const closeLoginBtn = document.getElementById('closeLoginBtn');

    // Add Profile inline elements
    const addNewProfileBtn = document.getElementById('addNewProfileBtn');
    const addProfileFormSection = document.getElementById('addProfileFormSection');
    const cancelAddProfileBtn = document.getElementById('cancelAddProfileBtn');
    const saveNewProfileBtn = document.getElementById('saveNewProfileBtn');
    const newProfileName = document.getElementById('newProfileName');
    const newProfileAvatar = document.getElementById('newProfileAvatar');

    profileSelector.addEventListener('click', () => {
        openUserProfilesModal();
    });

    closeLoginBtn.addEventListener('click', () => {
        userLoginModal.classList.add('hidden');
        addProfileFormSection.classList.add('hidden');
    });

    addNewProfileBtn.addEventListener('click', () => {
        addProfileFormSection.classList.remove('hidden');
        newProfileName.value = '';
        newProfileAvatar.value = '';
        newProfileName.focus();
    });

    cancelAddProfileBtn.addEventListener('click', () => {
        addProfileFormSection.classList.add('hidden');
    });

    saveNewProfileBtn.addEventListener('click', async () => {
        const name = newProfileName.value.trim();
        const avatar = newProfileAvatar.value.trim();
        if (!name) {
            alert("Profile name is required.");
            return;
        }

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, avatar })
            });
            if (res.ok) {
                const newUser = await res.json();
                addProfileFormSection.classList.add('hidden');
                await loadUserAccounts();
                switchUserContext(newUser);
            } else {
                const data = await res.json();
                alert(data.error || "Failed to create profile.");
            }
        } catch (err) {
            console.error("Error creating user profile:", err);
        }
    });

    async function loadUserAccounts() {
        try {
            const res = await fetch('/api/users');
            availableUsers = await res.json();
            
            if (availableUsers.length > 0 && !currentUser) {
                switchUserContext(availableUsers[0]);
            }
        } catch (err) {
            console.error("Failed to load user profiles:", err);
        }
    }

    function switchUserContext(user) {
        currentUser = user;
        userAvatar.src = user.avatar;
        userDisplayName.textContent = user.name;
        userRoleBadge.textContent = user.role;
        userLoginModal.classList.add('hidden');
    }

    function openUserProfilesModal() {
        loginProfilesList.innerHTML = '';
        availableUsers.forEach(user => {
            const card = document.createElement('div');
            card.className = 'profile-select-card';
            card.innerHTML = `
                <img src="${user.avatar}" class="avatar" alt="${user.name}">
                <div>
                    <strong>${user.name}</strong>
                    <div style="font-size: 10px; color: var(--text-muted);">${user.role.toUpperCase()}</div>
                </div>
            `;
            card.addEventListener('click', () => {
                switchUserContext(user);
            });
            loginProfilesList.appendChild(card);
        });
        userLoginModal.classList.remove('hidden');
    }

    // --- AUDIO CONTROL BRIDGE ---
    let pulseTween = gsap.to(['#vinylArt', '#largeVinylArt'], {
        scale: 1.04,
        duration: 2.2,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        paused: true
    });

    function updatePlayState(playing) {
        window.isPlaying = playing;
        playBtn.innerHTML = playing ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
        lucide.createIcons();

        document.body.classList.toggle('playing-active-state', playing);

        if (playing) {
            pulseTween.play();
        } else {
            gsap.to(['#vinylArt', '#largeVinylArt'], {
                scale: 1,
                duration: 0.6,
                ease: "power2.out",
                onComplete: () => pulseTween.pause()
            });
        }
        updateFocusControlsUI();
    }

    playBtn.addEventListener('click', () => {
        if (playlistQueue.length === 0) return;
        if (window.isPlaying) {
            audioEngine.pause();
            updatePlayState(false);
            broadcastSyncCommand();
        } else {
            audioEngine.play().then(() => {
                updatePlayState(true);
                broadcastSyncCommand();
            });
        }
    });

    progressBar.addEventListener('click', (e) => {
        const activeAudio = audioEngine.activeAudio;
        const currentTrack = playlistQueue[currentTrackIndex];
        if (currentTrack && currentTrack.chapterDuration) {
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            const start = currentTrack.startTime || 0;
            const chapDur = currentTrack.chapterDuration;
            activeAudio.currentTime = start + pos * chapDur;
        } else {
            if (!activeAudio.duration) return;
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            activeAudio.currentTime = pos * activeAudio.duration;
        }
        broadcastSyncCommand();
    });

    if (focusProgressBar) {
        focusProgressBar.addEventListener('click', (e) => {
            const activeAudio = audioEngine.activeAudio;
            const currentTrack = playlistQueue[currentTrackIndex];
            if (currentTrack && currentTrack.chapterDuration) {
                const rect = focusProgressBar.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                const start = currentTrack.startTime || 0;
                const chapDur = currentTrack.chapterDuration;
                activeAudio.currentTime = start + pos * chapDur;
            } else {
                if (!activeAudio.duration) return;
                const rect = focusProgressBar.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                activeAudio.currentTime = pos * activeAudio.duration;
            }
            broadcastSyncCommand();
        });
    }

    volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        audioEngine.setVolume(val / 100);
        isMuted = (val === 0);
        if (volumeIcon) {
            if (val === 0) {
                volumeIcon.innerHTML = '<i data-lucide="volume-x"></i>';
            } else if (val < 30) {
                volumeIcon.innerHTML = '<i data-lucide="volume"></i>';
            } else if (val < 70) {
                volumeIcon.innerHTML = '<i data-lucide="volume-1"></i>';
            } else {
                volumeIcon.innerHTML = '<i data-lucide="volume-2"></i>';
            }
            lucide.createIcons();
        }
    });

    speedSelector.addEventListener('change', (e) => {
        audioEngine.setPlaybackSpeed(parseFloat(e.target.value));
    });

    prevBtn.addEventListener('click', () => playPrevTrack());
    nextBtn.addEventListener('click', () => playNextTrack());

    function playPrevTrack() {
        if (playlistQueue.length === 0) return;
        let index = currentTrackIndex - 1;
        if (index < 0) index = playlistQueue.length - 1;
        loadAndPlayTrack(index);
    }

    function playNextTrack() {
        if (playlistQueue.length === 0) return;
        
        let index = currentTrackIndex + 1;
        if (isShuffle) {
            index = Math.floor(Math.random() * playlistQueue.length);
        } else if (index >= playlistQueue.length) {
            if (repeatMode === 'all') index = 0;
            else return;
        }
        
        loadAndPlayTrack(index);
    }

    // Ended event triggers
    audioEngine.audioA.addEventListener('ended', () => handleTrackEnded());
    audioEngine.audioB.addEventListener('ended', () => handleTrackEnded());

    function handleTrackEnded() {
        if (repeatMode === 'one') {
            loadAndPlayTrack(currentTrackIndex);
        } else {
            playNextTrack();
        }
    }

    function checkCrossfadeTiming() {
        const active = audioEngine.activeAudio;
        if (!active.duration || playlistQueue.length <= 1 || audioEngine.isFading) return;
        
        const remaining = active.duration - active.currentTime;
        if (remaining <= audioEngine.crossfadeDuration && !isCrossfadeTriggered) {
            isCrossfadeTriggered = true;
            
            let nextIdx = currentTrackIndex + 1;
            if (isShuffle) {
                nextIdx = Math.floor(Math.random() * playlistQueue.length);
            } else if (nextIdx >= playlistQueue.length) {
                if (repeatMode === 'all') nextIdx = 0;
                else return;
            }

            const nextTrack = playlistQueue[nextIdx];
            currentTrackIndex = nextIdx;
            
            console.log(`Crossfading to: ${nextTrack.name}`);
            
            audioEngine.crossfadeTo(nextTrack.path, nextTrack.replayGain || 0, () => {
                isCrossfadeTriggered = false;
                updateUIMetadata(nextTrack);
                renderQueueSidebar(); // Update queue highlights
            });
        }
    }

    let lastProgressSaveTime = 0;
    function handleAudiobookProgressUpdate(audioEl) {
        if (audioEngine.activeAudio !== audioEl) return;
        const currentTrack = playlistQueue[currentTrackIndex];
        if (!currentTrack || !currentTrack.id || !currentTrack.id.startsWith('book-')) return;

        const parts = currentTrack.id.split('-ch-');
        if (parts.length < 2) return;
        const bookId = parts[0].substring(5);
        const chapterIndex = parseInt(parts[1], 10);

        const currentTime = audioEl.currentTime;
        const offsetInChapter = currentTrack.startTime ? (currentTime - currentTrack.startTime) : currentTime;
        
        const now = Date.now();
        if (now - lastProgressSaveTime >= 5000) {
            lastProgressSaveTime = now;
            fetch(`/api/audiobooks/${bookId}/progress`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resumePosition: {
                        chapterIndex: chapterIndex,
                        seconds: Math.round(Math.max(0, offsetInChapter))
                    }
                })
            }).then(res => {
                if (res.ok) {
                    if (activeBook && activeBook.id === bookId) {
                        activeBook.resumePosition = {
                            chapterIndex: chapterIndex,
                            seconds: Math.round(Math.max(0, offsetInChapter))
                        };
                        updateResumeButtonDisplay();
                    }
                }
            }).catch(err => console.error("Error saving progress:", err));
        }
    }

    function checkVirtualChapterEnd(audioEl) {
        if (audioEngine.activeAudio !== audioEl) return;
        const currentTrack = playlistQueue[currentTrackIndex];
        if (currentTrack && currentTrack.id && currentTrack.id.startsWith('book-') && currentTrack.chapterDuration) {
            const start = currentTrack.startTime || 0;
            const chapDur = currentTrack.chapterDuration;
            const elapsed = audioEl.currentTime - start;
            if (elapsed >= chapDur) {
                console.log("Virtual chapter completed, playing next.");
                playNextTrack();
            }
        }
    }

    audioEngine.audioA.addEventListener('timeupdate', () => {
        updateProgressUI(audioEngine.audioA);
        checkCrossfadeTiming();
        checkVirtualChapterEnd(audioEngine.audioA);
        handleAudiobookProgressUpdate(audioEngine.audioA);
    });
    audioEngine.audioB.addEventListener('timeupdate', () => {
        updateProgressUI(audioEngine.audioB);
        checkCrossfadeTiming();
        checkVirtualChapterEnd(audioEngine.audioB);
        handleAudiobookProgressUpdate(audioEngine.audioB);
    });

    function updateProgressUI(audioEl) {
        if (audioEngine.activeAudio !== audioEl) return;
        const currentTrack = playlistQueue[currentTrackIndex];
        let percent = 0;
        let elapsed = 0;
        let total = 0;

        if (currentTrack && currentTrack.chapterDuration) {
            const start = currentTrack.startTime || 0;
            total = currentTrack.chapterDuration;
            elapsed = Math.max(0, audioEl.currentTime - start);
            percent = Math.min(100, (elapsed / total) * 100);
            
            timeCurrent.textContent = formatSeconds(elapsed);
            if (showRemainingTime) {
                timeTotal.textContent = "-" + formatSeconds(total - elapsed);
            } else {
                timeTotal.textContent = formatSeconds(total);
            }
        } else if (audioEl.duration) {
            total = audioEl.duration;
            elapsed = audioEl.currentTime;
            percent = (elapsed / total) * 100;
            
            timeCurrent.textContent = formatSeconds(elapsed);
            if (showRemainingTime) {
                timeTotal.textContent = "-" + formatSeconds(total - elapsed);
            } else {
                timeTotal.textContent = formatSeconds(total);
            }
        }

        progressFill.style.width = `${percent}%`;
        
        if (focusProgressFill) {
            focusProgressFill.style.width = `${percent}%`;
            focusTimeCurrent.textContent = formatSeconds(elapsed);
            focusTimeTotal.textContent = formatSeconds(total);
        }
    }

    function formatSeconds(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Load track and update all details
    async function loadAndPlayTrack(index, customStartOffset = null) {
        if (playlistQueue.length === 0) return;
        currentTrackIndex = index;
        isCrossfadeTriggered = false;
        
        const track = playlistQueue[index];
        updateUIMetadata(track);
        renderQueueSidebar(); // Render queue items showing active highlight

        audioEngine.loadTrack(track.path, track.replayGain || 0);
        
        const startOffset = customStartOffset !== null ? customStartOffset : (track.startTime || 0);
        if (startOffset > 0) {
            const onMetadata = () => {
                audioEngine.activeAudio.currentTime = startOffset;
                audioEngine.activeAudio.removeEventListener('loadedmetadata', onMetadata);
            };
            if (audioEngine.activeAudio.readyState >= 1) {
                audioEngine.activeAudio.currentTime = startOffset;
            } else {
                audioEngine.activeAudio.addEventListener('loadedmetadata', onMetadata);
            }
        }

        const playPromise = audioEngine.play();
        playPromise.then(() => {
            updatePlayState(true);
            broadcastSyncCommand();
            
            // Record history
            if (currentUser && track.id && !track.id.startsWith('web-') && !track.id.startsWith('book-')) {
                fetch('/api/history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, trackId: track.id })
                });
            }
        });
        return playPromise;
    }

    function hslToRgb(h, s, l) {
        let r, g, b;
        h = h / 360;
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            const hue2rgb = (t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            r = hue2rgb(h + 1/3);
            g = hue2rgb(h);
            b = hue2rgb(h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    function getTrackColors(title, artist) {
        const hashString = (title || "") + " " + (artist || "");
        let hash = 0;
        for (let i = 0; i < hashString.length; i++) {
            hash = hashString.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Generate a hue within Apple Music Red/Pink/Coral/Lavender ranges
        const rangeChoice = Math.abs(hash % 3);
        let h1;
        if (rangeChoice === 0) {
            // Red/Crimson: 345 to 360 / 0 to 10
            h1 = (345 + Math.abs(hash % 25)) % 360;
        } else if (rangeChoice === 1) {
            // Coral/Pink/Orange: 10 to 35
            h1 = 10 + Math.abs(hash % 25);
        } else {
            // Purple/Lavender/Magenta: 280 to 330
            h1 = 280 + Math.abs(hash % 50);
        }

        const h2 = (h1 + 20) % 360;
        const h3 = (h1 - 20 + 360) % 360;
        
        const rgb = hslToRgb(h1, 0.9, 0.55);
        return {
            primary: `hsl(${h1}, 90%, 55%)`,
            secondary: `hsl(${h2}, 85%, 50%)`,
            tertiary: `hsl(${h3}, 80%, 45%)`,
            glow: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`
        };
    }

    function updateUIMetadata(track) {
        const title = track.title || track.name;
        
        // Update Left Sidebar Card
        titleLeft.textContent = title;
        artistLeft.textContent = track.artist || 'Unknown Artist';
        
        const fmt = track.format || 'MP3';
        const rate = track.sampleRate ? `${Math.round(track.sampleRate / 100) / 10}kHz` : '44.1kHz';
        formatLeft.textContent = `${fmt} | ${rate}`;

        // Update Footer Bar
        titleFooter.textContent = title;
        artistFooter.textContent = track.artist || 'Unknown Artist';

        // Set cover art background
        const vinylCover = document.getElementById('vinylArt');
        const artUrl = (track.id && !track.id.startsWith('web-')) ? `/api/tracks/${track.id}/art` : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=250&h=250&q=80';
        vinylCover.style.backgroundImage = `url('${artUrl}')`;

        // Fullscreen Now Playing screen elements
        const largeTitle = document.getElementById('large-ui-title');
        const largeArtist = document.getElementById('large-ui-artist');
        const largeFormat = document.getElementById('large-ui-format');
        const largeRate = document.getElementById('large-ui-rate');
        const largeBitrate = document.getElementById('large-ui-bitrate');
        const largeBpm = document.getElementById('large-ui-bpm');
        const largeVinyl = document.getElementById('largeVinylArt');

        if (largeTitle) largeTitle.textContent = title;
        if (largeArtist) largeArtist.textContent = track.artist || 'Unknown Artist';
        if (largeFormat) largeFormat.textContent = fmt;
        if (largeRate) largeRate.textContent = rate;
        if (largeBitrate) largeBitrate.textContent = track.bitrate ? `${Math.round(track.bitrate / 1000)}kbps` : '320kbps';
        if (largeBpm) largeBpm.textContent = track.bpm ? `${track.bpm} BPM` : 'BPM --';
        if (largeVinyl) largeVinyl.style.backgroundImage = `url('${artUrl}')`;

        // Update list selections highlights
        document.querySelectorAll('.track-item').forEach(item => {
            if (item.getAttribute('data-track-id') === track.id) {
                item.classList.add('active-track');
            } else {
                item.classList.remove('active-track');
            }
        });

        // Sync details to Focus Mode
        syncFocusModeDetails();

        // Trigger active lyrics display refresh
        openLyricsPanel(track);
    }

    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        shuffleBtn.classList.toggle('active', isShuffle);
    });

    repeatBtn.addEventListener('click', () => {
        if (repeatMode === 'none') {
            repeatMode = 'all';
            repeatBtn.classList.add('active');
            repeatBtn.innerHTML = '<i data-lucide="repeat"></i>';
        } else if (repeatMode === 'all') {
            repeatMode = 'one';
            repeatBtn.classList.add('active');
            repeatBtn.innerHTML = '<i data-lucide="repeat-1"></i>';
        } else {
            repeatMode = 'none';
            repeatBtn.classList.remove('active');
            repeatBtn.innerHTML = '<i data-lucide="repeat"></i>';
        }
        lucide.createIcons();
    });

    // --- SLEEP TIMER PANEL ---
    const sleepModal = document.getElementById('sleepTimerModal');
    const cancelSleepBtn = document.getElementById('cancelSleepBtn');
    const startSleepBtn = document.getElementById('startSleepBtn');
    const customSleepMinutes = document.getElementById('customSleepMinutes');

    sleepBtn.addEventListener('click', () => {
        sleepModal.classList.remove('hidden');
    });

    cancelSleepBtn.addEventListener('click', () => {
        audioEngine.cancelSleepTimer();
        sleepBtn.classList.remove('active');
        sleepModal.classList.add('hidden');
    });

    startSleepBtn.addEventListener('click', () => {
        const val = parseFloat(customSleepMinutes.value);
        if (!isNaN(val) && val > 0) {
            audioEngine.startSleepTimer(val, () => {
                updatePlayState(false);
                sleepBtn.classList.remove('active');
            });
            sleepBtn.classList.add('active');
            sleepModal.classList.add('hidden');
        }
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const min = parseFloat(btn.getAttribute('data-time'));
            audioEngine.startSleepTimer(min, () => {
                updatePlayState(false);
                sleepBtn.classList.remove('active');
            });
            sleepBtn.classList.add('active');
            sleepModal.classList.add('hidden');
        });
    });

    // --- EQUALIZER MODAL CONTROL ---
    const eqPanel = document.getElementById('eqPanel');
    const eqBypassToggle = document.getElementById('eqBypassToggle');
    const eqSliders = document.querySelectorAll('.eq-slider');

    eqToggleBtn.addEventListener('click', () => {
        eqPanel.classList.toggle('hidden');
    });

    eqSliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-band'));
            const gain = parseFloat(e.target.value);
            audioEngine.setEQBand(idx, gain);
        });
    });

    eqBypassToggle.addEventListener('change', (e) => {
        audioEngine.setBitPerfectMode(e.target.checked);
        if (e.target.checked) {
            eqSliders.forEach(s => s.value = 0);
        }
    });

    document.querySelectorAll('.preset-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const preset = pill.getAttribute('data-preset');
            let gains = [0, 0, 0, 0, 0];
            if (preset === 'rock') gains = [4, 2, -1, 3, 5];
            if (preset === 'pop') gains = [-2, -1, 2, 4, -1];
            if (preset === 'classic') gains = [3, 1, -2, -1, 2];
            if (preset === 'electronic') gains = [1, 3, 0, 2, 4];
            
            audioEngine.applyEQPreset(gains);
            eqSliders.forEach((s, idx) => s.value = gains[idx]);
        });
    });

    // --- RIGHT SIDEBAR ACTIVE QUEUE RENDER ---
    const queueListScroll = document.getElementById('queueListScroll');
    const queueTracksCount = document.getElementById('queue-tracks-count');

    function renderQueueSidebar() {
        queueListScroll.innerHTML = '';
        queueTracksCount.textContent = `${playlistQueue.length} Tracks`;

        if (playlistQueue.length === 0) {
            queueListScroll.innerHTML = '<div class="empty-queue-text">No tracks queued</div>';
            return;
        }

        playlistQueue.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = `queue-item ${index === currentTrackIndex ? 'active' : ''}`;
            item.innerHTML = `
                <span>${index + 1}. ${track.title || track.name}</span>
                <span>${track.format || 'MP3'}</span>
            `;
            item.addEventListener('click', () => {
                loadAndPlayTrack(index);
            });
            queueListScroll.appendChild(item);
        });
    }

    // --- LYRICS SCROLLER ---
    const lyricsScrollArea = document.getElementById('lyricsScrollArea');
    let parsedLyrics = [];

    async function openLyricsPanel(track) {
        if (lyricsScrollArea) lyricsScrollArea.innerHTML = "<div class='lyrics-line'>Loading synced lyrics...</div>";
        if (largeLyricsScrollArea) largeLyricsScrollArea.innerHTML = "<div class='lyrics-line-fullscreen active'>Loading synced lyrics...</div>";
        parsedLyrics = [];

        // Support local web tracks metadata blank fallback
        if (track.id && track.id.startsWith('web-')) {
            if (lyricsScrollArea) lyricsScrollArea.innerHTML = "<div class='lyrics-line'>Local sandbox track. No lyrics found.</div>";
            if (largeLyricsScrollArea) largeLyricsScrollArea.innerHTML = "<div class='lyrics-line-fullscreen active'>Local sandbox track. No lyrics found.</div>";
            return;
        }

        try {
            const res = await fetch(`/api/tracks/${track.id}/lyrics`);
            const data = await res.json();
            
            if (data.lyrics) {
                parseLyricsString(data.lyrics);
                renderLyricsLines();
            } else {
                if (lyricsScrollArea) lyricsScrollArea.innerHTML = "<div class='lyrics-line'>No lyrics found.</div>";
                if (largeLyricsScrollArea) largeLyricsScrollArea.innerHTML = "<div class='lyrics-line-fullscreen active'>No lyrics found.</div>";
            }
        } catch (err) {
            if (lyricsScrollArea) lyricsScrollArea.innerHTML = "<div class='lyrics-line'>Offline fallback. No lyrics.</div>";
            if (largeLyricsScrollArea) largeLyricsScrollArea.innerHTML = "<div class='lyrics-line-fullscreen active'>Offline fallback. No lyrics.</div>";
        }
    }

    function parseLyricsString(lrcText) {
        parsedLyrics = [];
        const lines = lrcText.split('\n');
        const timeRegex = /\[(\d+):(\d+)\.(\d+)\]/;
        
        lines.forEach(line => {
            const match = timeRegex.exec(line);
            if (match) {
                const min = parseInt(match[1], 10);
                const sec = parseInt(match[2], 10);
                const ms = parseInt(match[3], 10);
                const time = min * 60 + sec + ms / 100;
                const text = line.replace(timeRegex, '').trim();
                parsedLyrics.push({ time, text });
            }
        });
    }

    const largeLyricsScrollArea = document.getElementById('largeLyricsScrollArea');

    function renderLyricsLines() {
        if (lyricsScrollArea) lyricsScrollArea.innerHTML = '';
        if (largeLyricsScrollArea) largeLyricsScrollArea.innerHTML = '';
        
        parsedLyrics.forEach((line, index) => {
            if (lyricsScrollArea) {
                const div = document.createElement('div');
                div.className = 'lyrics-line';
                div.textContent = line.text || ' ';
                div.setAttribute('data-index', index);
                div.addEventListener('click', () => {
                    audioEngine.activeAudio.currentTime = line.time;
                });
                lyricsScrollArea.appendChild(div);
            }

            if (largeLyricsScrollArea) {
                const lDiv = document.createElement('div');
                lDiv.className = 'lyrics-line-fullscreen';
                lDiv.textContent = line.text || ' ';
                lDiv.setAttribute('data-index', index);
                lDiv.addEventListener('click', () => {
                    audioEngine.activeAudio.currentTime = line.time;
                });
                largeLyricsScrollArea.appendChild(lDiv);
            }
        });
    }

    function syncLyricsScroll(currentTime) {
        if (!parsedLyrics.length) return;

        let activeIndex = 0;
        for (let i = 0; i < parsedLyrics.length; i++) {
            if (currentTime >= parsedLyrics[i].time) {
                activeIndex = i;
            } else {
                break;
            }
        }

        if (lyricsScrollArea) {
            const lines = lyricsScrollArea.querySelectorAll('.lyrics-line');
            lines.forEach((line, index) => {
                if (index === activeIndex) {
                    line.classList.add('active');
                    
                    const lineRect = line.getBoundingClientRect();
                    const areaRect = lyricsScrollArea.getBoundingClientRect();
                    const targetScroll = line.offsetTop - lyricsScrollArea.offsetTop - (areaRect.height / 2) + (lineRect.height / 2);
                    
                    gsap.to(lyricsScrollArea, {
                        scrollTop: targetScroll,
                        duration: 0.4,
                        ease: "power2.out",
                        overwrite: "auto"
                    });
                } else {
                    line.classList.remove('active');
                }
            });
        }

        if (largeLyricsScrollArea) {
            const largeLines = largeLyricsScrollArea.querySelectorAll('.lyrics-line-fullscreen');
            largeLines.forEach((line, index) => {
                if (index === activeIndex) {
                    line.classList.add('active');
                    
                    const lineRect = line.getBoundingClientRect();
                    const areaRect = largeLyricsScrollArea.getBoundingClientRect();
                    const targetScroll = line.offsetTop - largeLyricsScrollArea.offsetTop - (areaRect.height / 2) + (lineRect.height / 2);
                    
                    gsap.to(largeLyricsScrollArea, {
                        scrollTop: targetScroll,
                        duration: 0.5,
                        ease: "power2.out",
                        overwrite: "auto"
                    });
                } else {
                    line.classList.remove('active');
                }
            });
        }
    }

    audioEngine.audioA.addEventListener('timeupdate', () => syncLyricsScroll(audioEngine.audioA.currentTime));
    audioEngine.audioB.addEventListener('timeupdate', () => syncLyricsScroll(audioEngine.audioB.currentTime));

    // --- SEARCH AND ADVANCED FILTERS ---
    const searchInput = document.getElementById('searchInput');
    const toggleAdvancedFiltersBtn = document.getElementById('toggleAdvancedFiltersBtn');
    const advancedFiltersPanel = document.getElementById('advancedFiltersPanel');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');

    toggleAdvancedFiltersBtn.addEventListener('click', () => {
        advancedFiltersPanel.classList.toggle('hidden');
    });

    applyFiltersBtn.addEventListener('click', () => triggerSearch());
    searchInput.addEventListener('input', () => triggerSearch());

    async function triggerSearch() {
        const query = searchInput.value;
        const title = document.getElementById('filterTitle').value;
        const artist = document.getElementById('filterArtist').value;
        const album = document.getElementById('filterAlbum').value;
        const genre = document.getElementById('filterGenre').value;
        const year = document.getElementById('filterYear').value;
        const bpm = document.getElementById('filterBpm').value;
        const mood = document.getElementById('filterMood').value;
        const lyrics = document.getElementById('filterLyrics').value;

        let url = `/api/tracks?skipDuplicates=false`;
        if (query) url += `&q=${encodeURIComponent(query)}`;
        if (title) url += `&title=${encodeURIComponent(title)}`;
        if (artist) url += `&artist=${encodeURIComponent(artist)}`;
        if (album) url += `&album=${encodeURIComponent(album)}`;
        if (genre) url += `&genre=${encodeURIComponent(genre)}`;
        if (year) url += `&year=${year}`;
        if (bpm) url += `&bpm=${bpm}`;
        if (mood) url += `&mood=${mood}`;
        if (lyrics) url += `&lyrics=${encodeURIComponent(lyrics)}`;

        try {
            const res = await fetch(url);
            const tracks = await res.json();
            renderTracksTable(tracks);
        } catch (err) {
            console.error("Search fetch error:", err);
        }
    }

    function renderTracksTable(tracks) {
        trackListUI.innerHTML = '';
        if (tracks.length === 0) {
            trackListUI.innerHTML = "<div style='grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);'>No tracks found. Scan library or add music folders.</div>";
            return;
        }

        tracks.forEach(track => {
            const row = document.createElement('div');
            row.className = 'track-item';
            row.setAttribute('data-track-id', track.id);
            if (playlistQueue[currentTrackIndex] && playlistQueue[currentTrackIndex].id === track.id) {
                row.classList.add('active-track');
            }

            const titleSpan = document.createElement('span');
            titleSpan.className = 'track-title-cell';
            titleSpan.innerHTML = `
                <i data-lucide="music-2" style="width: 16px; height: 16px; opacity: 0.5;"></i>
                <span>${track.title || track.name}</span>
                ${track.isDuplicate ? '<span class="duplicate-warn-tag" title="Duplicate copy indexed">Duplicate</span>' : ''}
            `;

            const artistSpan = document.createElement('span');
            artistSpan.textContent = track.artist || 'Unknown Artist';

            const albumSpan = document.createElement('span');
            albumSpan.textContent = track.album || 'Unknown Album';

            const formatSpan = document.createElement('span');
            formatSpan.className = 'track-format-cell';
            formatSpan.textContent = `${track.format || 'MP3'} ${track.bpm ? `(${track.bpm} BPM)` : ''}`;

            const actionCell = document.createElement('span');
            actionCell.className = 'align-right';

            // Tag edit trigger
            const tagBtn = document.createElement('button');
            tagBtn.className = 'row-action-btn';
            tagBtn.title = 'Edit tag metadata';
            tagBtn.innerHTML = '<i data-lucide="edit-3"></i>';
            tagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openMetadataEditorModal(track);
            });

            // Playlist add button
            const addPlayBtn = document.createElement('button');
            addPlayBtn.className = 'row-action-btn';
            addPlayBtn.title = 'Add to playlist';
            addPlayBtn.innerHTML = '<i data-lucide="plus-circle"></i>';
            addPlayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                promptAddTrackToPlaylist(track.id);
            });

            actionCell.appendChild(tagBtn);
            actionCell.appendChild(addPlayBtn);

            row.appendChild(titleSpan);
            row.appendChild(artistSpan);
            row.appendChild(albumSpan);
            row.appendChild(formatSpan);
            row.appendChild(actionCell);

            row.addEventListener('click', () => {
                playlistQueue = tracks.map(t => ({
                    ...t,
                    name: t.title || t.name,
                    path: t.id.startsWith('web-') ? t.path : `/api/tracks/${t.id}/stream`
                }));
                const idx = playlistQueue.findIndex(t => t.id === track.id);
                loadAndPlayTrack(idx);
            });

            trackListUI.appendChild(row);
        });

        lucide.createIcons();
    }

    // --- METADATA EDITOR MODAL ---
    const metadataModal = document.getElementById('metadataModal');
    const closeMetaBtn = document.getElementById('closeMetaBtn');
    const saveMetaBtn = document.getElementById('saveMetaBtn');
    let activeMetaTrackId = null;

    function openMetadataEditorModal(track) {
        activeMetaTrackId = track.id;
        document.getElementById('editMetaTitle').value = track.title || '';
        document.getElementById('editMetaArtist').value = track.artist || '';
        document.getElementById('editMetaAlbum').value = track.album || '';
        document.getElementById('editMetaGenre').value = track.genre || '';
        document.getElementById('editMetaYear').value = track.year || '';
        document.getElementById('editMetaBpm').value = track.bpm || '';
        document.getElementById('editMetaComposer').value = track.composer || '';
        
        metadataModal.classList.remove('hidden');
    }

    closeMetaBtn.addEventListener('click', () => {
        metadataModal.classList.add('hidden');
    });

    saveMetaBtn.addEventListener('click', async () => {
        if (!activeMetaTrackId) return;
        const tags = {
            title: document.getElementById('editMetaTitle').value,
            artist: document.getElementById('editMetaArtist').value,
            album: document.getElementById('editMetaAlbum').value,
            genre: document.getElementById('editMetaGenre').value,
            year: parseInt(document.getElementById('editMetaYear').value, 10) || null,
            bpm: parseInt(document.getElementById('editMetaBpm').value, 10) || null,
            composer: document.getElementById('editMetaComposer').value
        };

        try {
            const res = await fetch(`/api/tracks/${activeMetaTrackId}/metadata`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tags)
            });
            if (res.ok) {
                metadataModal.classList.add('hidden');
                triggerSearch();
            }
        } catch (err) {
            console.error("Failed to save metadata tags:", err);
        }
    });

    async function promptAddTrackToPlaylist(trackId) {
        const res = await fetch('/api/playlists');
        const playlists = await res.json();
        
        const standardPlaylists = playlists.filter(p => !p.isSmart);
        if (standardPlaylists.length === 0) {
            alert("No standard playlists available. Create one first!");
            return;
        }

        const playlistNames = standardPlaylists.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n');
        const choice = prompt(`Select a playlist number to add to:\n${playlistNames}`);
        const idx = parseInt(choice, 10) - 1;
        
        if (idx >= 0 && idx < standardPlaylists.length) {
            const targetPlay = standardPlaylists[idx];
            const addRes = await fetch(`/api/playlists/${targetPlay.id}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trackId })
            });
            if (addRes.ok) {
                alert(`Added to playlist: ${targetPlay.name}`);
            }
        }
    }

    // --- DASHBOARD CHARTS ---
    let genreChartCanvas = document.getElementById('genreChart');
    let artistChartCanvas = document.getElementById('artistChart');

    async function loadStatsDashboard() {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();

            document.getElementById('stats-listening-hours').textContent = `${data.totalListeningHours} hrs`;
            document.getElementById('stats-total-tracks').textContent = data.totalTracks;

            drawDonutChart(genreChartCanvas, data.genreDistribution);
            drawBarChart(artistChartCanvas, data.topArtists);

            const topList = document.getElementById('topTracksRankList');
            topList.innerHTML = '';
            data.topTracks.forEach(track => {
                const li = document.createElement('li');
                li.style.marginBottom = '6px';
                li.innerHTML = `<strong>${track.title}</strong> by ${track.artist} <span style="color:var(--accent); float:right;">${track.playCount} plays</span>`;
                topList.appendChild(li);
            });

        } catch (err) {
            console.error("Dashboard stats loader error:", err);
        }
    }

    function drawDonutChart(canvas, dataList) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (!dataList || dataList.length === 0) return;
        const total = dataList.reduce((acc, curr) => acc + curr.count, 0);
        
        const cx = canvas.width / 3;
        const cy = canvas.height / 2;
        const radius = Math.min(cx, cy) * 0.75;
        
        let startAngle = 0;
        const colors = ['#00f2fe', '#8a2be2', '#ff007f', '#00ffd2', '#ffd60a'];

        dataList.forEach((item, idx) => {
            const sliceAngle = (item.count / total) * 2 * Math.PI;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
            ctx.arc(cx, cy, radius * 0.6, startAngle + sliceAngle, startAngle, true);
            ctx.fillStyle = colors[idx % colors.length];
            ctx.fill();
            startAngle += sliceAngle;

            const legendX = cx * 2 + 10;
            const legendY = 30 + idx * 24;
            ctx.fillStyle = colors[idx % colors.length];
            ctx.beginPath();
            ctx.roundRect(legendX, legendY - 10, 12, 12, 3);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = '11px Outfit';
            ctx.fillText(`${item.genre} (${item.count})`, legendX + 18, legendY);
        });
    }

    // Canvas Bar charts renderer
    function drawBarChart(canvas, artistsList) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!artistsList || artistsList.length === 0) return;
        const maxPlays = Math.max(...artistsList.map(a => a.playCount));

        const margin = 30;
        const chartHeight = canvas.height - margin * 2;
        const chartWidth = canvas.width - margin * 2;
        const barWidth = chartWidth / artistsList.length * 0.6;
        const gap = chartWidth / artistsList.length * 0.4;

        artistsList.forEach((artist, idx) => {
            const plays = artist.playCount;
            const barHeight = (plays / maxPlays) * chartHeight;
            const x = margin + idx * (barWidth + gap);
            const y = canvas.height - margin - barHeight;

            const grad = ctx.createLinearGradient(0, canvas.height, 0, y);
            grad.addColorStop(0, 'rgba(0, 242, 254, 0.2)');
            grad.addColorStop(1, '#00f2fe');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Outfit';
            ctx.fillText(artist.artist.substring(0, 8), x, canvas.height - 15);
            
            ctx.fillStyle = 'var(--accent)';
            ctx.fillText(plays, x + 2, y - 6);
        });
    }

    // --- PLAYLISTS MODULES ---
    const playlistDetailCol = document.getElementById('playlistDetailCol');
    const playlistsList = document.getElementById('playlistsList');
    const playlistTracksList = document.getElementById('playlistTracksList');
    const commentsFeed = document.getElementById('commentsFeed');
    const newCommentInput = document.getElementById('newCommentInput');
    const postCommentBtn = document.getElementById('postCommentBtn');
    const versionTimeline = document.getElementById('versionTimeline');
    const createPlaylistBtn = document.getElementById('createPlaylistBtn');
    let activePlaylistId = null;

    createPlaylistBtn.addEventListener('click', () => {
        document.getElementById('newPlaylistName').value = '';
        document.getElementById('newPlaylistDesc').value = '';
        document.getElementById('playlistCreateModal').classList.remove('hidden');
    });

    document.getElementById('closePlaylistModalBtn').addEventListener('click', () => {
        document.getElementById('playlistCreateModal').classList.add('hidden');
    });

    document.getElementById('savePlaylistModalBtn').addEventListener('click', async () => {
        const name = document.getElementById('newPlaylistName').value.trim();
        const desc = document.getElementById('newPlaylistDesc').value.trim();
        if (!name) {
            alert("Playlist name is required.");
            return;
        }

        const res = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: desc })
        });
        if (res.ok) {
            document.getElementById('playlistCreateModal').classList.add('hidden');
            loadPlaylistsLayout();
        }
    });

    const deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
    deletePlaylistBtn.addEventListener('click', async () => {
        if (!activePlaylistId) return;
        if (confirm("Are you sure you want to delete this playlist?")) {
            const res = await fetch(`/api/playlists/${activePlaylistId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                playlistDetailCol.classList.add('hidden');
                activePlaylistId = null;
                loadPlaylistsLayout();
            }
        }
    });

    async function loadPlaylistsLayout() {
        playlistsList.innerHTML = '';
        try {
            const res = await fetch('/api/playlists');
            const playlists = await res.json();

            playlists.forEach(p => {
                const card = document.createElement('div');
                card.className = `playlist-item-card ${activePlaylistId === p.id ? 'active' : ''}`;
                card.innerHTML = `
                    <h4>${p.name}</h4>
                    <p>${p.isSmart ? 'Smart Rules Compile' : `${p.tracks?.length || 0} tracks`}</p>
                `;
                card.addEventListener('click', () => {
                    openPlaylistDetail(p.id);
                    document.querySelectorAll('.playlist-item-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                });
                playlistsList.appendChild(card);
            });
        } catch (err) {
            console.error(err);
        }
    }

    async function openPlaylistDetail(playlistId) {
        activePlaylistId = playlistId;
        playlistDetailCol.classList.remove('hidden');

        try {
            const res = await fetch(`/api/playlists/${playlistId}`);
            const p = await res.json();

            document.getElementById('playlist-detail-title').textContent = p.name;
            
            let totalSeconds = 0;
            if (p.tracks && p.tracks.length > 0) {
                p.tracks.forEach(t => { totalSeconds += (t.duration || 0); });
            }
            const countStr = p.tracks ? `${p.tracks.length} tracks` : '0 tracks';
            let durationStr = '';
            if (totalSeconds > 0) {
                const hrs = Math.floor(totalSeconds / 3600);
                const mins = Math.round((totalSeconds % 3600) / 60);
                durationStr = hrs > 0 ? ` • ${hrs} hr ${mins} min` : ` • ${mins} min`;
            }
            document.getElementById('playlist-detail-desc').textContent = `${p.description || 'No description.'} (${countStr}${durationStr})`;

            const deleteBtn = document.getElementById('deletePlaylistBtn');
            if (p.isSmart) {
                deleteBtn.style.display = 'none';
            } else {
                deleteBtn.style.display = 'flex';
            }

            playlistTracksList.innerHTML = '';
            if (!p.tracks || p.tracks.length === 0) {
                playlistTracksList.innerHTML = "<div style='grid-column: 1/-1; padding: 24px; text-align: center; color: var(--text-muted);'>Playlist contains no tracks yet. Add tracks from search.</div>";
            } else {
                p.tracks.forEach(track => {
                    const row = document.createElement('div');
                    row.className = 'track-item';
                    row.setAttribute('data-track-id', track.id);
                    
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'track-title-cell';
                    titleSpan.innerHTML = `<i data-lucide="music" style="width:14px; height:14px; opacity:0.5;"></i> <span>${track.title || track.name}</span>`;
                    
                    const artistSpan = document.createElement('span');
                    artistSpan.textContent = track.artist || 'Unknown Artist';
                    
                    const albumSpan = document.createElement('span');
                    albumSpan.textContent = track.album || 'Unknown Album';

                    const formatSpan = document.createElement('span');
                    formatSpan.className = 'track-format-cell';
                    formatSpan.textContent = track.format || 'MP3';

                    const actionCell = document.createElement('span');
                    actionCell.className = 'align-right';
                    
                    if (!p.isSmart) {
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'row-action-btn remove-track-btn';
                        removeBtn.title = 'Remove track from playlist';
                        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                        removeBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            if (confirm(`Remove "${track.title || track.name}" from this playlist?`)) {
                                const removeRes = await fetch(`/api/playlists/${p.id}/tracks/${track.id}`, {
                                    method: 'DELETE'
                                });
                                if (removeRes.ok) {
                                    openPlaylistDetail(p.id);
                                    loadPlaylistsLayout();
                                }
                            }
                        });
                        actionCell.appendChild(removeBtn);
                    }
                    
                    row.appendChild(titleSpan);
                    row.appendChild(artistSpan);
                    row.appendChild(albumSpan);
                    row.appendChild(formatSpan);
                    row.appendChild(actionCell);

                    row.addEventListener('click', () => {
                        playlistQueue = p.tracks.map(t => ({
                            ...t,
                            name: t.title || t.name,
                            path: `/api/tracks/${t.id}/stream`
                        }));
                        const idx = playlistQueue.findIndex(t => t.id === track.id);
                        loadAndPlayTrack(idx);
                    });

                    playlistTracksList.appendChild(row);
                });
            }

            const commentsSect = document.getElementById('playlistCommentsSection');
            const versionSect = document.getElementById('playlistVersionSection');

            if (p.isSmart) {
                commentsSect.style.display = 'none';
                versionSect.style.display = 'none';
            } else {
                commentsSect.style.display = 'block';
                versionSect.style.display = 'block';
                
                commentsFeed.innerHTML = '';
                (p.comments || []).forEach(comm => {
                    const bubble = document.createElement('div');
                    bubble.className = 'comment-bubble';
                    bubble.innerHTML = `<div class="comment-meta">${comm.user} • ${formatTimestamp(comm.timestamp)}</div><div>${comm.text}</div>`;
                    commentsFeed.appendChild(bubble);
                });

                versionTimeline.innerHTML = '';
                (p.versionHistory || []).forEach(node => {
                    const el = document.createElement('div');
                    el.className = 'timeline-node';
                    el.innerHTML = `<span class="node-time">${formatTimestamp(node.timestamp)}</span> <span class="node-action">${node.action}</span>`;
                    versionTimeline.appendChild(el);
                });
            }

            lucide.createIcons();

        } catch (err) {
            console.error(err);
        }
    }

    function formatTimestamp(isoStr) {
        const d = new Date(isoStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + d.toLocaleDateString();
    }

    postCommentBtn.addEventListener('click', async () => {
        const text = newCommentInput.value.trim();
        if (!text || !activePlaylistId) return;

        const userName = currentUser ? currentUser.name : 'Guest';
        const res = await fetch(`/api/playlists/${activePlaylistId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: userName, comment: text })
        });
        if (res.ok) {
            newCommentInput.value = '';
            openPlaylistDetail(activePlaylistId);
        }
    });


    // --- AUDIOBOOK HANDLERS ---
    const audiobooksGrid = document.getElementById('audiobooksGrid');
    const audiobookPlayerContainer = document.getElementById('audiobookPlayerContainer');
    const bookChaptersList = document.getElementById('bookChaptersList');
    const bookBookmarksList = document.getElementById('bookBookmarksList');
    const closeAudiobookPlayer = document.getElementById('closeAudiobookPlayer');
    const addBookBtn = document.getElementById('addAudiobookBtn');
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const resumeBookBtn = document.getElementById('resumeBookBtn');
    
    // Add Audiobook modal elements
    const audiobookModal = document.getElementById('audiobookModal');
    const closeBookModalBtn = document.getElementById('closeBookModalBtn');
    const saveBookModalBtn = document.getElementById('saveBookModalBtn');
    const chooseBookFilesBtn = document.getElementById('chooseBookFilesBtn');
    const selectedBookFilesLabel = document.getElementById('selectedBookFilesLabel');
    const bookFilesInput = document.getElementById('bookFilesInput');
    const newBookTitle = document.getElementById('newBookTitle');
    const newBookAuthor = document.getElementById('newBookAuthor');
    const newBookCover = document.getElementById('newBookCover');
    const newBookType = document.getElementById('newBookType');
    
    let activeBook = null;
    let selectedBookFiles = []; // Holds selected files paths or web files objects

    closeAudiobookPlayer.addEventListener('click', () => {
        audiobookPlayerContainer.classList.add('hidden');
        audiobooksGrid.classList.remove('hidden');
        activeBook = null;
    });

    addBookBtn.addEventListener('click', () => {
        newBookTitle.value = '';
        newBookAuthor.value = '';
        newBookCover.value = '';
        newBookType.value = 'file';
        selectedBookFilesLabel.textContent = 'No files selected';
        selectedBookFiles = [];
        audiobookModal.classList.remove('hidden');
    });

    closeBookModalBtn.addEventListener('click', () => {
        audiobookModal.classList.add('hidden');
    });

    chooseBookFilesBtn.addEventListener('click', () => {
        if (isElectron) {
            const type = newBookType.value;
            const properties = type === 'file' ? ['openFile'] : ['openFile', 'multiSelections'];
            window.electronAPI.openFiles({ properties }).then(paths => {
                if (paths && paths.length > 0) {
                    selectedBookFiles = paths;
                    selectedBookFilesLabel.textContent = `${paths.length} file(s) selected: ${paths.map(p => p.split(/[\\/]/).pop()).join(', ')}`;
                }
            });
        } else {
            bookFilesInput.click();
        }
    });

    bookFilesInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        selectedBookFiles = Array.from(files).map(f => ({
            name: f.name,
            path: URL.createObjectURL(f)
        }));
        
        selectedBookFilesLabel.textContent = `${files.length} file(s) selected: ${selectedBookFiles.map(f => f.name).join(', ')}`;
    });

    saveBookModalBtn.addEventListener('click', async () => {
        const title = newBookTitle.value.trim();
        const author = newBookAuthor.value.trim();
        const coverUrl = newBookCover.value.trim();
        const type = newBookType.value;

        if (!title || !author) {
            alert("Title and Author are required.");
            return;
        }
        if (selectedBookFiles.length === 0) {
            alert("Please select audiobook file(s).");
            return;
        }

        let paths = [];
        let filenames = [];
        if (isElectron) {
            paths = selectedBookFiles;
        } else {
            paths = selectedBookFiles.map(f => f.path);
            filenames = selectedBookFiles.map(f => f.name);
        }

        try {
            const res = await fetch('/api/audiobooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, author, coverUrl, type, paths, filenames })
            });
            if (res.ok) {
                audiobookModal.classList.add('hidden');
                loadAudiobooksLayout();
            } else {
                const data = await res.json();
                alert(data.error || "Failed to add audiobook");
            }
        } catch (err) {
            console.error("Error adding book:", err);
            alert("Error adding audiobook.");
        }
    });

    async function loadAudiobooksLayout() {
        audiobooksGrid.innerHTML = '';
        audiobookPlayerContainer.classList.add('hidden');
        audiobooksGrid.classList.remove('hidden');

        try {
            const res = await fetch('/api/audiobooks');
            const books = await res.json();

            books.forEach(book => {
                const card = document.createElement('div');
                card.className = 'media-card glass-panel';
                card.innerHTML = `
                    <img src="${book.coverUrl}" alt="${book.title}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 8px;">
                    <h4 style="margin-top: 10px; font-size: 14px; font-weight: 600;">${book.title}</h4>
                    <p style="font-size: 11px; color: var(--text-muted);">${book.author}</p>
                `;
                card.addEventListener('click', () => {
                    openAudiobookDetail(book);
                });
                audiobooksGrid.appendChild(card);
            });
        } catch (err) {
            console.error(err);
        }
    }

    async function openAudiobookDetail(book) {
        activeBook = book;
        audiobooksGrid.classList.add('hidden');
        audiobookPlayerContainer.classList.remove('hidden');
        document.getElementById('selectedBookTitle').textContent = `Syncing Book Details...`;

        try {
            const res = await fetch(`/api/audiobooks/${book.id}`);
            if (res.ok) {
                activeBook = await res.json();
            }
        } catch (err) {
            console.error("Failed to sync audiobook progress from server:", err);
        }

        document.getElementById('selectedBookTitle').textContent = `${activeBook.title} by ${activeBook.author}`;
        updateResumeButtonDisplay();
        renderChaptersList();
        renderBookmarksList();
    }

    function updateResumeButtonDisplay() {
        if (!resumeBookBtn || !activeBook) return;
        const resumePos = activeBook.resumePosition || { chapterIndex: 0, seconds: 0 };
        resumeBookBtn.innerHTML = `<i data-lucide="play" style="width: 14px; height: 14px; margin-right: 4px;"></i> Resume: Ch ${resumePos.chapterIndex + 1} at ${formatSeconds(resumePos.seconds)}`;
        lucide.createIcons();
    }

    function playBookChapter(chapterIndex, seekSeconds = 0) {
        if (!activeBook || !activeBook.chapters || activeBook.chapters.length === 0) return;
        
        playlistQueue = activeBook.chapters.map(ch => ({
            id: `book-${activeBook.id}-ch-${ch.index}`,
            name: `${activeBook.title} - ${ch.title}`,
            title: `${activeBook.title} - ${ch.title}`,
            path: ch.path.startsWith('blob:') || ch.path.startsWith('data:') ? ch.path : `/api/stream?path=${encodeURIComponent(ch.path)}`,
            artist: activeBook.author,
            format: 'MP3',
            startTime: ch.start || 0,
            chapterDuration: ch.duration
        }));
        
        const targetChapter = playlistQueue[chapterIndex];
        if (targetChapter) {
            const originalStart = targetChapter.startTime || 0;
            const seekTime = originalStart + seekSeconds;
            loadAndPlayTrack(chapterIndex, seekTime);
        }
    }

    resumeBookBtn.addEventListener('click', () => {
        if (!activeBook) return;
        const resumePos = activeBook.resumePosition || { chapterIndex: 0, seconds: 0 };
        playBookChapter(resumePos.chapterIndex, resumePos.seconds);
    });

    function renderChaptersList() {
        bookChaptersList.innerHTML = '';
        activeBook.chapters.forEach(chap => {
            const el = document.createElement('div');
            el.className = 'chapter-item';
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.padding = '8px 12px';
            el.style.background = 'rgba(255, 255, 255, 0.02)';
            el.style.border = '1px solid var(--glass-border)';
            el.style.borderRadius = '8px';
            el.style.cursor = 'pointer';
            el.style.marginBottom = '6px';
            el.innerHTML = `<span>${chap.title}</span> <span style="color:var(--text-muted); font-size: 11px;">${Math.round(chap.duration / 60)}m</span>`;
            el.addEventListener('click', () => {
                playBookChapter(chap.index, 0);
            });
            bookChaptersList.appendChild(el);
        });
    }

    function renderBookmarksList() {
        bookBookmarksList.innerHTML = '';
        const bookmarks = activeBook.bookmarks || [];
        if (bookmarks.length === 0) {
            bookBookmarksList.innerHTML = "<div style='font-size:11px; color:var(--text-muted); padding:10px;'>No bookmarks saved.</div>";
            return;
        }

        bookmarks.forEach((b, idx) => {
            const el = document.createElement('div');
            el.className = 'bookmark-item';
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.padding = '8px 12px';
            el.style.background = 'rgba(255, 255, 255, 0.02)';
            el.style.border = '1px solid var(--glass-border)';
            el.style.borderRadius = '8px';
            el.style.cursor = 'pointer';
            el.style.marginBottom = '6px';
            el.innerHTML = `<span>Chapter ${b.chapterIndex + 1} at ${formatSeconds(b.seconds)}</span> <span style="font-size:10px; color:var(--accent);">${b.note}</span>`;
            el.addEventListener('click', () => {
                playBookChapter(b.chapterIndex, b.seconds);
            });
            bookBookmarksList.appendChild(el);
        });
    }

    addBookmarkBtn.addEventListener('click', async () => {
        if (!activeBook) return;
        const note = prompt("Enter brief note for this bookmark:", "Chapter marker");
        if (note === null) return;

        const currentTrack = playlistQueue[currentTrackIndex];
        let relativeSeconds = Math.round(audioEngine.activeAudio.currentTime || 0);
        let currentChap = 0;
        
        if (currentTrack && currentTrack.id && currentTrack.id.startsWith('book-')) {
            const parts = currentTrack.id.split('-ch-');
            if (parts.length >= 2) {
                currentChap = parseInt(parts[1], 10);
            }
            if (currentTrack.chapterDuration) {
                const start = currentTrack.startTime || 0;
                relativeSeconds = Math.round(Math.max(0, (audioEngine.activeAudio.currentTime || 0) - start));
            }
        }

        const newBookmark = { chapterIndex: currentChap, seconds: relativeSeconds, note };
        activeBook.bookmarks = activeBook.bookmarks || [];
        activeBook.bookmarks.push(newBookmark);

        try {
            const res = await fetch(`/api/audiobooks/${activeBook.id}/progress`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookmarks: activeBook.bookmarks })
            });
            if (res.ok) renderBookmarksList();
        } catch (err) {
            console.error(err);
        }
    });

    // --- SYSTEM SETTINGS CONFIGURATIONS ---
    const settingsFoldersList = document.getElementById('settingsFoldersList');
    const triggerScanBtn = document.getElementById('triggerScanBtn');
    const reorganizeDestInput = document.getElementById('reorganizeDestInput');
    const reorganizeBtn = document.getElementById('reorganizeBtn');
    const audioOutputSelector = document.getElementById('audioOutputSelector');
    const bitPerfectToggle = document.getElementById('bitPerfectToggle');

    triggerScanBtn.addEventListener('click', async () => {
        const res = await fetch('/api/folders');
        const folders = await res.json();
        if (folders.length === 0) {
            alert("No folders registered. Register paths first.");
            return;
        }

        triggerScanBtn.innerHTML = '<i data-lucide="refresh-cw" class="brand-disc"></i> Scanning...';
        lucide.createIcons();

        try {
            const scanRes = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folders })
            });
            const data = await scanRes.json();
            alert(`Scan completed!\nAdded ${data.added} tracks.\nDuplicates skipped: ${data.duplicates}`);
        } catch (err) {
            alert(`Scan error: ${err.message}`);
        } finally {
            triggerScanBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Scan Now';
            lucide.createIcons();
            loadSettingsLayout();
        }
    });

    reorganizeBtn.addEventListener('click', async () => {
        const path = reorganizeDestInput.value.trim();
        if (!path) {
            alert("Destination folder path is required.");
            return;
        }
        
        try {
            const res = await fetch('/api/organize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destDir: path })
            });
            const data = await res.json();
            alert(`Reorganization finished!\nOrganized ${data.organized} files to ${path}.\nErrors encountered: ${data.errors}`);
        } catch (err) {
            alert("Organization error: " + err.message);
        }
    });

    async function loadSettingsLayout() {
        settingsFoldersList.innerHTML = '';
        try {
            const res = await fetch('/api/folders');
            const folders = await res.json();

            if (folders.length === 0) {
                settingsFoldersList.innerHTML = "<div class='folder-item'>No registered folder pathways.</div>";
            } else {
                folders.forEach(f => {
                    const el = document.createElement('div');
                    el.className = 'folder-item';
                    el.innerHTML = `<span>${f}</span>`;
                    settingsFoldersList.appendChild(el);
                });
            }

            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioDevices = devices.filter(d => d.kind === 'audiooutput');
                
                audioOutputSelector.innerHTML = '<option value="default">Default System Output</option>';
                audioDevices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.textContent = d.label || `Device ${d.deviceId.substring(0, 5)}...`;
                    audioOutputSelector.appendChild(opt);
                });
            }

        } catch (err) {
            console.error("Failed to load settings configs:", err);
        }
    }

    audioOutputSelector.addEventListener('change', (e) => {
        audioEngine.setOutputDevice(e.target.value);
    });

    bitPerfectToggle.addEventListener('change', (e) => {
        audioEngine.setBitPerfectMode(e.target.checked);
        document.getElementById('eqBypassToggle').checked = e.target.checked;
    });

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const th = btn.getAttribute('data-theme');
            document.body.classList.remove('amoled-theme', 'light-theme', 'abyss-theme', 'medieval-theme', 'catppuccin-theme', 'sunset-theme', 'forest-theme', 'cyberpunk-theme', 'vaporwave-theme');
            if (th !== 'dark') {
                document.body.classList.add(`${th}-theme`);
            }
            localStorage.setItem('aura-theme', th);
        });
    });

    function broadcastSyncCommand() {
        // WS Sync system removed
    }

    // --- ALGORITHMIC PLAYLIST CARD GENERATION ---
    async function loadRecommendedPlaylistsGrid() {
        const grid = document.getElementById('smartPlaylistsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        try {
            const res = await fetch('/api/playlists');
            const playlists = await res.json();
            
            const smartPlaylists = playlists.filter(p => p.isSmart);

            smartPlaylists.forEach(p => {
                const card = document.createElement('div');
                card.className = 'smart-playlist-card glass-panel';
                card.innerHTML = `
                    <h4>${p.name}</h4>
                    <p>${p.description}</p>
                    <div class="smart-playlist-meta">
                        <span>Algorithmic Sync</span>
                        <span>${p.tracks?.length || 0} Tracks</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    if (p.tracks && p.tracks.length > 0) {
                        playlistQueue = p.tracks.map(t => ({
                            ...t,
                            name: t.title || t.name,
                            path: `/api/tracks/${t.id}/stream`
                        }));
                        loadAndPlayTrack(0);
                        switchView('search');
                        renderTracksTable(p.tracks);
                    } else {
                        alert("Smart playlist compile returned 0 tracks. Scan files first!");
                    }
                });
                grid.appendChild(card);
            });

        } catch (err) {
            console.error(err);
        }
    }

    // Load persisted theme
    const savedTheme = localStorage.getItem('aura-theme') || 'dark';
    document.body.classList.remove('amoled-theme', 'light-theme', 'abyss-theme', 'medieval-theme', 'catppuccin-theme', 'sunset-theme', 'forest-theme', 'cyberpunk-theme', 'vaporwave-theme');
    if (savedTheme !== 'dark') {
        document.body.classList.add(`${savedTheme}-theme`);
    }
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.getAttribute('data-theme') === savedTheme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // --- PLAY ALL TRACKS ACTION AND STATS ---
    const quickPlayAllBtn = document.querySelector('[data-action="quick-play-all"]');
    if (quickPlayAllBtn) {
        quickPlayAllBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/tracks');
                const tracks = await res.json();
                if (tracks.length > 0) {
                    playlistQueue = tracks.map(t => ({
                        ...t,
                        name: t.title || t.name,
                        path: t.id.startsWith('web-') ? t.path : `/api/tracks/${t.id}/stream`
                    }));
                    loadAndPlayTrack(0);
                } else {
                    alert("No tracks found in library! Scan directories first.");
                }
            } catch (err) {
                console.error("Play All error:", err);
            }
        });
    }

    async function updateHomeStats() {
        try {
            const res = await fetch('/api/tracks');
            const tracks = await res.json();
            const countEl = document.getElementById('home-total-tracks');
            if (countEl) {
                countEl.textContent = `${tracks.length} tracks loaded`;
            }
            const homeTotalTracksHeader = document.getElementById('home-total-tracks');
            if (homeTotalTracksHeader) {
                homeTotalTracksHeader.textContent = `${tracks.length} tracks loaded`;
            }
        } catch (err) {
            console.error("Failed to load home tracks count:", err);
        }
    }
    updateHomeStats();

    // Now Playing Minimize Button Setup
    const minimizeNowPlayingBtn = document.getElementById('minimizeNowPlayingBtn');
    if (minimizeNowPlayingBtn) {
        minimizeNowPlayingBtn.addEventListener('click', () => {
            document.body.classList.remove('playing-active');
            switchView(previousView);
            
            navItems.forEach(n => {
                if (n.getAttribute('data-view') === previousView) {
                    n.classList.add('active');
                } else {
                    n.classList.remove('active');
                }
            });
        });
    }

    // Clear Queue Button Event Listener
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', () => {
            playlistQueue = [];
            currentTrackIndex = -1;
            audioEngine.pause();
            updatePlayState(false);
            renderQueueSidebar();
            
            // Reset metadata display texts to defaults
            titleLeft.textContent = 'Select a folder';
            artistLeft.textContent = 'No tracks loaded';
            formatLeft.textContent = 'MP3';
            titleFooter.textContent = 'Select a folder';
            artistFooter.textContent = 'No tracks loaded';
            
            const largeTitle = document.getElementById('large-ui-title');
            const largeArtist = document.getElementById('large-ui-artist');
            if (largeTitle) largeTitle.textContent = 'Select a track';
            if (largeArtist) largeArtist.textContent = 'No music playing';

            // Reset dynamic adaptive HSL colors
            document.documentElement.style.removeProperty('--ambient-color-1');
            document.documentElement.style.removeProperty('--ambient-color-2');
            document.documentElement.style.removeProperty('--ambient-color-3');
            document.documentElement.style.removeProperty('--accent');
            document.documentElement.style.removeProperty('--accent-glow');
        });
    }

    // Click total time text to toggle showing the remaining time instead of the total length
    if (timeTotal) {
        timeTotal.style.cursor = 'pointer';
        timeTotal.title = 'Toggle remaining time';
        timeTotal.addEventListener('click', () => {
            showRemainingTime = !showRemainingTime;
            const activeAudio = audioEngine.activeAudio;
            updateProgressUI(activeAudio);
        });
    }

    // Click volume icon to toggle mute/unmute
    if (volumeIcon) {
        volumeIcon.addEventListener('click', () => {
            isMuted = !isMuted;
            if (isMuted) {
                lastVolume = volumeSlider.value;
                volumeSlider.value = 0;
                audioEngine.setVolume(0);
                volumeIcon.innerHTML = '<i data-lucide="volume-x"></i>';
            } else {
                volumeSlider.value = lastVolume;
                audioEngine.setVolume(lastVolume / 100);
                if (lastVolume > 50) {
                    volumeIcon.innerHTML = '<i data-lucide="volume-2"></i>';
                } else if (lastVolume > 0) {
                    volumeIcon.innerHTML = '<i data-lucide="volume-1"></i>';
                } else {
                    volumeIcon.innerHTML = '<i data-lucide="volume"></i>';
                }
            }
            lucide.createIcons();
        });
    }

    // Click bottom bar artwork or track info to toggle Focus Mode
    const playerTrackInfo = document.querySelector('.player-track-info');
    if (capsuleArt && playerTrackInfo) {
        [capsuleArt, playerTrackInfo].forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.progress-bar-mini') || e.target.closest('input') || e.target.closest('button')) return;
                if (focusModeBtn) focusModeBtn.click();
            });
        });
    }

    // Dynamic initial page state load triggers
    loadUserAccounts();
    loadRecommendedPlaylistsGrid();
    triggerSearch(); // Initial tracks load
});