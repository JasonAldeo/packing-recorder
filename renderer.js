// ─── i18n helper ─────────────────────────────────────────────────────────────
const t = (...args) => window._i18n.t(...args);

// ─── Constants ────────────────────────────────────────────────────────────────
const MANUAL_SCAN_CODE = 'MANUALSCAN';
const STATION_QR_PREFIX = 'STATION:';
const DEFAULT_ARMED_TIMEOUT_MS = 15000;
const MAX_STATIONS = 6;

// ─── Global state ─────────────────────────────────────────────────────────────
let trialDaysLeft = null;
let licenseDaysLeft = null;
let currentUserRole = null;
let barcodeBuffer = '';
let barcodeTimeout = null;
let currentPlayingPath = null;
let allRecordings = [];

// Multi-station state: Map of stationId -> station object
// Single-station mode uses one station with id 'station1'
const stations = new Map();

// Settings cache
let appSettings = {};

// Whether this window is a station window (loaded with ?station=X)
const urlParams = new URLSearchParams(window.location.search);
const stationWindowId = urlParams.get('station'); // e.g. 'station1' or null

// ─── DOM References ──────────────────────────────────────────────────────────
const statusMessage        = document.getElementById('status-message');
const savedInfo            = document.getElementById('saved-info');
const searchInput          = document.getElementById('search-input');
const searchBtn            = document.getElementById('search-btn');
const searchResults        = document.getElementById('search-results');
const resultsList          = document.getElementById('results-list');
const playbackSection      = document.getElementById('playback-section');
const playingFilename      = document.getElementById('playing-filename');
const playbackVideo        = document.getElementById('playback-video');
const searchError          = document.getElementById('search-error');
const saveAsBtn            = document.getElementById('save-as-btn');
const saveAsStatus         = document.getElementById('save-as-status');
const searchClearBtn       = document.getElementById('search-clear-btn');
const recordingsListEl     = document.getElementById('recordings-list');
const noRecordingsEl       = document.getElementById('no-recordings');
const recDateFilter        = document.getElementById('rec-date-filter');
const recStationFilter     = document.getElementById('rec-station-filter');
const recResetFilterBtn    = document.getElementById('rec-reset-filter-btn');
const recFilterCount       = document.getElementById('rec-filter-count');
const manualRecordingsListEl  = document.getElementById('manual-recordings-list');
const noManualRecordingsEl    = document.getElementById('no-manual-recordings');
const manualDateFilter        = document.getElementById('manual-date-filter');
const manualStationFilter     = document.getElementById('manual-station-filter');
const manualResetFilterBtn    = document.getElementById('manual-reset-filter-btn');
const manualFilterCount       = document.getElementById('manual-filter-count');
const printQrBtn           = document.getElementById('print-qr-btn');
const qrCodeSection        = document.getElementById('qr-code-section');
const qrCodeImg            = document.getElementById('qr-code-img');
const videosDirDisplay     = document.getElementById('videos-dir-display');
const pickDirBtn           = document.getElementById('pick-dir-btn');
const autoDeleteInput      = document.getElementById('auto-delete-days');
const saveAutoDeleteBtn    = document.getElementById('save-auto-delete-btn');
const autoDeleteStatus     = document.getElementById('auto-delete-status');
const testModePanelEl      = document.getElementById('test-mode-panel');
const testScanInput        = document.getElementById('test-scan-input');
const testScanBtn          = document.getElementById('test-scan-btn');
const testManualBtn        = document.getElementById('test-manual-btn');
const testModeToggle       = document.getElementById('test-mode-toggle');
const testStationRow       = document.getElementById('test-station-row');
const testStationBtns      = document.getElementById('test-station-btns');
const voiceEnabledToggle   = document.getElementById('voice-enabled-toggle');
const voiceLocaleSelect    = document.getElementById('voice-locale-select');
const voiceOptions         = document.getElementById('voice-options');
const voiceSpeedRange      = document.getElementById('voice-speed-range');
const voiceSpeedLabel      = document.getElementById('voice-speed-label');
const localeSelect         = document.getElementById('locale-select');

// Multi-station DOM
const stationsGrid         = document.getElementById('stations-grid');
const singleStationView    = document.getElementById('single-station-view');
const dashboardView        = document.getElementById('dashboard-view');
const multiStationToggle   = document.getElementById('multi-station-toggle');
const stationCountInput    = document.getElementById('station-count-input');
const multiWindowToggle    = document.getElementById('multi-window-toggle');
const armedTimeoutInput    = document.getElementById('armed-timeout-input');
const stationConfigArea    = document.getElementById('station-config-area');
const saveStationsBtn      = document.getElementById('save-stations-btn');
const saveStationsStatus   = document.getElementById('save-stations-status');
const printStationQrBtn    = document.getElementById('print-station-qr-btn');
const cameraWarningEl      = document.getElementById('camera-warning');

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await window.electronAPI.ensureVideosDir();
    appSettings = await window.electronAPI.getSettings();

    // Restore locale first so UI is translated on load
    if (appSettings.locale) {
      window._i18n.setLocale(appSettings.locale);
    }

    if (stationWindowId) {
      // This is a station-specific window — render only that station
      await initAsStationWindow(stationWindowId);
    } else {
      // Main window
      await initMainWindow();
    }

    applyTranslations();
    await initLicense();
  } catch (err) {
    console.error('[startup] init failed:', err);
  } finally {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
})();

// ─── Main window init ─────────────────────────────────────────────────────────
async function initMainWindow() {
  initTabs();
  await loadSavedDir();
  await initStations();
  await loadRecordingsList();

  // Listen for station window closures (notified by main process)
  window.electronAPI.onStationWindowClosed((sid) => {
    updateDashboardWindowButton(sid, false);
  });

  // Listen for scans relayed from station windows — route through normal armed state machine
  window.electronAPI.onRelayScan((code) => {
    routeBarcode(code);
  });

  // Listen for recording events from station windows — keep dashboard state in sync
  window.electronAPI.onStationEvent((payload) => {
    const { type, stationId } = payload;
    const st = stations.get(stationId);
    if (!st) return;
    if (type === 'recording-saved' || type === 'recording-aborted') {
      st.currentShippingCode = null;
      st.state = 'idle';
      setStationStatus(stationId, 'idle');
    }
  });
}

// ─── Station window init ──────────────────────────────────────────────────────
async function initAsStationWindow(sid) {
  // Hide everything except the station view
  document.querySelector('.tab-nav').classList.add('hidden');
  document.querySelector('.tab-content').style.paddingTop = '0';

  // Only show the station panel
  if (stationsGrid) stationsGrid.classList.add('hidden');
  if (dashboardView) dashboardView.classList.add('hidden');

  // Show the single-station-view panel
  const panel = document.getElementById('tab-scan');
  if (panel) panel.classList.add('active');

  // Build this one station
  const settings = appSettings;
  const stationsCfg = settings.stations || [];
  const cfg = stationsCfg.find(s => s.id === sid) || { id: sid, label: labelFromId(sid) };

  await buildStation(cfg, true /* fullSize */);
  const st = stations.get(sid);
  if (st) {
    // Restore test mode if enabled
    if (settings.testMode) {
      st.stream = createFakeStream();
      st.elements.video.srcObject = st.stream;
      if (testModePanelEl) testModePanelEl.classList.remove('hidden');
    } else {
      await initStationCamera(sid);
    }
  }

  // Wire test scan controls for this station window
  initTestControls();

  // ── Listen for commands from the dashboard ──────────────────────────────────
  window.electronAPI.onStationCommand(async (cmd) => {
    switch (cmd.type) {
      case 'set-status':
        setStationStatus(sid, cmd.state);
        // Mirror state on the local station object so recording guards work
        if (st) st.state = cmd.state === 'cancelled' ? 'idle' : cmd.state;
        // Armed timeout flash: cancelled → back to idle after 1500ms
        if (cmd.state === 'cancelled') {
          setTimeout(() => {
            if (st && st.state === 'idle') setStationStatus(sid, 'idle');
          }, 1500);
        }
        break;
      case 'start-recording':
        if (st) {
          st.state = 'recording';
          st.currentShippingCode = cmd.code;
          await startRecording(sid, cmd.code);
        }
        break;
      case 'stop-recording':
        if (st) stopRecording(sid);
        break;
    }
  });
}

// ─── Station initialization ───────────────────────────────────────────────────
async function initStations() {
  const settings = appSettings;
  const multiStation = settings.multiStation || false;
  const multiWindow = settings.multiWindow || false;
  const stationsCfg = settings.stations || [];
  const stationCount = multiStation ? Math.min(parseInt(settings.stationCount, 10) || 1, MAX_STATIONS) : 1;

  // Build station config array
  const configs = [];
  for (let i = 1; i <= stationCount; i++) {
    const id = `station${i}`;
    const saved = stationsCfg.find(s => s.id === id) || {};
    configs.push({
      id,
      label: saved.label || `Station ${i}`,
      cameraDeviceId: saved.cameraDeviceId || null,
    });
  }

  // Decide render mode
  if (!multiStation) {
    // Single-station mode: show the classic single view
    if (singleStationView) singleStationView.classList.remove('hidden');
    if (stationsGrid) stationsGrid.classList.add('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');

    await buildStation(configs[0], true);
    const settings2 = appSettings;
    if (settings2.testMode) {
      const st = stations.get('station1');
      if (st) {
        st.stream = createFakeStream();
        st.elements.video.srcObject = st.stream;
        if (testModePanelEl) testModePanelEl.classList.remove('hidden');
      }
    } else {
      await initStationCamera('station1');
    }
  } else if (multiStation && multiWindow) {
    // Dashboard mode
    if (singleStationView) singleStationView.classList.add('hidden');
    if (stationsGrid) stationsGrid.classList.add('hidden');
    if (dashboardView) dashboardView.classList.remove('hidden');

    // Populate the stations Map with state objects (no UI elements / no camera)
    // so the armed state machine and routeBarcode work correctly on the dashboard.
    for (const cfg of configs) {
      stations.set(cfg.id, {
        id: cfg.id,
        label: cfg.label,
        state: 'idle',
        stream: null,
        mediaRecorder: null,
        currentShippingCode: null,
        armedTimer: null,
        writeQueue: Promise.resolve(),
        elements: {
          card: null, video: null, badge: null, stateLabel: null,
          codeLabel: null, timerDisplay: null, timerEl: null,
          statusText: null, savedInfo: null, stopBtn: null, cameraError: null,
        },
      });
    }

    renderDashboard(configs);
    if (appSettings.testMode && testModePanelEl) testModePanelEl.classList.remove('hidden');
    initTestControls();
  } else {
    // Multi-station single-window grid
    if (singleStationView) singleStationView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');
    if (stationsGrid) {
      stationsGrid.classList.remove('hidden');
      stationsGrid.innerHTML = '';
      // Set dynamic column class based on station count
      stationsGrid.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3');
      const colClass = stationCount <= 1 ? 'grid-cols-1'
                     : stationCount <= 4 ? 'grid-cols-2'
                     : 'grid-cols-3';
      stationsGrid.classList.add(colClass);
    }

    for (const cfg of configs) {
      await buildStation(cfg, false);
    }

    // Init cameras (may be test mode)
    const settings2 = appSettings;
    for (const cfg of configs) {
      if (settings2.testMode) {
        const st = stations.get(cfg.id);
        if (st) {
          st.stream = createFakeStream();
          st.elements.video.srcObject = st.stream;
        }
      } else {
        await initStationCamera(cfg.id);
      }
    }
    if (settings2.testMode && testModePanelEl) {
      testModePanelEl.classList.remove('hidden');
    }
  }

  // Enumerate cameras and warn if not enough
  await enumerateCamerasAndWarn(stationCount, multiStation);

  // Render station test buttons (only visible in multi-station + test mode)
  renderTestStationButtons(stationCount, multiStation);

  // Wire test scan controls once (works regardless of single/multi-station mode)
  initTestControls();
}

