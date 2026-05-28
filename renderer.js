// ─── i18n helper ─────────────────────────────────────────────────────────────
const t = (...args) => window._i18n.t(...args);

// ─── State ───────────────────────────────────────────────────────────────────
const MANUAL_SCAN_CODE = 'MANUALSCAN';
let currentShippingCode = null;
let trialDaysLeft = null;
let mediaRecorder = null;
let stream = null;
let writeQueue = Promise.resolve(); // serialises async chunk writes
let timerInterval = null;
let timerSeconds = 0;
let barcodeBuffer = '';
let barcodeTimeout = null;
let currentPlayingPath = null;

// ─── DOM References ──────────────────────────────────────────────────────────
const statusMessage = document.getElementById('status-message');
const currentCodeEl = document.getElementById('current-code');
const timerDisplay = document.getElementById('timer-display');
const timerEl = document.getElementById('timer');
const savedInfo = document.getElementById('saved-info');
const cameraPreview = document.getElementById('camera-preview');
const recordingBadge = document.getElementById('recording-badge');
const cameraError = document.getElementById('camera-error');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const resultsList = document.getElementById('results-list');
const playbackSection = document.getElementById('playback-section');
const playingFilename = document.getElementById('playing-filename');
const playbackVideo = document.getElementById('playback-video');
const searchError = document.getElementById('search-error');
const saveAsBtn = document.getElementById('save-as-btn');
const saveAsStatus = document.getElementById('save-as-status');
const searchClearBtn = document.getElementById('search-clear-btn');
const stopRecordingBtn = document.getElementById('stop-recording-btn');
const recordingsListEl = document.getElementById('recordings-list');
const noRecordingsEl = document.getElementById('no-recordings');
const recDateFilter = document.getElementById('rec-date-filter');
const recResetFilterBtn = document.getElementById('rec-reset-filter-btn');
const recFilterCount = document.getElementById('rec-filter-count');
const manualRecordingsListEl = document.getElementById('manual-recordings-list');
const noManualRecordingsEl = document.getElementById('no-manual-recordings');
const manualDateFilter = document.getElementById('manual-date-filter');
const manualResetFilterBtn = document.getElementById('manual-reset-filter-btn');
const manualFilterCount = document.getElementById('manual-filter-count');
const printQrBtn = document.getElementById('print-qr-btn');
const qrCodeSection = document.getElementById('qr-code-section');
const qrCodeImg = document.getElementById('qr-code-img');
const videosDirDisplay = document.getElementById('videos-dir-display');
const pickDirBtn = document.getElementById('pick-dir-btn');
const autoDeleteInput = document.getElementById('auto-delete-days');
const saveAutoDeleteBtn = document.getElementById('save-auto-delete-btn');
const autoDeleteStatus = document.getElementById('auto-delete-status');
const testModePanelEl = document.getElementById('test-mode-panel');
const testScanInput = document.getElementById('test-scan-input');
const testScanBtn = document.getElementById('test-scan-btn');
const testManualBtn = document.getElementById('test-manual-btn');
const testModeToggle = document.getElementById('test-mode-toggle');
const localeSelect = document.getElementById('locale-select');

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  await window.electronAPI.ensureVideosDir();
  await initCamera();
  await loadRecordingsList();
  await loadSavedDir();
  initTabs();
  await initLicense();
})();

// ─── Locale ───────────────────────────────────────────────────────────────────
localeSelect.addEventListener('change', async () => {
  const locale = localeSelect.value;
  window._i18n.setLocale(locale);
  await window.electronAPI.saveSettings({ locale });
  applyTranslations();
});

function applyTranslations() {
  // Update all static elements tagged with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Update placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // Sync locale selector
  localeSelect.value = window._i18n.getLocale();
  // Re-apply dynamic status if no recording is active
  if (!currentShippingCode) {
    setStatus('waiting', t('scan.waiting'));
  }
  // Re-apply trial badge text if visible
  if (trialDaysLeft !== null && !trialBadge.classList.contains('hidden')) {
    trialBadgeText.textContent = t('trial.badge', trialDaysLeft);
  }
  // Re-render recordings list so play/delete buttons and empty-state text update
  renderRecordingsList();
}

