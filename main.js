import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';
import { scanDirectories } from './scanner.js';
import { getTracksByFolders } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
const PORT = process.env.PORT || 8085;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        frame: false, // Custom borderless window for premium Fluent look
        backgroundColor: '#050506',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load server url
    mainWindow.loadURL(`http://localhost:${PORT}`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    // Start local Express server
    startServer(PORT);

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC HANDLERS ---
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.handle('get-app-config', () => {
    return { port: PORT };
});

ipcMain.handle('open-folder-dialog', async () => {
    if (!mainWindow) return [];

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return [];
    }

    try {
        // Trigger library scanning for the selected folders
        const scanResult = await scanDirectories(result.filePaths);
        console.log(`Scan completed. Added ${scanResult.added} tracks. Duplicates: ${scanResult.duplicates}`);
        
        // Fetch and return the list of tracks from these specific folders
        const tracks = getTracksByFolders(result.filePaths);
        return tracks.map(t => ({
            id: t.id,
            name: t.title || path.basename(t.path),
            path: `http://localhost:${PORT}/api/tracks/${t.id}/stream`,
            duration: t.duration,
            artist: t.artist || 'Unknown Artist'
        }));
    } catch (err) {
        console.error("Folder loading and scan error:", err);
        return [];
    }
});

ipcMain.handle('open-file-dialog', async (event, options = {}) => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: options.properties || ['openFile', 'multiSelections'],
        filters: options.filters || [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'opus', 'm4a', 'm4b'] }]
    });
    if (result.canceled) return [];
    return result.filePaths;
});

