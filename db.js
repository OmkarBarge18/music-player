import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'music-player-db.json');

const initialDb = {
    folders: [],
    tracks: [],
    playlists: [
        {
            id: 'smart-recently-added',
            name: 'Recently Added',
            isSmart: true,
            criteria: { sortBy: 'addedAt', limit: 20 },
            description: 'Your 20 most recently scanned tracks.',
            comments: []
        },
        {
            id: 'smart-most-played',
            name: 'Most Played',
            isSmart: true,
            criteria: { sortBy: 'playCount', limit: 20, minPlayCount: 1 },
            description: 'Your top played tracks.',
            comments: []
        },
        {
            id: 'smart-never-played',
            name: 'Never Played',
            isSmart: true,
            criteria: { sortBy: 'title', filterBy: 'neverPlayed' },
            description: 'Tracks in your library you haven\'t listened to yet.',
            comments: []
        }
    ],
    users: [
        {
            id: 'admin',
            username: 'admin',
            password: 'password', // Simple auth for demo
            role: 'admin',
            name: 'Administrator',
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80',
            permissions: ['read', 'write', 'admin'],
            folders: [] // Personal folders (empty means access to all)
        }
    ],
    history: [],
    podcasts: []
};

// Initialize DB if not exists
function readDb() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
            return initialDb;
        }
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(content);
        let modified = false;
        if (parsed.hasOwnProperty('friendActivity')) {
            delete parsed.friendActivity;
            modified = true;
        }
        if (parsed.users && parsed.users.length > 0) {
            const originalLength = parsed.users.length;
            parsed.users = parsed.users.filter(u => u.id === 'admin' || !u.id.startsWith('family-'));
            if (parsed.users.length !== originalLength) {
                modified = true;
            }
        }
        if (modified) {
            fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        }
        return parsed;
    } catch (err) {
        console.error("Error reading database file, using fallback configuration:", err);
        return initialDb;
    }
}


function writeDb(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error("Error writing database file:", err);
    }
}

// Generates a simple unique ID
function makeId() {
    return Math.random().toString(36).substr(2, 9);
}

// --- TRACKS API ---
export function getAllTracks() {
    const db = readDb();
    return db.tracks;
}

export function getTrackById(id) {
    const db = readDb();
    return db.tracks.find(t => t.id === id);
}

export function addTrack(track) {
    const db = readDb();
    const existing = db.tracks.find(t => t.path === track.path);
    if (existing) {
        // Update existing track fields if path already indexed
        Object.assign(existing, track);
        writeDb(db);
        return existing;
    }
    track.id = track.id || makeId();
    track.playCount = 0;
    track.rating = 0;
    track.addedAt = new Date().toISOString();
    db.tracks.push(track);
    writeDb(db);
    return track;
}

export function updateTrack(id, trackData) {
    const db = readDb();
    const track = db.tracks.find(t => t.id === id);
    if (track) {
        Object.assign(track, trackData);
        writeDb(db);
        return track;
    }
    return null;
}

export function incrementPlayCount(id) {
    const db = readDb();
    const track = db.tracks.find(t => t.id === id);
    if (track) {
        track.playCount = (track.playCount || 0) + 1;
        track.lastPlayedAt = new Date().toISOString();
        writeDb(db);
        return track;
    }
    return null;
}

export function getTracksByFolders(folders) {
    const db = readDb();
    return db.tracks.filter(track => {
        return folders.some(folder => track.path.startsWith(folder));
    });
}

export function getFolders() {
    const db = readDb();
    return db.folders;
}

export function addFolder(folderPath) {
    const db = readDb();
    if (!db.folders.includes(folderPath)) {
        db.folders.push(folderPath);
        writeDb(db);
    }
    return db.folders;
}

// --- PLAYLISTS API ---
export function getPlaylists() {
    const db = readDb();
    return db.playlists.map(p => {
        if (p.isSmart) {
            // Compile smart playlist tracks dynamically
            return { ...p, tracks: compileSmartPlaylist(p, db.tracks) };
        }
        return p;
    });
}

function compileSmartPlaylist(playlist, allTracks) {
    const crit = playlist.criteria;
    let tracks = [...allTracks];

    if (playlist.id === 'smart-recently-added') {
        tracks.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
        return tracks.slice(0, crit.limit || 20);
    }
    if (playlist.id === 'smart-most-played') {
        tracks = tracks.filter(t => (t.playCount || 0) >= (crit.minPlayCount || 1));
        tracks.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
        return tracks.slice(0, crit.limit || 20);
    }
    if (playlist.id === 'smart-never-played') {
        tracks = tracks.filter(t => !t.playCount || t.playCount === 0);
        return tracks;
    }
    if (crit.yearStart && crit.yearEnd) {
        tracks = tracks.filter(t => t.year >= crit.yearStart && t.year <= crit.yearEnd);
        return tracks;
    }
    return [];
}

