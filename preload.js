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

  // ─── License ───────────────────────────────────────────────────────────────
  getLicenseStatus:      ()                         => ipcRenderer.invoke('get-license-status'),
  activateLicense:       (key)                      => ipcRenderer.invoke('activate-license', key),
  openPurchasePage:      ()                         => ipcRenderer.invoke('open-purchase-page'),
});
