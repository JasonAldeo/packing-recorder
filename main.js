const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const ffmpegPath = require('ffmpeg-static');

// ─── License / Trial ──────────────────────────────────────────────────────────
// ⚠️  Replace this URL with your Railway app URL after deployment.
const LICENSE_SERVER_URL = 'https://packingrecorder.com';
const TRIAL_DAYS = 14;
const TRIAL_OFFLINE_GRACE_MS   = 60 * 60 * 1000;       // 1 hour
const LICENSE_OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;  // 24-hour grace window for licensed users before blocking access
const LICENSE_PATH = path.join(app.getPath('userData'), 'license.json');

function getLicenseData() {
  try {
    if (fs.existsSync(LICENSE_PATH)) return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
  } catch (_) {}
  return {};
}

function saveLicenseData(data) {
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Pre-login fallback only — used when user is not yet logged in.
 * Returns { daysLeft, expired } based on local firstLaunchDate.
 * Once logged in, trial is owned entirely by the server (users.created_at).
 */
function getLocalTrialInfo() {
  let data = getLicenseData();
  if (!data.firstLaunchDate) {
    data.firstLaunchDate = Date.now();
    saveLicenseData(data);
  }
  const daysElapsed = Math.floor((Date.now() - data.firstLaunchDate) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - daysElapsed);
  return { daysLeft, expired: daysLeft === 0 };
}

/** Makes an authenticated request to the license server. Returns parsed JSON. */
function serverRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(urlPath, LICENSE_SERVER_URL);
    const isHttps = url.protocol === 'https:';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method,
      headers,
    };
    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { reject(new Error('Invalid server response')); }
      });
    });
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// IPC: get trial + account/license status
ipcMain.handle('get-license-status', async () => {
  const data = getLicenseData();

  // Not logged in — use local trial info for pre-login UI display only
  if (!data.token) {
    const trial = getLocalTrialInfo();
    return {
      loggedIn: false,
      licensed: false,
      trialDaysLeft: trial.daysLeft,
      trialExpired: trial.expired,
      offlineTrialExpired: false,
      username: null,
      role: null,
    };
  }

  // Logged in — call /me to refresh token and get server-authoritative trial + license status
  let networkError = false;
  try {
    const resp = await serverRequest('GET', '/me', null, data.token);
    if (resp.status === 401) {
      // Token expired — log out
      delete data.token;
      delete data.username;
      delete data.role;
      delete data.licenseExpiresAt;
      delete data.trialDaysLeft;
      delete data.trialExpired;
      delete data.trialCachedAt;
      delete data.licenseCachedAt;
      saveLicenseData(data);
      const trial = getLocalTrialInfo();
      return {
        loggedIn: false,
        licensed: false,
        trialDaysLeft: trial.daysLeft,
        trialExpired: trial.expired,
        offlineTrialExpired: false,
        username: null,
        role: null,
      };
    }
    const me = resp.body;
    // Save refreshed token + latest server-authoritative values
    data.token          = me.token;
    data.username       = me.username;
    data.role           = me.role;
    data.licenseExpiresAt = me.licenseExpiresAt || null;
    data.trialDaysLeft  = me.trialDaysLeft;
    data.trialExpired   = me.trialExpired;
    data.hadLicense     = me.hadLicense ?? false;
    data.trialCachedAt  = Date.now();
    data.licenseCachedAt = Date.now();
    saveLicenseData(data);
  } catch (_) {
    // Network error — use cached values with grace window logic below
    networkError = true;
  }

  // Compute license state from cache
  const expiresAt = data.licenseExpiresAt ? new Date(data.licenseExpiresAt) : null;
  const licensed = !!(expiresAt && expiresAt > new Date());
  const licenseDaysLeft = licensed
    ? Math.ceil((expiresAt - new Date()) / 86400000)
    : 0;

  // Compute trial state from cache
  // For trial users offline: enforce 1-hour grace window
  let trialDaysLeft       = data.trialDaysLeft  ?? 0;
  let trialExpired        = data.trialExpired    ?? true;
  let offlineTrialExpired   = false;
  let offlineLicenseExpired = false;

  if (networkError) {
    if (!licensed) {
      // Trial user offline — enforce 1-hour grace
      const trialAge = Date.now() - (data.trialCachedAt || 0);
      if (trialAge >= TRIAL_OFFLINE_GRACE_MS) {
        trialExpired        = true;
        offlineTrialExpired = true;
      }
    } else {
      // Licensed user offline — enforce 24-hour grace
      // (licensed is true here, meaning expiresAt is still in the future)
      const licenseAge = Date.now() - (data.licenseCachedAt || 0);
      if (licenseAge >= LICENSE_OFFLINE_GRACE_MS) {
        // Grace exhausted — treat as offline-blocked (not a genuine expiry)
        offlineLicenseExpired = true;
      }
    }
  }

  // If offline license grace exhausted, override licensed state
  const effectiveLicensed = licensed && !offlineLicenseExpired;

  return {
    loggedIn: true,
    licensed: effectiveLicensed,
    licenseDaysLeft: effectiveLicensed ? licenseDaysLeft : 0,
    licenseExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    trialDaysLeft,
    trialExpired,
    offlineTrialExpired,
    offlineLicenseExpired,
    hadLicense: data.hadLicense ?? false,
    username: data.username || null,
    role: data.role || 'user',
  };
});

