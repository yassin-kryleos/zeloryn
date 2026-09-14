const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, crashReporter, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess = null;

// Single-instance lock: ensure only one instance of the app runs at a time.
// If a second instance is launched, focus the existing window and exit the new one immediately.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.log('[electron] Another instance is already running. Focusing existing window and exiting.');
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Set Application User Model ID for Windows taskbar grouping & shortcut binding
if (process.platform === 'win32') {
  app.setAppUserModelId('com.zeloryn.app');
}

// Ensure a valid local session secret is available for backend and IPC
let localSessionSecret = process.env.KRYLEOS_LOCAL_SESSION_SECRET || '';
function getLocalSessionSecret() {
  if (!localSessionSecret || localSessionSecret.length < 32) {
    localSessionSecret = crypto.randomBytes(32).toString('hex');
    process.env.KRYLEOS_LOCAL_SESSION_SECRET = localSessionSecret;
  }
  return localSessionSecret;
}

ipcMain.on('get-session-secret-sync', (event) => {
  event.returnValue = getLocalSessionSecret();
});

crashReporter.start({ uploadToServer: false });

function writeCrashRecord(kind, error) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'crash.log'),
      `${new Date().toISOString()} ${kind}: ${error && error.stack ? error.stack : String(error)}\n`,
      'utf-8'
    );
  } catch {}
}

process.on('uncaughtException', (error) => {
  writeCrashRecord('uncaughtException', error);
  app.exit(1);
});

process.on('unhandledRejection', (error) => {
  writeCrashRecord('unhandledRejection', error);
});

// AES-256 fallback encryption, used only when Electron safeStorage is
// unavailable (testing / unsupported OS keychain).
const ALGORITHM = 'aes-256-cbc';

