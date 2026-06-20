# Packing Recorder

A desktop application for recording packing videos triggered by barcode scans. Built with Electron.

## Features

- **Barcode-triggered recording** — plug in any USB HID barcode scanner; scanning a shipping code automatically starts recording, scanning the same code again stops it
- **Manual recording** — print the built-in MANUALSCAN QR code and affix it to your station; scan it to toggle a manual (non-code) recording session
- **Searchable recordings** — find any recording by its shipping code
- **Video playback** — play back .webm recordings inside the app
- **Export to MP4** — save any recording as an MP4 file (no re-encoding; instant)
- **Auto-delete** — configure recordings to be automatically deleted after N days
- **Custom save folder** — choose where recordings are stored
- **Test Mode** — simulate a camera and barcode scans for testing without hardware
- **7-day free trial** — after the trial period a license key is required
- **Multi-language UI** — switch between English (EN) and Bahasa Indonesia (ID)

## Requirements

- Windows 10/11 x64
- A webcam
- (Optional) A USB HID barcode scanner

## Installation

Download the latest installer from the [releases page](../../releases), run the `.exe`, and follow the prompts.

## Running from Source

```bash
# Install dependencies
npm install

# Start the app
npm start
```

### Build a distributable installer

```bash
npm run dist
```

The output will be in the `dist/` folder.

## Usage

### Scan Tab

1. Point the barcode scanner at a shipping label.
2. The app automatically starts recording when the code is read.
3. Scan the **same code again** (or press **■ Stop Recording**) to stop and save the video.

### Manual Recording

1. Go to **Settings → Manual Scan QR Code** and click **Print QR…**
2. Affix the printed QR code near your packing station.
3. Scan the QR code to start a manual recording; scan it again to stop.

### Search & Playback Tab

Enter a shipping code to find its recording(s). Click **Play** to watch in-app, or **Save As…** to export as MP4.

### Recordings Tab

Browse all recordings sorted by newest first, filtered optionally by date. Supports separate lists for standard and manual recordings.

### Settings Tab

| Setting | Description |
|---|---|
| Videos Save Folder | Where .webm recordings are stored on disk |
| Auto-delete recordings older than | Automatically remove recordings older than N days (0 = disabled) |
| Test Mode | Use a simulated camera stream; show manual scan controls |
| Manual Scan QR Code | Print the QR code to use for manual recordings |
| Language | Switch between English (EN) and Bahasa Indonesia (ID) |

## License

This app requires a valid license key after the 7-day trial expires. Purchase via the in-app **Buy License** button.

## Project Structure

```
packing-recorder/
├── main.js          # Electron main process (IPC handlers, file I/O, license)
├── preload.js       # Context bridge – exposes safe APIs to renderer
├── renderer.js      # Renderer process logic (UI, recording, playback)
├── i18n.js          # Translations (EN / ID)
├── index.html       # Application shell
├── styles.css       # All UI styles
├── license-server/  # Node.js license + payment server (Railway deployment)
│   ├── server.js
│   └── public/
│       └── purchase.html
└── videos/          # Default recordings folder (created at runtime)
```

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) — WebM → MP4 conversion
- [qrcode](https://github.com/soldair/node-qrcode) — QR code generation
- [electron-builder](https://www.electron.build/) — packaging & installer
