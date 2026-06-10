import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import NodeID3 from 'node-id3';
import { addTrack, addFolder, getAllTracks } from './db.js';

const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.opus', '.m4a', '.m4b', '.dsf', '.dff'];

// Recursive walker to find all audio files
async function walkDirectory(dir, fileList = []) {
    let files;
    try {
        files = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err.message);
        return fileList;
    }

    for (const file of files) {
        const resPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            await walkDirectory(resPath, fileList);
        } else if (file.isFile()) {
            const ext = path.extname(file.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                fileList.push(resPath);
            }
        }
    }
    return fileList;
}

// Scans list of directories and indexes them in the database
export async function scanDirectories(directories) {
    const allFiles = [];
    for (const dir of directories) {
        // Save folder path to DB
        addFolder(dir);
        await walkDirectory(dir, allFiles);
    }

    console.log(`Found ${allFiles.length} audio files in directories.`);
    
    let addedCount = 0;
    let duplicateCount = 0;

    // Load current tracks to compare for duplicate detection
    const existingTracks = getAllTracks();
    const fingerprintMap = new Map();

    // Map existing tracks by fingerprint to detect duplicates
    existingTracks.forEach(t => {
        const fp = getFingerprint(t.title, t.artist, t.duration);
        if (fp) {
            fingerprintMap.set(fp, t.id);
        }
    });

    for (const filePath of allFiles) {
        try {
            const metadata = await parseFile(filePath);
            const common = metadata.common || {};
            const format = metadata.format || {};

            const title = common.title || path.basename(filePath, path.extname(filePath));
            const artist = common.artist || 'Unknown Artist';
            const album = common.album || 'Unknown Album';
            const genre = common.genre ? common.genre.join(', ') : 'Unknown Genre';
            const year = common.year || null;
            const duration = format.duration || 0;
            const bpm = common.bpm || null;
            const composer = common.composer ? common.composer.join(', ') : '';
            const sampleRate = format.sampleRate || 44100;
            const bitrate = format.bitrate || 128000;
            
            // Check if track has lyrics in metadata
            let lyrics = '';
            if (common.lyrics) {
                lyrics = common.lyrics.join('\n');
            }

            // Generate fingerprint
            const fp = getFingerprint(title, artist, duration);
            let isDuplicate = false;
            let duplicateOf = null;

            if (fp) {
                if (fingerprintMap.has(fp)) {
                    isDuplicate = true;
                    duplicateOf = fingerprintMap.get(fp);
                    duplicateCount++;
                } else {
                    // Temporarily set in map to prevent duplicate in same scan batch
                    fingerprintMap.set(fp, filePath);
                }
            }

            // Check if file has embedded album art
            const hasArt = common.picture && common.picture.length > 0;

            const track = {
                path: filePath,
                title,
                artist,
                album,
                genre,
                year,
                duration,
                bpm,
                composer,
                lyrics,
                sampleRate,
                bitrate,
                isDuplicate,
                duplicateOf,
                hasArt,
                format: path.extname(filePath).substring(1).toUpperCase()
            };

            const saved = addTrack(track);
            // If we just saved this track and it wasn't a duplicate, update map with actual ID
            if (fp && !isDuplicate) {
                fingerprintMap.set(fp, saved.id);
            }
            addedCount++;
        } catch (err) {
            console.error(`Error parsing tags for ${filePath}:`, err.message);
        }
    }

    return {
        totalFound: allFiles.length,
        added: addedCount,
        duplicates: duplicateCount
    };
}

// Generate fingerprint for duplicate detection: "title|artist|approx_duration"
function getFingerprint(title, artist, duration) {
    if (!title || !artist) return null;
    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    const approxDuration = Math.round(duration); // Round to nearest second
    return `${cleanTitle}|${cleanArtist}|${approxDuration}`;
}

// Save metadata tags to physical file (currently fully supports MP3 via node-id3)
export async function savePhysicalMetadata(filePath, tags) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.mp3') {
        const id3Tags = {
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            genre: tags.genre,
            year: tags.year ? String(tags.year) : undefined,
            bpm: tags.bpm ? String(tags.bpm) : undefined,
            composer: tags.composer || undefined
        };
        
        const success = NodeID3.update(id3Tags, filePath);
        if (!success) {
            throw new Error("Failed to write ID3 tags to MP3 file");
        }
        return true;
    } else {
        // Tag editing for FLAC/WAV/etc. falls back to updating the database
        // and physically is not written if node-id3 is the only editor.
        // We log it and let it succeed in the database.
        console.log(`Metadata updated in database for non-MP3 format (${ext}): ${filePath}`);
        return true;
    }
}

// Extracts album art buffer from file
export async function getEmbeddedArt(filePath) {
    try {
        const metadata = await parseFile(filePath);
        if (metadata.common.picture && metadata.common.picture.length > 0) {
            return metadata.common.picture[0];
        }
    } catch (err) {
        console.error("Error extracting album art:", err.message);
    }
    return null;
}

// Smart file organization helper: Copies/moves files into a structured directory
export async function reorganizeLibrary(destDir, tracks) {
    let organizedCount = 0;
    let errorsCount = 0;

    for (const track of tracks) {
        try {
            if (!fs.existsSync(track.path)) continue;
            
            // Clean names for folder path
            const safeArtist = (track.artist || 'Unknown Artist').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
            const safeAlbum = (track.album || 'Unknown Album').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
            const ext = path.extname(track.path);
            const safeTitle = (track.title || path.basename(track.path, ext)).replace(/[^a-zA-Z0-9 _-]/g, '').trim();

            const targetFolder = path.join(destDir, safeArtist, safeAlbum);
            await fs.promises.mkdir(targetFolder, { recursive: true });

            const targetPath = path.join(targetFolder, `${safeTitle}${ext}`);
            
            // Copy file synchronously to target path
            await fs.promises.copyFile(track.path, targetPath);
            organizedCount++;
        } catch (err) {
            console.error(`Failed to organize track ${track.path}:`, err.message);
            errorsCount++;
        }
    }

    return { organized: organizedCount, errors: errorsCount };
}

// Extract tags for any audio file
export async function parseAudioFile(filePath) {
    return await parseFile(filePath);
}