export function getPlaylistById(id) {
    const db = readDb();
    const p = db.playlists.find(x => x.id === id);
    if (!p) return null;
    if (p.isSmart) {
        return { ...p, tracks: compileSmartPlaylist(p, db.tracks) };
    }
    // For standard playlists, resolve track objects from track ids
    const tracks = (p.trackIds || []).map(tid => db.tracks.find(t => t.id === tid)).filter(Boolean);
    return { ...p, tracks };
}

export function createPlaylist(name, description = '', isSmart = false, criteria = null) {
    const db = readDb();
    const playlist = {
        id: makeId(),
        name,
        description,
        isSmart,
        criteria,
        trackIds: [],
        comments: [],
        versionHistory: [{ version: 1, timestamp: new Date().toISOString(), action: 'Playlist created' }]
    };
    db.playlists.push(playlist);
    writeDb(db);
    return playlist;
}

export function addTrackToPlaylist(playlistId, trackId) {
    const db = readDb();
    const playlist = db.playlists.find(p => p.id === playlistId);
    if (playlist && !playlist.isSmart) {
        if (!playlist.trackIds.includes(trackId)) {
            playlist.trackIds.push(trackId);
            playlist.versionHistory = playlist.versionHistory || [];
            playlist.versionHistory.push({
                version: playlist.versionHistory.length + 1,
                timestamp: new Date().toISOString(),
                action: `Track added: ${trackId}`
            });
            writeDb(db);
        }
        return getPlaylistById(playlistId);
    }
    return null;
}

export function addCommentToPlaylist(playlistId, comment) {
    const db = readDb();
    const playlist = db.playlists.find(p => p.id === playlistId);
    if (playlist) {
        playlist.comments = playlist.comments || [];
        comment.id = makeId();
        comment.timestamp = new Date().toISOString();
        playlist.comments.push(comment);
        writeDb(db);
        return playlist;
    }
    return null;
}

export function deletePlaylist(playlistId) {
    const db = readDb();
    db.playlists = db.playlists.filter(p => p.id !== playlistId);
    writeDb(db);
    return true;
}

export function removeTrackFromPlaylist(playlistId, trackId) {
    const db = readDb();
    const playlist = db.playlists.find(p => p.id === playlistId);
    if (playlist && !playlist.isSmart) {
        playlist.trackIds = (playlist.trackIds || []).filter(tid => tid !== trackId);
        playlist.versionHistory = playlist.versionHistory || [];
        playlist.versionHistory.push({
            version: playlist.versionHistory.length + 1,
            timestamp: new Date().toISOString(),
            action: `Track removed: ${trackId}`
        });
        writeDb(db);
        return getPlaylistById(playlistId);
    }
    return null;
}


// --- USERS API ---
export function getUsers() {
    const db = readDb();
    return db.users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, avatar: u.avatar }));
}

export function authenticate(username, password) {
    const db = readDb();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        return { id: user.id, username: user.username, role: user.role, name: user.name, avatar: user.avatar, permissions: user.permissions };
    }
    return null;
}

export function addUser(name, avatar) {
    const db = readDb();
    const id = makeId();
    const newUser = {
        id,
        username: name.toLowerCase().replace(/[^a-z0-9]/g, '') || `user-${id.substring(0, 4)}`,
        password: 'password',
        role: 'member',
        name: name,
        avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80',
        permissions: ['read', 'write'],
        folders: []
    };
    db.users.push(newUser);
    writeDb(db);
    return newUser;
}

// --- HISTORY & STATS API ---
export function addToHistory(userId, trackId) {
    const db = readDb();
    const entry = {
        id: makeId(),
        userId,
        trackId,
        timestamp: new Date().toISOString()
    };
    db.history.push(entry);
    writeDb(db);
    incrementPlayCount(trackId);
    return entry;
}

export function getStats() {
    const db = readDb();
    const tracks = db.tracks;
    const history = db.history;

    // Compile dynamic statistics dashboard metrics
    const totalListeningHours = (history.length * 3.5) / 60; // Estimate ~3.5 mins per song in hours

    // Top Tracks
    const topTracks = [...tracks]
        .filter(t => (t.playCount || 0) > 0)
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5);

    // Genre distribution
    const genresMap = {};
    tracks.forEach(t => {
        const g = t.genre || 'Unknown';
        genresMap[g] = (genresMap[g] || 0) + 1;
    });
    const genreDistribution = Object.entries(genresMap).map(([genre, count]) => ({ genre, count }));

    // Top Artists
    const artistPlayMap = {};
    tracks.forEach(t => {
        if (t.artist && t.playCount) {
            artistPlayMap[t.artist] = (artistPlayMap[t.artist] || 0) + t.playCount;
        }
    });
    const topArtists = Object.entries(artistPlayMap)
        .map(([artist, playCount]) => ({ artist, playCount }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5);

    return {
        totalTracks: tracks.length,
        totalListeningHours: Math.round(totalListeningHours * 10) / 10,
        topTracks,
        topArtists,
        genreDistribution
    };
}



// --- FRIEND ACTIVITY ---
// Removed social activity systems