function initTestControls() {
  const relay = (code) => {
    if (stationWindowId) {
      window.electronAPI.relayScan(code);
    } else {
      routeBarcode(code);
    }
  };
  if (testScanBtn) {
    testScanBtn.onclick = () => {
      const code = testScanInput ? testScanInput.value.trim() : '';
      if (code) { relay(code); testScanInput.value = ''; }
    };
  }
  if (testManualBtn) {
    testManualBtn.onclick = () => relay(MANUAL_SCAN_CODE);
  }
  if (testScanInput) {
    testScanInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const code = testScanInput.value.trim();
        if (code) { relay(code); testScanInput.value = ''; }
      }
    };
  }
}

// ─── Build a station card ──────────────────────────────────────────────────────
async function buildStation(cfg, fullSize) {
  const sid = cfg.id;
  const num = parseInt(sid.replace('station', ''), 10);

  // Create state object
  const stateObj = {
    id: sid,
    label: cfg.label || `Station ${num}`,
    cameraDeviceId: cfg.cameraDeviceId || null,
    stream: null,
    mediaRecorder: null,
    writeQueue: Promise.resolve(),
    state: 'idle', // 'idle' | 'armed' | 'recording'
    armedTimer: null,
    currentShippingCode: null,
    timerInterval: null,
    timerSeconds: 0,
    elements: {}
  };
  stations.set(sid, stateObj);

  if (fullSize) {
    // Use the existing single-station DOM elements
    stateObj.elements = {
      card: singleStationView,
      video: document.getElementById('camera-preview'),
      badge: document.getElementById('recording-badge'),
      statusText: document.getElementById('status-message'),
      codeLabel: document.getElementById('current-code'),
      timerDisplay: document.getElementById('timer-display'),
      timerEl: document.getElementById('timer'),
      savedInfo: document.getElementById('saved-info'),
      stopBtn: document.getElementById('stop-recording-btn'),
      cameraError: document.getElementById('camera-error'),
      stateLabel: null, // no state badge in single view
    };

    // Wire stop button
    const stopBtn = stateObj.elements.stopBtn;
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        if (stateObj.currentShippingCode) stopRecording(sid);
      });
    }

  } else {
    // Build a card element and append to grid
    const card = document.createElement('div');
    card.className = 'station-card station-idle';
    card.id = `station-card-${sid}`;
    card.innerHTML = `
      <div class="station-header">
        <span class="station-label-text">${cfg.label || `Station ${num}`}</span>
        <span class="station-state-badge badge-idle" id="badge-${sid}">${t('station.idle')}</span>
      </div>
      <div class="station-video-wrap">
        <video class="station-preview" id="video-${sid}" autoplay muted playsinline></video>
        <div class="station-rec-badge hidden" id="rec-badge-${sid}">\u25CF REC</div>
      </div>
      <div class="station-code-label" id="code-${sid}"></div>
      <div class="station-timer hidden" id="timer-display-${sid}">
        <span>${t('scan.timerLabel')}</span> <span id="timer-${sid}">00:00</span>
      </div>
    `;
    if (stationsGrid) stationsGrid.appendChild(card);

    stateObj.elements = {
      card,
      video: document.getElementById(`video-${sid}`),
      badge: document.getElementById(`rec-badge-${sid}`),
      stateLabel: document.getElementById(`badge-${sid}`),
      codeLabel: document.getElementById(`code-${sid}`),
      timerDisplay: document.getElementById(`timer-display-${sid}`),
      timerEl: document.getElementById(`timer-${sid}`),
      statusText: null,
      savedInfo: null,
      stopBtn: null,
      cameraError: null,
    };
  }

  return stateObj;
}

// ─── Camera init per station ──────────────────────────────────────────────────
async function initStationCamera(sid) {
  const st = stations.get(sid);
  if (!st) return;

  const videoEl = st.elements.video;
  const cameraError = st.elements.cameraError;

  // Race getUserMedia against a 5s timeout so a missing or unresponsive camera
  // never hangs the startup sequence indefinitely.
  function getUserMediaWithTimeout(constraints, ms = 5000) {
    return Promise.race([
      navigator.mediaDevices.getUserMedia(constraints),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Camera timeout')), ms)
      ),
    ]);
  }

  try {
    const constraints = {
      video: st.cameraDeviceId
        ? { deviceId: { exact: st.cameraDeviceId } }
        : true,
      audio: false
    };
    st.stream = await getUserMediaWithTimeout(constraints);
    if (videoEl) videoEl.srcObject = st.stream;
    if (cameraError) cameraError.classList.add('hidden');
  } catch (err) {
    // Fallback: try without exact deviceId
    try {
      st.stream = await getUserMediaWithTimeout({ video: true, audio: false });
      if (videoEl) videoEl.srcObject = st.stream;
      if (cameraError) cameraError.classList.add('hidden');
    } catch (err2) {
      if (cameraError) {
        cameraError.textContent = t('status.cameraError', err2.message);
        cameraError.classList.remove('hidden');
      }
      setStationStatus(sid, 'idle');
    }
  }
}

// ─── Test station buttons ─────────────────────────────────────────────────────
function renderTestStationButtons(stationCount, multiStation) {
  if (!testStationRow || !testStationBtns) return;

  // Only show in multi-station mode with more than 1 station
  const show = multiStation && stationCount > 1;
  testStationRow.classList.toggle('hidden', !show);

  if (!show) return;

  testStationBtns.innerHTML = '';
  for (let i = 1; i <= stationCount; i++) {
    const sid = `station${i}`;
    const st = stations.get(sid);
    const label = st ? st.label : `Station ${i}`;
    const btn = document.createElement('button');
    btn.className = 'test-station-btn';
    btn.dataset.stationNum = i;
    btn.textContent = `${t('test.stationBtn', i)} [${i}]`;
    btn.title = label;
    btn.addEventListener('click', () => {
      if (!appSettings.testMode) return;
      const qrCode = `${STATION_QR_PREFIX}${i}`;
      if (stationWindowId) {
        window.electronAPI.relayScan(qrCode);
      } else {
        routeBarcode(qrCode);
      }
    });
    testStationBtns.appendChild(btn);
  }
}

// ─── Camera enumeration ───────────────────────────────────────────────────────
async function enumerateCamerasAndWarn(stationCount, multiStation) {
  if (!multiStation || stationCount <= 1) {
    if (cameraWarningEl) cameraWarningEl.classList.add('hidden');
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    populateCameraDropdowns(videoDevices);
    if (videoDevices.length < stationCount) {
      if (cameraWarningEl) {
        cameraWarningEl.textContent = t('settings.cameraWarning', videoDevices.length, stationCount);
        cameraWarningEl.classList.remove('hidden');
      }
    } else {
      if (cameraWarningEl) cameraWarningEl.classList.add('hidden');
    }
  } catch (_) {}
}

