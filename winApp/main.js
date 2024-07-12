const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

let mainWindow;
let allocatedStorage = 0;
let storageFilePath = '';
let storageStore;


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

function initializeApp() {
    import('electron-store').then((Store) => {
        storageStore = new Store.default();
        storageFilePath = storageStore.get('storageFilePath', '');
        allocatedStorage = storageStore.get('allocatedStorage', 0);
        createWindow();
    }).catch((error) => {
        console.error('Failed to load electron-store:', error);
        createWindow();
    });
}

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('allocate-storage', async (event, size) => {
    if (!storageStore) {
        return { success: false, message: 'Storage system not initialized.' };
    }

    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return { success: false, message: 'Directory selection cancelled.' };
        }

        const selectedDir = result.filePaths[0];
        const hashchatDir = path.join(selectedDir, 'HashChat Storage');
        
        await fs.mkdir(hashchatDir, { recursive: true });

        const uniqueFileName = `blockchain_${crypto.randomBytes(8).toString('hex')}.hcb`;
        storageFilePath = path.join(hashchatDir, uniqueFileName);

        await fs.writeFile(storageFilePath, Buffer.alloc(size * 1024 * 1024));
        allocatedStorage = size;

        storageStore.set('storageFilePath', storageFilePath);
        storageStore.set('allocatedStorage', allocatedStorage);

        return { success: true, message: 'Storage allocated successfully.', path: storageFilePath };
    } catch (error) {
        console.error('Storage allocation failed:', error);
        return { success: false, message: 'Storage allocation failed: ' + error.message };
    }
});

ipcMain.handle('verify-storage', async (event) => {
    if (!storageStore) {
        return { success: false, message: 'Storage system not initialized.', needManualSelection: true };
    }

    if (!storageFilePath) {
        return { success: false, message: 'No storage has been allocated yet.' };
    }

    try {
        const stats = await fs.stat(storageFilePath);
        const isValid = stats.size === allocatedStorage * 1024 * 1024; 
        //till now it verifies only on basis of size of file, have to change later
        return { 
            success: isValid, 
            message: isValid ? 'Storage verified successfully.' : 'Storage verification failed.',
            path: isValid ? storageFilePath : null,
            needManualSelection: !isValid
        };
    } catch (error) {
        console.error('Storage verification failed:', error);
        return { success: false, message: 'Storage verification failed: ' + error.message };
    }
});


ipcMain.handle('manual-file-selection', async (event) => {
    if (!storageStore) {
        return { success: false, message: 'Storage system not initialized.' };
    }
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'HashChat Blockchain', extensions: ['hcb'] }]
        });

        if (result.canceled) {
            return { success: false, message: 'File selection cancelled.' };
        }

        const selectedFile = result.filePaths[0];
        const stats = await fs.stat(selectedFile);
        
        // Assuming the file size is valid if it's one of the allowed sizes
        const allowedSizes = [500, 700, 1000, 1500, 2000];
        const fileSizeMB = Math.round(stats.size / (1024 * 1024));
        const isValidSize = allowedSizes.includes(fileSizeMB);

        if (isValidSize) {
            storageFilePath = selectedFile;
            allocatedStorage = fileSizeMB;
            storageStore.set('storageFilePath', storageFilePath);
            storageStore.set('allocatedStorage', allocatedStorage);
            return { success: true, message: 'File verified successfully.', path: storageFilePath };
        } else {
            return { success: false, message: 'Invalid file size.' };
        }
    } catch (error) {
        console.error('Manual file selection failed:', error);
        return { success: false, message: 'File verification failed: ' + error.message };
    }
});


ipcMain.handle('open-chat-webapp', () => {
    require('electron').shell.openExternal('http://localhost:3000');
});