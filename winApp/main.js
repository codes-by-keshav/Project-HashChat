//main.js

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const { secp256k1 } = require("ethereum-cryptography/secp256k1");
const { keccak256 } = require("ethereum-cryptography/keccak");
const { bytesToHex, hexToBytes } = require("ethereum-cryptography/utils");
const { HDKey } = require("ethereum-cryptography/hdkey");
const bip39 = require("@scure/bip39");
const { wordlist } = require("@scure/bip39/wordlists/english");

let mainWindow;
let allocatedStorage = 0;
let storageFilePath = "";
let storageStore;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");
}

function initializeApp() {
  import("electron-store")
    .then((Store) => {
      storageStore = new Store.default();
      storageFilePath = storageStore.get("storageFilePath", "");
      allocatedStorage = storageStore.get("allocatedStorage", 0);
      createWindow();
    })
    .catch((error) => {
      console.error("Failed to load electron-store:", error);
      createWindow();
    });
}

function generateKeys(allocatedStorage) {
  const mnemonic = bip39.generateMnemonic(wordlist);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const wallet = hdKey.derive("m/44'/60'/0'/0/0");

  const privateKey = wallet.privateKey;
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1);
  const address = keccak256(publicKey).slice(-20);
  console.log("Generated keys:", {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    address: "0x" + bytesToHex(address),
    mnemonic: mnemonic,
  });

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    address: "0x" + bytesToHex(address),
    mnemonic: mnemonic,
  };
}

function deriveKeysFromMnemonic(mnemonic) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const wallet = hdKey.derive("m/44'/60'/0'/0/0");

  const privateKey = wallet.privateKey;
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1);
  const address = keccak256(publicKey).slice(-20);
  console.log("Derived keys:", {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    address: "0x" + bytesToHex(address),
    mnemonic: mnemonic,
  });

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    address: "0x" + bytesToHex(address),
    mnemonic: mnemonic,
  };
}

async function checkStorageIntegrity() {
  if (!storageFilePath || !allocatedStorage) {
    console.log("Storage not initialized yet");
    return false;
  }

  try {
    const stats = await fs.stat(storageFilePath);
    const isValid = stats.size === allocatedStorage * 1024 * 1024;
    
    if (!isValid) {
      console.warn("Storage file size mismatch");
      return false;
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn("Storage file does not exist yet");
      return false;
    }
    console.error("Error checking storage integrity:", error);
    return false;
  }
}

let storageCheckInterval;

function startStorageIntegrityCheck() {
  if (storageCheckInterval) {
    clearInterval(storageCheckInterval);
  }
  if (storageFilePath && allocatedStorage) {
    storageCheckInterval = setInterval(async () => {
      const isIntact = await checkStorageIntegrity();
      if (!isIntact) {
        mainWindow.webContents.send('storage-integrity-lost');
      }
    }, 5000); // Check every minute
  }
}

function stopStorageIntegrityCheck() {
  if (storageCheckInterval) {
    clearInterval(storageCheckInterval);
  }
}

app.whenReady().then(() => {
  initializeApp();
  startStorageIntegrityCheck();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  stopStorageIntegrityCheck();
});

ipcMain.handle("check-storage-integrity", async () => {
  return await checkStorageIntegrity();
});

ipcMain.handle("allocate-storage", async (event, size) => {
  if (!storageStore) {
    return { success: false, message: "Storage system not initialized." };
  }

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });

    if (result.canceled) {
      return { success: false, message: "Directory selection cancelled." };
    }

    const selectedDir = result.filePaths[0];
    const hashchatDir = path.join(selectedDir, "HashChat-Storage");

    await fs.mkdir(hashchatDir, { recursive: true });

    const uniqueFileName = `blockchain_${crypto
      .randomBytes(8)
      .toString("hex")}.hcbdb`;
    storageFilePath = path.join(hashchatDir, uniqueFileName);

    // Use writeFile instead of openSync and write
    await fs.writeFile(storageFilePath, Buffer.alloc(size * 1024 * 1024));
    
    allocatedStorage = size;
    storageStore.delete("keys");

    storageStore.set("storageFilePath", storageFilePath);
    storageStore.set("allocatedStorage", allocatedStorage);

    return {
      success: true,
      message: "Storage allocated successfully.",
      path: storageFilePath,
    };
  } catch (error) {
    console.error("Storage allocation failed:", error);
    return {
      success: false,
      message: "Storage allocation failed: " + error.message,
    };
  }
});

