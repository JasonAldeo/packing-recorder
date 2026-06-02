# AGENTS.md

## Two independent Node projects

This repo has two separate `package.json` files that must be managed independently:

- `/` — Electron desktop app (Windows x64 only)
- `license-server/` — Express/PostgreSQL server deployed to Railway

`npm install` in root does **not** install `license-server/` dependencies. Run it separately there.

## Developer commands

### Electron app (root)
```
npm start       # launch app (electron .)  — no watch/hot-reload
npm run dist    # build Windows installer (electron-builder --win --x64) → dist/
```

### License server (license-server/)
```
npm start       # node server.js
npm run dev     # node --watch server.js
```

There are **no lint, typecheck, or test scripts** in either project.

## Releasing a new version

Releases are fully automated via GitHub Actions (`.github/workflows/release.yml`). Push a version tag to trigger the pipeline:

```
git tag v2.1.0
git push origin v2.1.0
```

The workflow will:
1. Run `npm version <tag> --no-git-tag-version` to sync `package.json` version with the tag
2. Build the Windows installer with `electron-builder -p never`
3. Upload `dist/PackingRecorder-Setup.exe` + `dist/latest.yml` to a GitHub Release
4. POST the new version to the Railway license server via `POST /set-version` (notifies the website)

**Do not manually bump `package.json` version before tagging** — the CI does it automatically from the tag name.

### Required secrets
| Secret | Where set | Purpose |
|---|---|---|
| `VERSION_UPDATE_TOKEN` | GitHub Actions + Railway env var | Authenticates CI → Railway version update |
| `GITHUB_TOKEN` | Auto-provided by GitHub | Publishing the GitHub Release |

Both `VERSION_UPDATE_TOKEN` values (GitHub secret and Railway env var) must be identical.

## Auto-update (electron-updater)

- Uses `electron-updater` (package: `electron-updater ^6.x`).
- On startup, `autoUpdater.checkForUpdates()` runs silently after a 3 s delay.
- `update-available` → renderer receives `update-available` IPC event (Settings shows "Downloading…").
- `update-downloaded` → native dialog prompts user to restart and install.
- Manual check available via "Check for Updates" button in Settings tab.
- `electron-updater` compares the running version (from `package.json` at build time) against `latest.yml` hosted on the GitHub release. **Both must be in sync** — the CI handles this automatically.
- `autoUpdater.autoDownload = true`, `autoUpdater.autoInstallOnAppQuit = false`.
- Errors are logged silently — users are never disrupted by a failed update check.

### preload.js update APIs
```
getAppVersion()           → string
checkForUpdates()         → void
onUpdateAvailable(cb)     → push event, cb receives { version, ... }
onUpdateDownloaded(cb)    → push event, cb receives { version, ... }
```

## Architecture — Electron app

