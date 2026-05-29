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

## Architecture — Electron app

- **Context isolation ON, nodeIntegration OFF.** All Node/Electron APIs are accessed only via `window.electronAPI` (defined in `preload.js` via `contextBridge`). Never `require()` anything in renderer code.
- Video is written to disk in chunks via a 3-step IPC protocol: `begin-video-write` → repeated `write-video-chunk` → `end-video-write`. Do not pass a full video buffer over IPC in one call.
- WebM → MP4 export uses `ffmpeg-static` with `-c copy` (no re-encode). The binary is explicitly listed in `electron-builder` files — do not remove it.
- `LICENSE_SERVER_URL` is hardcoded at `main.js:14` as a placeholder. Replace with the actual Railway URL before building for distribution.
- Runtime data (license, settings, videos) lives in `app.getPath('userData')` (e.g. `%APPDATA%\Packing Recorder\`), not in the repo directory.
- Machine ID on Windows reads `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`; license validation is machine-locked.
- License is re-validated at most once per 24 hours; cached validation enables offline use within that window.
- `i18n.js` must be loaded before `renderer.js` in `index.html`. Translation values can be strings **or functions** (for interpolation) — check before using directly.
- Manual scan code is the hardcoded string `'MANUALSCAN'`; those files are prefixed `MANUAL_`.
- Shipping code filenames are sanitized with `/[^a-zA-Z0-9_\-]/g` → `_`; timestamp appended on collision.

## Architecture — License server

- Requires Node ≥ 18 (uses native `fetch`).
- Requires `DATABASE_URL` (PostgreSQL). Schema is auto-created on startup via `CREATE TABLE IF NOT EXISTS`.
- License keys are `XXXX-XXXX-XXXX-XXXX` format, generated only after Midtrans webhook confirms payment.
- First activation binds a key to a `machineId`; subsequent activation from a different machine is rejected.
- Midtrans webhook URL must be manually set in the Midtrans dashboard.
- `trust proxy` is set for Railway's reverse proxy — do not remove.

## Testing

No automated tests exist. Manual verification uses the built-in **Test Mode** in Settings, which simulates a camera stream and allows triggering barcode scans without hardware.
