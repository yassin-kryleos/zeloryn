const { contextBridge, ipcRenderer } = require('electron');

let sessionSecret = '';
try {
  sessionSecret = ipcRenderer.sendSync('get-session-secret-sync') || '';
} catch (e) {
  console.error('[preload] failed to get session secret:', e);
}

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
  },
  getSessionSecret: () => sessionSecret,
  authenticatedWebSocketUrl: (url) => {
    try {
      const parsed = new URL(url);
      if (sessionSecret) {
        parsed.searchParams.set('session', sessionSecret);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
});
