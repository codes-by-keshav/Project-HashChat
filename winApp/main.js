//main.js

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const axios = require("axios");
const { secp256k1 } = require("ethereum-cryptography/secp256k1");
const { keccak256 } = require("ethereum-cryptography/keccak");
const { bytesToHex, hexToBytes } = require("ethereum-cryptography/utils");
const { HDKey } = require("ethereum-cryptography/hdkey");
const bip39 = require("@scure/bip39");
const { wordlist } = require("@scure/bip39/wordlists/english");

let mainWindow;
let storageCheckInterval;
let allocatedStorage = 0;
let storageFilePath = "";
let storageStore;


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(
      __dirname,
      "img",
      process.platform === "win32" ? "hashtag-icon.ico" : "hashtag-icon.png"
    ),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");
  startHeartbeat();

  mainWindow.webContents.on("did-finish-load", async () => {
    const existingUser = storageStore.has("encryptedKeys");
    const storageFileExists = await checkStorageFileExists();
    const hasValidMnemonic = storageStore.has("encryptedKeys");
    console.log("Initializing app state:", { existingUser, storageFileExists, hasValidMnemonic });
    mainWindow.webContents.send(
      'init-app-state',
      existingUser,
      storageFileExists,
      hasValidMnemonic
    );
  });
}

async function initializeApp() {
  try {
    const Store = await import('electron-store');
    storageStore = new Store.default();
    storageFilePath = storageStore.get("storageFilePath", "");
    allocatedStorage = storageStore.get("allocatedStorage", 0);
    console.log("App initialized. Storage file path:", storageFilePath, "Allocated storage:", allocatedStorage);
    await createWindow();
  } catch (error) {
    console.error("Error initializing app:", error);
  }
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

function encrypt(data, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, salt: salt.toString("hex"), iv: iv.toString("hex") };
}

function decrypt(encryptedData, password) {
  const { encrypted, salt, iv } = encryptedData;
  const key = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32);
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    key,
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

async function handleRemoveStorage() {
  console.log("Handling storage removal");
  const address = storageStore.get("address");
  if (address) {
    try {
      await axios.post("http://localhost:8080/remove_storage", { user_id: address });
      console.log("Server notified about storage removal for address:", address);
    } catch (error) {
      console.error("Failed to notify server about storage removal:", error);
    }
  }
  // storageStore.clear();
  // console.log("Local storage cleared");
}

async function checkStorageFileExists() {
  if (!storageFilePath) {
    console.log("Storage file path is not set");
    return false;
  }
  try {
    await fs.access(storageFilePath);
    console.log("Storage file exists");
    return true;
  } catch (error) {
    console.log("Storage file not found:", error.message);
    return false;
  }
}

function startStorageCheck() {
  if (storageCheckInterval) {
    clearInterval(storageCheckInterval);
  }
  storageCheckInterval = setInterval(async () => {
    console.log("Checking storage file existence...");
    const exists = await checkStorageFileExists();
    if (!exists) {
      console.log("Storage file not found during check");
      clearInterval(storageCheckInterval);
      mainWindow.webContents.send("storage-file-deleted");
      // Use the centralized handleRemoveStorage function
      await handleRemoveStorage();
    } else {
      console.log("Storage file exists");
    }
  }, 5000); // Check every 5 seconds
}

async function updateServerWithUserInfo(capacityInBytes) {
  try {
    const address = storageStore.get("address");
    if (!address) {
      throw new Error("User address not found. Please create or login to an account first.");
    }

    const response = await axios.post("http://localhost:8080/verify_storage", {
      user_id: address,
      capacity: capacityInBytes.toString()
    });

    if (response.data.status !== "success") {
      throw new Error("Failed to update user info on the server");
    }

    console.log("Server updated successfully with user info for address:", address);
  } catch (error) {
    console.error("Error updating user info with server:", error);
    if (error.response) {
      console.error("Server responded with:", error.response.data);
    }
    if (error.code === "ECONNREFUSED") {
      throw new Error("Cannot reach server. Please try again later.");
    }
    throw error;
  }
}

