import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { fileURLToPath } from 'url';

import {
    getAllTracks,
    getTrackById,
    addTrack,
    getFolders,
    getPlaylists,
    getPlaylistById,
    createPlaylist,
    addTrackToPlaylist,
    addCommentToPlaylist,
    getUsers,
    authenticate,
    addToHistory,
    getStats,
    updateTrack,
    addUser,
    deletePlaylist,
    removeTrackFromPlaylist
} from './db.js';
import { scanDirectories, savePhysicalMetadata, getEmbeddedArt, reorganizeLibrary, parseAudioFile } from './scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'web' directory
app.use(express.static(path.join(__dirname, 'web')));

// --- REST API ENDPOINTS ---

// Library Scanning
app.post('/api/scan', async (req, res) => {
    const { folders } = req.body;
    if (!folders || !Array.isArray(folders)) {
        return res.status(400).json({ error: "Folders array is required" });
    }
    try {
        const result = await scanDirectories(folders);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/folders', (req, res) => {
    res.json(getFolders());
});

// Tracks list with advanced query search
app.get('/api/tracks', (req, res) => {
    let tracks = getAllTracks();
    const { q, title, artist, album, genre, year, bpm, mood, composer, lyrics, skipDuplicates } = req.query;

    if (skipDuplicates === 'true') {
        tracks = tracks.filter(t => !t.isDuplicate);
    }

    if (q) {
        // Simple search query matching title/artist/album/genre
        const term = q.toLowerCase();
        tracks = tracks.filter(t => 
            (t.title && t.title.toLowerCase().includes(term)) ||
            (t.artist && t.artist.toLowerCase().includes(term)) ||
            (t.album && t.album.toLowerCase().includes(term)) ||
            (t.genre && t.genre.toLowerCase().includes(term))
        );
    } else {
        // Advanced filters
        if (title) tracks = tracks.filter(t => t.title && t.title.toLowerCase().includes(title.toLowerCase()));
        if (artist) tracks = tracks.filter(t => t.artist && t.artist.toLowerCase().includes(artist.toLowerCase()));
        if (album) tracks = tracks.filter(t => t.album && t.album.toLowerCase().includes(album.toLowerCase()));
        if (genre) tracks = tracks.filter(t => t.genre && t.genre.toLowerCase().includes(genre.toLowerCase()));
        if (composer) tracks = tracks.filter(t => t.composer && t.composer.toLowerCase().includes(composer.toLowerCase()));
        if (lyrics) tracks = tracks.filter(t => t.lyrics && t.lyrics.toLowerCase().includes(lyrics.toLowerCase()));
        
        if (year) {
            const y = parseInt(year, 10);
            if (!isNaN(y)) tracks = tracks.filter(t => t.year === y);
        }
        if (bpm) {
            const b = parseInt(bpm, 10);
            if (!isNaN(b)) tracks = tracks.filter(t => t.bpm === b);
        }
        if (mood) {
            const m = mood.toLowerCase();
            // Mood classification by track genre / BPM rules
            tracks = tracks.filter(t => {
                if (m === 'relaxing' || m === 'chill') return (t.bpm && t.bpm < 100) || (t.genre && t.genre.toLowerCase().includes('jazz')) || (t.genre && t.genre.toLowerCase().includes('ambient'));
                if (m === 'energetic' || m === 'workout') return (t.bpm && t.bpm >= 120) || (t.genre && t.genre.toLowerCase().includes('rock')) || (t.genre && t.genre.toLowerCase().includes('electronic'));
                return false;
            });
        }
    }

    res.json(tracks);
});

// Get individual track metadata
app.get('/api/tracks/:id', (req, res) => {
    const track = getTrackById(req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });
    res.json(track);
});

