//preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  allocateStorage: (size) => ipcRenderer.invoke("allocate-storage", size),
  verifyStorage: () => ipcRenderer.invoke("verify-storage"),
  manualFileSelection: () => ipcRenderer.invoke("manual-file-selection"),
  openChatWebapp: () => ipcRenderer.invoke("open-chat-webapp"),
  getMnemonic: () => ipcRenderer.invoke("get-mnemonic"),
  getAddress: () => ipcRenderer.invoke("get-address"),
  showMnemonic: (mnemonic) => ipcRenderer.invoke("show-mnemonic", mnemonic),
  chooseAccount: (choice, mnemonic) =>
    ipcRenderer.invoke("choose-account", choice, mnemonic),
  onMnemonicData: (callback) => {
    console.log("Setting up onMnemonicData listener");
    ipcRenderer.on("mnemonic-data", (_, value) => {
      console.log("Received mnemonic in preload:", value);
      callback(value);
    });
  },
  onMnemonicWindowClosed: (callback) =>
    ipcRenderer.on("mnemonic-window-closed", () => callback()),
  checkStorageIntegrity: () => ipcRenderer.invoke("check-storage-integrity"),
  onStorageIntegrityLost: (callback) =>
    ipcRenderer.on("storage-integrity-lost", callback),
});
