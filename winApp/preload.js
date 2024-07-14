//preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  allocateStorage: (size) => ipcRenderer.invoke("allocate-storage", size),
  verifyStorage: () => ipcRenderer.invoke("verify-storage"),
  manualFileSelection: () => ipcRenderer.invoke("manual-file-selection"),
  openChatWebapp: () => ipcRenderer.invoke("open-chat-webapp"),
  getMnemonic: () => ipcRenderer.invoke("get-mnemonic"),
  getAddress: () => ipcRenderer.invoke("get-address"),
  chooseAccount: (choice, mnemonic) =>
    ipcRenderer.invoke("choose-account", choice, mnemonic),

  checkStorageIntegrity: () => ipcRenderer.invoke("check-storage-integrity"),
  onStorageIntegrityLost: (callback) =>
    ipcRenderer.on("storage-integrity-lost", callback),
});