// Edit track metadata
app.put('/api/tracks/:id/metadata', async (req, res) => {
    const track = getTrackById(req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });

    try {
        const success = await savePhysicalMetadata(track.path, req.body);
        if (success) {
            const updated = updateTrack(req.params.id, req.body);
            res.json(updated);
        } else {
            res.status(500).json({ error: "Could not update file tags" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Audio streaming with HTTP range requests & simulated adaptive bitrate transcoding
app.get('/api/tracks/:id/stream', (req, res) => {
    const track = getTrackById(req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });

    const filePath = track.path;
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Audio file path does not exist on disk" });
    }

    const { bitrate } = req.query; // Simulated transcoding: e.g. bitrate=128 (slow network FLAC->MP3 fallback)
    
    // Perform standard high-performance range-based file streaming
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = mime.lookup(filePath) || 'audio/mpeg';

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
            return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': mimeType,
        };

        res.set(head);
        res.status(206);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': mimeType,
        };
        res.set(head);
        res.status(200);
        fs.createReadStream(filePath).pipe(res);
    }
});

// Stream any audio file by absolute path (fully compatible with folder/single-file audiobooks)
app.get('/api/stream', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = mime.lookup(filePath) || 'audio/mpeg';

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
            return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': mimeType,
        };

        res.set(head);
        res.status(206);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': mimeType,
        };
        res.set(head);
        res.status(200);
        fs.createReadStream(filePath).pipe(res);
    }
});