/** Reads the Windows MachineGuid from the registry. Resolves to a string or null. */
function getMachineId() {
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { windowsHide: true },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const match = stdout.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
        resolve(match ? match[1].trim() : null);
      }
    );
  });
}

// IPC: register a new account
ipcMain.handle('register', async (_, { username, email, password }) => {
  try {
    const machineId = await getMachineId();
    const resp = await serverRequest('POST', '/register', { username, email, password, machineId });
    if (resp.status !== 200 && resp.status !== 201) {
      return { success: false, error: resp.body.error || 'Registration failed.' };
    }
    const me = resp.body;
    const data = getLicenseData();
    data.token = me.token;
    data.username = me.username;
    data.role = me.role;
    data.licenseExpiresAt = me.licenseExpiresAt || null;
    saveLicenseData(data);
    return { success: true, username: me.username, role: me.role, licenseExpiresAt: me.licenseExpiresAt };
  } catch (err) {
    return { success: false, error: 'Could not connect to server. Check your internet connection.' };
  }
});

// IPC: log in to an existing account
ipcMain.handle('login', async (_, { email, password }) => {
  try {
    const resp = await serverRequest('POST', '/login', { email, password });
    if (resp.status !== 200) {
      return { success: false, error: resp.body.error || 'Login failed.' };
    }
    const me = resp.body;
    const data = getLicenseData();
    data.token = me.token;
    data.username = me.username;
    data.role = me.role;
    data.licenseExpiresAt = me.licenseExpiresAt || null;
    saveLicenseData(data);
    return { success: true, username: me.username, role: me.role, licenseExpiresAt: me.licenseExpiresAt };
  } catch (err) {
    return { success: false, error: 'Could not connect to server. Check your internet connection.' };
  }
});

// IPC: send a forgot-password request (no auth required)
ipcMain.handle('forgot-password', async (_, email) => {
  try {
    const resp = await serverRequest('POST', '/forgot-password', { email });
    if (resp.status === 200) return { success: true };
    return { success: false, error: resp.body.error || 'Request failed.' };
  } catch (_err) {
    return { success: false, error: 'Could not connect to server. Check your internet connection.' };
  }
});

// IPC: log out (clears stored token)
ipcMain.handle('logout', () => {  const data = getLicenseData();
  delete data.token;
  delete data.username;
  delete data.role;
  delete data.licenseExpiresAt;
  saveLicenseData(data);
});

// IPC: open the purchase page in the user's default browser (passes token as query param)
ipcMain.handle('open-purchase-page', () => {
  const data = getLicenseData();
  const token = data.token || '';
  shell.openExternal(`${LICENSE_SERVER_URL}/purchase.html?token=${encodeURIComponent(token)}`);
});