// ─── License / Trial ──────────────────────────────────────────────────────────
const licenseOverlay   = document.getElementById('license-overlay');
const trialBadge       = document.getElementById('trial-badge');
const trialBadgeText   = document.getElementById('trial-badge-text');
const trialBuyBtn      = document.getElementById('trial-buy-btn');
const overlayBuyBtn    = document.getElementById('overlay-buy-btn');
const licenseKeyInput  = document.getElementById('license-key-input');
const activateBtn      = document.getElementById('activate-btn');
const licenseFeedback  = document.getElementById('license-feedback');

async function initLicense() {
  const status = await window.electronAPI.getLicenseStatus();

  if (status.licensed) {
    // Fully licensed — nothing to show
    return;
  }

  if (status.trialExpired) {
    // Block the app with overlay
    licenseOverlay.classList.remove('hidden');
  } else {
    // Trial active — show badge
    const days = status.trialDaysLeft;
    trialDaysLeft = days;
    trialBadgeText.textContent = t('trial.badge', days);
    if (days <= 2) trialBadge.classList.add('trial-badge-urgent');
    trialBadge.classList.remove('hidden');
  }
}

// Auto-format license key input as user types (XXXX-XXXX-XXXX-XXXX)
licenseKeyInput.addEventListener('input', () => {
  let raw = licenseKeyInput.value.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 16);
  const parts = raw.match(/.{1,4}/g) || [];
  licenseKeyInput.value = parts.join('-');
});

// Buy buttons open the purchase page in browser
[trialBuyBtn, overlayBuyBtn].forEach(btn => {
  btn.addEventListener('click', () => window.electronAPI.openPurchasePage());
});

// Activate button
activateBtn.addEventListener('click', async () => {
  const key = licenseKeyInput.value.trim();
  if (!key) return;

  setLicenseFeedback('', '');
  activateBtn.disabled = true;
  activateBtn.textContent = t('activate.checking');

  const result = await window.electronAPI.activateLicense(key);

  activateBtn.disabled = false;
  activateBtn.textContent = t('activate.btn');

  if (result.valid) {
    setLicenseFeedback('success', t('activate.success', result.message));
    setTimeout(() => { licenseOverlay.classList.add('hidden'); }, 1800);
  } else {
    setLicenseFeedback('error', result.message || t('activate.failed'));
  }
});

function setLicenseFeedback(type, msg) {
  licenseFeedback.textContent = msg;
  licenseFeedback.className = 'license-feedback';
  if (type) licenseFeedback.classList.add(type);
  if (msg) licenseFeedback.classList.remove('hidden');
  else licenseFeedback.classList.add('hidden');
}

// ─── Tab Navigation ────────────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tabId}`)
  );
}

async function loadSavedDir() {
  // ensureVideosDir resolves the real active dir (with fallback if saved path is gone)
  const activeDir = await window.electronAPI.ensureVideosDir();
  videosDirDisplay.textContent = activeDir;
  // Load settings
  const settings = await window.electronAPI.getSettings();
  autoDeleteInput.value = settings.autoDeleteDays || 0;
  updateAutoDeleteStatus(settings.autoDeleteDays || 0, null);
  // Restore test mode toggle state
  if (settings.testMode) {
    testModeToggle.checked = true;
    await applyTestMode(true);
  }
  // Restore locale
  if (settings.locale) {
    window._i18n.setLocale(settings.locale);
    applyTranslations();
  }
}

testModeToggle.addEventListener('change', async () => {
  await window.electronAPI.saveSettings({ testMode: testModeToggle.checked });
  await applyTestMode(testModeToggle.checked);
});

async function applyTestMode(enabled) {
  if (enabled) {
    // Stop real camera if running
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    stream = createFakeStream();
    cameraPreview.srcObject = stream;
    testModePanelEl.classList.remove('hidden');
  } else {
    // Stop fake stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    testModePanelEl.classList.add('hidden');
    await initCamera();
  }
}

saveAutoDeleteBtn.addEventListener('click', async () => {
  const days = parseInt(autoDeleteInput.value, 10);
  if (isNaN(days) || days < 0) {
    autoDeleteInput.value = 0;
    return;
  }
  await window.electronAPI.saveSettings({ autoDeleteDays: days });
  const result = await window.electronAPI.deleteOldRecordings();
  updateAutoDeleteStatus(days, result);
  await loadRecordingsList();
});

