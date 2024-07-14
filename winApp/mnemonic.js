//mnemonic.js

console.log("mnemonic.js loaded");

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");
    
    window.electronAPI.onMnemonicData((mnemonic) => {
        console.log("Received mnemonic data in renderer:", mnemonic);
        const mnemonicDisplay = document.getElementById('mnemonicDisplay');
        if (mnemonicDisplay) {
            mnemonicDisplay.textContent = mnemonic;
            console.log("Mnemonic displayed in DOM");
        } else {
            console.error("mnemonicDisplay element not found");
        }
    });
});

// document.getElementById('closeBtn').addEventListener('click', () => {
//     window.close();
// });