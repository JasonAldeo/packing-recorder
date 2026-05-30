const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const { execFile, execSync } = require('child_process');
const QRCode = require('qrcode');
const ffmpegPath = require('ffmpeg-static');

// ─── License / Trial ──────────────────────────────────────────────────────────
// ⚠️  Replace this URL with your Railway app URL after deployment.
const LICENSE_SERVER_URL = 'https://your-app.up.railway.app';
const TRIAL_DAYS = 7;
const LICENSE_PATH = path.join(app.getPath('userData'), 'license.json');

/** Returns a stable machine ID derived from the Windows MachineGuid (with MAC-based fallback). */
function getMachineId() {
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', timeout: 3000 }
      );
      const m = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
      if (m) return crypto.createHash('sha256').update(m[1].trim()).digest('hex').slice(0, 40);
    } catch (_) {}
  }
  // Fallback: hash hostname + sorted non-loopback MAC addresses
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
    .map(i => i.mac)
    .sort();
  return crypto
    .createHash('sha256')
    .update(`${process.platform}-${os.hostname()}-${macs.join(',')}`)
    .digest('hex')
    .slice(0, 40);
}

function getLicenseData() {
  try {
    if (fs.existsSync(LICENSE_PATH)) return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
  } catch (_) {}
  return {};
}

function saveLicenseData(data) {
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/** Returns { daysLeft: number, expired: boolean } */
function getTrialInfo() {
  let data = getLicenseData();
  if (!data.firstLaunchDate) {
    data.firstLaunchDate = Date.now();
    saveLicenseData(data);
  }
  const daysElapsed = Math.floor((Date.now() - data.firstLaunchDate) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - daysElapsed);
  return { daysLeft, expired: daysLeft === 0 };
}

/** Calls the license server to validate key + machineId. Returns { valid, message }. */
function validateWithServer(key, machineId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ key, machineId });
    const url = new URL('/validate-license', LICENSE_SERVER_URL);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (_) { reject(new Error('Invalid server response')); }
      });
    });
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// IPC: get trial + license status
ipcMain.handle('get-license-status', async () => {
  const data = getLicenseData();
  const trial = getTrialInfo();

  if (data.licensed && data.licenseKey) {
    // Re-validate once per day (allows offline use with grace period)
    const oneDayMs = 86400000;
    const lastValidated = data.lastValidated || 0;
    if (Date.now() - lastValidated > oneDayMs) {
      try {
        const machineId = getMachineId();
        const result = await validateWithServer(data.licenseKey, machineId);
        if (!result.valid) {
          data.licensed = false;
          saveLicenseData(data);
          return { licensed: false, trialDaysLeft: trial.daysLeft, trialExpired: trial.expired };
        }
        data.lastValidated = Date.now();
        saveLicenseData(data);
      } catch (_) {
        // Network error — honour cached license (grace period)
      }
    }
    return { licensed: true, trialDaysLeft: trial.daysLeft, trialExpired: trial.expired };
  }

  return { licensed: false, trialDaysLeft: trial.daysLeft, trialExpired: trial.expired };
});

// IPC: activate a license key entered by the user
ipcMain.handle('activate-license', async (_, rawKey) => {
  try {
    const key = String(rawKey).trim().toUpperCase();
    if (!key) return { valid: false, message: 'Please enter a license key.' };
    const machineId = getMachineId();
    const result = await validateWithServer(key, machineId);
    if (result.valid) {
      const data = getLicenseData();
      data.licenseKey = key;
      data.licensed = true;
      data.lastValidated = Date.now();
      saveLicenseData(data);
    }
    return result;
  } catch (err) {
    return { valid: false, message: 'Could not connect to license server. Check your internet connection and try again.' };
  }
});

// IPC: open the purchase page in the user's default browser
ipcMain.handle('open-purchase-page', () => {
  shell.openExternal(`${LICENSE_SERVER_URL}/purchase.html`);
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
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  runAutoDelete();

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
      sandbox: false
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

// Read video file as base64 for playback in renderer
ipcMain.handle('read-video', (event, filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath);
  return data.toString('base64');
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
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    title: 'Print Station QR Codes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile('print-stations.html', { query: { data: JSON.stringify(stationsData) } });
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
