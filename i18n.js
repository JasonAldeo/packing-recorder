// ─── i18n – Translations ──────────────────────────────────────────────────────
// Supports: 'en' (English), 'id' (Bahasa Indonesia)
;(function () {
  const TRANSLATIONS = {
  en: {
    // Nav tabs
    'tab.scan': 'Scan',
    'tab.recordings': 'Recordings',
    'tab.search': 'Search',
    'tab.settings': 'Settings',

    // Trial badge
    'trial.badge': (n) => `Trial: ${n} day${n === 1 ? '' : 's'} left`,
    'trial.buyBtn': 'Buy License',

    // License badge (active paid license)
    'license.badge': (n) => `License: ${n} day${n === 1 ? '' : 's'} left`,

    // Nav
    'nav.logout': 'Logout',
    'nav.welcome': (name) => `Welcome, ${name}`,

    // Auth overlay
    'overlay.authSub': 'Sign in to your account to continue.',
    'overlay.tabLogin': 'Login',
    'overlay.tabRegister': 'Register',
    'overlay.loginBtn': 'Login',
    'overlay.registerBtn': 'Create Account',
    'overlay.emailPlaceholder': 'Email',
    'overlay.passwordPlaceholder': 'Password',
    'overlay.usernamePlaceholder': 'Username',
    'overlay.confirmPlaceholder': 'Confirm Password',

    // License overlay (expired, no license)
    'overlay.title': 'Trial Period Ended',
    'overlay.sub': 'Your 7-day free trial has expired. Purchase a license to continue using Packing Recorder.',
    'overlay.priceLabel': '30-day license',
    'overlay.buyBtn': 'Buy License (QRIS)',
    'overlay.alreadyPaid': 'Already paid but license didn\'t appear?',
    'overlay.checkPayment': 'Check My Payment',
    'overlay.recovering': 'Checking…',
    'overlay.recoveredOk': (n) => `License restored! ${n} payment${n === 1 ? '' : 's'} applied.`,
    'overlay.recoveredNone': 'No pending payments found. Contact aldeojason@gmail.com if you believe this is an error.',

    // Test mode panel
    'test.warning': '\u26A0 TEST MODE \u2014 No camera detected. Using simulated stream.',
    'test.placeholder': 'Type a shipping code\u2026',
    'test.simulateScan': 'Simulate Scan',
    'test.simulateManual': 'Simulate Manual Scan',
    'test.stationLabel': 'Simulate Station QR:',
    'test.stationBtn': (n) => `Station ${n}`,
    'test.stationHint': 'or press keys 1\u20135',

    // Scan tab – static labels
    'scan.statusTitle': 'Status',
    'scan.waiting': 'Waiting for scan...',
    'scan.timerLabel': 'Recording:',
    'scan.stopBtn': '\u25A0 Stop Recording',
    'scan.cameraTitle': 'Camera Preview',

    // Status messages (dynamic)
    'status.cameraError': (msg) => `Camera error: ${msg}. Please allow camera access or enable Test Mode in Settings.`,
    'status.cameraUnavailable': (code) => `Camera not available. Cannot record for: ${code}`,
    'status.failedOpenFile': (msg) => `Failed to open file for writing: ${msg}`,
    'status.failedStartRecorder': (msg) => `Failed to start recorder: ${msg}`,
    'status.recordingFor': (code) => `Recording for: ${code}`,
    'status.manualRecordingActive': (label) => `Manual Recording: ${label}`,
    'status.manualRecording': 'Manual Recording',
    'status.shippingCode': (code) => `Shipping Code: ${code}`,
    'status.duplicate': (code, n) => `\u26A0 Duplicate! \u201C${code}\u201D already has ${n} recording(s).`,
    'status.switchToSearch': (code) => `Shipping Code: ${code} \u2014 switch to Search tab to view it.`,
    'status.saved': (filename) => `Saved: ${filename}`,
    'status.savedInfo': (filename, size) => `File: ${filename} \u2014 Size: ${size} KB`,
    'status.errorSaving': (msg) => `Error saving video: ${msg}`,
    'status.regularInProgress': '\u26A0 Regular recording in progress. Finish it first.',
    'status.scanStationFirst': '\u26A0 Scan a station QR code first to activate a station.',
    'status.stationArmed': (label) => `\u23F3 ${label}: waiting for barcode or manual QR\u2026`,
    'status.stationArmedCancel': 'Scan station QR again to cancel.',
    'status.stationCancelled': (label) => `${label}: armed state cancelled.`,
    'status.stationStopped': (label, code) => `${label}: stopped recording \u201C${code}\u201D.`,

    // Recordings tab
    'rec.title': 'Recordings',
    'rec.standardTitle': 'Standard Recordings',
    'rec.filterLabel': 'Filter by date:',
    'rec.filterStation': 'Filter by station:',
    'rec.allStations': 'All Stations',
    'rec.resetFilter': '\u2715 Reset',
    'rec.noRecordings': 'No recordings yet.',
    'rec.noRecordingsOnDate': 'No recordings on this date.',
    'rec.manualTitle': 'Manual Recordings',
    'rec.noManualRecordings': 'No manual recordings yet.',
    'rec.noManualRecordingsOnDate': 'No manual recordings on this date.',
    'rec.filterCount': (n) => `${n} recording${n !== 1 ? 's' : ''} on this date`,
    'rec.play': 'Play',
    'rec.delete': 'Delete',
    'rec.confirmDelete': (name) => `Delete "${name}"?`,
    'rec.deleteFailed': (msg) => `Delete failed: ${msg}`,

    // Search & Playback tab
    'search.title': 'Search & Playback',
    'search.placeholder': 'Enter shipping code...',
    'search.btn': 'Search',
    'search.results': 'Results',
    'search.nowPlaying': 'Now Playing:',
    'search.saveAs': '\u2B09 Save As\u2026',
    'search.converting': 'Converting to MP4\u2026',
    'search.savedTo': (p) => `\u2713 Saved to: ${p}`,
    'search.searchError': (msg) => `Search error: ${msg}`,
    'search.noResults': (code) => `No recordings found for: ${code}`,
    'search.enterCode': 'Please enter a shipping code.',
    'search.cantReadVideo': 'Could not read video file.',
    'search.playbackError': (msg) => `Playback error: ${msg}`,
    'search.saveError': (msg) => `Error: ${msg}`,

    // Settings tab
    'settings.title': 'Settings',
    'settings.folderTitle': 'Videos Save Folder',
    'settings.browse': 'Browse\u2026',
    'settings.autoDeleteTitle': 'Auto-delete recordings older than',
    'settings.autoDeleteHint': 'Set to 0 to disable. Runs automatically on every launch.',
    'settings.daysUnit': 'days',
    'settings.save': 'Save',
    'settings.autoDeleteDisabled': 'Auto-delete is disabled.',
    'settings.autoDeleteEnabled': (days) => `Auto-delete enabled: recordings older than ${days} day(s) will be removed on each launch.`,
    'settings.autoDeleteSaved': (n, days) => n > 0
      ? `\u2713 Saved. Deleted ${n} recording(s) older than ${days} day(s).`
      : `\u2713 Saved. No recordings older than ${days} day(s) found.`,
    'settings.testModeTitle': 'Test Mode',
    'settings.testModeHint': 'Replaces the camera with a simulated stream and shows manual scan controls. Use when testing without a real camera or barcode scanner.',
    'settings.qrTitle': 'Manual Scan QR Code',
    'settings.qrHint': 'Print and affix this QR code to your station. Scan it to start/stop a manual recording.',
    'settings.printQR': '\uD83D\uDDB6 Print QR\u2026',
    'settings.qrLabel': 'Scan to start & stop manual recording',

    // Multi-station settings
    'settings.stationsTitle': 'Multiple Stations',
    'settings.stationsHint': 'Enable to use multiple scanning stations simultaneously, each with its own camera and recording session.',
    'settings.allowMultiStation': 'Allow multiple stations',
    'settings.stationCount': 'Number of stations',
    'settings.stationCountHint': 'Maximum 6 stations.',
    'settings.multiWindow': 'Multi-window mode (dashboard + separate station windows)',
    'settings.multiWindowHint': 'When enabled, a dashboard shows all stations. The PIC can open each station in its own window (useful for multiple monitors).',
    'settings.armedTimeout': 'Armed state timeout',
    'settings.armedTimeoutHint': 'Seconds before an armed station automatically cancels if no barcode is scanned.',
    'settings.secondsUnit': 'seconds',
    'settings.stationLabel': (n) => `Station ${n} label`,
    'settings.stationCamera': (n) => `Station ${n} camera`,
    'settings.stationConfigTitle': 'Station Configuration',
    'settings.cameraNotAssigned': 'Not assigned (use default)',
    'settings.cameraWarning': (n, m) => `\u26A0 Warning: only ${n} camera${n !== 1 ? 's' : ''} detected for ${m} station${m !== 1 ? 's' : ''}. Some stations will share cameras.`,
    'settings.printStationQR': '\uD83D\uDDB6 Print Station QR Codes\u2026',
    'settings.printStationQRHint': 'Print QR codes for each station and the manual scan code. Operators scan these to activate stations.',
    'settings.saveStations': 'Save Station Settings',
    'settings.stationsSaved': '\u2713 Station settings saved.',

    // Station states
    'station.idle': 'IDLE',
    'station.armed': 'ARMED',
    'station.recording': 'REC',
    'station.cancelled': 'CANCELLED',
    'station.waitingBarcode': 'Waiting for barcode\u2026',
    'station.noCamera': 'No camera',

    // Dashboard
    'dashboard.title': 'Station Dashboard',
    'dashboard.openWindow': 'Open Window',
    'dashboard.windowOpen': 'Window Open',
    'dashboard.hint': 'Click \u201COpen Window\u201D to open a station in its own window. Each station records independently.',

    // Voice announcements settings
    'settings.voiceTitle': 'Voice Announcements',
    'settings.voiceHint': 'Speaks station status aloud. Useful for operators away from the screen.',
    'settings.voiceEnabled': 'Enable voice announcements',
    'settings.voiceLocale': 'Voice language',
    'settings.voiceSpeed': 'Voice speed',
    'settings.voiceSpeedHint': '1.0 is normal speed.',

    // Voice announcement phrases (used independently of UI locale)
    'voice.stationNum': (n) => ['One','Two','Three','Four','Five'][n - 1] ?? String(n),
    'voice.armed':      (label) => `${label}, waiting`,
    'voice.recording':  (label) => `${label}, recording`,
    'voice.saved':      (label) => `${label}, saved`,
    'voice.cancelled':  (label) => `${label}, cancelled`,
  },

  id: {
    // Nav tabs
    'tab.scan': 'Pindai',
    'tab.recordings': 'Rekaman',
    'tab.search': 'Cari',
    'tab.settings': 'Pengaturan',

    // Trial badge
    'trial.badge': (n) => `Percobaan: sisa ${n} hari`,
    'trial.buyBtn': 'Beli Lisensi',

    // License badge (active paid license)
    'license.badge': (n) => `Lisensi: sisa ${n} hari`,

    // Nav
    'nav.logout': 'Keluar',
    'nav.welcome': (name) => `Selamat datang, ${name}`,

    // Auth overlay
    'overlay.authSub': 'Masuk ke akun Anda untuk melanjutkan.',
    'overlay.tabLogin': 'Masuk',
    'overlay.tabRegister': 'Daftar',
    'overlay.loginBtn': 'Masuk',
    'overlay.registerBtn': 'Buat Akun',
    'overlay.emailPlaceholder': 'Email',
    'overlay.passwordPlaceholder': 'Kata Sandi',
    'overlay.usernamePlaceholder': 'Nama Pengguna',
    'overlay.confirmPlaceholder': 'Konfirmasi Kata Sandi',

    // License overlay (expired, no license)
    'overlay.title': 'Masa Percobaan Berakhir',
    'overlay.sub': 'Masa percobaan 7 hari Anda telah berakhir. Beli lisensi untuk terus menggunakan Packing Recorder.',
    'overlay.priceLabel': 'Lisensi 30 hari',
    'overlay.buyBtn': 'Beli Lisensi (QRIS)',
    'overlay.alreadyPaid': 'Sudah bayar tapi lisensi belum muncul?',
    'overlay.checkPayment': 'Cek Pembayaran',
    'overlay.recovering': 'Memeriksa…',
    'overlay.recoveredOk': (n) => `Lisensi berhasil dipulihkan! ${n} pembayaran diterapkan.`,
    'overlay.recoveredNone': 'Tidak ada pembayaran yang ditemukan. Hubungi aldeojason@gmail.com jika Anda merasa ini keliru.',

    // Test mode panel
    'test.warning': '\u26A0 MODE UJI \u2014 Kamera tidak terdeteksi. Menggunakan aliran simulasi.',
    'test.placeholder': 'Ketik kode pengiriman\u2026',
    'test.simulateScan': 'Simulasi Pindai',
    'test.simulateManual': 'Simulasi Pindai Manual',
    'test.stationLabel': 'Simulasi QR Stasiun:',
    'test.stationBtn': (n) => `Stasiun ${n}`,
    'test.stationHint': 'atau tekan tombol 1\u20135',

    // Scan tab – static labels
    'scan.statusTitle': 'Status',
    'scan.waiting': 'Menunggu pemindaian...',
    'scan.timerLabel': 'Merekam:',
    'scan.stopBtn': '\u25A0 Hentikan Rekaman',
    'scan.cameraTitle': 'Pratinjau Kamera',

    // Status messages (dynamic)
    'status.cameraError': (msg) => `Kesalahan kamera: ${msg}. Izinkan akses kamera atau aktifkan Mode Uji di Pengaturan.`,
    'status.cameraUnavailable': (code) => `Kamera tidak tersedia. Tidak dapat merekam untuk: ${code}`,
    'status.failedOpenFile': (msg) => `Gagal membuka file untuk ditulis: ${msg}`,
    'status.failedStartRecorder': (msg) => `Gagal memulai perekam: ${msg}`,
    'status.recordingFor': (code) => `Merekam untuk: ${code}`,
    'status.manualRecordingActive': (label) => `Rekaman Manual: ${label}`,
    'status.manualRecording': 'Rekaman Manual',
    'status.shippingCode': (code) => `Kode Pengiriman: ${code}`,
    'status.duplicate': (code, n) => `\u26A0 Duplikat! \u201C${code}\u201D sudah memiliki ${n} rekaman.`,
    'status.switchToSearch': (code) => `Kode Pengiriman: ${code} \u2014 beralih ke tab Cari untuk melihatnya.`,
    'status.saved': (filename) => `Tersimpan: ${filename}`,
    'status.savedInfo': (filename, size) => `File: ${filename} \u2014 Ukuran: ${size} KB`,
    'status.errorSaving': (msg) => `Kesalahan menyimpan video: ${msg}`,
    'status.regularInProgress': '\u26A0 Rekaman reguler sedang berjalan. Selesaikan terlebih dahulu.',
    'status.scanStationFirst': '\u26A0 Scan kode QR stasiun terlebih dahulu untuk mengaktifkan stasiun.',
    'status.stationArmed': (label) => `\u23F3 ${label}: menunggu barcode atau QR manual\u2026`,
    'status.stationArmedCancel': 'Scan QR stasiun lagi untuk membatalkan.',
    'status.stationCancelled': (label) => `${label}: status aktif dibatalkan.`,
    'status.stationStopped': (label, code) => `${label}: rekaman \u201C${code}\u201D dihentikan.`,

    // Recordings tab
    'rec.title': 'Rekaman',
    'rec.standardTitle': 'Rekaman Standar',
    'rec.filterLabel': 'Filter berdasarkan tanggal:',
    'rec.filterStation': 'Filter berdasarkan stasiun:',
    'rec.allStations': 'Semua Stasiun',
    'rec.resetFilter': '\u2715 Reset',
    'rec.noRecordings': 'Belum ada rekaman.',
    'rec.noRecordingsOnDate': 'Tidak ada rekaman pada tanggal ini.',
    'rec.manualTitle': 'Rekaman Manual',
    'rec.noManualRecordings': 'Belum ada rekaman manual.',
    'rec.noManualRecordingsOnDate': 'Tidak ada rekaman manual pada tanggal ini.',
    'rec.filterCount': (n) => `${n} rekaman pada tanggal ini`,
    'rec.play': 'Putar',
    'rec.delete': 'Hapus',
    'rec.confirmDelete': (name) => `Hapus "${name}"?`,
    'rec.deleteFailed': (msg) => `Penghapusan gagal: ${msg}`,

    // Search & Playback tab
    'search.title': 'Cari & Putar',
    'search.placeholder': 'Masukkan kode pengiriman...',
    'search.btn': 'Cari',
    'search.results': 'Hasil',
    'search.nowPlaying': 'Sedang Diputar:',
    'search.saveAs': '\u2B09 Simpan Sebagai\u2026',
    'search.converting': 'Mengonversi ke MP4\u2026',
    'search.savedTo': (p) => `\u2713 Tersimpan di: ${p}`,
    'search.searchError': (msg) => `Kesalahan pencarian: ${msg}`,
    'search.noResults': (code) => `Tidak ada rekaman ditemukan untuk: ${code}`,
    'search.enterCode': 'Masukkan kode pengiriman terlebih dahulu.',
    'search.cantReadVideo': 'Tidak dapat membaca file video.',
    'search.playbackError': (msg) => `Kesalahan pemutaran: ${msg}`,
    'search.saveError': (msg) => `Kesalahan: ${msg}`,

    // Settings tab
    'settings.title': 'Pengaturan',
    'settings.folderTitle': 'Folder Penyimpanan Video',
    'settings.browse': 'Telusuri\u2026',
    'settings.autoDeleteTitle': 'Hapus otomatis rekaman lebih dari',
    'settings.autoDeleteHint': 'Atur ke 0 untuk menonaktifkan. Berjalan otomatis setiap kali aplikasi dibuka.',
    'settings.daysUnit': 'hari',
    'settings.save': 'Simpan',
    'settings.autoDeleteDisabled': 'Hapus otomatis dinonaktifkan.',
    'settings.autoDeleteEnabled': (days) => `Hapus otomatis aktif: rekaman lebih dari ${days} hari akan dihapus setiap kali aplikasi dibuka.`,
    'settings.autoDeleteSaved': (n, days) => n > 0
      ? `\u2713 Tersimpan. Menghapus ${n} rekaman lebih dari ${days} hari.`
      : `\u2713 Tersimpan. Tidak ada rekaman lebih dari ${days} hari.`,
    'settings.testModeTitle': 'Mode Uji',
    'settings.testModeHint': 'Mengganti kamera dengan aliran simulasi dan menampilkan kontrol pindai manual. Gunakan saat pengujian tanpa kamera atau pemindai barcode nyata.',
    'settings.qrTitle': 'Kode QR Pindai Manual',
    'settings.qrHint': 'Cetak dan tempelkan kode QR ini di stasiun Anda. Pindai untuk memulai/menghentikan rekaman manual.',
    'settings.printQR': '\uD83D\uDDB6 Cetak QR\u2026',
    'settings.qrLabel': 'Pindai untuk memulai & menghentikan rekaman manual',

    // Multi-station settings
    'settings.stationsTitle': 'Beberapa Stasiun',
    'settings.stationsHint': 'Aktifkan untuk menggunakan beberapa stasiun pemindaian secara bersamaan, masing-masing dengan kamera dan sesi rekaman sendiri.',
    'settings.allowMultiStation': 'Izinkan beberapa stasiun',
    'settings.stationCount': 'Jumlah stasiun',
    'settings.stationCountHint': 'Maksimal 6 stasiun.',
    'settings.multiWindow': 'Mode multi-jendela (dasbor + jendela stasiun terpisah)',
    'settings.multiWindowHint': 'Saat diaktifkan, dasbor menampilkan semua stasiun. PIC dapat membuka setiap stasiun di jendela tersendiri (berguna untuk beberapa monitor).',
    'settings.armedTimeout': 'Waktu tunggu status aktif',
    'settings.armedTimeoutHint': 'Detik sebelum stasiun yang aktif otomatis dibatalkan jika tidak ada barcode yang dipindai.',
    'settings.secondsUnit': 'detik',
    'settings.stationLabel': (n) => `Nama Stasiun ${n}`,
    'settings.stationCamera': (n) => `Kamera Stasiun ${n}`,
    'settings.stationConfigTitle': 'Konfigurasi Stasiun',
    'settings.cameraNotAssigned': 'Tidak ditentukan (gunakan default)',
    'settings.cameraWarning': (n, m) => `\u26A0 Peringatan: hanya ${n} kamera terdeteksi untuk ${m} stasiun. Beberapa stasiun akan berbagi kamera.`,
    'settings.printStationQR': '\uD83D\uDDB6 Cetak QR Stasiun\u2026',
    'settings.printStationQRHint': 'Cetak kode QR untuk setiap stasiun dan kode pindai manual. Operator memindai kode ini untuk mengaktifkan stasiun.',
    'settings.saveStations': 'Simpan Pengaturan Stasiun',
    'settings.stationsSaved': '\u2713 Pengaturan stasiun tersimpan.',

    // Station states
    'station.idle': 'IDLE',
    'station.armed': 'AKTIF',
    'station.recording': 'REC',
    'station.cancelled': 'BATAL',
    'station.waitingBarcode': 'Menunggu barcode\u2026',
    'station.noCamera': 'Tidak ada kamera',

    // Dashboard
    'dashboard.title': 'Dasbor Stasiun',
    'dashboard.openWindow': 'Buka Jendela',
    'dashboard.windowOpen': 'Jendela Terbuka',
    'dashboard.hint': 'Klik \u201CBuka Jendela\u201D untuk membuka stasiun di jendela tersendiri. Setiap stasiun merekam secara independen.',

    // Voice announcements settings
    'settings.voiceTitle': 'Pengumuman Suara',
    'settings.voiceHint': 'Mengucapkan status stasiun dengan suara. Berguna untuk operator yang jauh dari layar.',
    'settings.voiceEnabled': 'Aktifkan pengumuman suara',
    'settings.voiceLocale': 'Bahasa suara',
    'settings.voiceSpeed': 'Kecepatan suara',
    'settings.voiceSpeedHint': '1.0 adalah kecepatan normal.',

    // Voice announcement phrases (used independently of UI locale)
    'voice.stationNum': (n) => ['Satu','Dua','Tiga','Empat','Lima'][n - 1] ?? String(n),
    'voice.armed':      (label) => `${label}, menunggu`,
    'voice.recording':  (label) => `${label}, merekam`,
    'voice.saved':      (label) => `${label}, tersimpan`,
    'voice.cancelled':  (label) => `${label}, dibatalkan`,
  }
};

  let _locale = 'en';

  /** Translate a key, optionally passing arguments for function-valued entries. */
  function t(key, ...args) {
    const dict = TRANSLATIONS[_locale] || TRANSLATIONS.en;
    const val = (key in dict) ? dict[key] : (TRANSLATIONS.en[key] ?? key);
    return typeof val === 'function' ? val(...args) : val;
  }

  function setLocale(locale) {
    _locale = TRANSLATIONS[locale] ? locale : 'en';
  }

  function getLocale() { return _locale; }

  /** Return the raw translation dict for a specific locale (for voice use). */
  function getTranslations(locale) {
    return TRANSLATIONS[locale] || TRANSLATIONS.en;
  }

  window._i18n = { t, setLocale, getLocale, getTranslations };
}());