ipcMain.handle('open-external-url', (event, url) => {
  shell.openExternal(url);
});

// IPC: fetch live pricing from server — used to display dynamic prices in the buy overlay
ipcMain.handle('fetch-pricing', async () => {
  try {
    const resp = await serverRequest('GET', '/pricing');
    if (resp.status === 200) return resp.body;
  } catch (_) {}
  return null;
});

// IPC: recover license — finds paid orders not yet applied and stacks them
ipcMain.handle('recover-license', async () => {
  const data = getLicenseData();
  if (!data.token) return { recovered: false, error: 'Not logged in.' };
  try {
    const resp = await serverRequest('POST', '/recover-license', {}, data.token);
    if (resp.status === 401) return { recovered: false, error: 'Session expired. Please log in again.' };
    const result = resp.body;
    if (result.recovered && result.licenseExpiresAt) {
      data.licenseExpiresAt = result.licenseExpiresAt;
      saveLicenseData(data);
    }
    return result;
  } catch (_) {
    return { recovered: false, error: 'Could not connect to server. Check your internet connection.' };
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const DEFAULT_VIDEOS_DIR = path.join(app.getPath('userData'), 'videos');

function getVideosDir() {
  const settings = loadSettings();
  const dir = settings.videosDir || DEFAULT_VIDEOS_DIR;
  // Validate: try to reach the root of the path; fall back if unavailable
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (_) {
    // Saved path is unreachable — clear it and use default
    const settings2 = loadSettings();
    delete settings2.videosDir;
    saveSettings(settings2);
    fs.mkdirSync(DEFAULT_VIDEOS_DIR, { recursive: true });
    return DEFAULT_VIDEOS_DIR;
  }
}

let mainWindow;
// Map of stationId -> BrowserWindow for station windows
const stationWindows = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Packing Recorder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });

  mainWindow.loadFile('index.html');
}

// ─── Recording-aware update state ─────────────────────────────────────────────
let rendererIsRecording = false; // true while any station is recording
let pendingUpdateInfo   = null;  // holds update info when download finished during a recording

function showUpdateDialog(info) {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: `Version ${info.version} has been downloaded. Restart now to install the update?`,
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
}

app.whenReady().then(() => {
  // Grant camera/media permissions so getUserMedia always settles (never hangs)
  // on machines where Electron's default permission handler leaves requests pending.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['media', 'mediaKeySystem', 'fullscreen'].includes(permission));
  });

  createWindow();
  runAutoDelete();

  // ─── Application menu ────────────────────────────────────────────────────────
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Visit Packing Recorder Website',
          click: () => shell.openExternal(LICENSE_SERVER_URL),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  // ─── Auto-updater ────────────────────────────────────────────────────────────
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
    // If a recording is active, defer the restart dialog until recording finishes
    if (rendererIsRecording) {
      pendingUpdateInfo = info;
    } else {
      showUpdateDialog(info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[auto-updater] error:', err.message);
  });

  // Check for updates silently on startup (delay 3s to let window finish loading).
  // Skipped when running as a Microsoft Store MSIX — the Store manages updates there.
  if (!process.windowsStore) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[auto-updater] startup check failed:', err.message);
      });
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Ensure videos directory exists
ipcMain.handle('ensure-videos-dir', () => {
  return getVideosDir();
});

// ─── App version & updates ────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
  // When running as a Store-installed MSIX, the Microsoft Store manages updates.
  if (process.windowsStore) return { isUpdateAvailable: false, storeManaged: true };
  try {
    const result = await autoUpdater.checkForUpdates();
    // result is null when no update feed is reachable (dev/local build)
    if (!result || !result.updateInfo) return { isUpdateAvailable: false };
    const currentVersion = app.getVersion();
    const latestVersion  = result.updateInfo.version;
    const isUpdateAvailable = result.cancellationToken != null;
    return { isUpdateAvailable, version: latestVersion, currentVersion };
  } catch (err) {
    console.error('[auto-updater] manual check failed:', err.message);
    // Treat any update check failure as "up to date" — avoids surfacing
    // confusing error messages when the GitHub release feed is unreachable.
    return { isUpdateAvailable: false };
  }
});

