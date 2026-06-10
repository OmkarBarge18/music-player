const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFolder: () => ipcRenderer.invoke('open-folder-dialog'),
    openFiles: (options) => ipcRenderer.invoke('open-file-dialog', options),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    getAppConfig: () => ipcRenderer.invoke('get-app-config')
});
