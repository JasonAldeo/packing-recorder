const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ensureVideosDir: () => ipcRenderer.invoke('ensure-videos-dir'),
  beginVideoWrite: (shippingCode) => ipcRenderer.invoke('begin-video-write', { shippingCode }),
  writeVideoChunk: (chunk) => ipcRenderer.invoke('write-video-chunk', chunk),
  endVideoWrite: () => ipcRenderer.invoke('end-video-write'),
  abortVideoWrite: () => ipcRenderer.invoke('abort-video-write'),
  searchVideo: (shippingCode) => ipcRenderer.invoke('search-video', shippingCode),
  readVideo: (filePath) => ipcRenderer.invoke('read-video', filePath),
  listAllVideos: () => ipcRenderer.invoke('list-all-videos'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  pickVideosDir: () => ipcRenderer.invoke('pick-videos-dir'),
  saveVideoAs: (data) => ipcRenderer.invoke('save-video-as', data),
  deleteOldRecordings: () => ipcRenderer.invoke('delete-old-recordings'),
  deleteVideo: (filePath) => ipcRenderer.invoke('delete-video', filePath),
  generateManualQR: () => ipcRenderer.invoke('generate-manual-qr'),
  // ── License / Trial ──────────────────────────────────────────────────────
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  openPurchasePage: () => ipcRenderer.invoke('open-purchase-page'),
});