ipcMain.handle("verify-storage", async (event) => {
  console.log("Verify storage handler called");

  if (!storageStore) {
    console.log("Storage system not initialized");
    return {
      success: false,
      message: "Storage system not initialized.",
      needManualSelection: true,
    };
  }

  if (!storageFilePath) {
    console.log("No storage has been allocated yet");
    return {
      success: false,
      message: "No storage has been allocated yet.",
      needManualSelection: true,
    };
  }

  try {
    const stats = await fs.stat(storageFilePath);
    const isValid = stats.size === allocatedStorage * 1024 * 1024;

    console.log("Storage file validity:", isValid);

    if (isValid) {
      // Always clear existing keys and prompt for account choice
      storageStore.delete("keys");
      console.log("Existing keys cleared, returning needAccountChoice: true");
      
      // Start the storage integrity check after successful verification
      startStorageIntegrityCheck();

      return {
        success: true,
        message: "Storage verified successfully. Choose to create new account or login to existing.",
        path: storageFilePath,
        needAccountChoice: true,
      };
    } else {
      console.log("Storage file is invalid");
      return {
        success: false,
        message: "Storage file is invalid.",
        needManualSelection: true,
      };
    }
  } catch (error) {
    console.error("Storage verification failed:", error);
    return {
      success: false,
      message: "Storage verification failed: " + error.message,
      needManualSelection: true,
    };
  }
});

ipcMain.handle("choose-account", async (event, choice, mnemonic = null) => {
  if (choice === "new") {
    try {
      const keys = generateKeys(allocatedStorage);
      storageStore.set("keys", { ...keys, filePath: storageFilePath });
      console.log("New account created with mnemonic:", keys.mnemonic);
      return {
        success: true,
        message: "New account created successfully.",
        address: keys.address,
        mnemonic: keys.mnemonic,
      };
    } catch (error) {
      console.error("Failed to create new account:", error);
      return {
        success: false,
        message: "Failed to create new account: " + error.message,
      };
    }
  } else if (choice === "existing" && mnemonic) {
    try {
      const keys = deriveKeysFromMnemonic(mnemonic);
      storageStore.set("keys", {
        ...keys,
        filePath: storageFilePath,
        mnemonic: mnemonic,
      }); // Store mnemonic
      console.log("Logged in with existing account, address:", keys.address);
      return {
        success: true,
        message: "Logged in to existing account successfully.",
        address: keys.address,
        mnemonic: mnemonic, // Return mnemonic
      };
    } catch (error) {
      console.error("Failed to derive keys from mnemonic:", error);
      console.error("Mnemonic used:", mnemonic);
      return {
        success: false,
        message:
          "Failed to derive keys from mnemonic. Please check your phrase and try again.",
      };
    }
  } else {
    return {
      success: false,
      message: "Invalid choice or missing mnemonic.",
    };
  }
});

ipcMain.handle("manual-file-selection", async (event) => {
  if (!storageStore) {
    return { success: false, message: "Storage system not initialized." };
  }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "HashChat Blockchain", extensions: ["hcbdb"] }],
    });

    if (result.canceled) {
      return { success: false, message: "File selection cancelled." };
    }

    const selectedFile = result.filePaths[0];
    const stats = await fs.stat(selectedFile);

    const allowedSizes = [500, 700, 1000, 1500, 2000];
    const fileSizeMB = Math.round(stats.size / (1024 * 1024));
    const isValidSize = allowedSizes.includes(fileSizeMB);

    if (isValidSize) {
      storageFilePath = selectedFile;
      allocatedStorage = fileSizeMB;
      storageStore.set("storageFilePath", storageFilePath);
      storageStore.set("allocatedStorage", allocatedStorage);

      return {
        success: true,
        message:
          "File verified successfully. Choose to create new account or login to existing.",
        path: storageFilePath,
        needAccountChoice: true,
      };
    } else {
      return { success: false, message: "Invalid file size." };
    }
  } catch (error) {
    console.error("Manual file selection failed:", error);
    return {
      success: false,
      message: "File verification failed: " + error.message,
    };
  }
});

ipcMain.handle("get-address", () => {
  const address = storageStore.get("address");
  console.log("getAddress called, returning:", address);
  return address;
});

ipcMain.handle("get-mnemonic", () => {
  const keys = storageStore.get("keys");
  return keys ? keys.mnemonic : null;
});

ipcMain.handle("open-chat-webapp", () => {
  require("electron").shell.openExternal("http://localhost:3000");
});
