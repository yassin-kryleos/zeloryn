const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  encryptString: (plainText) => ipcRenderer.invoke('encrypt-string', plainText),
  decryptString: (cipherTextBase64) => ipcRenderer.invoke('decrypt-string', cipherTextBase64),
  isEncryptionAvailable: () => ipcRenderer.invoke('is-encryption-available'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) => {
    const subscription = (event, info) => callback(info);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  }
});