function updateAutoDeleteStatus(days, result) {
  autoDeleteStatus.classList.remove('hidden', 'success', 'info');
  if (!days || days <= 0) {
    autoDeleteStatus.textContent = t('settings.autoDeleteDisabled');
    autoDeleteStatus.classList.add('info');
  } else if (result === null) {
    autoDeleteStatus.textContent = t('settings.autoDeleteEnabled', days);
    autoDeleteStatus.classList.add('info');
  } else {
    autoDeleteStatus.textContent = t('settings.autoDeleteSaved', result.deleted, days);
    autoDeleteStatus.classList.add('success');
  }
}

pickDirBtn.addEventListener('click', async () => {
  const chosen = await window.electronAPI.pickVideosDir();
  if (chosen) {
    videosDirDisplay.textContent = chosen;
    await loadRecordingsList();
  }
});

async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    cameraPreview.srcObject = stream;
    cameraError.classList.add('hidden');
  } catch (err) {
    cameraError.textContent = t('status.cameraError', err.message);
    cameraError.classList.remove('hidden');
  }
}

function createFakeStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 640, 480);
    // Animated grid lines
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke(); }
    for (let y = 0; y < 480; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
    // Label
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TEST MODE', 320, 200);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px monospace';
    ctx.fillText('Simulated Camera Stream', 320, 248);
    ctx.fillStyle = '#64748b';
    ctx.font = '16px monospace';
    ctx.fillText(new Date().toLocaleTimeString(), 320, 288);
    requestAnimationFrame(draw);
  }
  draw();
  return canvas.captureStream(15);
}

// ─── Test Mode Controls ────────────────────────────────────────────────────────
testScanBtn.addEventListener('click', () => {
  const code = testScanInput.value.trim();
  if (code) { handleBarcodeScan(code); testScanInput.value = ''; }
});

testManualBtn.addEventListener('click', () => {
  handleBarcodeScan(MANUAL_SCAN_CODE);
});

testScanInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const code = testScanInput.value.trim();
    if (code) { handleBarcodeScan(code); testScanInput.value = ''; }
  }
});

// ─── Barcode Input Capture ────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Ignore keystrokes when any input or textarea is focused
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

  if (e.key === 'Enter') {
    const code = barcodeBuffer.trim();
    barcodeBuffer = '';
    clearTimeout(barcodeTimeout);
    if (code.length > 0) {
      handleBarcodeScan(code);
    }
    return;
  }

  // Accept printable characters only
  if (e.key.length === 1) {
    barcodeBuffer += e.key;
    // Auto-reset buffer after 500ms of inactivity (safety net)
    clearTimeout(barcodeTimeout);
    barcodeTimeout = setTimeout(() => {
      barcodeBuffer = '';
    }, 500);
  }
});

