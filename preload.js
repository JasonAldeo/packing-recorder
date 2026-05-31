const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Core ──────────────────────────────────────────────────────────────────
  ensureVideosDir:       ()                         => ipcRenderer.invoke('ensure-videos-dir'),
  getSettings:           ()                         => ipcRenderer.invoke('get-settings'),
  saveSettings:          (patch)                    => ipcRenderer.invoke('save-settings', patch),
  pickVideosDir:         ()                         => ipcRenderer.invoke('pick-videos-dir'),
  deleteOldRecordings:   ()                         => ipcRenderer.invoke('delete-old-recordings'),

  // ─── Video write — per-station ─────────────────────────────────────────────
  beginVideoWrite:       (stationId, shippingCode)  => ipcRenderer.invoke('begin-video-write', { stationId, shippingCode }),
  writeVideoChunk:       (stationId, chunk)         => ipcRenderer.invoke('write-video-chunk', stationId, chunk),
  endVideoWrite:         (stationId)                => ipcRenderer.invoke('end-video-write', stationId),
  abortVideoWrite:       (stationId)                => ipcRenderer.invoke('abort-video-write', stationId),

  // ─── Recordings ────────────────────────────────────────────────────────────
  searchVideo:           (code)                     => ipcRenderer.invoke('search-video', code),
  readVideo:             (filePath)                 => ipcRenderer.invoke('read-video', filePath),
  listAllVideos:         ()                         => ipcRenderer.invoke('list-all-videos'),
  saveVideoAs:           (opts)                     => ipcRenderer.invoke('save-video-as', opts),
  deleteVideo:           (filePath)                 => ipcRenderer.invoke('delete-video', filePath),

  // ─── QR Codes ──────────────────────────────────────────────────────────────
  generateManualQR:      ()                         => ipcRenderer.invoke('generate-manual-qr'),
  generateStationQR:     (stationId)                => ipcRenderer.invoke('generate-station-qr', stationId),
  openPrintStations:     (stationsData)             => ipcRenderer.invoke('open-print-stations', stationsData),

  // ─── Multi-window ──────────────────────────────────────────────────────────
  openStationWindow:     (stationId)                => ipcRenderer.invoke('open-station-window', stationId),
  getOpenStationWindows: ()                         => ipcRenderer.invoke('get-open-station-windows'),
  closeStationWindow:    (stationId)                => ipcRenderer.invoke('close-station-window', stationId),

  // ─── IPC events (main → renderer) ─────────────────────────────────────────
  onStationWindowClosed: (cb)                       => ipcRenderer.on('station-window-closed', (_, sid) => cb(sid)),

  // ─── Multi-window relay ────────────────────────────────────────────────────
  // Station window → dashboard: relay a scan for routing
  relayScan:             (code)                     => ipcRenderer.invoke('relay-scan', code),
  // Dashboard → station window: send a command
  sendStationCommand:    (stationId, command)        => ipcRenderer.invoke('send-station-command', stationId, command),
  // Dashboard listens for relayed scans from any station window
  onRelayScan:           (cb)                       => ipcRenderer.on('relayed-scan', (_, code) => cb(code)),
  // Station window listens for commands from dashboard
  onStationCommand:      (cb)                       => ipcRenderer.on('station-command', (_, cmd) => cb(cmd)),
  // Station window → dashboard: notify of recording events (saved, aborted, stopped)
  notifyDashboard:       (payload)                  => ipcRenderer.invoke('notify-station-event', payload),
  // Dashboard listens for station events from station windows
  onStationEvent:        (cb)                       => ipcRenderer.on('station-event', (_, payload) => cb(payload)),

  // ─── License / Auth ────────────────────────────────────────────────────────
  getLicenseStatus:      ()                         => ipcRenderer.invoke('get-license-status'),
  register:              (opts)                     => ipcRenderer.invoke('register', opts),
  login:                 (opts)                     => ipcRenderer.invoke('login', opts),
  logout:                ()                         => ipcRenderer.invoke('logout'),
  openPurchasePage:      ()                         => ipcRenderer.invoke('open-purchase-page'),
  recoverLicense:        ()                         => ipcRenderer.invoke('recover-license'),
});
