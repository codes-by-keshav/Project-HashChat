// renderer.js

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    storageSize: document.getElementById("storageSize"),
    storageSizeDisplay: document.getElementById("storageSizeDisplay"),
    allocateBtn: document.getElementById("allocateBtn"),
    resultDiv: document.getElementById("result"),
    addressDisplay: document.getElementById("addressDisplay"),
    openChatBtn: document.getElementById("openChatBtn"),
    showMnemonicBtn: document.getElementById("showMnemonicBtn"),
    mnemonicDisplay: document.getElementById("mnemonicDisplay"),
    mnemonicInput: document.getElementById("mnemonicInput"),
    submitMnemonicBtn: document.getElementById("submitMnemonicBtn"),
    resetAccountBtn: document.getElementById("resetAccountBtn"),
    createAccountBtn: document.getElementById("createAccountBtn"),
    mnemonicContainer: document.getElementById("mnemonicContainer"),
    addressContainer: document.getElementById("addressContainer"),
    storageAllocator: document.getElementById("storageAllocator")

  };

  const storageSizes = [500, 700, 1000, 1500, 2000];

  function updateStorageSizeDisplay() {
    elements.storageSizeDisplay.textContent = `${storageSizes[elements.storageSize.value]} MB`;
  }

  function showAddress(address) {
    elements.addressDisplay.value = address;
    elements.addressContainer.style.display = 'block';
  }

  async function allocateStorage() {
    const size = storageSizes[elements.storageSize.value];
    console.log("Allocating storage:", size, "MB");
    const result = await window.electronAPI.allocateStorage(size);
    if (result.success) {
      elements.resultDiv.textContent = `Storage allocated: ${size} MB`;
      elements.resultDiv.className = "text-green-600";
      
      if (result.existingUser) {
        showMnemonicInput();
      } else {
        showCreateAccountButton();
      }
    } else {
      elements.resultDiv.textContent = result.message;
      elements.resultDiv.className = "text-red-600";
    }
  }

  async function createNewAccount() {
    console.log("Creating new account");
    try {
      const result = await window.electronAPI.createNewAccount();
      if (result.success) {
        showAddress(result.address);
        elements.mnemonicDisplay.textContent = result.mnemonic;
        elements.resultDiv.textContent = "New account created successfully.";
        elements.resultDiv.className = "text-green-600";
        showAccountControls();
      } else {
        elements.resultDiv.textContent = result.message;
        elements.resultDiv.className = "text-red-600";
      }
    } catch (error) {
      console.error("Error creating new account:", error);
      elements.resultDiv.textContent = "Failed to create new account: " + error.message;
      elements.resultDiv.className = "text-red-600";
    }
  }

  async function submitMnemonic() {
    const mnemonic = elements.mnemonicInput.value.trim();
    console.log("Submitting mnemonic");
    if (mnemonic) {
      const result = await window.electronAPI.submitMnemonic(mnemonic);
      if (result.success) {
        showAddress(result.address);
        elements.resultDiv.textContent = "Login successful.";
        elements.resultDiv.className = "text-green-600";
        showAccountControls();
      } else {
        elements.resultDiv.textContent = result.message;
        elements.resultDiv.className = "text-red-600";
      }
    }
  }

  async function resetAccount() {
    console.log("Resetting account");
    const confirm = window.confirm(
      "Are you sure you want to reset your account? This will delete all your data and cannot be undone."
    );
    if (confirm) {
      const result = await window.electronAPI.resetAccount();
      if (result.success) {
        resetUI();
        elements.resultDiv.textContent = "Account reset successfully.";
        elements.resultDiv.className = "text-green-600";
      } else {
        elements.resultDiv.textContent = "Failed to reset account. Please try again.";
        elements.resultDiv.className = "text-red-600";
      }
    }
  }

  function showMnemonicInput() {
    elements.mnemonicContainer.style.display = 'block';
    elements.createAccountBtn.style.display = 'none';
    elements.submitMnemonicBtn.textContent = 'Login to existing';
    elements.mnemonicInput.value = ''; 
  elements.mnemonicInput.focus();
  }

  function showCreateAccountButton() {
    elements.createAccountBtn.style.display = 'block';
    elements.mnemonicContainer.style.display = 'none';
  }

  function showAccountControls() {
    elements.createAccountBtn.style.display = 'none';
    elements.mnemonicContainer.style.display = 'none';
    elements.showMnemonicBtn.style.display = 'block';
    elements.openChatBtn.style.display = 'block';
    elements.storageAllocator.style.display = 'none';
    elements.addressContainer.style.display = 'block';
  }

  function resetUI() {
    elements.addressDisplay.value = "";
    elements.mnemonicInput.value = "";
    elements.mnemonicDisplay.textContent = "";
    elements.createAccountBtn.style.display = 'none';
    elements.mnemonicContainer.style.display = 'none';
    elements.showMnemonicBtn.style.display = 'none';
    elements.openChatBtn.style.display = 'none';
    elements.addressContainer.style.display = 'none';
    elements.storageAllocator.style.display = 'block';
  }

  // Event Listeners
  elements.storageSize.addEventListener("input", updateStorageSizeDisplay);
  elements.allocateBtn.addEventListener("click", allocateStorage);
  elements.createAccountBtn.addEventListener("click", createNewAccount);
  elements.submitMnemonicBtn.addEventListener("click", submitMnemonic);
  elements.resetAccountBtn.addEventListener("click", resetAccount);

  elements.showMnemonicBtn.addEventListener("click", async () => {
    console.log("Show Mnemonic button clicked");
    const mnemonic = await window.electronAPI.getMnemonic();
    console.log("Received mnemonic:", mnemonic);
    if (mnemonic) {
      elements.mnemonicDisplay.textContent = mnemonic;
      elements.mnemonicDisplay.style.display = 'block';
    } else {
      elements.mnemonicDisplay.textContent = "No mnemonic available.";
      elements.mnemonicDisplay.style.display = 'block';
    }
  });

  elements.openChatBtn.addEventListener("click", () => {
    window.electronAPI.openChatWebapp();
  });

  // Initialize
  updateStorageSizeDisplay();
  resetUI();

  // Handle initial app state
  window.electronAPI.onPromptMnemonic(async (event, existingUser, storageFileExists, hasValidMnemonic) => {
    console.log("Initial app state:", { existingUser, storageFileExists, hasValidMnemonic });
    if (existingUser) {
      showMnemonicInput();
      if (!storageFileExists) {
        elements.resultDiv.textContent = "Storage file not found. Please allocate storage again.";
        elements.resultDiv.className = "text-blue-600";
      }
    } else if (!storageFileExists) {
      elements.resultDiv.textContent = "Please allocate storage first.";
      elements.resultDiv.className = "text-blue-600";
    }
  });

  window.electronAPI.onStorageFileDeleted(() => {
    console.log("Storage file deleted");
    resetUI();
    elements.resultDiv.textContent = "Storage file was deleted. Please allocate storage again.";
    elements.resultDiv.className = "text-red-600";
  });

  window.electronAPI.onAccountReset(() => {
    console.log("Account reset");
    resetUI();
  });
});