// Renderer notifies main whenever recording state changes so the update dialog
// can be deferred while a recording is active.
ipcMain.on('set-recording-state', (_, isRecording) => {
  rendererIsRecording = isRecording;
  if (!isRecording && pendingUpdateInfo) {
    const info = pendingUpdateInfo;
    pendingUpdateInfo = null;
    showUpdateDialog(info);
  }
});

// ─── Streaming video write — per-station ──────────────────────────────────────
// Each station has its own write state keyed by stationId string.

const _writeStates = new Map();
// stationId -> { stream, tempPath, finalPath, filename }

ipcMain.handle('begin-video-write', (event, { stationId, shippingCode }) => {
  const sid = String(stationId || 'station1');

  // Clean up any abandoned previous stream for this station
  if (_writeStates.has(sid)) {
    const prev = _writeStates.get(sid);
    try { prev.stream.destroy(); } catch (_) {}
    if (prev.tempPath && fs.existsSync(prev.tempPath)) {
      try { fs.unlinkSync(prev.tempPath); } catch (_) {}
    }
    _writeStates.delete(sid);
  }

  const videosDir = getVideosDir();
  const sanitizedCode = shippingCode.replace(/[^a-zA-Z0-9_\-]/g, '_');
  // Include station ID prefix in filename
  const stationPrefix = sid.replace(/[^a-zA-Z0-9_\-]/g, '_');
  let filename = `${stationPrefix}_${sanitizedCode}.webm`;
  let filePath = path.join(videosDir, filename);

  if (fs.existsSync(filePath)) {
    const timestamp = Date.now();
    filename = `${stationPrefix}_${sanitizedCode}_${timestamp}.webm`;
    filePath = path.join(videosDir, filename);
  }

  const tempPath = filePath + '.tmp';
  const writeStream = fs.createWriteStream(tempPath);
  _writeStates.set(sid, { stream: writeStream, tempPath, finalPath: filePath, filename });
  return { ok: true };
});

ipcMain.handle('write-video-chunk', (event, stationId, chunk) => {
  const sid = String(stationId || 'station1');
  return new Promise((resolve, reject) => {
    const state = _writeStates.get(sid);
    if (!state) return reject(new Error(`No active write stream for station: ${sid}`));
    const buffer = Buffer.from(chunk);
    state.stream.write(buffer, (err) => {
      if (err) reject(err); else resolve();
    });
  });
});

ipcMain.handle('end-video-write', (event, stationId) => {
  const sid = String(stationId || 'station1');
  return new Promise((resolve, reject) => {
    const state = _writeStates.get(sid);
    if (!state) return reject(new Error(`No active write stream for station: ${sid}`));
    _writeStates.delete(sid);

    state.stream.end((err) => {
      if (err) return reject(err);
      try {
        fs.renameSync(state.tempPath, state.finalPath);
        const stats = fs.statSync(state.finalPath);
        resolve({ filename: state.filename, filePath: state.finalPath, size: stats.size });
      } catch (e) {
        reject(e);
      }
    });
  });
});

ipcMain.handle('abort-video-write', (event, stationId) => {
  const sid = String(stationId || 'station1');
  const state = _writeStates.get(sid);
  if (state) {
    try { state.stream.destroy(); } catch (_) {}
    if (state.tempPath && fs.existsSync(state.tempPath)) {
      try { fs.unlinkSync(state.tempPath); } catch (_) {}
    }
    _writeStates.delete(sid);
  }
});

// ─── Multi-window: Station Windows ────────────────────────────────────────────