function startHeartbeat() {
  setInterval(async () => {
    try {
      const address = storageStore.get("address");
      if (address) {
        await axios.post("http://localhost:8080/heartbeat", { user_id: address });
        console.log("address: ", address + " is  online");
      } else {
        console.log("No address found for heartbeat");
      }
    } catch (error) {
      console.error("Failed to send heartbeat:", error);
    }
  }, 5000); // Send heartbeat every 5 seconds
}




app.whenReady().then(() => {
  initializeApp().catch(console.error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("allocate-storage", async (event, size) => {
  console.log("Allocating storage:", size, "MB");
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

    // Calculate capacity in bytes
    const capacityInBytes = BigInt(size) * BigInt(1024 * 1024); // Convert MB to bytes

    // Use writeFile instead of openSync and write
    await fs.writeFile(storageFilePath, Buffer.alloc(Number(capacityInBytes)));

    allocatedStorage = size;
    
    // Instead of deleting, check if the user already exists
    const existingUser = storageStore.has("encryptedKeys");

    storageStore.set("storageFilePath", storageFilePath);
    storageStore.set("allocatedStorage", allocatedStorage);
    storageStore.set("fileAssociated", false); // Reset the file association

    startStorageCheck();

    mainWindow.webContents.send("storage-allocated", {
      size: allocatedStorage,
      existingUser: existingUser
    });

    return {
      success: true,
      message: "Storage allocated successfully.",
      path: storageFilePath,
      existingUser: existingUser
    };
  } catch (error) {
    console.error("Storage allocation failed:", error);
    return {
      success: false,
      message: "Storage allocation failed: " + error.message,
    };
  }
});

ipcMain.handle("submit-mnemonic", async (event, mnemonic) => {
  console.log("Processing submitted mnemonic");

  try {
    const derivedKeys = deriveKeysFromMnemonic(mnemonic);
    const encryptedKeys = storageStore.get("encryptedKeys");
    const password = storageStore.get("password");

    if (!encryptedKeys || !password) {
      throw new Error("No existing account found. Please create a new account.");
    }

    const storedKeys = decrypt(encryptedKeys, password);

    if (derivedKeys.address !== storedKeys.address) {
      throw new Error("Mnemonic does not match stored keys");
    }

    // Check if storage file exists, if not, recreate it
    const storageExists = await checkStorageFileExists();
    if (!storageExists) {
      const allocatedStorage = storageStore.get("allocatedStorage");
      if (!allocatedStorage) {
        throw new Error("Cannot recreate storage file. Storage size unknown.");
      }
      
      // Recreate the storage file
      const result = await allocateStorage(allocatedStorage);
      if (!result.success) {
        throw new Error("Failed to recreate storage file.");
      }
    }

    // Re-encrypt with the same password for consistency
    const newEncryptedKeys = encrypt(derivedKeys, password);
    storageStore.set("encryptedKeys", newEncryptedKeys);
    
    const capacityInBytes = BigInt(allocatedStorage) * BigInt(1024 * 1024);
    await updateServerWithUserInfo(capacityInBytes.toString());
    startStorageCheck();

    return {
      success: true,
      message: "Logged in and updated server successfully.",
      address: derivedKeys.address,
      mnemonic: mnemonic,
      storageRecreated: !storageExists
    };
  } catch (error) {
    console.error("Failed to process mnemonic:", error);
    return {
      success: false,
      message: error.message || "Failed to process mnemonic. Please check your phrase and try again.",
    };
  }
});

ipcMain.handle("create-new-account", async () => {
  console.log("Creating new account");
  try {
    const keys = generateKeys(allocatedStorage);
    const password = crypto.randomBytes(32).toString("hex");
    const encryptedKeys = encrypt(keys, password);
    storageStore.set("encryptedKeys", encryptedKeys);
    storageStore.set("password", password);
    storageStore.set("address", keys.address);

    const capacityInBytes = BigInt(allocatedStorage) * BigInt(1024 * 1024);
    await updateServerWithUserInfo(capacityInBytes.toString());

    console.log("New account created successfully");
    return {
      success: true,
      message: "New account created and server updated successfully.",
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
});

ipcMain.handle("update-distributed-storage", async (event) => {
  const keys = storageStore.get("keys");

  if (!keys || !keys.address) {
    return {
      success: false,
      message:
        "User keys not found. Please create or login to an account first.",
    };
  }

  try {
    console.log("Sending request to update distributed storage on the server");
    const response = await axios.post("http://localhost:8080/verify_storage", {
      user_id: keys.address,
      capacity: allocatedStorage * 1024 * 1024, // Convert MB to bytes
    });
    console.log("Received response from server:", response.data);

    if (response.data.status !== "success") {
      throw new Error("Failed to update distributed storage on the server");
    }

    return {
      success: true,
      message: "Distributed storage updated successfully.",
    };
  } catch (error) {
    console.error("Error updating distributed storage with server:", error);
    return {
      success: false,
      message:
        "Failed to update distributed storage with the blockchain server: " +
        error.message,
    };
  }
});

ipcMain.handle("choose-account", async (event, choice) => {
  const storageExists = await checkStorageFileExists();
  if (!storageExists) {
    return {
      success: false,
      message: "Storage file not found. Please allocate storage first.",
    };
  }

  if (choice === "new") {
    try {
      const keys = generateKeys(allocatedStorage);
      const password = crypto.randomBytes(32).toString("hex");
      const encryptedKeys = encrypt(keys, password);
      storageStore.set("encryptedKeys", encryptedKeys);
      storageStore.set("password", password);
      storageStore.set("address", keys.address);

      const capacityInBytes = BigInt(allocatedStorage) * BigInt(1024 * 1024);
      await updateServerWithUserInfo(capacityInBytes.toString());

      return {
        success: true,
        message: "New account created and server updated successfully.",
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
  } else {
    return {
      success: false,
      message: "Invalid choice.",
    };
  }
});

ipcMain.handle("reset-account", async () => {
  console.log("Resetting account");

  try {
    // Delete the .hcbdb file if it exists
    if (storageFilePath) {
      await fs.unlink(storageFilePath).catch(() => {});
    }
    // Clear all stored data
    storageStore.clear();
    // Notify the server about storage removal
    await handleRemoveStorage();
    // Send a message to the renderer to update UI
    mainWindow.webContents.send("account-reset");

    return { success: true, message: "Account reset successfully." };
  } catch (error) {
    console.error("Error resetting account:", error);
    return { success: false, message: "Failed to reset account: " + error.message };
  }
});

ipcMain.handle("get-address", () => {
  const address = storageStore.get("address");
  console.log("getAddress called, returning:", address);
  return address;
});

ipcMain.handle("remove-storage", handleRemoveStorage);

ipcMain.handle("get-mnemonic", () => {
  console.log("Getting mnemonic");
  const encryptedKeys = storageStore.get("encryptedKeys");
  const password = storageStore.get("password");
  if (encryptedKeys && password) {
    const keys = decrypt(encryptedKeys, password);
    console.log("Retrieved mnemonic");
    return keys.mnemonic;
  }
  console.log("No mnemonic found");
  return null;
});

ipcMain.handle("check-storage-file-exists", checkStorageFileExists);

ipcMain.handle("check-existing-user", () => {
  const hasExistingUser = storageStore.has("encryptedKeys");
  console.log("Checking for existing user:", hasExistingUser);
  return hasExistingUser;
});

ipcMain.handle("open-chat-webapp", () => {
  console.log("Opening chat webapp");
  require("electron").shell.openExternal("http://localhost:3000");
});

app.on("before-quit", () => {
  if (storageCheckInterval) {
    clearInterval(storageCheckInterval);
  }
});

