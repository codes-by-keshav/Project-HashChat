//rendere.js

const allocateBtn = document.getElementById("allocateBtn");
const verifyBtn = document.getElementById("verifyBtn");
const openChatBtn = document.getElementById("openChatBtn");
const resultDiv = document.getElementById("result");
const storageSize = document.getElementById("storageSize");
const storageSizeDisplay = document.getElementById("storageSizeDisplay");
const manualSelectionLink = document.getElementById("manualSelectionLink");
const addressDisplay = document.getElementById("addressDisplay");
const mnemonicDisplay = document.getElementById("mnemonicDisplay");
const keyInfoDiv = document.getElementById("keyInfo");
const addressContainer = document.getElementById("addressContainer");
const showMnemonicBtn = document.getElementById("showMnemonicBtn");

const storageSizes = [500, 700, 1000, 1500, 2000];

function updateStorageSizeDisplay() {
  const index = parseInt(storageSize.value);
  storageSizeDisplay.textContent = `${storageSizes[index]} MB`;
}

function showAccountChoiceButtons() {
  console.log("showAccountChoiceButtons called");
  const existingButtons = document.getElementById("accountChoiceButtons");
  if (existingButtons) {
    existingButtons.remove();
  }
  const choiceButtons = document.createElement("div");
  choiceButtons.innerHTML = `
      <button id="newAccountBtn" class="bg-[#284863] text-white py-2 px-4 rounded hover:bg-[#192e3f] transition duration-300 mr-2">Create New Account</button>
      <button id="existingAccountBtn" class="bg-[#284863] text-white py-2 px-4 rounded hover:bg-[#192e3f] transition duration-300">Login to Existing Account</button>
    `;
  resultDiv.after(choiceButtons);

  document
    .getElementById("newAccountBtn")
    .addEventListener("click", () => chooseAccount("new"));
  document
    .getElementById("existingAccountBtn")
    .addEventListener("click", promptMnemonic);
}

async function chooseAccount(choice, mnemonic = null) {
  console.log("Choosing account:", choice);
  const result = await window.electronAPI.chooseAccount(choice, mnemonic);
  if (result.success) {
    showAddress(result.address);
    if (result.mnemonic) {
      window.currentMnemonic = result.mnemonic;
      showMnemonicBtn.style.display = 'block';
    }
    openChatBtn.style.display = 'block';
  } else {
    resultDiv.textContent = result.message;
    resultDiv.className = 'text-red-600';
  }
}

function promptMnemonic() {
    const mnemonicInput = document.createElement('textarea');
    mnemonicInput.placeholder = "Enter your 12-word mnemonic phrase";
    mnemonicInput.className = "w-full p-2 border rounded mb-2";
    const submitButton = document.createElement('button');
    submitButton.textContent = "Submit";
    submitButton.className = "bg-[#284863] text-white py-2 px-4 rounded hover:bg-[#192e3f] transition duration-300";
    
    const container = document.createElement('div');
    container.appendChild(mnemonicInput);
    container.appendChild(submitButton);
    
    resultDiv.after(container);

    submitButton.addEventListener('click', () => {
        const mnemonic = mnemonicInput.value.trim();
        if (mnemonic) {
            chooseAccount('existing', mnemonic);
            container.remove();
        } else {
            alert("Please enter a valid mnemonic phrase.");
        }
    });
}

function showAddress(address) {
  addressDisplay.value = address;
  addressDisplay.style.display = "block";
  addressContainer.style.display = "block";
}

storageSize.addEventListener("input", updateStorageSizeDisplay);

// Initial display update
updateStorageSizeDisplay();

allocateBtn.addEventListener("click", async () => {
  const size = storageSizes[parseInt(storageSize.value)];
  const result = await window.electronAPI.allocateStorage(size);
  resultDiv.textContent = result.message;
  resultDiv.className = result.success ? "text-green-600" : "text-red-600";
  if (result.success) {
    resultDiv.textContent += ` File created at: ${result.path}`;
    manualSelectionLink.style.display = "none";
    
  } else {
    manualSelectionLink.style.display = "block";
  }
});

verifyBtn.addEventListener("click", async () => {
  console.log("Verify button clicked");
  const result = await window.electronAPI.verifyStorage();
  console.log("Verification result:", result);
  resultDiv.textContent = result.message;
  resultDiv.className = result.success ? "text-green-600" : "text-red-600";

  if (result.success) {
    resultDiv.textContent += ` Verified file at: ${result.path}`;
    manualSelectionLink.style.display = "none";

    if (result.needAccountChoice) {
      console.log("Showing account choice buttons");
      showAccountChoiceButtons();
    } else if (result.address) {
      console.log("Showing address:", result.address);
      showAddress(result.address);
      openChatBtn.style.display = "block";
    }
  } else {
    console.log("Verification failed");
    openChatBtn.style.display = "none";
    if (result.needManualSelection) {
      manualSelectionLink.style.display = "block";
    }
    addressContainer.style.display = "none";
  }
});

showMnemonicBtn.addEventListener('click', async () => {
  let mnemonic = window.currentMnemonic;
  if (!mnemonic) {
    mnemonic = await window.electronAPI.getMnemonic();
  }
  if (mnemonic) {
    mnemonicDisplay.textContent = mnemonic;
    mnemonicDisplay.style.display = 'block';
  } else {
    mnemonicDisplay.textContent = 'No mnemonic available.';
    mnemonicDisplay.style.display = 'block';
  }
});

manualSelectionLink.addEventListener("click", async () => {
  const result = await window.electronAPI.manualFileSelection();
  resultDiv.textContent = result.message;
  resultDiv.className = result.success ? "text-green-600" : "text-red-600";

  if (result.success) {
    resultDiv.textContent += ` Verified file at: ${result.path}`;
    manualSelectionLink.style.display = "none";

    if (result.needAccountChoice) {
      showAccountChoiceButtons();
    } else {
      showAddress(result.address);
      openChatBtn.style.display = "block";
    }
  } else {
    openChatBtn.style.display = "none";
    manualSelectionLink.style.display = "block";
    addressContainer.style.display = "none";
  }
});

window.electronAPI.onStorageIntegrityLost(() => {
  resultDiv.textContent = "Storage integrity check failed. Please verify your storage.";
  resultDiv.className = "text-red-600";
  verifyBtn.style.display = "block";
  openChatBtn.style.display = "none";
  addressContainer.style.display = "none";
});

openChatBtn.addEventListener("click", () => {
  window.electronAPI.openChatWebapp();
});