ipcMain.handle('open-station-window', (event, stationId) => {
  const sid = String(stationId);

  // If already open, focus it
  if (stationWindows.has(sid)) {
    const existing = stationWindows.get(sid);
    if (!existing.isDestroyed()) {
      existing.focus();
      return { windowId: existing.id };
    }
  }

  const settings = loadSettings();
  const stationsCfg = settings.stations || [];
  const stationCfg = stationsCfg.find(s => s.id === sid) || {};
  const label = stationCfg.label || `Station ${sid.replace('station', '')}`;

  const win = new BrowserWindow({
    width: 800,
    height: 700,
    title: `${label} — Packing Recorder`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });

  win.loadFile('index.html', { query: { station: sid } });

  win.on('closed', () => {
    stationWindows.delete(sid);
    // Notify main window that this station window closed
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('station-window-closed', sid);
    }
  });

  stationWindows.set(sid, win);
  return { windowId: win.id };
});

ipcMain.handle('get-open-station-windows', () => {
  const result = [];
  for (const [sid, win] of stationWindows.entries()) {
    if (!win.isDestroyed()) result.push(sid);
  }
  return result;
});

ipcMain.handle('close-station-window', (event, stationId) => {
  const sid = String(stationId);
  const win = stationWindows.get(sid);
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

// ─── Multi-window scan relay ───────────────────────────────────────────────────
// Station window → main → dashboard: relay a barcode scan for routing
ipcMain.handle('relay-scan', (event, code) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('relayed-scan', code);
  }
});

// Dashboard → main → station window: send a command (set-status, start-recording, stop-recording)
ipcMain.handle('send-station-command', (event, stationId, command) => {
  const sid = String(stationId);
  const win = stationWindows.get(sid);
  if (win && !win.isDestroyed()) {
    win.webContents.send('station-command', command);
  }
});

// Station window → main → dashboard: notify of a recording event (saved, aborted)
ipcMain.handle('notify-station-event', (event, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('station-event', payload);
  }
});

// Search for video by shipping code
ipcMain.handle('search-video', (event, shippingCode) => {
  const videosDir = getVideosDir();
  if (!fs.existsSync(videosDir)) return [];

  const sanitizedCode = shippingCode.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const files = fs.readdirSync(videosDir);
  const matches = files
    .filter(f => f.includes(sanitizedCode) && f.endsWith('.webm'))
    .map(f => ({
      filename: f,
      filePath: path.join(videosDir, f),
      size: fs.statSync(path.join(videosDir, f)).size,
      modified: fs.statSync(path.join(videosDir, f)).mtimeMs
    }));

  return matches;
});

// Return the file path for playback — renderer uses a file:// URL directly (no data copy over IPC)
ipcMain.handle('read-video', (event, filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return filePath;
});

// List all recordings sorted by newest first
ipcMain.handle('list-all-videos', () => {
  const videosDir = getVideosDir();
  if (!fs.existsSync(videosDir)) return [];
  return fs.readdirSync(videosDir)
    .filter(f => f.endsWith('.webm'))
    .map(f => {
      const stats = fs.statSync(path.join(videosDir, f));
      // Parse: stationN_SHIPPINGCODE[_timestamp].webm
      const base = f.replace(/\.webm$/, '');
      // Try to extract station prefix
      const stationMatch = base.match(/^(station\d+)_(.+?)(?:_(\d{13}))?$/);
      let stationId = null;
      let shippingCode = base;
      if (stationMatch) {
        stationId = stationMatch[1];
        shippingCode = stationMatch[2];
      } else {
        // Legacy filename without station prefix
        const legacyMatch = base.match(/^(.+?)(?:_(\d{13}))?$/);
        shippingCode = legacyMatch ? legacyMatch[1] : base;
      }
      const isManual = shippingCode.startsWith('MANUAL_');
      return {
        filename: f,
        filePath: path.join(videosDir, f),
        shippingCode,
        stationId,
        isManual,
        size: stats.size,
        modified: stats.mtimeMs
      };
    })
    .sort((a, b) => b.modified - a.modified);
});