// ─── Barcode Logic ────────────────────────────────────────────────────────────
async function handleBarcodeScan(code) {
  if (code === MANUAL_SCAN_CODE) {
    if (!currentShippingCode) {
      // Start a new manual recording named by current date/time
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const name = `MANUAL_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      currentShippingCode = name;
      startRecording(name);
    } else if (currentShippingCode.startsWith('MANUAL_')) {
      // Stop the in-progress manual recording
      stopRecording();
    } else {
      // Regular recording in progress — notify user
      setStatus('warning', t('status.regularInProgress'));
    }
    return;
  }

  if (!currentShippingCode) {
    // Check for existing recordings — block duplicates
    const existing = await window.electronAPI.searchVideo(code);
    if (existing.length > 0) {
      setStatus('warning', t('status.duplicate', code, existing.length));
      currentCodeEl.textContent = t('status.switchToSearch', code);
      searchInput.value = code;
      return;
    }
    // No recording in progress — start one
    currentShippingCode = code;
    startRecording(code);
  } else if (code === currentShippingCode) {
    // Same code scanned — stop recording
    stopRecording();
  } else {
    // Different code — ignore
    console.log(`Ignored mismatched code: ${code} (current: ${currentShippingCode})`);
  }
}

// ─── Recording ────────────────────────────────────────────────────────────────
async function startRecording(code) {
  if (!stream) {
    setStatus('recording', t('status.cameraUnavailable', code));
    return;
  }

  try {
    await window.electronAPI.beginVideoWrite(code);
  } catch (err) {
    setStatus('waiting', t('status.failedOpenFile', err.message));
    return;
  }

  writeQueue = Promise.resolve();

  const mimeType = getSupportedMimeType();
  const options = {
    ...(mimeType ? { mimeType } : {})
  };

  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (err) {
    await window.electronAPI.abortVideoWrite().catch(() => {});
    setStatus('waiting', t('status.failedStartRecorder', err.message));
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      // Chain writes so they stay in order and don't overlap
      writeQueue = writeQueue.then(async () => {
        const arrayBuffer = await e.data.arrayBuffer();
        await window.electronAPI.writeVideoChunk(new Uint8Array(arrayBuffer));
      }).catch(err => console.error('Chunk write error:', err));
    }
  };

  mediaRecorder.onstop = () => {
    // Wait for all in-flight chunk writes before finalising
    writeQueue.then(() => saveRecording()).catch(() => saveRecording());
  };

  mediaRecorder.start(100); // collect data every 100ms

  // UI
  const isManual = code.startsWith('MANUAL_');
  const displayLabel = isManual ? formatManualCode(code) : code;
  setStatus('recording', isManual ? t('status.manualRecordingActive', displayLabel) : t('status.recordingFor', code));
  currentCodeEl.textContent = isManual ? t('status.manualRecording') : t('status.shippingCode', code);
  recordingBadge.classList.remove('hidden');
  savedInfo.classList.add('hidden');
  stopRecordingBtn.classList.remove('hidden');
  startTimer();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  stopTimer();
  recordingBadge.classList.add('hidden');
  stopRecordingBtn.classList.add('hidden');
}

stopRecordingBtn.addEventListener('click', () => {
  if (currentShippingCode) {
    stopRecording();
  }
});

async function saveRecording() {
  try {
    const result = await window.electronAPI.endVideoWrite();
    const sizeKb = (result.size / 1024).toFixed(1);
    setStatus('saved', t('status.saved', result.filename));
    savedInfo.textContent = t('status.savedInfo', result.filename, sizeKb);
    savedInfo.classList.remove('hidden');
    await loadRecordingsList();
  } catch (err) {
    setStatus('waiting', t('status.errorSaving', err.message));
    await window.electronAPI.abortVideoWrite().catch(() => {});
  }

  currentShippingCode = null;
}

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  timerSeconds = 0;
  timerDisplay.classList.remove('hidden');
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerDisplay.classList.add('hidden');
}

function updateTimerDisplay() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const s = String(timerSeconds % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

// ─── Status ───────────────────────────────────────────────────────────────────
function setStatus(type, message) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  if (type === 'waiting') {
    currentCodeEl.textContent = '';
  }
}

saveAsBtn.addEventListener('click', async () => {
  if (!currentPlayingPath) return;
  const defaultName = currentPlayingPath.split(/[\\/]/).pop();
  saveAsStatus.classList.remove('hidden', 'success', 'error');
  saveAsStatus.textContent = t('search.converting');
  saveAsBtn.disabled = true;
  const result = await window.electronAPI.saveVideoAs({ srcPath: currentPlayingPath, defaultName });
  saveAsBtn.disabled = false;
  if (result.canceled) {
    saveAsStatus.classList.add('hidden');
  } else if (result.error) {
    saveAsStatus.textContent = t('search.saveError', result.error);
    saveAsStatus.classList.add('error');
  } else {
    saveAsStatus.textContent = t('search.savedTo', result.filePath);
    saveAsStatus.classList.add('success');
  }
});

// ─── Search & Playback ────────────────────────────────────────────────────────
searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

searchInput.addEventListener('input', () => {
  searchClearBtn.classList.toggle('hidden', searchInput.value === '');
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchClearBtn.classList.add('hidden');
  searchResults.classList.add('hidden');
  playbackSection.classList.add('hidden');
  searchError.classList.add('hidden');
  resultsList.innerHTML = '';
  searchInput.focus();
});

async function doSearch() {
  const code = searchInput.value.trim();
  searchError.classList.add('hidden');
  searchResults.classList.add('hidden');
  playbackSection.classList.add('hidden');
  resultsList.innerHTML = '';

  if (!code) {
    searchError.textContent = t('search.enterCode');
    searchError.classList.remove('hidden');
    return;
  }

  try {
    const results = await window.electronAPI.searchVideo(code);
    if (results.length === 0) {
      searchError.textContent = t('search.noResults', code);
      searchError.classList.remove('hidden');
      return;
    }

    results.forEach((item) => {
      const li = document.createElement('li');
      const sizeKb = (item.size / 1024).toFixed(1);
      const date = new Date(item.modified).toLocaleString();
      li.innerHTML = `
        <div class="res-info">
          <span class="file-name">${item.filename}</span>
          <span class="file-meta">${sizeKb} KB &nbsp;&middot;&nbsp; ${date}</span>
        </div>
        <div class="res-actions">
          <button class="play-btn" data-path="${item.filePath}" data-name="${item.filename}">${t('rec.play')}</button>
          <button class="delete-btn" data-path="${item.filePath}" data-name="${item.filename}">${t('rec.delete')}</button>
        </div>
      `;
      resultsList.appendChild(li);
    });

    resultsList.querySelectorAll('.play-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        playVideo(btn.dataset.path, btn.dataset.name);
      });
    });

    resultsList.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('rec.confirmDelete', btn.dataset.name))) return;
        const result = await window.electronAPI.deleteVideo(btn.dataset.path);
        if (result.success) {
          if (currentPlayingPath === btn.dataset.path) {
            playbackSection.classList.add('hidden');
            currentPlayingPath = null;
          }
          await loadRecordingsList();
          doSearch();
        } else {
          searchError.textContent = t('rec.deleteFailed', result.error);
          searchError.classList.remove('hidden');
        }
      });
    });

    searchResults.classList.remove('hidden');
  } catch (err) {
    searchError.textContent = t('search.searchError', err.message);
    searchError.classList.remove('hidden');
  }
}

async function playVideo(filePath, filename) {
  try {
    const base64 = await window.electronAPI.readVideo(filePath);
    if (!base64) {
      searchError.textContent = t('search.cantReadVideo');
      searchError.classList.remove('hidden');
      return;
    }

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    // Revoke previous object URL if any
    if (playbackVideo.src && playbackVideo.src.startsWith('blob:')) {
      URL.revokeObjectURL(playbackVideo.src);
    }

    playbackVideo.src = url;
    playingFilename.textContent = filename;
    currentPlayingPath = filePath;
    saveAsStatus.classList.add('hidden');
    playbackSection.classList.remove('hidden');
    playbackVideo.play();
  } catch (err) {
    searchError.textContent = t('search.playbackError', err.message);
    searchError.classList.remove('hidden');
  }
}

// ─── Recordings List ────────────────────────────────────────────────────────────────────────────
let allRecordings = [];

recDateFilter.addEventListener('change', () => {
  recResetFilterBtn.classList.remove('hidden');
  renderStandardRecordingsList();
});

recResetFilterBtn.addEventListener('click', () => {
  recDateFilter.value = '';
  recResetFilterBtn.classList.add('hidden');
  recFilterCount.classList.add('hidden');
  renderStandardRecordingsList();
});

manualDateFilter.addEventListener('change', () => {
  manualResetFilterBtn.classList.remove('hidden');
  renderManualRecordingsList();
});

manualResetFilterBtn.addEventListener('click', () => {
  manualDateFilter.value = '';
  manualResetFilterBtn.classList.add('hidden');
  manualFilterCount.classList.add('hidden');
  renderManualRecordingsList();
});

async function loadRecordingsList() {
  try {
    allRecordings = await window.electronAPI.listAllVideos();
    renderRecordingsList();
  } catch (err) {
    console.error('Failed to load recordings list:', err);
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatManualCode(shippingCode) {
  const m = shippingCode.match(/^MANUAL_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  return shippingCode;
}

function matchesDateFilter(item, dateStr) {
  const d = new Date(item.modified);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}` === dateStr;
}

function attachRecListEvents(listEl) {
  listEl.querySelectorAll('.rec-play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab('search');
      playVideo(btn.dataset.path, btn.dataset.name);
    });
  });
  listEl.querySelectorAll('.rec-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('rec.confirmDelete', btn.dataset.name))) return;
      const result = await window.electronAPI.deleteVideo(btn.dataset.path);
      if (result.success) {
        if (currentPlayingPath === btn.dataset.path) {
          playbackSection.classList.add('hidden');
          currentPlayingPath = null;
        }
        await loadRecordingsList();
      } else {
        console.error(t('rec.deleteFailed', result.error));
      }
    });
  });
}

