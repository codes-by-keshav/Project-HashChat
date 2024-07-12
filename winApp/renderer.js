const allocateBtn = document.getElementById('allocateBtn');
const verifyBtn = document.getElementById('verifyBtn');
const openChatBtn = document.getElementById('openChatBtn');
const resultDiv = document.getElementById('result');
const storageSize = document.getElementById('storageSize');
const storageSizeDisplay = document.getElementById('storageSizeDisplay');
const manualSelectionLink = document.getElementById('manualSelectionLink');

const storageSizes = [500, 700, 1000, 1500, 2000];

function updateStorageSizeDisplay() {
    const index = parseInt(storageSize.value);
    storageSizeDisplay.textContent = `${storageSizes[index]} MB`;
}

storageSize.addEventListener('input', updateStorageSizeDisplay);

// Initial display update
updateStorageSizeDisplay();

allocateBtn.addEventListener('click', async () => {
    const size = storageSizes[parseInt(storageSize.value)];
    const result = await window.electronAPI.allocateStorage(size);
    resultDiv.textContent = result.message;
    resultDiv.className = result.success ? 'text-green-600' : 'text-red-600';
    if (result.success) {
        resultDiv.textContent += ` File created at: ${result.path}`;
        manualSelectionLink.style.display = 'none';
    } else {
        manualSelectionLink.style.display = 'block';
    }
});

verifyBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.verifyStorage();
    resultDiv.textContent = result.message;
    resultDiv.className = result.success ? 'text-green-600' : 'text-red-600';
    openChatBtn.style.display = result.success ? 'block' : 'none';
    
    // Show the manual selection link when verification fails
    manualSelectionLink.style.display = result.success ? 'none' : 'block';
    
    if (result.success) {
        resultDiv.textContent += ` Verified file at: ${result.path}`;
    }
});

manualSelectionLink.addEventListener('click', async () => {
    const result = await window.electronAPI.manualFileSelection();
    resultDiv.textContent = result.message;
    resultDiv.className = result.success ? 'text-green-600' : 'text-red-600';
    openChatBtn.style.display = result.success ? 'block' : 'none';
    manualSelectionLink.style.display = result.success ? 'none' : 'block';
    if (result.success) {
        resultDiv.textContent += ` Verified file at: ${result.path}`;
    }
});

openChatBtn.addEventListener('click', () => {
    window.electronAPI.openChatWebapp();
});