- **Context isolation ON, nodeIntegration OFF.** All Node/Electron APIs are accessed only via `window.electronAPI` (defined in `preload.js` via `contextBridge`). Never `require()` anything in renderer code.
- Video is written to disk in chunks via a 3-step IPC protocol: `begin-video-write` → repeated `write-video-chunk` → `end-video-write`. Do not pass a full video buffer over IPC in one call.
- WebM → MP4 export uses `ffmpeg-static` with `-c copy` (no re-encode). The binary is explicitly listed in `electron-builder` files — do not remove it.
- `LICENSE_SERVER_URL` is hardcoded at `main.js:12` as `https://packing-recorder-production.up.railway.app`.
- Runtime data (license, settings, videos) lives in `app.getPath('userData')` (e.g. `%APPDATA%\Packing Recorder\`), not in the repo directory.
- Machine ID on Windows reads `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`; license validation is machine-locked.
- License is re-validated at most once per 24 hours; cached validation enables offline use within that window.
- `i18n.js` must be loaded before `renderer.js` in `index.html`. Translation values can be strings **or functions** (for interpolation) — check before using directly.
- Manual scan code is the hardcoded string `'MANUALSCAN'`; those files are prefixed `MANUAL_`.
- Shipping code filenames are sanitized with `/[^a-zA-Z0-9_\-]/g` → `_`; timestamp appended on collision.

## Build files

The `electron-builder` `files` array in `package.json` must include all files the app needs at runtime:
```
main.js, preload.js, renderer.js, index.html, i18n.js,
print-stations.html, styles.css, videos/, node_modules/ffmpeg-static/**
```
Do not remove `i18n.js` or `print-stations.html` — both are required at runtime.

## Print QR codes

- **Station QR codes + Manual Scan QR:** both use `print-stations.html` opened via `window.electronAPI.openPrintStations(stationsData)`.
- Passing an **empty array** (`[]`) to `openPrintStations` opens only the Manual Scan page.
- `print-stations.html` always appends the Manual Scan page at the end regardless of the stations array.
- The old inline print approach (`window.print()` from renderer) has been removed.

## Multi-station architecture

- **`MAX_STATIONS = 6`** — maximum 6 stations. Grid layout is dynamic: 1 station = 1 col, 2–4 = 2 cols, 5–6 = 3 cols (3×2).
- Station state machine: `idle` → `armed` → `recording` → `idle`. Only one station can be `armed` at a time — arming a new station cancels the current armed one.
- `cancelArm(sid, silent, skipVoice)`: `silent=true` = timeout (quiet); `silent=false` = displaced (flash + voice). `skipVoice=true` lets caller handle combined voice phrase via `speakSequence()`.
- Armed timeout default: 15 s (configurable in Settings). On timeout, station returns to `idle` silently.
- Cancelled flash: `.station-cancelled` class + "CANCELLED"/"BATAL" badge for 1500 ms, then back to `idle`.
- Station QR codes encode `STATION:X` (prefix `STATION_QR_PREFIX = 'STATION:'`). Manual scan code is `'MANUALSCAN'`.
- Recording filenames: `station1_ABC123.webm` (station prefix + shipping code).

## Multi-window mode (dashboard)

Three rendering modes controlled by `settings.multiStation` + `settings.multiWindow`:

| Mode | Condition | Description |
|---|---|---|
| Single-station | `!multiStation` | Classic single view, `#single-station-view` shown |
| Grid | `multiStation && !multiWindow` | All station cards in `#stations-grid`, dynamic column class |
| Dashboard | `multiStation && multiWindow` | `#dashboard-view` shown; station windows opened separately |

### Dashboard / station window IPC protocol

The dashboard is the **single source of truth** for armed state and routing. Station windows are thin clients (camera + recording only).

**Scan relay (station window → dashboard):**
- Station window keydown / test controls call `window.electronAPI.relayScan(code)` instead of routing locally.
- Main process: `relay-scan` handler forwards to `mainWindow.webContents.send('relayed-scan', code)`.
- Dashboard: `onRelayScan` listener calls `routeBarcode(code)` normally.

**Commands (dashboard → station window):**
- Dashboard calls `pushToStationWindow(sid, command)` → `window.electronAPI.sendStationCommand(sid, cmd)`.
- Main process: `send-station-command` forwards to the correct `stationWindows.get(sid)`.
- Station window: `onStationCommand` listener handles:
  - `{ type: 'set-status', state }` — updates visual badge + status bar; handles 1500 ms cancelled flash
  - `{ type: 'start-recording', code }` — calls `startRecording(sid, code)` locally
  - `{ type: 'stop-recording' }` — calls `stopRecording(sid)` locally

**Recording events (station window → dashboard):**
- After `saveStationRecording` completes (or aborts), station window calls `window.electronAPI.notifyDashboard({ type: 'recording-saved'|'recording-aborted', stationId })`.
- Main process: `notify-station-event` forwards to `mainWindow.webContents.send('station-event', payload)`.
- Dashboard: `onStationEvent` listener resets station state to `idle` and updates badge.

**Dashboard stations Map:**
- In dashboard mode, `initStations` populates the `stations` Map with state objects (no stream, no DOM elements) so the armed state machine and `routeBarcode` work correctly. `setStationStatus` updates `#dash-badge-${sid}` elements which are null-safe.
- `delegated = appSettings.multiWindow && !stationWindowId` — when true, `handleCodeForStation` skips local `startRecording`/`stopRecording` and calls `setStationStatus(sid, 'recording'/'idle')` directly.

**Focus:**
- No focus requirement — any open window (station or dashboard) can receive scanner input; station windows relay all scans to the dashboard.

## Voice announcements

- Toggle in Settings (default off). When enabled, shows language (EN/ID, default ID) and speed (0.5×–2.0×, default 1.0×) controls.
- `speak(voiceKey, label)` — single utterance, cancels any in-progress speech first.
- `speakSequence(items)` — queues multiple utterances without cancelling between them. Used when a station is displaced (speaks "Station X cancelled, Station Y waiting" as one sequence).
- Voice locale is **independent of UI locale** — uses `window._i18n.getTranslations(voiceLocale)` directly.
- `voice.stationNum` i18n key is a function `(n) => word` — must be called, not used directly.

## Test mode

- Replaces camera with a simulated fake stream (`createFakeStream()`).
- Test panel shows simulate scan input, simulate manual scan button, and station QR simulation buttons (multi-station only).
- Digit keys `1`–`6` simulate `STATION:X` QR scans — gated behind `testMode && multiStation`.
- In station windows, all test controls relay via `relayScan` instead of calling `routeBarcode` locally.
- `initTestControls()` must be called in both `initStations()` (main window) and `initAsStationWindow()` (station windows).

## Architecture — License server

- Requires Node ≥ 18 (uses native `fetch`).
- Requires `DATABASE_URL` (PostgreSQL). Schema is auto-created on startup via `CREATE TABLE IF NOT EXISTS`.
- License keys are `XXXX-XXXX-XXXX-XXXX` format, generated only after Midtrans webhook confirms payment.
- First activation binds a key to a `machineId`; subsequent activation from a different machine is rejected.
- Midtrans webhook URL must be manually set in the Midtrans dashboard.
- `trust proxy` is set for Railway's reverse proxy — do not remove.

### Database tables
| Table | Purpose |
|---|---|
| `users` | Accounts (username, email, password hash, role, machine_id) |
| `licenses` | License periods per user (expires_at) |
| `orders` | Midtrans payment orders |
| `app_meta` | Key/value store for app metadata (currently stores `app_version`) |

### App version endpoints
- `GET /latest-version` — public, returns `{ version }`. Used by the website to display the current version.
- `POST /set-version` — protected by `Authorization: Bearer <VERSION_UPDATE_TOKEN>`. Called by CI after each release to update the stored version. Body: `{ version: "v2.1.0" }`.

## Website (license-server/public/index.html)

- Static HTML served by the Express server from `public/`.
- Bilingual: ID (default) + EN, switched via `localStorage` key `pr_site_lang`.
- All translatable strings are in the `TEXTS` object at the bottom of the file — add new keys to both `TEXTS.id` and `TEXTS.en`.
- Feature cards use SVG icons from `/icons/` directory.
- On page load, fetches `GET /latest-version` and displays the current version below download buttons in the hero and download CTA sections.
- Features grid is **4×2** (`repeat(4, 1fr)`), responsive: 4 cols → 2 cols (≤900px) → 1 col (≤500px).
- Current 8 feature cards: Barcode recording, Search & replay, MP4 export, Multi-station, Offline recordings, Account-based license, Auto-delete, Voice announcements.

## Testing

No automated tests exist. Manual verification uses the built-in **Test Mode** in Settings, which simulates a camera stream and allows triggering barcode scans without hardware.

In multi-station mode, test station QR buttons and digit keys `1`–`6` simulate station QR scans. In multi-window mode, these relay through the dashboard's routing engine regardless of which window has focus.