function renderRecordingsList() {
  renderStandardRecordingsList();
  renderManualRecordingsList();
}

function renderStandardRecordingsList() {
  const source = allRecordings.filter(r => !r.isManual);
  const selectedDate = recDateFilter.value;
  const filtered = selectedDate ? source.filter(item => matchesDateFilter(item, selectedDate)) : source;

  if (selectedDate) {
    recFilterCount.textContent = t('rec.filterCount', filtered.length);
    recFilterCount.classList.remove('hidden');
  } else {
    recFilterCount.classList.add('hidden');
  }

  recordingsListEl.innerHTML = '';
  if (filtered.length === 0) {
    noRecordingsEl.textContent = selectedDate ? t('rec.noRecordingsOnDate') : t('rec.noRecordings');
    noRecordingsEl.classList.remove('hidden');
    return;
  }
  noRecordingsEl.classList.add('hidden');

  filtered.forEach(item => {
    const li = document.createElement('li');
    const sizeKb = (item.size / 1024).toFixed(1);
    const date = new Date(item.modified).toLocaleString();
    li.innerHTML = `
      <div class="rec-info">
        <span class="rec-code">${item.shippingCode}</span>
        <span class="rec-filename">${item.filename}</span>
        <span class="rec-meta">${sizeKb} KB &nbsp;·&nbsp; ${date}</span>
      </div>
      <div class="rec-actions">
        <button class="rec-play-btn" data-path="${item.filePath}" data-name="${item.filename}">${t('rec.play')}</button>
        <button class="rec-delete-btn" data-path="${item.filePath}" data-name="${item.filename}">${t('rec.delete')}</button>
      </div>
    `;
    recordingsListEl.appendChild(li);
  });
  attachRecListEvents(recordingsListEl);
}

