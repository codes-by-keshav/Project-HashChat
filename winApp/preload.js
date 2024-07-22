// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  allocateStorage: (size) => ipcRenderer.invoke("allocate-storage", size),
  openChatWebapp: () => ipcRenderer.invoke("open-chat-webapp"),
  chooseAccount: (choice) => ipcRenderer.invoke("choose-account", choice),
  submitMnemonic: (mnemonic) => ipcRenderer.invoke("submit-mnemonic", mnemonic),
  onPromptMnemonic: (callback) => ipcRenderer.on("init-app-state", callback),
  checkExistingUser: () => ipcRenderer.invoke("check-existing-user"),
  onStorageFileDeleted: (callback) =>
    ipcRenderer.on("storage-file-deleted", callback),
  onStorageAllocated: (callback) =>
    ipcRenderer.on("storage-allocated", callback),
  resetAccount: () => ipcRenderer.invoke("reset-account"),
  removeStorage: () => ipcRenderer.invoke("remove-storage"),
  checkStorageFileExists: () => ipcRenderer.invoke("check-storage-file-exists"),
  onAccountReset: (callback) => ipcRenderer.on("account-reset", callback),
  createNewAccount: () => ipcRenderer.invoke("create-new-account"),
  getMnemonic: () => ipcRenderer.invoke("get-mnemonic"),
  openChatWebapp: () => ipcRenderer.invoke("open-chat-webapp"),
  

});