// SEC-B3: derive the fallback key from a PER-INSTALL random secret persisted
// with owner-only permissions, NOT from a hardcoded constant. The key file
// lives under Electron's userData dir (or OS temp as a last resort).
let _fallbackKeyCache = null;
function getFallbackKey() {
  if (_fallbackKeyCache) return _fallbackKeyCache;
  let baseDir;
  try {
    baseDir = app.getPath('userData');
  } catch {
    baseDir = require('os').tmpdir();
  }
  const keyPath = path.join(baseDir, '.kryleos_fallback.key');
  try {
    if (fs.existsSync(keyPath)) {
      const existing = fs.readFileSync(keyPath);
      if (existing.length === 32) {
        _fallbackKeyCache = existing;
        return existing;
      }
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    try { fs.chmodSync(keyPath, 0o600); } catch {}
    _fallbackKeyCache = key;
    return key;
  } catch (err) {
    // If we cannot persist a key, derive an ephemeral process-scoped one rather
    // than reverting to a shared constant. Secrets won't survive restart, which
    // is the safe failure mode.
    if (!_fallbackKeyCache) _fallbackKeyCache = crypto.randomBytes(32);
    return _fallbackKeyCache;
  }
}

let warnedElectronLegacy = false;

// Legacy decrypt for data written by the old constant-key scheme, so existing
// installs aren't bricked. Encryption never uses this path again.
function legacyDecrypt(cipherText) {
  const legacySeed = process.env.OS_FINGERPRINT || 'kryleos-fallback-key-9988';
  if (!process.env.OS_FINGERPRINT && !warnedElectronLegacy) {
    warnedElectronLegacy = true;
    console.warn(
      '[Security] OS_FINGERPRINT not set — using hardcoded fallback decryption key. ' +
      'Set the OS_FINGERPRINT environment variable to a unique 32+ char secret for secure key derivation.'
    );
  }
  const parts = cipherText.split(':');
  const iv = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts[2], 'hex');
  const key = crypto.scryptSync(legacySeed, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function fallbackEncrypt(text) {
  try {
    const key = getFallbackKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `aes256:${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Fallback encryption failed:', err);
    return Buffer.from(text).toString('base64');
  }
}

function fallbackDecrypt(cipherText) {
  try {
    if (!cipherText.startsWith('aes256:')) {
      return Buffer.from(cipherText, 'base64').toString('utf8');
    }
    const parts = cipherText.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const encryptedText = Buffer.from(parts[2], 'hex');
    const key = getFallbackKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Try the legacy constant-key scheme for pre-existing data, then plain base64.
    try {
      return legacyDecrypt(cipherText);
    } catch {
      try {
        return Buffer.from(cipherText, 'base64').toString('utf8');
      } catch {
        return cipherText;
      }
    }
  }
}

// Register safeStorage handlers for secure OS keychain storage
ipcMain.handle('encrypt-string', async (event, plainText) => {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    return fallbackEncrypt(plainText);
  }
  try {
    const encrypted = safeStorage.encryptString(plainText);
    return encrypted.toString('base64');
  } catch (err) {
    console.error('SafeStorage encryption failed, trying fallback:', err);
    return fallbackEncrypt(plainText);
  }
});

ipcMain.handle('decrypt-string', async (event, cipherTextBase64) => {
  if (cipherTextBase64.startsWith('aes256:')) {
    return fallbackDecrypt(cipherTextBase64);
  }
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    return fallbackDecrypt(cipherTextBase64);
  }
  try {
    const buffer = Buffer.from(cipherTextBase64, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (err) {
    // If safeStorage decrypt failed, it might be pre-existing unencrypted or fallback-encrypted key
    return fallbackDecrypt(cipherTextBase64);
  }
});

ipcMain.handle('is-encryption-available', async () => {
  return !!(safeStorage && safeStorage.isEncryptionAvailable());
});

// Register IPC handler to open external links
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

// Register IPC handler to select directories via native OS dialog
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Production-only: the backend is normally started by `npm run dev`
// (concurrently) via `tsx src/backend/server.ts`. A packaged build has no dev
// server and no tsx, so the main process starts the esbuild-bundled backend
// (dist-backend/server.cjs) itself as a child Node process on the same fixed
// port (3001) the renderer already hardcodes.
function startBackend() {
  if (!app.isPackaged) return;

  // Check if port 3001 is already active before spawning a new child process
  const req = http.get('http://127.0.0.1:3001/', () => {
    console.log('[backend] An active backend is already responding on port 3001. Skipping child process spawn.');
  });
  req.on('error', () => {
    // Port is free, spawn backend child process
    spawnBackendChild();
  });
}

function spawnBackendChild() {
  // dist-backend/** and node_modules/** are unpacked from app.asar (see
  // electron-builder.yml asarUnpack) because a plain-node child process
  // (ELECTRON_RUN_AS_NODE) cannot resolve require() targets inside an asar
  // archive. Resolve against the unpacked tree under resourcesPath, not
  // __dirname (which still points inside app.asar).
  const serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-backend', 'server.cjs');
  const workspaceDir = path.join(app.getPath('documents'), 'Kryleos Forge');
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
  } catch (err) {
    console.error('[backend] could not create default workspace dir:', err);
  }

  const secret = getLocalSessionSecret();

  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: workspaceDir,
    env: { ...process.env, KRYLEOS_LOCAL_SESSION_SECRET: secret, ELECTRON_RUN_AS_NODE: '1', PORT: '3001' },
    stdio: 'inherit'
  });

  backendProcess.on('exit', (code, signal) => {
    console.error(`[backend] exited (code=${code}, signal=${signal})`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = null;
}

// Unsigned builds cannot auto-apply updates (Squirrel.Mac requires a signed
// Update check policy (Phase 3 open-source strategy):
// Conservative, privacy-first default — NO silent phone-home on startup.
// Automatic checks occur only if explicitly opted in via KRYLEOS_CHECK_UPDATES=1.
// Manual checks are always available via IPC ('check-for-updates') or releases page.
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    if (!mainWindow) return;
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseUrl: 'https://github.com/yassin-kryleos/zeloryn/releases/latest'
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[updater] Version ${app.getVersion()} is up to date.`);
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err);
  });

  // Explicit opt-in: only check on boot if user requested it via env
  if (process.env.KRYLEOS_CHECK_UPDATES === '1') {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] check failed:', err);
    });
  } else {
    console.log('[updater] automatic update check disabled by default (no phone-home). Set KRYLEOS_CHECK_UPDATES=1 to enable.');
  }

  // Allow manual check from UI via IPC
  ipcMain.handle('check-for-updates', async () => {
    try {
      const res = await autoUpdater.checkForUpdates();
      const latestVersion = res?.updateInfo?.version || app.getVersion();
      return {
        success: true,
        version: latestVersion,
        hasUpdate: Boolean(res?.updateInfo?.version && res.updateInfo.version !== app.getVersion()),
        releaseUrl: 'https://github.com/yassin-kryleos/zeloryn/releases/latest'
      };
    } catch (err) {
      return { success: false, error: err?.message || 'Update check failed' };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#040805',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    title: 'Kryleos Forge // Agent Workspace',
    show: false // Show only after loading to prevent visual flicker
  });

  // Hide default menu bar
  mainWindow.setMenuBarVisibility(false);

  if (app.isPackaged) {
    // Packaged: wait for the backend child process to come up, then load the
    // built renderer from disk (no dev server involved).
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');

    function loadWhenBackendReady() {
      http.get('http://127.0.0.1:3001/', () => {
        mainWindow.loadFile(indexPath);
        mainWindow.once('ready-to-show', () => {
          mainWindow.show();
        });
      }).on('error', () => {
        setTimeout(loadWhenBackendReady, 300);
      });
    }

    loadWhenBackendReady();
  } else {
    const targetUrl = process.env.ELECTRON_DEV_URL || 'http://localhost:5173';

    // Wait for Vite server to be ready before loading
    function loadWithRetry() {
      http.get(targetUrl, (res) => {
        // Server is online, load window
        mainWindow.loadURL(targetUrl);
        mainWindow.once('ready-to-show', () => {
          mainWindow.show();
        });
      }).on('error', () => {
        // Server offline, retry in 300ms
        setTimeout(loadWithRetry, 300);
      });
    }

    loadWithRetry();
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  if (session && session.defaultSession) {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['http://localhost:3001/*', 'http://127.0.0.1:3001/*', 'ws://localhost:3001/*', 'ws://127.0.0.1:3001/*'] },
      (details, callback) => {
        details.requestHeaders['X-Kryleos-Session'] = getLocalSessionSecret();
        callback({ requestHeaders: details.requestHeaders });
      }
    );
  }
  startBackend();
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', function () {
  stopBackend();
  // Quit when all windows are closed, except on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', stopBackend);

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