// Save a copy of a recording to a user-chosen path, converted to MP4
ipcMain.handle('save-video-as', async (event, { srcPath, defaultName }) => {
  const baseName = defaultName.replace(/\.webm$/i, '');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recording As MP4',
    defaultPath: baseName + '.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const destPath = result.filePath;
  return new Promise((resolve) => {
    // -movflags faststart writes the seek index (moov atom) at the front of
    // the file so seeking works. -c copy means no re-encoding — very fast.
    execFile(ffmpegPath, [
      '-y',
      '-i', srcPath,
      '-c', 'copy',
      '-movflags', 'faststart',
      destPath
    ], (err) => {
      if (err) {
        resolve({ canceled: false, filePath: destPath, error: err.message });
      } else {
        resolve({ canceled: false, filePath: destPath });
      }
    });
  });
});

// Get current settings
ipcMain.handle('get-settings', () => loadSettings());

// Save arbitrary settings keys
ipcMain.handle('save-settings', (event, patch) => {
  const current = loadSettings();
  saveSettings({ ...current, ...patch });
});

// Delete recordings older than autoDeleteDays
function runAutoDelete() {
  const settings = loadSettings();
  const days = parseInt(settings.autoDeleteDays, 10);
  if (!days || days <= 0) return 0;
  const videosDir = getVideosDir();
  if (!fs.existsSync(videosDir)) return 0;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let deleted = 0;
  fs.readdirSync(videosDir)
    .filter(f => f.endsWith('.webm'))
    .forEach(f => {
      const fp = path.join(videosDir, f);
      try {
        if (fs.statSync(fp).mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          deleted++;
        }
      } catch (_) {}
    });
  return deleted;
}

ipcMain.handle('delete-old-recordings', () => {
  const settings = loadSettings();
  const days = parseInt(settings.autoDeleteDays, 10);
  if (!days || days <= 0) return { deleted: 0, disabled: true };
  const deleted = runAutoDelete();
  return { deleted, disabled: false };
});

// Delete a single recording by file path
ipcMain.handle('delete-video', (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' };
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Generate QR code data URL for the manual scan code
ipcMain.handle('generate-manual-qr', async () => {
  return QRCode.toDataURL('MANUALSCAN', {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2
  });
});

// Generate QR code data URL for a station ID
ipcMain.handle('generate-station-qr', async (event, stationId) => {
  return QRCode.toDataURL(`STATION:${stationId}`, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2
  });
});

// Open the station QR print page
ipcMain.handle('open-print-stations', (event, stationsData) => {
  // Hidden window renders print-stations.html, generates QR codes, then exports to PDF
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });
  win.loadFile('print-stations.html', { query: { data: JSON.stringify(stationsData) } });

  // Renderer sends 'print-to-pdf' once all QR data URLs are set
  const onPrintToPdf = async (e) => {
    if (e.sender !== win.webContents || win.isDestroyed()) return;
    try {
      const pdfData = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' }
      });
      const tmpPath = path.join(app.getPath('temp'), `qr-print-${Date.now()}.pdf`);
      fs.writeFileSync(tmpPath, pdfData);

      // Open PDF in Chromium's built-in PDF viewer — user prints from there
      const pdfWin = new BrowserWindow({
        width: 860,
        height: 1000,
        title: 'Print Preview – Station QR Codes',
        webPreferences: {
          plugins: true,
          contextIsolation: true,
          nodeIntegration: false,
        }
      });
      pdfWin.loadURL(`file://${tmpPath}`);
      pdfWin.on('closed', () => { try { fs.unlinkSync(tmpPath); } catch (_) {} });
    } catch (err) {
      console.error('[print-to-pdf] failed:', err.message);
    } finally {
      // Hidden window no longer needed
      if (!win.isDestroyed()) win.destroy();
    }
  };
  ipcMain.on('print-to-pdf', onPrintToPdf);
  win.on('closed', () => ipcMain.removeListener('print-to-pdf', onPrintToPdf));
});

// Open folder picker dialog and persist choice
ipcMain.handle('pick-videos-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Videos Save Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const chosen = result.filePaths[0];
  const settings = loadSettings();
  settings.videosDir = chosen;
  saveSettings(settings);
  if (!fs.existsSync(chosen)) fs.mkdirSync(chosen, { recursive: true });
  return chosen;
});
