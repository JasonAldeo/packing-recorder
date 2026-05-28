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

    // License overlay
    'overlay.title': 'Trial Period Ended',
    'overlay.sub': 'Your 7-day free trial has expired. Purchase a license to continue using Packing Recorder.',
    'overlay.priceLabel': 'One-time license',
    'overlay.buyBtn': 'Buy License (QRIS)',
    'overlay.divider': 'Already have a license?',
    'overlay.activateBtn': 'Activate',

    // Activation feedback
    'activate.checking': 'Checking\u2026',
    'activate.btn': 'Activate',
    'activate.enterKey': 'Please enter a license key.',
    'activate.success': (msg) => `\u2713 ${msg} The app is now unlocked.`,
    'activate.failed': 'Activation failed. Please try again.',

    // Test mode panel
    'test.warning': '\u26A0 TEST MODE \u2014 No camera detected. Using simulated stream.',
    'test.placeholder': 'Type a shipping code\u2026',
    'test.simulateScan': 'Simulate Scan',
    'test.simulateManual': 'Simulate Manual Scan',

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

    // Recordings tab
    'rec.title': 'Recordings',
    'rec.standardTitle': 'Standard Recordings',
    'rec.filterLabel': 'Filter by date:',
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

    // License overlay
    'overlay.title': 'Masa Percobaan Berakhir',
    'overlay.sub': 'Masa percobaan 7 hari Anda telah berakhir. Beli lisensi untuk terus menggunakan Packing Recorder.',
    'overlay.priceLabel': 'Lisensi sekali bayar',
    'overlay.buyBtn': 'Beli Lisensi (QRIS)',
    'overlay.divider': 'Sudah punya lisensi?',
    'overlay.activateBtn': 'Aktifkan',

    // Activation feedback
    'activate.checking': 'Memeriksa\u2026',
    'activate.btn': 'Aktifkan',
    'activate.enterKey': 'Masukkan kunci lisensi terlebih dahulu.',
    'activate.success': (msg) => `\u2713 ${msg} Aplikasi sekarang sudah aktif.`,
    'activate.failed': 'Aktivasi gagal. Silakan coba lagi.',

    // Test mode panel
    'test.warning': '\u26A0 MODE UJI \u2014 Kamera tidak terdeteksi. Menggunakan aliran simulasi.',
    'test.placeholder': 'Ketik kode pengiriman\u2026',
    'test.simulateScan': 'Simulasi Pindai',
    'test.simulateManual': 'Simulasi Pindai Manual',

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

    // Recordings tab
    'rec.title': 'Rekaman',
    'rec.standardTitle': 'Rekaman Standar',
    'rec.filterLabel': 'Filter berdasarkan tanggal:',
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

  window._i18n = { t, setLocale, getLocale };
}());
