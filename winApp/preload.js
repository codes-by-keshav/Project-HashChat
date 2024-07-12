const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    allocateStorage: (size) => ipcRenderer.invoke('allocate-storage', size),
    verifyStorage: () => ipcRenderer.invoke('verify-storage'),
    manualFileSelection: () => ipcRenderer.invoke('manual-file-selection'),
    openChatWebapp: () => ipcRenderer.invoke('open-chat-webapp')
});