function populateCameraDropdowns(videoDevices) {
  const selects = document.querySelectorAll('.station-camera-select');
  selects.forEach(sel => {
    const currentVal = sel.value;
    // Keep first "not assigned" option
    while (sel.options.length > 1) sel.remove(1);
    videoDevices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i + 1}`;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  });
}

function createFakeStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 640, 480);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke(); }
    for (let y = 0; y < 480; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
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

// ─── Voice announcements ──────────────────────────────────────────────────────

/** Returns the spoken label for a station in the voice locale, e.g. "Station Two" / "Stasiun Dua". */
function voiceLabelFor(sid) {
  const num = parseInt(sid.replace('station', ''), 10);
  const voiceLocale = appSettings.voiceLocale || 'id';
  const dict = window._i18n.getTranslations(voiceLocale);
  const numWord = typeof dict['voice.stationNum'] === 'function'
    ? dict['voice.stationNum'](num)
    : String(num);
  // const prefix = voiceLocale === 'id' ? 'Stasiun' : 'Station';
  return `${numWord}`;
}

/** Speak a voice announcement phrase, using the voice locale independently of the UI locale. */
function speak(voiceKey, label) {
  if (!appSettings.voiceEnabled) return;
  const voiceLocale = appSettings.voiceLocale || 'id';
  const voiceSpeed  = parseFloat(appSettings.voiceSpeed) || 1.0;
  const dict = window._i18n.getTranslations(voiceLocale);
  const val = dict[voiceKey];
  const phrase = typeof val === 'function' ? val(label) : (val ?? '');
  if (!phrase) return;
  const utter = new SpeechSynthesisUtterance(phrase);
  utter.lang = voiceLocale === 'id' ? 'id-ID' : 'en-US';
  utter.rate = voiceSpeed;
  window.speechSynthesis.cancel(); // cancel any in-progress speech first
  window.speechSynthesis.speak(utter);
}

/**
 * Speak multiple phrases in sequence, one after another.
 * @param {Array<{key: string, label: string}>} items
 */
function speakSequence(items) {
  if (!appSettings.voiceEnabled || !items.length) return;
  const voiceLocale = appSettings.voiceLocale || 'id';
  const voiceSpeed  = parseFloat(appSettings.voiceSpeed) || 1.0;
  const lang = voiceLocale === 'id' ? 'id-ID' : 'en-US';
  const dict = window._i18n.getTranslations(voiceLocale);
  window.speechSynthesis.cancel();
  items.forEach(({ key, label }) => {
    const val = dict[key];
    const phrase = typeof val === 'function' ? val(label) : (val ?? '');
    if (!phrase) return;
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.lang = lang;
    utter.rate = voiceSpeed;
    window.speechSynthesis.speak(utter); // queued, not cancelled
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard(configs) {
  if (!dashboardView) return;
  dashboardView.innerHTML = `
    <div class="dashboard-hint">${t('dashboard.hint')}</div>
    <div class="dashboard-grid" id="dashboard-grid"></div>
  `;
  const grid = document.getElementById('dashboard-grid');
  const openWindows = await window.electronAPI.getOpenStationWindows();

  configs.forEach(cfg => {
    const sid = cfg.id;
    const num = parseInt(sid.replace('station', ''), 10);
    const isOpen = openWindows.includes(sid);
    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.id = `dash-card-${sid}`;
    card.innerHTML = `
      <div class="dashboard-card-header">
        <span class="dashboard-station-name">${cfg.label || `Station ${num}`}</span>
        <span class="dashboard-state-badge badge-idle" id="dash-badge-${sid}">${t('station.idle')}</span>
      </div>
      <div class="dashboard-code" id="dash-code-${sid}"></div>
      <button class="dashboard-open-btn ${isOpen ? 'btn-open' : ''}" id="dash-btn-${sid}">
        ${isOpen ? t('dashboard.windowOpen') : t('dashboard.openWindow')}
      </button>
    `;
    grid.appendChild(card);

    document.getElementById(`dash-btn-${sid}`).addEventListener('click', async () => {
      await window.electronAPI.openStationWindow(sid);
      updateDashboardWindowButton(sid, true);
    });
  });
}

function updateDashboardWindowButton(sid, isOpen) {
  const btn = document.getElementById(`dash-btn-${sid}`);
  if (!btn) return;
  btn.textContent = isOpen ? t('dashboard.windowOpen') : t('dashboard.openWindow');
  btn.classList.toggle('btn-open', isOpen);
}

// ─── Scanner routing ──────────────────────────────────────────────────────────
// Global keydown listener — routes to the right station
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

  // ── Test mode: digit keys 1–5 simulate STATION:X QR scans ──────────────────
  if (appSettings.testMode && appSettings.multiStation && /^[1-5]$/.test(e.key)) {
    const num = parseInt(e.key, 10);
    if (num <= (parseInt(appSettings.stationCount, 10) || 1)) {
      const qrCode = `${STATION_QR_PREFIX}${num}`;
      if (stationWindowId) {
        window.electronAPI.relayScan(qrCode);
      } else {
        routeBarcode(qrCode);
      }
      return;
    }
  }

  if (e.key === 'Enter') {
    const code = barcodeBuffer.trim();
    barcodeBuffer = '';
    clearTimeout(barcodeTimeout);
    if (code.length > 0) {
      // Station windows relay all scans to the dashboard for routing
      if (stationWindowId) {
        window.electronAPI.relayScan(code);
      } else {
        routeBarcode(code);
      }
    }
    return;
  }

  if (e.key.length === 1) {
    barcodeBuffer += e.key;
    clearTimeout(barcodeTimeout);
    barcodeTimeout = setTimeout(() => { barcodeBuffer = ''; }, 500);
  }
});

function routeBarcode(code) {
  // Station QR code
  if (code.startsWith(STATION_QR_PREFIX)) {
    const sid = 'station' + code.slice(STATION_QR_PREFIX.length);
    handleStationQR(sid);
    return;
  }

  // MANUALSCAN: deliver to any armed station
  if (code === MANUAL_SCAN_CODE) {
    const armed = getArmedStation();
    if (armed) {
      handleCodeForStation(armed.id, MANUAL_SCAN_CODE);
    } else {
      // Single-station mode: deliver to station1
      const single = stations.get('station1');
      if (single && stations.size === 1) {
        handleCodeForStation('station1', MANUAL_SCAN_CODE);
      } else {
        showGlobalWarning(t('status.scanStationFirst'));
      }
    }
    return;
  }

  // Regular barcode
  const multiStation = appSettings.multiStation || false;
  if (!multiStation || stations.size === 1) {
    // Single station mode — deliver directly
    handleCodeForStation('station1', code);
  } else {
    // Multi-station: route to armed station
    const armed = getArmedStation();
    if (armed) {
      handleCodeForStation(armed.id, code);
    } else {
      showGlobalWarning(t('status.scanStationFirst'));
    }
  }
}

/**
 * Send a command to an open station window (multi-window mode).
 * No-op if the window isn't open or we're not in multi-window mode.
 */
function pushToStationWindow(sid, command) {
  if (!appSettings.multiWindow) return;
  window.electronAPI.sendStationCommand(sid, command).catch(() => {});
}

function getArmedStation() {
  for (const [, st] of stations) {
    if (st.state === 'armed') return st;
  }
  return null;
}

// ─── Station QR handler ────────────────────────────────────────────────────────
function handleStationQR(sid) {
  const st = stations.get(sid);
  if (!st) return;

  if (st.state === 'idle') {
    // Find any currently armed station that will be displaced
    let displacedId = null;
    for (const [otherId, other] of stations) {
      if (otherId !== sid && other.state === 'armed') {
        displacedId = otherId;
        break;
      }
    }

    if (displacedId) {
      // Cancel the displaced station (visual flash only — no voice yet)
      cancelArm(displacedId, false, true /* skipVoice */);
      // Arm new station (visual only — no voice yet)
      armStation(sid, true /* skipVoice */);
      // Speak combined phrase: "Station Two cancelled, Station Three waiting"
      speakSequence([
        { key: 'voice.cancelled', label: voiceLabelFor(displacedId) },
        { key: 'voice.armed',     label: voiceLabelFor(sid) },
      ]);
    } else {
      armStation(sid);
    }
  } else if (st.state === 'armed') {
    // Operator scanned their own station QR while armed — cancel
    cancelArm(sid, false);
  } else if (st.state === 'recording') {
    pushToStationWindow(sid, { type: 'stop-recording' });
    stopRecording(sid);
  }
}

function armStation(sid, skipVoice = false) {
  const st = stations.get(sid);
  if (!st) return;
  st.state = 'armed';
  setStationStatus(sid, 'armed');
  if (!skipVoice) speak('voice.armed', voiceLabelFor(sid));
  pushToStationWindow(sid, { type: 'set-status', state: 'armed' });

  const timeoutMs = (parseInt(appSettings.armedTimeoutSecs, 10) || 15) * 1000;
  st.armedTimer = setTimeout(() => {
    // Timeout-triggered cancel: silent (no flash, no voice — operator is gone)
    if (st.state === 'armed') cancelArm(sid, true);
  }, timeoutMs);
}

/**
 * Cancel the armed state of a station.
 * @param {string} sid
 * @param {boolean} silent    - true = quiet return to idle (timeout); false = flash (displaced)
 * @param {boolean} skipVoice - true = caller will handle voice themselves (combined phrase)
 */
function cancelArm(sid, silent = true, skipVoice = false) {
  const st = stations.get(sid);
  if (!st) return;
  clearTimeout(st.armedTimer);
  st.armedTimer = null;
  st.state = 'idle';

  if (silent) {
    // Quiet return to idle — operator walked away, no need to alarm
    setStationStatus(sid, 'idle');
    pushToStationWindow(sid, { type: 'set-status', state: 'idle' });
    if (statusMessage && stations.size === 1) {
      setStatus('waiting', t('status.stationCancelled', st.label));
    }
  } else {
    // Flash "CANCELLED" for 1500ms then fade to idle
    setStationStatus(sid, 'cancelled');
    pushToStationWindow(sid, { type: 'set-status', state: 'cancelled' });
    if (!skipVoice) speak('voice.cancelled', voiceLabelFor(sid));
    setTimeout(() => {
      if (st.state === 'idle') {
        setStationStatus(sid, 'idle');
        pushToStationWindow(sid, { type: 'set-status', state: 'idle' });
      }
    }, 1500);
    if (statusMessage && stations.size === 1) {
      setStatus('waiting', t('status.stationCancelled', st.label));
    }
  }
}

// ─── Per-station barcode logic ─────────────────────────────────────────────────
async function handleCodeForStation(sid, code) {
  const st = stations.get(sid);
  if (!st) return;

  // In multi-window mode the dashboard has no camera stream for station windows.
  // It manages state only and delegates actual recording to the station window via IPC.
  const delegated = appSettings.multiWindow && !stationWindowId;

  if (code === MANUAL_SCAN_CODE) {
    if (!st.currentShippingCode) {
      const name = generateManualName();
      clearArmedTimer(sid);
      st.state = 'recording';
      st.currentShippingCode = name;
      if (delegated) setStationStatus(sid, 'recording');
      pushToStationWindow(sid, { type: 'start-recording', code: name });
      if (!delegated) await startRecording(sid, name);
    } else if (st.currentShippingCode.startsWith('MANUAL_')) {
      pushToStationWindow(sid, { type: 'stop-recording' });
      if (!delegated) stopRecording(sid);
      else { st.currentShippingCode = null; st.state = 'idle'; setStationStatus(sid, 'idle'); }
    } else {
      // Regular recording in progress
      if (stations.size === 1 && statusMessage) {
        setStatus('warning', t('status.regularInProgress'));
      }
    }
    return;
  }

  if (!st.currentShippingCode) {
    // Check for duplicates
    const existing = await window.electronAPI.searchVideo(code);
    if (existing.length > 0) {
      if (stations.size === 1 && statusMessage) {
        setStatus('warning', t('status.duplicate', code, existing.length));
        document.getElementById('current-code').textContent = t('status.switchToSearch', code);
        searchInput.value = code;
      }
      clearArmedTimer(sid);
      st.state = 'idle';
      setStationStatus(sid, 'idle');
      pushToStationWindow(sid, { type: 'set-status', state: 'idle' });
      return;
    }
    clearArmedTimer(sid);
    st.state = 'recording';
    st.currentShippingCode = code;
    if (delegated) setStationStatus(sid, 'recording');
    pushToStationWindow(sid, { type: 'start-recording', code });
    if (!delegated) await startRecording(sid, code);
  } else if (code === st.currentShippingCode) {
    pushToStationWindow(sid, { type: 'stop-recording' });
    if (!delegated) stopRecording(sid);
    else { st.currentShippingCode = null; st.state = 'idle'; setStationStatus(sid, 'idle'); }
  } else {
    console.log(`[${sid}] Ignored mismatched code: ${code} (current: ${st.currentShippingCode})`);
  }
}

function clearArmedTimer(sid) {
  const st = stations.get(sid);
  if (!st) return;
  if (st.armedTimer) {
    clearTimeout(st.armedTimer);
    st.armedTimer = null;
  }
}

// ─── Recording ────────────────────────────────────────────────────────────────
async function startRecording(sid, code) {
  const st = stations.get(sid);
  if (!st) return;

  if (!st.stream) {
    if (stations.size === 1 && statusMessage) {
      setStatus('recording', t('status.cameraUnavailable', code));
    }
    st.state = 'idle';
    setStationStatus(sid, 'idle');
    return;
  }

  try {
    await window.electronAPI.beginVideoWrite(sid, code);
  } catch (err) {
    if (stations.size === 1 && statusMessage) {
      setStatus('waiting', t('status.failedOpenFile', err.message));
    }
    st.state = 'idle';
    setStationStatus(sid, 'idle');
    return;
  }

  st.writeQueue = Promise.resolve();

  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : {};

  try {
    st.mediaRecorder = new MediaRecorder(st.stream, options);
  } catch (err) {
    await window.electronAPI.abortVideoWrite(sid).catch(() => {});
    if (stations.size === 1 && statusMessage) {
      setStatus('waiting', t('status.failedStartRecorder', err.message));
    }
    st.state = 'idle';
    setStationStatus(sid, 'idle');
    return;
  }

  st.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      st.writeQueue = st.writeQueue.then(async () => {
        const arrayBuffer = await e.data.arrayBuffer();
        await window.electronAPI.writeVideoChunk(sid, new Uint8Array(arrayBuffer));
      }).catch(err => console.error(`[${sid}] Chunk write error:`, err));
    }
  };

  st.mediaRecorder.onstop = () => {
    st.writeQueue.then(() => saveStationRecording(sid)).catch(() => saveStationRecording(sid));
  };

  st.mediaRecorder.start(100);

  // Update UI
  setStationStatus(sid, 'recording');
  speak('voice.recording', voiceLabelFor(sid));
  const isManual = code.startsWith('MANUAL_');
  const displayLabel = isManual ? formatManualCode(code) : code;

  if (stations.size === 1 && statusMessage) {
    setStatus('recording', isManual
      ? t('status.manualRecordingActive', displayLabel)
      : t('status.recordingFor', code));
    const currentCodeEl = document.getElementById('current-code');
    if (currentCodeEl) {
      currentCodeEl.textContent = isManual
        ? t('status.manualRecording')
        : t('status.shippingCode', code);
    }
    if (savedInfo) savedInfo.classList.add('hidden');
    const stopBtn = st.elements.stopBtn;
    if (stopBtn) stopBtn.classList.remove('hidden');
  }

  if (st.elements.codeLabel) {
    st.elements.codeLabel.textContent = isManual ? formatManualCode(code) : code;
  }

  startStationTimer(sid);
}

function stopRecording(sid) {
  const st = stations.get(sid);
  if (!st) return;
  if (st.mediaRecorder && st.mediaRecorder.state !== 'inactive') {
    st.mediaRecorder.stop();
  } else if (!st.mediaRecorder && appSettings.multiWindow && !stationWindowId) {
    // Dashboard in multi-window mode: no local mediaRecorder, just clean up state
    st.currentShippingCode = null;
    st.state = 'idle';
    setStationStatus(sid, 'idle');
  }
  stopStationTimer(sid);
  if (st.elements.badge) st.elements.badge.classList.add('hidden');
  if (st.elements.stopBtn) st.elements.stopBtn.classList.add('hidden');
}

async function saveStationRecording(sid) {
  const st = stations.get(sid);
  if (!st) return;

  try {
    const result = await window.electronAPI.endVideoWrite(sid);
    const sizeKb = (result.size / 1024).toFixed(1);
    speak('voice.saved', voiceLabelFor(sid));
    if (stations.size === 1 && statusMessage) {
      setStatus('saved', t('status.saved', result.filename));
      if (savedInfo) {
        savedInfo.textContent = t('status.savedInfo', result.filename, sizeKb);
        savedInfo.classList.remove('hidden');
      }
    }
    if (st.elements.codeLabel) st.elements.codeLabel.textContent = '';
    await loadRecordingsList();
    // Notify dashboard that recording finished so it can update its state
    if (stationWindowId) {
      window.electronAPI.notifyDashboard({ type: 'recording-saved', stationId: sid }).catch(() => {});
    }
  } catch (err) {
    if (stations.size === 1 && statusMessage) {
      setStatus('waiting', t('status.errorSaving', err.message));
    }
    await window.electronAPI.abortVideoWrite(sid).catch(() => {});
    if (stationWindowId) {
      window.electronAPI.notifyDashboard({ type: 'recording-aborted', stationId: sid }).catch(() => {});
    }
  }

  st.currentShippingCode = null;
  st.state = 'idle';
  setStationStatus(sid, 'idle');
}

// ─── Station UI state ──────────────────────────────────────────────────────────
function setStationStatus(sid, state) {
  const st = stations.get(sid);
  if (!st) return;

  const { card, badge, stateLabel } = st.elements;

  if (card) {
    card.classList.remove('station-idle', 'station-armed', 'station-recording', 'station-cancelled');
    card.classList.add(`station-${state}`);
  }

  if (badge) {
    badge.classList.toggle('hidden', state !== 'recording');
  }

  if (stateLabel) {
    stateLabel.className = `station-state-badge badge-${state}`;
    if (state === 'idle')      stateLabel.textContent = t('station.idle');
    else if (state === 'armed')      stateLabel.textContent = t('station.armed');
    else if (state === 'recording')  stateLabel.textContent = t('station.recording');
    else if (state === 'cancelled')  stateLabel.textContent = t('station.cancelled');
  }

  // Update status bar when in station window (single station in map)
  if (stations.size === 1 && statusMessage) {
    if (state === 'armed')     setStatus('waiting', t('status.stationArmed', st.label));
    if (state === 'cancelled') setStatus('waiting', t('status.stationCancelled', st.label));
    if (state === 'idle')      setStatus('waiting', t('scan.waiting'));
  }

  // Update dashboard badge if dashboard exists
  const dashBadge = document.getElementById(`dash-badge-${sid}`);
  if (dashBadge) {
    dashBadge.className = `dashboard-state-badge badge-${state}`;
    if (state === 'idle')      dashBadge.textContent = t('station.idle');
    else if (state === 'armed')      dashBadge.textContent = t('station.armed');
    else if (state === 'recording')  dashBadge.textContent = t('station.recording');
    else if (state === 'cancelled')  dashBadge.textContent = t('station.cancelled');
  }
  const dashCode = document.getElementById(`dash-code-${sid}`);
  if (dashCode) {
    dashCode.textContent = st.currentShippingCode || '';
  }
}

function showGlobalWarning(msg) {
  if (statusMessage) {
    statusMessage.textContent = msg;
    statusMessage.className = 'status warning';
  }
}

// ─── Per-station timer ────────────────────────────────────────────────────────
function startStationTimer(sid) {
  const st = stations.get(sid);
  if (!st) return;
  st.timerSeconds = 0;
  if (st.elements.timerDisplay) st.elements.timerDisplay.classList.remove('hidden');
  updateStationTimerDisplay(sid);
  st.timerInterval = setInterval(() => {
    st.timerSeconds++;
    updateStationTimerDisplay(sid);
  }, 1000);
}

function stopStationTimer(sid) {
  const st = stations.get(sid);
  if (!st) return;
  clearInterval(st.timerInterval);
  st.timerInterval = null;
  if (st.elements.timerDisplay) st.elements.timerDisplay.classList.add('hidden');
}

function updateStationTimerDisplay(sid) {
  const st = stations.get(sid);
  if (!st || !st.elements.timerEl) return;
  const m = String(Math.floor(st.timerSeconds / 60)).padStart(2, '0');
  const s = String(st.timerSeconds % 60).padStart(2, '0');
  st.elements.timerEl.textContent = `${m}:${s}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function labelFromId(sid) {
  const num = parseInt(sid.replace('station', ''), 10);
  return `Station ${num}`;
}

function generateManualName() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `MANUAL_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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

function formatManualCode(shippingCode) {
  const m = shippingCode.match(/^MANUAL_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  return shippingCode;
}

// ─── Status (single-station view helper) ─────────────────────────────────────
function setStatus(type, message) {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  if (type === 'waiting') {
    const currentCodeEl = document.getElementById('current-code');
    if (currentCodeEl) currentCodeEl.textContent = '';
  }
}

// ─── Locale ───────────────────────────────────────────────────────────────────
if (localeSelect) {
  localeSelect.addEventListener('change', async () => {
    const locale = localeSelect.value;
    window._i18n.setLocale(locale);
    await window.electronAPI.saveSettings({ locale });
    applyTranslations();
  });
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  if (localeSelect) localeSelect.value = window._i18n.getLocale();

  // Update station state badges
  stations.forEach((st, sid) => setStationStatus(sid, st.state));

  if (trialDaysLeft !== null) {
    const trialBadgeText = document.getElementById('trial-badge-text');
    const trialBadge = document.getElementById('trial-badge');
    if (trialBadgeText && trialBadge && !trialBadge.classList.contains('hidden')) {
      trialBadgeText.textContent = t('trial.badge', trialDaysLeft);
    }
  }

  if (licenseDaysLeft !== null) {
    const licenseBadgeText = document.getElementById('license-badge-text');
    const licenseBadge = document.getElementById('license-badge');
    if (licenseBadgeText && licenseBadge && !licenseBadge.classList.contains('hidden')) {
      licenseBadgeText.textContent = t('license.badge', licenseDaysLeft);
    }
  }

  renderRecordingsList();
}

// ─── License / Auth ───────────────────────────────────────────────────────────
const licenseOverlay   = document.getElementById('license-overlay');
const authSection      = document.getElementById('auth-section');
const buySection       = document.getElementById('buy-section');
const trialBadge       = document.getElementById('trial-badge');
const trialBadgeText   = document.getElementById('trial-badge-text');
const trialBuyBtn      = document.getElementById('trial-buy-btn');
const licenseBadge     = document.getElementById('license-badge');
const licenseBadgeText = document.getElementById('license-badge-text');
const licenseBuyBtn    = document.getElementById('license-buy-btn');
const licenseRefreshBtn = document.getElementById('license-refresh-btn');
const adminBadge       = document.getElementById('admin-badge');
const userInfo         = document.getElementById('user-info');
const welcomeText      = document.getElementById('welcome-text');
const logoutBtn        = document.getElementById('logout-btn');
const overlayBuyBtn    = document.getElementById('overlay-buy-btn');
const overlayRecoverBtn = document.getElementById('overlay-recover-btn');
const authFeedback     = document.getElementById('auth-feedback');
const buyFeedback      = document.getElementById('buy-feedback');
const testModeSettingRow = document.getElementById('test-mode-setting-row');

// Auth tab toggle
const tabLoginBtn    = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const loginForm      = document.getElementById('login-form');
const registerForm   = document.getElementById('register-form');

if (tabLoginBtn) {
  tabLoginBtn.addEventListener('click', () => {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    setAuthFeedback('', '');
  });
}
if (tabRegisterBtn) {
  tabRegisterBtn.addEventListener('click', () => {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    setAuthFeedback('', '');
  });
}

// Login handler
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { setAuthFeedback('error', 'Please enter your email and password.'); return; }
    setAuthFeedback('', '');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in…';
    const result = await window.electronAPI.login({ email, password });
    loginBtn.disabled = false;
    loginBtn.textContent = t ? t('overlay.loginBtn') : 'Login';
    if (result.success) {
      onAuthSuccess(result);
    } else {
      setAuthFeedback('error', result.error || 'Login failed.');
    }
  });
}

// Register handler
const registerBtn = document.getElementById('register-btn');
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('register-username').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm  = document.getElementById('register-confirm').value;
    if (!username || !email || !password) { setAuthFeedback('error', 'Please fill in all fields.'); return; }
    if (password !== confirm) { setAuthFeedback('error', 'Passwords do not match.'); return; }
    if (password.length < 6)  { setAuthFeedback('error', 'Password must be at least 6 characters.'); return; }
    setAuthFeedback('', '');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Creating account…';
    const result = await window.electronAPI.register({ username, email, password });
    registerBtn.disabled = false;
    registerBtn.textContent = t ? t('overlay.registerBtn') : 'Create Account';
    if (result.success) {
      onAuthSuccess(result);
    } else {
      setAuthFeedback('error', result.error || 'Registration failed.');
    }
  });
}

/** Called after a successful login or register. Shows the appropriate state. */
function onAuthSuccess(result) {
  const { username, role, licenseExpiresAt } = result;
  currentUserRole = role || 'user';

  // Show welcome + logout in nav
  if (welcomeText) welcomeText.textContent = `Welcome, ${username}`;
  if (userInfo) userInfo.classList.remove('hidden');

  // Show/hide test mode toggle based on role
  applyRoleUI(role);

  const expiresAt = licenseExpiresAt ? new Date(licenseExpiresAt) : null;
  const licensed  = expiresAt && expiresAt > new Date();

  if (licensed) {
    // Close overlay, show license badge
    if (licenseOverlay) licenseOverlay.classList.add('hidden');
    const days = Math.ceil((expiresAt - new Date()) / 86400000);
    licenseDaysLeft = days;
    if (licenseBadgeText) licenseBadgeText.textContent = t ? t('license.badge', days) : `License: ${days} days left`;
    if (days <= 7 && licenseBadge) licenseBadge.classList.add('trial-badge-urgent');
    if (licenseBadge) licenseBadge.classList.remove('hidden');
    if (trialBadge) trialBadge.classList.add('hidden');
  } else {
    // Licensed status unknown / no license
    // If overlay is still showing, switch from auth form to buy section
    if (authSection) authSection.classList.add('hidden');
    // Check trial state inline (we need to await, so use a separate async call)
    _handlePostLoginTrialState();
  }
}

async function _handlePostLoginTrialState() {
  // Re-fetch status to get trial info (we already have it in getLicenseStatus)
  const status = await window.electronAPI.getLicenseStatus();
  if (status.licensed) {
    // License appeared (race condition / just activated) — call onAuthSuccess properly
    const days = status.licenseDaysLeft;
    licenseDaysLeft = days;
    if (licenseBadgeText) licenseBadgeText.textContent = t ? t('license.badge', days) : `License: ${days} days left`;
    if (days <= 7 && licenseBadge) licenseBadge.classList.add('trial-badge-urgent');
    if (licenseBadge) licenseBadge.classList.remove('hidden');
    if (licenseOverlay) licenseOverlay.classList.add('hidden');
    return;
  }
  if (!status.trialExpired) {
    // Trial still active — close overlay, show trial badge
    if (licenseOverlay) licenseOverlay.classList.add('hidden');
    const days = status.trialDaysLeft;
    trialDaysLeft = days;
    if (trialBadgeText) trialBadgeText.textContent = t ? t('trial.badge', days) : `Trial: ${days} days left`;
    if (days <= 2 && trialBadge) trialBadge.classList.add('trial-badge-urgent');
    if (trialBadge) trialBadge.classList.remove('hidden');
  } else {
    // Trial expired, no license — show buy section inside overlay
    if (authSection) authSection.classList.add('hidden');
    if (buySection) buySection.classList.remove('hidden');
    if (licenseOverlay) licenseOverlay.classList.remove('hidden');
  }
}

/** Shows/hides admin-only UI elements based on role. */
function applyRoleUI(role) {
  const isAdmin = role === 'admin';
  if (testModeSettingRow) {
    testModeSettingRow.classList.toggle('hidden', !isAdmin);
  }
  if (adminBadge) {
    adminBadge.classList.toggle('hidden', !isAdmin);
  }
  // Hide trial/license badges for admin — they don't need them
  if (isAdmin) {
    if (trialBadge)   trialBadge.classList.add('hidden');
    if (licenseBadge) licenseBadge.classList.add('hidden');
  }
}

// Buy button
if (overlayBuyBtn) {
  overlayBuyBtn.addEventListener('click', () => window.electronAPI.openPurchasePage());
}
if (trialBuyBtn) {
  trialBuyBtn.addEventListener('click', () => window.electronAPI.openPurchasePage());
}
if (licenseBuyBtn) {
  licenseBuyBtn.addEventListener('click', () => window.electronAPI.openPurchasePage());
}

// ── Help modal ──
(function initHelpModal() {
  const helpBtn      = document.getElementById('help-btn');
  const helpModal    = document.getElementById('help-modal');
  const helpCloseBtn = document.getElementById('help-close-btn');
  const backdrop     = helpModal ? helpModal.querySelector('.help-modal-backdrop') : null;
  const helpTabs     = helpModal ? helpModal.querySelectorAll('.help-tab') : [];
  const helpContents = helpModal ? helpModal.querySelectorAll('.help-tab-content') : [];
  const helpExtLink  = document.getElementById('help-open-website');

  if (!helpBtn || !helpModal) return;

  function openHelp() { helpModal.classList.remove('hidden'); }
  function closeHelp() { helpModal.classList.add('hidden'); }

  helpBtn.addEventListener('click', openHelp);
  helpCloseBtn.addEventListener('click', closeHelp);
  if (backdrop) backdrop.addEventListener('click', closeHelp);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) closeHelp();
  });

  helpTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-help-tab');
      helpTabs.forEach(t => t.classList.remove('active'));
      helpContents.forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      const content = document.getElementById(`help-tab-${target}`);
      if (content) content.classList.remove('hidden');
    });
  });

  if (helpExtLink) {
    helpExtLink.addEventListener('click', () => {
      window.electronAPI.openExternalUrl('https://packing-recorder.up.railway.app/tutorial.html');
    });
  }
})();

// ── "Check My Payment" button — in the buy overlay (trial expired, no license) ──
if (overlayRecoverBtn) {
  overlayRecoverBtn.addEventListener('click', async () => {
    setBuyFeedback('', '');
    overlayRecoverBtn.disabled = true;
    overlayRecoverBtn.textContent = t('overlay.recovering');
    const result = await window.electronAPI.recoverLicense();
    overlayRecoverBtn.disabled = false;
    overlayRecoverBtn.textContent = t('overlay.checkPayment');

    if (result.recovered && result.licenseExpiresAt) {
      // License restored — update UI and close overlay
      const expiresAt = new Date(result.licenseExpiresAt);
      const days = Math.ceil((expiresAt - new Date()) / 86400000);
      licenseDaysLeft = days;
      if (licenseBadgeText) licenseBadgeText.textContent = t('license.badge', days);
      if (days <= 7 && licenseBadge) licenseBadge.classList.add('trial-badge-urgent');
      if (licenseBadge) licenseBadge.classList.remove('hidden');
      if (trialBadge) trialBadge.classList.add('hidden');
      setBuyFeedback('success', t('overlay.recoveredOk', result.count || 1));
      setTimeout(() => {
        if (licenseOverlay) licenseOverlay.classList.add('hidden');
      }, 1800);
    } else if (result.error) {
      setBuyFeedback('error', result.error);
    } else {
      setBuyFeedback('error', t('overlay.recoveredNone'));
    }
  });
}

// ── "Refresh ↺" button — in the nav license badge (licensed users) ──
if (licenseRefreshBtn) {
  licenseRefreshBtn.addEventListener('click', async () => {
    licenseRefreshBtn.disabled = true;
    licenseRefreshBtn.classList.add('spinning');
    const status = await window.electronAPI.getLicenseStatus();
    licenseRefreshBtn.disabled = false;
    licenseRefreshBtn.classList.remove('spinning');

    if (status.licensed) {
      const days = status.licenseDaysLeft;
      licenseDaysLeft = days;
      if (licenseBadgeText) licenseBadgeText.textContent = t('license.badge', days);
      if (days <= 7) {
        licenseBadge.classList.add('trial-badge-urgent');
      } else {
        licenseBadge.classList.remove('trial-badge-urgent');
      }
      // Brief flash to confirm update
      licenseBadge.style.transition = 'opacity 0.15s';
      licenseBadge.style.opacity = '0.4';
      setTimeout(() => { licenseBadge.style.opacity = '1'; }, 200);
    }
  });
}


// Logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await window.electronAPI.logout();
    stopLicensePoller();
    // Reset UI state
    if (userInfo) userInfo.classList.add('hidden');
    if (trialBadge) trialBadge.classList.add('hidden');
    if (licenseBadge) licenseBadge.classList.add('hidden');
    if (authSection) authSection.classList.remove('hidden');
    if (buySection) buySection.classList.add('hidden');
    // Re-show login tab by default
    if (tabLoginBtn) tabLoginBtn.click();
    if (licenseOverlay) licenseOverlay.classList.remove('hidden');
    // Reset inputs
    ['login-email','login-password','register-username','register-email','register-password','register-confirm']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    setAuthFeedback('', '');
    // Hide test mode toggle (no role known after logout)
    applyRoleUI('user');
    currentUserRole = null;
    licenseDaysLeft = null;
    trialDaysLeft = null;
  });
}

async function initLicense() {
  if (!licenseOverlay) return; // station window has no overlay
  const status = await window.electronAPI.getLicenseStatus();

  if (!status.loggedIn) {
    // Show login/register overlay
    if (authSection) authSection.classList.remove('hidden');
    if (buySection) buySection.classList.add('hidden');
    licenseOverlay.classList.remove('hidden');
    return;
  }

  // Logged in — update nav with username and role
  if (welcomeText && status.username) welcomeText.textContent = `Welcome, ${status.username}`;
  if (userInfo) userInfo.classList.remove('hidden');
  currentUserRole = status.role || 'user';
  applyRoleUI(currentUserRole);

  // Admins are never gated by trial or license
  if (currentUserRole === 'admin') return;

  if (status.licensed) {
    // Active license — show license countdown badge
    const days = status.licenseDaysLeft;
    licenseDaysLeft = days;
    if (licenseBadgeText) licenseBadgeText.textContent = t('license.badge', days);
    if (days <= 7 && licenseBadge) licenseBadge.classList.add('trial-badge-urgent');
    if (licenseBadge) licenseBadge.classList.remove('hidden');
    stopLicensePoller(); // already licensed, no need to poll
    return;
  }

  // Licensed but offline grace exhausted
  if (status.offlineLicenseExpired) {
    showBuyOverlay('offlineLicense');
    startLicensePoller();
    return;
  }

  if (!status.trialExpired) {
    // Trial still active — show trial badge, poll in background in case user purchases
    const days = status.trialDaysLeft;
    trialDaysLeft = days;
    if (trialBadgeText) trialBadgeText.textContent = t('trial.badge', days);
    if (days <= 2 && trialBadge) trialBadge.classList.add('trial-badge-urgent');
    if (trialBadge) trialBadge.classList.remove('hidden');
    startLicensePoller();
    return;
  }

  // Trial expired (genuine) or offline trial grace exhausted — show buy/offline overlay
  showBuyOverlay(status.offlineTrialExpired ? 'offlineTrial' : 'expired');
  startLicensePoller();
}

// ─── Background license poller ────────────────────────────────────────────────
// Polls every 30s while user is in trial or expired state.
// When a license is detected, updates the UI without requiring a manual refresh.
let _licensePollerTimer = null;

function startLicensePoller() {
  if (_licensePollerTimer) return; // already running
  _licensePollerTimer = setInterval(async () => {
    const status = await window.electronAPI.getLicenseStatus();

    if (!status.loggedIn) return;

    if (status.licensed) {
      // License active (purchased or reconnected after offline block) — stop polling
      stopLicensePoller();

      const days = status.licenseDaysLeft;
      licenseDaysLeft = days;

      if (licenseBadgeText) licenseBadgeText.textContent = t('license.badge', days);
      if (days <= 7 && licenseBadge) licenseBadge.classList.add('trial-badge-urgent');
      if (licenseBadge) licenseBadge.classList.remove('hidden');
      if (trialBadge) trialBadge.classList.add('hidden');
      if (licenseOverlay) licenseOverlay.classList.add('hidden');
      return;
    }

    // Licensed but offline grace exhausted — show reconnect overlay
    if (status.offlineLicenseExpired) {
      showBuyOverlay('offlineLicense');
      return;
    }

    // Not licensed — update overlay variant (may have just reconnected during offline block)
    if (status.trialExpired) {
      showBuyOverlay(status.offlineTrialExpired ? 'offlineTrial' : 'expired');
    } else {
      // Trial still active (reconnected after offline block while trial was still valid)
      if (licenseOverlay) licenseOverlay.classList.add('hidden');
      const days = status.trialDaysLeft;
      trialDaysLeft = days;
      if (trialBadgeText) trialBadgeText.textContent = t('trial.badge', days);
      if (days <= 2 && trialBadge) trialBadge.classList.add('trial-badge-urgent');
      else if (trialBadge) trialBadge.classList.remove('trial-badge-urgent');
      if (trialBadge) trialBadge.classList.remove('hidden');
    }
  }, 30000); // every 30 seconds
}

function stopLicensePoller() {
  if (_licensePollerTimer) {
    clearInterval(_licensePollerTimer);
    _licensePollerTimer = null;
  }
}

/**
 * Shows the buy/block overlay.
 * mode = 'expired'       → trial ended, show buy buttons
 * mode = 'offlineTrial'  → offline >1h during trial, hide buy buttons
 * mode = 'offlineLicense'→ offline >24h during active license, hide buy buttons
 */
function showBuyOverlay(mode) {
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub   = document.getElementById('overlay-sub');
  const overlayIcon  = document.getElementById('overlay-icon');
  const buyControls  = document.getElementById('overlay-buy-controls');

  if (authSection) authSection.classList.add('hidden');
  if (buySection)  buySection.classList.remove('hidden');
  if (licenseOverlay) licenseOverlay.classList.remove('hidden');

  if (mode === 'offlineTrial') {
    if (overlayIcon)  overlayIcon.textContent  = '📡';
    if (overlayTitle) overlayTitle.textContent = t('overlay.offlineTitle');
    if (overlaySub)   overlaySub.textContent   = t('overlay.offlineSub');
    if (buyControls)  buyControls.classList.add('hidden');
  } else if (mode === 'offlineLicense') {
    if (overlayIcon)  overlayIcon.textContent  = '📡';
    if (overlayTitle) overlayTitle.textContent = t('overlay.offlineLicenseTitle');
    if (overlaySub)   overlaySub.textContent   = t('overlay.offlineLicenseSub');
    if (buyControls)  buyControls.classList.add('hidden');
  } else {
    // 'expired' — genuine trial end, show purchase UI
    if (overlayIcon)  overlayIcon.textContent  = '🔒';
    if (overlayTitle) overlayTitle.textContent = t('overlay.title');
    if (overlaySub)   overlaySub.textContent   = t('overlay.sub');
    if (buyControls)  buyControls.classList.remove('hidden');
  }
}

function setAuthFeedback(type, msg) {
  if (!authFeedback) return;
  authFeedback.textContent = msg;
  authFeedback.className = 'license-feedback';
  if (type) authFeedback.classList.add(type);
  if (msg) authFeedback.classList.remove('hidden');
  else authFeedback.classList.add('hidden');
}

function setBuyFeedback(type, msg) {
  if (!buyFeedback) return;
  buyFeedback.textContent = msg;
  buyFeedback.className = 'license-feedback';
  if (type) buyFeedback.classList.add(type);
  if (msg) buyFeedback.classList.remove('hidden');
  else buyFeedback.classList.add('hidden');
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
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

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSavedDir() {
  const activeDir = await window.electronAPI.ensureVideosDir();
  if (videosDirDisplay) videosDirDisplay.textContent = activeDir;
  const settings = appSettings;
  if (autoDeleteInput) autoDeleteInput.value = settings.autoDeleteDays || 0;
  updateAutoDeleteStatus(settings.autoDeleteDays || 0, null);
  if (testModeToggle) testModeToggle.checked = !!settings.testMode;

  // Voice settings
  const voiceEnabled = !!settings.voiceEnabled;
  const voiceLocale  = settings.voiceLocale || 'id';
  const voiceSpeed   = parseFloat(settings.voiceSpeed) || 1.0;
  if (voiceEnabledToggle) voiceEnabledToggle.checked = voiceEnabled;
  if (voiceLocaleSelect)  voiceLocaleSelect.value    = voiceLocale;
  if (voiceSpeedRange)  { voiceSpeedRange.value      = voiceSpeed; }
  if (voiceSpeedLabel)    voiceSpeedLabel.textContent = voiceSpeed.toFixed(1) + '×';
  if (voiceOptions)       voiceOptions.classList.toggle('hidden', !voiceEnabled);

  // Multi-station settings
  const multiStation = settings.multiStation || false;
  const stationCount = parseInt(settings.stationCount, 10) || 1;
  const multiWindow = settings.multiWindow || false;
  const armedTimeout = parseInt(settings.armedTimeoutSecs, 10) || 15;

  if (multiStationToggle) multiStationToggle.checked = multiStation;
  if (stationCountInput) stationCountInput.value = stationCount;
  if (multiWindowToggle) multiWindowToggle.checked = multiWindow;
  if (armedTimeoutInput) armedTimeoutInput.value = armedTimeout;

  toggleMultiStationUI(multiStation);
  renderStationConfigArea(stationCount, settings);
  if (localeSelect && settings.locale) localeSelect.value = settings.locale;
}

function toggleMultiStationUI(enabled) {
  const multiStationOptions = document.getElementById('multi-station-options');
  if (multiStationOptions) {
    multiStationOptions.classList.toggle('hidden', !enabled);
  }
}

function renderStationConfigArea(count, settings) {
  if (!stationConfigArea) return;
  const stationsCfg = settings.stations || [];
  stationConfigArea.innerHTML = `<h4 class="station-config-title" data-i18n="settings.stationConfigTitle">${t('settings.stationConfigTitle')}</h4>`;

  for (let i = 1; i <= count; i++) {
    const sid = `station${i}`;
    const saved = stationsCfg.find(s => s.id === sid) || {};
    const row = document.createElement('div');
    row.className = 'station-config-row';
    row.innerHTML = `
      <div class="station-config-num">S${i}</div>
      <div class="station-config-fields">
        <input type="text" class="station-label-input" id="cfg-label-${sid}"
          placeholder="${t('settings.stationLabel', i)}"
          value="${saved.label || `Station ${i}`}" />
        <select class="station-camera-select" id="cfg-cam-${sid}">
          <option value="">${t('settings.cameraNotAssigned')}</option>
        </select>
      </div>
    `;
    stationConfigArea.appendChild(row);
  }
  // Trigger camera enum to populate dropdowns
  navigator.mediaDevices.enumerateDevices().then(devices => {
    populateCameraDropdowns(devices.filter(d => d.kind === 'videoinput'));
    // Restore saved device selections
    stationsCfg.forEach(sc => {
      const sel = document.getElementById(`cfg-cam-${sc.id}`);
      if (sel && sc.cameraDeviceId) sel.value = sc.cameraDeviceId;
    });
  }).catch(() => {});
}

if (multiStationToggle) {
  multiStationToggle.addEventListener('change', async () => {
    toggleMultiStationUI(multiStationToggle.checked);
    await window.electronAPI.saveSettings({ multiStation: multiStationToggle.checked });
    appSettings = await window.electronAPI.getSettings();

    // Rebuild stations to match new mode
    stations.forEach((st) => {
      if (st.stream) st.stream.getTracks().forEach(tr => tr.stop());
      stopStationTimer(st.id);
    });
    stations.clear();
    if (stationsGrid) stationsGrid.innerHTML = '';
    if (dashboardView) dashboardView.innerHTML = '';
    await initStations();
  });
}

if (stationCountInput) {
  stationCountInput.addEventListener('change', () => {
    let val = parseInt(stationCountInput.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > MAX_STATIONS) val = MAX_STATIONS;
    stationCountInput.value = val;
    renderStationConfigArea(val, appSettings);
  });
}

if (saveStationsBtn) {
  saveStationsBtn.addEventListener('click', async () => {
    const multiStation = multiStationToggle ? multiStationToggle.checked : false;
    const stationCount = stationCountInput ? parseInt(stationCountInput.value, 10) || 1 : 1;
    const multiWindow = multiWindowToggle ? multiWindowToggle.checked : false;
    const armedTimeoutSecs = armedTimeoutInput ? parseInt(armedTimeoutInput.value, 10) || 15 : 15;

    const stations_cfg = [];
    for (let i = 1; i <= stationCount; i++) {
      const sid = `station${i}`;
      const labelEl = document.getElementById(`cfg-label-${sid}`);
      const camEl = document.getElementById(`cfg-cam-${sid}`);
      stations_cfg.push({
        id: sid,
        label: labelEl ? labelEl.value.trim() || `Station ${i}` : `Station ${i}`,
        cameraDeviceId: camEl ? camEl.value || null : null,
      });
    }

    await window.electronAPI.saveSettings({
      multiStation, stationCount, multiWindow, armedTimeoutSecs, stations: stations_cfg
    });
    appSettings = await window.electronAPI.getSettings();

    if (saveStationsStatus) {
      saveStationsStatus.textContent = t('settings.stationsSaved');
      saveStationsStatus.classList.remove('hidden');
      setTimeout(() => saveStationsStatus.classList.add('hidden'), 2500);
    }

    // Re-init stations to apply new config
    stations.forEach((st) => {
      if (st.stream) st.stream.getTracks().forEach(tr => tr.stop());
      stopStationTimer(st.id);
    });
    stations.clear();
    if (stationsGrid) stationsGrid.innerHTML = '';
    if (dashboardView) dashboardView.innerHTML = '';
    await initStations();
  });
}

if (printStationQrBtn) {
  printStationQrBtn.addEventListener('click', async () => {
    const settings = await window.electronAPI.getSettings();
    const stationCount = parseInt(settings.stationCount, 10) || 1;
    const stationsCfg = settings.stations || [];
    const stationsData = [];
    for (let i = 1; i <= stationCount; i++) {
      const sid = `station${i}`;
      const cfg = stationsCfg.find(s => s.id === sid) || {};
      stationsData.push({ id: sid, label: cfg.label || `Station ${i}`, num: i });
    }
    await window.electronAPI.openPrintStations(stationsData);
  });
}

if (testModeToggle) {
  testModeToggle.addEventListener('change', async () => {
    await window.electronAPI.saveSettings({ testMode: testModeToggle.checked });
    await applyTestMode(testModeToggle.checked);
  });
}

if (voiceEnabledToggle) {
  voiceEnabledToggle.addEventListener('change', async () => {
    const enabled = voiceEnabledToggle.checked;
    await window.electronAPI.saveSettings({ voiceEnabled: enabled });
    appSettings.voiceEnabled = enabled;
    if (voiceOptions) voiceOptions.classList.toggle('hidden', !enabled);
  });
}

if (voiceLocaleSelect) {
  voiceLocaleSelect.addEventListener('change', async () => {
    const locale = voiceLocaleSelect.value;
    await window.electronAPI.saveSettings({ voiceLocale: locale });
    appSettings.voiceLocale = locale;
  });
}

if (voiceSpeedRange) {
  voiceSpeedRange.addEventListener('input', () => {
    const speed = parseFloat(voiceSpeedRange.value);
    if (voiceSpeedLabel) voiceSpeedLabel.textContent = speed.toFixed(1) + '×';
  });
  voiceSpeedRange.addEventListener('change', async () => {
    const speed = parseFloat(voiceSpeedRange.value);
    await window.electronAPI.saveSettings({ voiceSpeed: speed });
    appSettings.voiceSpeed = speed;
  });
}

async function applyTestMode(enabled) {
  stations.forEach((st, sid) => {
    if (st.stream) {
      st.stream.getTracks().forEach(tr => tr.stop());
      st.stream = null;
    }
  });

  if (enabled) {
    stations.forEach((st) => {
      st.stream = createFakeStream();
      if (st.elements.video) st.elements.video.srcObject = st.stream;
    });
    if (testModePanelEl) testModePanelEl.classList.remove('hidden');
  } else {
    if (testModePanelEl) testModePanelEl.classList.add('hidden');
    // Hide station test row when test mode is off
    if (testStationRow) testStationRow.classList.add('hidden');
    for (const [sid] of stations) {
      await initStationCamera(sid);
    }
    return;
  }

  // Re-render station buttons to reflect current station count
  const multiStation = appSettings.multiStation || false;
  const stationCount = parseInt(appSettings.stationCount, 10) || 1;
  renderTestStationButtons(stationCount, multiStation);
}

if (saveAutoDeleteBtn) {
  saveAutoDeleteBtn.addEventListener('click', async () => {
    const days = parseInt(autoDeleteInput.value, 10);
    if (isNaN(days) || days < 0) { autoDeleteInput.value = 0; return; }
    await window.electronAPI.saveSettings({ autoDeleteDays: days });
    const result = await window.electronAPI.deleteOldRecordings();
    updateAutoDeleteStatus(days, result);
    await loadRecordingsList();
  });
}

function updateAutoDeleteStatus(days, result) {
  if (!autoDeleteStatus) return;
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

if (pickDirBtn) {
  pickDirBtn.addEventListener('click', async () => {
    const chosen = await window.electronAPI.pickVideosDir();
    if (chosen) {
      if (videosDirDisplay) videosDirDisplay.textContent = chosen;
      await loadRecordingsList();
    }
  });
}

// ─── App Version & Updates ────────────────────────────────────────────────────
const appVersionDisplay = document.getElementById('app-version-display');
const checkUpdateBtn    = document.getElementById('check-update-btn');
const updateStatusEl    = document.getElementById('update-status');

function setUpdateStatus(text, type) {
  if (!updateStatusEl) return;
  updateStatusEl.classList.remove('hidden', 'success', 'info', 'error');
  updateStatusEl.textContent = text;
  if (type) updateStatusEl.classList.add(type);
}

// Display version on load
if (appVersionDisplay) {
  window.electronAPI.getAppVersion().then(v => {
    appVersionDisplay.textContent = `v${v}`;
  });
}

// Manual "Check for Updates" button
if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener('click', async () => {
    checkUpdateBtn.disabled = true;
    setUpdateStatus(t('settings.updateChecking'), 'info');
    try {
      const result = await window.electronAPI.checkForUpdates();
      // If no update-available event fires within 4s, assume up to date
      setTimeout(() => {
        if (checkUpdateBtn.disabled) {
          checkUpdateBtn.disabled = false;
          if (updateStatusEl && updateStatusEl.textContent === t('settings.updateChecking')) {
            setUpdateStatus(t('settings.updateNotAvailable'), 'success');
          }
        }
      }, 4000);
    } catch (_) {
      checkUpdateBtn.disabled = false;
      setUpdateStatus(t('settings.updateError'), 'error');
    }
  });
}

// Push events from main process
if (window.electronAPI.onUpdateAvailable) {
  window.electronAPI.onUpdateAvailable((info) => {
    if (checkUpdateBtn) checkUpdateBtn.disabled = false;
    setUpdateStatus(t('settings.updateAvailable', info.version), 'info');
  });
}

if (window.electronAPI.onUpdateDownloaded) {
  window.electronAPI.onUpdateDownloaded((info) => {
    if (checkUpdateBtn) checkUpdateBtn.disabled = false;
    setUpdateStatus(t('settings.updateReady', info.version), 'success');
  });
}

// ─── QR Code (manual) ─────────────────────────────────────────────────────────
if (printQrBtn) {
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
    const originalParent = qrCodeSection.parentNode;
    const originalNextSibling = qrCodeSection.nextSibling;
    document.body.appendChild(qrCodeSection);
    window.print();
    originalParent.insertBefore(qrCodeSection, originalNextSibling);
  });
}

// ─── Search & Playback ────────────────────────────────────────────────────────
if (searchBtn) searchBtn.addEventListener('click', doSearch);
if (searchInput) {
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  searchInput.addEventListener('input', () => {
    if (searchClearBtn) searchClearBtn.classList.toggle('hidden', searchInput.value === '');
  });
}
if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.classList.add('hidden');
    if (searchResults) searchResults.classList.add('hidden');
    if (playbackSection) playbackSection.classList.add('hidden');
    if (searchError) searchError.classList.add('hidden');
    if (resultsList) resultsList.innerHTML = '';
    searchInput.focus();
  });
}

async function doSearch() {
  const code = searchInput.value.trim();
  if (searchError) searchError.classList.add('hidden');
  if (searchResults) searchResults.classList.add('hidden');
  if (playbackSection) playbackSection.classList.add('hidden');
  if (resultsList) resultsList.innerHTML = '';

  if (!code) {
    if (searchError) { searchError.textContent = t('search.enterCode'); searchError.classList.remove('hidden'); }
    return;
  }

  try {
    const results = await window.electronAPI.searchVideo(code);
    if (results.length === 0) {
      if (searchError) { searchError.textContent = t('search.noResults', code); searchError.classList.remove('hidden'); }
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
    resultsList.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', () => playVideo(btn.dataset.path, btn.dataset.name));
    });
    resultsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('rec.confirmDelete', btn.dataset.name))) return;
        const result = await window.electronAPI.deleteVideo(btn.dataset.path);
        if (result.success) {
          if (currentPlayingPath === btn.dataset.path) {
            if (playbackSection) playbackSection.classList.add('hidden');
            currentPlayingPath = null;
          }
          await loadRecordingsList();
          doSearch();
        } else {
          if (searchError) { searchError.textContent = t('rec.deleteFailed', result.error); searchError.classList.remove('hidden'); }
        }
      });
    });
    if (searchResults) searchResults.classList.remove('hidden');
  } catch (err) {
    if (searchError) { searchError.textContent = t('search.searchError', err.message); searchError.classList.remove('hidden'); }
  }
}

async function playVideo(filePath, filename) {
  try {
    const base64 = await window.electronAPI.readVideo(filePath);
    if (!base64) {
      if (searchError) { searchError.textContent = t('search.cantReadVideo'); searchError.classList.remove('hidden'); }
      return;
    }
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    if (playbackVideo.src && playbackVideo.src.startsWith('blob:')) URL.revokeObjectURL(playbackVideo.src);
    playbackVideo.src = url;
    if (playingFilename) playingFilename.textContent = filename;
    currentPlayingPath = filePath;
    if (saveAsStatus) saveAsStatus.classList.add('hidden');
    if (playbackSection) playbackSection.classList.remove('hidden');
    playbackVideo.play();
  } catch (err) {
    if (searchError) { searchError.textContent = t('search.playbackError', err.message); searchError.classList.remove('hidden'); }
  }
}

if (saveAsBtn) {
  saveAsBtn.addEventListener('click', async () => {
    if (!currentPlayingPath) return;
    const defaultName = currentPlayingPath.split(/[\\/]/).pop();
    if (saveAsStatus) { saveAsStatus.classList.remove('hidden', 'success', 'error'); saveAsStatus.textContent = t('search.converting'); }
    saveAsBtn.disabled = true;
    const result = await window.electronAPI.saveVideoAs({ srcPath: currentPlayingPath, defaultName });
    saveAsBtn.disabled = false;
    if (result.canceled) {
      if (saveAsStatus) saveAsStatus.classList.add('hidden');
    } else if (result.error) {
      if (saveAsStatus) { saveAsStatus.textContent = t('search.saveError', result.error); saveAsStatus.classList.add('error'); }
    } else {
      if (saveAsStatus) { saveAsStatus.textContent = t('search.savedTo', result.filePath); saveAsStatus.classList.add('success'); }
    }
  });
}

// ─── Recordings List ──────────────────────────────────────────────────────────
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
          if (playbackSection) playbackSection.classList.add('hidden');
          currentPlayingPath = null;
        }
        await loadRecordingsList();
      } else {
        console.error(t('rec.deleteFailed', result.error));
      }
    });
  });
}

if (recDateFilter) {
  recDateFilter.addEventListener('change', () => {
    if (recResetFilterBtn) recResetFilterBtn.classList.remove('hidden');
    renderStandardRecordingsList();
  });
}
if (recResetFilterBtn) {
  recResetFilterBtn.addEventListener('click', () => {
    if (recDateFilter) recDateFilter.value = '';
    recResetFilterBtn.classList.add('hidden');
    if (recFilterCount) recFilterCount.classList.add('hidden');
    renderStandardRecordingsList();
  });
}
if (recStationFilter) {
  recStationFilter.addEventListener('change', () => renderStandardRecordingsList());
}

if (manualDateFilter) {
  manualDateFilter.addEventListener('change', () => {
    if (manualResetFilterBtn) manualResetFilterBtn.classList.remove('hidden');
    renderManualRecordingsList();
  });
}
if (manualResetFilterBtn) {
  manualResetFilterBtn.addEventListener('click', () => {
    if (manualDateFilter) manualDateFilter.value = '';
    manualResetFilterBtn.classList.add('hidden');
    if (manualFilterCount) manualFilterCount.classList.add('hidden');
    renderManualRecordingsList();
  });
}
if (manualStationFilter) {
  manualStationFilter.addEventListener('change', () => renderManualRecordingsList());
}

async function loadRecordingsList() {
  try {
    allRecordings = await window.electronAPI.listAllVideos();
    updateStationFilterOptions();
    renderRecordingsList();
  } catch (err) {
    console.error('Failed to load recordings list:', err);
  }
}

function updateStationFilterOptions() {
  const stationIds = [...new Set(allRecordings.map(r => r.stationId).filter(Boolean))].sort();
  [recStationFilter, manualStationFilter].forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    stationIds.forEach(sid => {
      const opt = document.createElement('option');
      opt.value = sid;
      const num = parseInt(sid.replace('station', ''), 10);
      const settings = appSettings;
      const cfg = (settings.stations || []).find(s => s.id === sid);
      opt.textContent = cfg ? cfg.label : `Station ${num}`;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  });
}

function renderRecordingsList() {
  renderStandardRecordingsList();
  renderManualRecordingsList();
}

function renderStandardRecordingsList() {
  if (!recordingsListEl) return;
  const source = allRecordings.filter(r => !r.isManual);
  const selectedDate = recDateFilter ? recDateFilter.value : '';
  const selectedStation = recStationFilter ? recStationFilter.value : '';
  let filtered = selectedDate ? source.filter(item => matchesDateFilter(item, selectedDate)) : source;
  if (selectedStation) filtered = filtered.filter(item => item.stationId === selectedStation);

  if (selectedDate || selectedStation) {
    if (recFilterCount) { recFilterCount.textContent = t('rec.filterCount', filtered.length); recFilterCount.classList.remove('hidden'); }
  } else {
    if (recFilterCount) recFilterCount.classList.add('hidden');
  }

  recordingsListEl.innerHTML = '';
  if (filtered.length === 0) {
    if (noRecordingsEl) { noRecordingsEl.textContent = selectedDate ? t('rec.noRecordingsOnDate') : t('rec.noRecordings'); noRecordingsEl.classList.remove('hidden'); }
    return;
  }
  if (noRecordingsEl) noRecordingsEl.classList.add('hidden');

  filtered.forEach(item => {
    const li = document.createElement('li');
    const sizeKb = (item.size / 1024).toFixed(1);
    const date = new Date(item.modified).toLocaleString();
    const stationLabel = item.stationId ? `<span class="rec-station-tag">${item.stationId.replace('station', 'S')}</span>` : '';
    li.innerHTML = `
      <div class="rec-info">
        <span class="rec-code">${stationLabel}${item.shippingCode}</span>
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
  if (!manualRecordingsListEl) return;
  const source = allRecordings.filter(r => r.isManual);
  const selectedDate = manualDateFilter ? manualDateFilter.value : '';
  const selectedStation = manualStationFilter ? manualStationFilter.value : '';
  let filtered = selectedDate ? source.filter(item => matchesDateFilter(item, selectedDate)) : source;
  if (selectedStation) filtered = filtered.filter(item => item.stationId === selectedStation);

  if (selectedDate || selectedStation) {
    if (manualFilterCount) { manualFilterCount.textContent = t('rec.filterCount', filtered.length); manualFilterCount.classList.remove('hidden'); }
  } else {
    if (manualFilterCount) manualFilterCount.classList.add('hidden');
  }

  manualRecordingsListEl.innerHTML = '';
  if (filtered.length === 0) {
    if (noManualRecordingsEl) { noManualRecordingsEl.textContent = selectedDate ? t('rec.noManualRecordingsOnDate') : t('rec.noManualRecordings'); noManualRecordingsEl.classList.remove('hidden'); }
    return;
  }
  if (noManualRecordingsEl) noManualRecordingsEl.classList.add('hidden');

  filtered.forEach(item => {
    const li = document.createElement('li');
    const sizeKb = (item.size / 1024).toFixed(1);
    const date = new Date(item.modified).toLocaleString();
    const displayCode = formatManualCode(item.shippingCode);
    const stationLabel = item.stationId ? `<span class="rec-station-tag">${item.stationId.replace('station', 'S')}</span>` : '';
    li.innerHTML = `
      <div class="rec-info">
        <span class="rec-code manual-code">${stationLabel}${displayCode}</span>
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