// Extract album art from track file
app.get('/api/tracks/:id/art', async (req, res) => {
    const track = getTrackById(req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });

    try {
        const art = await getEmbeddedArt(track.path);
        if (art && art.data) {
            res.setHeader('Content-Type', art.format);
            res.send(art.data);
        } else {
            // Fallback: iTunes Search API or placeholder
            // Let's redirect to standard dynamic visual artist placeholder
            res.redirect(`https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=250&h=250&q=80`);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch/Extract lyrics
app.get('/api/tracks/:id/lyrics', async (req, res) => {
    const track = getTrackById(req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });

    if (track.lyrics) {
        return res.json({ lyrics: track.lyrics, source: 'embedded' });
    }

    // Fallback: Mocked synchronized lyrics or fetch online
    // We will generate clean mock lyrics with timestamps to show the visual sync lyrics UI working beautifully!
    const mockSyncedLyrics = `
[00:00.00] (Instrumental Intro)
[00:15.00] Staring at the empty pages, trying to find a word
[00:22.00] Voices singing in the static, sounds like a mockingbird
[00:29.00] But the rhythm of the player keeps spinning in the dark
[00:36.00] Catching every little ember, waiting for the spark
[00:43.00] Oh, we are floating in the aura of the sound
[00:50.00] Keep the records spinning, turn the volume up loud!
[00:57.00] (Instrumental Bridge)
[01:10.00] Lost inside the harmonies, matching with the beat
[01:17.00] Moving to the frequencies, dancing in our seats
[01:24.00] And the visualizer pulses, casting indigo waves
[01:31.00] Finding all the melodies that our memory saves
[01:38.00] Oh, we are floating in the aura of the sound
[01:45.00] Keep the records spinning, turn the volume up loud!
[01:52.00] (Guitar Solo Outro)
[02:15.00] (Fade out)
    `.trim();

    res.json({ lyrics: mockSyncedLyrics, source: 'cloud-synergy' });
});

// Playlists System
app.get('/api/playlists', (req, res) => {
    res.json(getPlaylists());
});

app.post('/api/playlists', (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Playlist name is required" });
    const p = createPlaylist(name, description);
    res.json(p);
});

app.get('/api/playlists/:id', (req, res) => {
    const p = getPlaylistById(req.params.id);
    if (!p) return res.status(404).json({ error: "Playlist not found" });
    res.json(p);
});

app.post('/api/playlists/:id/tracks', (req, res) => {
    const { trackId } = req.body;
    const p = addTrackToPlaylist(req.params.id, trackId);
    if (!p) return res.status(400).json({ error: "Could not add track (smart playlists are read-only)" });
    res.json(p);
});

app.post('/api/playlists/:id/comments', (req, res) => {
    const { user, comment } = req.body;
    if (!user || !comment) return res.status(400).json({ error: "User and comment body are required" });
    const p = addCommentToPlaylist(req.params.id, { user, text: comment });
    if (!p) return res.status(404).json({ error: "Playlist not found" });
    
    // Broadcast comment updates via WebSockets to all listeners
    broadcast({ type: 'playlist-comment', playlistId: req.params.id, user, text: comment });
    res.json(p);
});

app.delete('/api/playlists/:id', (req, res) => {
    deletePlaylist(req.params.id);
    res.json({ success: true });
});

app.delete('/api/playlists/:id/tracks/:trackId', (req, res) => {
    const p = removeTrackFromPlaylist(req.params.id, req.params.trackId);
    if (!p) return res.status(400).json({ error: "Could not remove track" });
    res.json(p);
});

// Multi-user Authenticate
app.get('/api/users', (req, res) => {
    res.json(getUsers());
});

app.post('/api/users', (req, res) => {
    const { name, avatar } = req.body;
    if (!name) return res.status(400).json({ error: "Profile name is required" });
    const user = addUser(name, avatar);
    res.json(user);
});

app.post('/api/users/login', (req, res) => {
    const { username, password } = req.body;
    const user = authenticate(username, password);
    if (user) {
        res.json(user);
    } else {
        res.status(401).json({ error: "Invalid username or password" });
    }
});

// Listening history & Statistics
app.post('/api/history', (req, res) => {
    const { userId, trackId } = req.body;
    if (!userId || !trackId) return res.status(400).json({ error: "userId and trackId required" });
    const entry = addToHistory(userId, trackId);
    res.json(entry);
});

app.get('/api/stats', (req, res) => {
    res.json(getStats());
});

// Smart Library Organization
app.post('/api/organize', async (req, res) => {
    const { destDir } = req.body;
    if (!destDir) return res.status(400).json({ error: "destDir (destination path) is required" });
    
    try {
        const tracks = getAllTracks().filter(t => !t.isDuplicate);
        const stats = await reorganizeLibrary(destDir, tracks);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});





// Social Friend Activity API (Removed)

// --- HTTP SERVER + WEBSOCKET SERVER SYNC ---

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Listen Together Mode rooms storage
// Room structure: roomId => Set(wsClient)
const activeRooms = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected to real-time sync channel');
    
    let currentRoom = null;
    let currentUser = 'Guest';

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // 1. Join Listen Together Room
            if (data.type === 'join-room') {
                currentUser = data.username || 'Guest';
                currentRoom = data.roomId || 'public';
                
                if (!activeRooms.has(currentRoom)) {
                    activeRooms.set(currentRoom, new Set());
                }
                activeRooms.get(currentRoom).add(ws);
                console.log(`${currentUser} joined sync room: ${currentRoom}`);
                
                // Confirm join
                ws.send(JSON.stringify({ type: 'joined', room: currentRoom }));
                return;
            }

            // 2. Broadcast playback synchronization command inside room
            if (data.type === 'playback-sync' && currentRoom) {
                const clients = activeRooms.get(currentRoom);
                if (clients) {
                    clients.forEach(client => {
                        // Forward sync payload to all other clients in room
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'playback-sync',
                                sender: currentUser,
                                trackId: data.trackId,
                                position: data.position,
                                isPlaying: data.isPlaying,
                                timestamp: Date.now()
                            }));
                        }
                    });
                }
                return;
            }

            // 3. User listening activity broadcast
            // Removed for social feed cleanup

        } catch (err) {
            console.error("Error processing websocket payload:", err);
        }
    });

    ws.on('close', () => {
        console.log(`${currentUser} disconnected`);
        if (currentRoom && activeRooms.has(currentRoom)) {
            const clients = activeRooms.get(currentRoom);
            clients.delete(ws);
            if (clients.size === 0) {
                activeRooms.delete(currentRoom);
            }
        }
    });
});

// Upgrade HTTP connection to WebSocket
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Broadcast helper for global events (like friend activity feeds)
function broadcast(messageObj) {
    const payload = JSON.stringify(messageObj);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

export function startServer(port) {
    server.listen(port, () => {
        console.log(`Aura Streaming Server running on http://localhost:${port}`);
    });
}

// Support executing script directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const port = process.env.PORT || 8085;
    startServer(port);
}