function renderManualRecordingsList() {
  const source = allRecordings.filter(r => r.isManual);
  const selectedDate = manualDateFilter.value;
  const filtered = selectedDate ? source.filter(item => matchesDateFilter(item, selectedDate)) : source;

  if (selectedDate) {
    manualFilterCount.textContent = t('rec.filterCount', filtered.length);
    manualFilterCount.classList.remove('hidden');
  } else {
    manualFilterCount.classList.add('hidden');
  }

  manualRecordingsListEl.innerHTML = '';
  if (filtered.length === 0) {
    noManualRecordingsEl.textContent = selectedDate ? t('rec.noManualRecordingsOnDate') : t('rec.noManualRecordings');
    noManualRecordingsEl.classList.remove('hidden');
    return;
  }
  noManualRecordingsEl.classList.add('hidden');

  filtered.forEach(item => {
    const li = document.createElement('li');
    const sizeKb = (item.size / 1024).toFixed(1);
    const date = new Date(item.modified).toLocaleString();
    const displayCode = formatManualCode(item.shippingCode);
    li.innerHTML = `
      <div class="rec-info">
        <span class="rec-code manual-code">${displayCode}</span>
        <span class="rec-filename">${item.filename}</span>
        <span class="rec-meta">${sizeKb} KB &nbsp;·&nbsp; ${date}</span>
      </div>
      <div class="rec-actions">
        <button class="rec-play-btn" data-path="${item.filePath}" data-name="${item.filename}">${t('rec.play')}</button>
        <button class="rec-delete-btn" data-path="${item.filePath}" data-name="${item.filename}">${t('rec.delete')}</button>
      </div>
    `;
    manualRecordingsListEl.appendChild(li);
  });
  attachRecListEvents(manualRecordingsListEl);
}

// ─── QR Code ──────────────────────────────────────────────────────────────────
printQrBtn.addEventListener('click', async () => {
  if (!qrCodeImg.getAttribute('src')) {
    const dataUrl = await window.electronAPI.generateManualQR();
    await new Promise(resolve => {
      qrCodeImg.onload = resolve;
      qrCodeImg.src = dataUrl;
      if (qrCodeImg.complete) resolve();
    });
  }
  qrCodeSection.classList.remove('hidden');

  // Move qrCodeSection to a direct child of <body> so the @media print rule
  // (body > * { display:none }) doesn't hide it via an ancestor.
  const originalParent = qrCodeSection.parentNode;
  const originalNextSibling = qrCodeSection.nextSibling;
  document.body.appendChild(qrCodeSection);

  window.print();

  // Restore to original position in the DOM after printing.
  originalParent.insertBefore(qrCodeSection, originalNextSibling);
});
