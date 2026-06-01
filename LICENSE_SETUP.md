# License Server & Payment Setup Guide

This guide covers deploying the license server to Railway, configuring Midtrans QRIS payments, setting up the marketing website, and publishing the app installer via GitHub Releases.

---

## Part 1: Railway Setup

### Step 1: Create a Railway account
1. Go to [railway.app](https://railway.app) and sign up — GitHub login is easiest
2. Verify your account via email if prompted

### Step 2: Create a new project
1. Click **"New Project"**
2. Choose **"Deploy from GitHub repo"**
3. Connect your GitHub account and select your `packing-recorder` repository
4. When asked for the **Root Directory**, set it to `license-server`
5. Railway will detect `package.json` and use `npm start` automatically

### Step 3: Add a PostgreSQL database
1. Inside your project, click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway provisions it automatically — no configuration needed
3. It will appear as a separate service in your project dashboard

### Step 4: Set environment variables
Go to your `license-server` service → **"Variables"** tab and add the following:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | *(reference)* | Click **"Add Reference"** → select the Postgres service → `DATABASE_URL`. Do **not** type this manually. |
| `JWT_SECRET` | A long random string | Run `openssl rand -hex 32` in your terminal and paste the output |
| `MIDTRANS_SERVER_KEY` | Your Midtrans server key | From Part 2 below |
| `MIDTRANS_ENVIRONMENT` | `sandbox` | Change to `production` when going live |

> `PORT` does not need to be set — Railway injects it automatically.

### Step 5: Get your Railway public URL
1. Go to your `license-server` service → **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Copy the URL (e.g. `https://packing-recorder.up.railway.app`)
4. Open `main.js` and replace line 14:
   ```js
   const LICENSE_SERVER_URL = 'https://packing-recorder.up.railway.app';
   ```

### Step 6: Verify the deployment
1. Push your latest code to GitHub — Railway deploys automatically on every push
2. Check the **"Deployments"** tab in Railway — look for a green checkmark
3. Visit `https://your-url.up.railway.app` — you should see the **marketing website homepage** load
4. Visit `https://your-url.up.railway.app/purchase.html` — you should see the purchase page

---

## Part 2: Midtrans Setup (Starting Fresh)

### Step 1: Register for a Midtrans account
1. Go to [dashboard.midtrans.com](https://dashboard.midtrans.com)
2. Click **"Register"** and fill in your details
3. You will start in **Sandbox mode** by default — this is correct for testing

### Step 2: Get your Sandbox API keys
1. In the Midtrans dashboard, go to **Settings** → **Access Keys**
2. Make sure you are in **Sandbox** mode (toggle at the top of the page)
3. Copy the **Server Key** — it starts with `SB-Mid-server-...`
4. Paste it into Railway as `MIDTRANS_SERVER_KEY`

### Step 3: Configure the payment notification (webhook) URL
1. In Midtrans dashboard → **Settings** → **Configuration**
2. Set **Payment Notification URL** to:
   ```
   https://your-railway-url.up.railway.app/midtrans-webhook
   ```
3. Click **Save**

> This URL is how Midtrans tells your server that a payment was completed. It must be your live Railway URL, not localhost.

### Step 4: Test the full payment flow (Sandbox)
1. Open the Packing Recorder app
2. Register an account, then click **"Buy License"** in the nav bar
3. The purchase page opens in your browser — click **"Bayar dengan QRIS"**
4. A QR code appears — **do not scan it yet**
5. Go to Midtrans Sandbox dashboard → **"Simulator"** (in the left menu)
6. Find your order ID (shown in the URL or your Railway logs)
7. In the Simulator, enter the order ID and trigger a **"settlement"** status
8. Wait a few seconds — the purchase page should show the success screen with your license expiry date
9. Close and reopen the app — the green **"License: X days left"** badge should appear in the nav bar

> **Note:** The new flow does not show a license key to copy. The license is applied automatically to the user's account. The success screen just shows the expiry date.

### Step 5: Go live (Production)

Before switching to production, Midtrans requires business verification:

1. In the Midtrans dashboard, go to **Settings** → **General Settings**
2. Fill in your business information (business name, address, website)
3. Upload the required documents — for individuals this is typically your **KTP** (national ID)
4. Submit and wait for approval (usually 1–3 business days)
5. Once approved, switch the dashboard toggle from **Sandbox** to **Production**
6. Go to **Settings** → **Access Keys** (now in Production mode)
7. Copy the **Production Server Key** — it starts with `Mid-server-...`
8. Update Railway environment variables:
   - `MIDTRANS_SERVER_KEY` → your Production Server Key
   - `MIDTRANS_ENVIRONMENT` → `production`
9. Also update the **Payment Notification URL** in Production mode (same URL as sandbox)

---

## Part 3: GitHub Private Repo + Public Releases (Download Button)

The marketing website's Download button links to:
```
https://github.com/JasonAldeo/packing-recorder/releases/latest/download/PackingRecorder-Setup.exe
```

This URL works automatically as long as your latest GitHub Release has a file named exactly `PackingRecorder-Setup.exe` attached. Here's how to set that up.

### Step 1: Keep the repo private
Your source code stays private. GitHub allows publishing public release assets from a private repo — the installer is downloadable by anyone but the code remains hidden.

1. Go to your repo on GitHub → **Settings** → scroll to **"Danger Zone"**
2. Confirm the repo is set to **Private**

### Step 2: Build the installer
In your project root, run:
```bash
npm run dist
```
This produces `dist/PackingRecorder-Setup.exe` (or similar name depending on your `electron-builder` config).

Check your `package.json` `build` config to confirm the output filename. If it differs, either rename the file before uploading or update the download URL in `license-server/public/index.html` to match.

### Step 3: Create a GitHub Release
1. Go to your repo on GitHub → **Releases** → **"Draft a new release"**
2. Click **"Choose a tag"** → type a version like `v1.0.0` → click **"Create new tag"**
3. Set the release title (e.g. `v1.0.0 — Initial Release`)
4. Write brief release notes if you like
5. Under **"Attach binaries"**, drag and drop your `PackingRecorder-Setup.exe` file
6. **Important:** make sure the filename is exactly `PackingRecorder-Setup.exe`
7. Click **"Publish release"**

### Step 4: Verify the download link
Open this URL in your browser — it should immediately download the installer:
```
https://github.com/JasonAldeo/packing-recorder/releases/latest/download/PackingRecorder-Setup.exe
```

If it returns a 404, double-check the filename attached to the release matches exactly.

### Step 5: Future updates
For every new version:
1. Run `npm run dist` to build the new installer
2. Create a new GitHub Release with a new tag (e.g. `v1.1.0`)
3. Attach the new `PackingRecorder-Setup.exe`
4. The `/releases/latest/download/...` URL updates automatically — no changes needed to the website

---

## Part 4: Marketing Website

The marketing website (`license-server/public/index.html`) is served automatically by Express at your Railway root URL. No extra configuration is needed — it is included in the `license-server/` deployment.

### What it includes
- **Hero** with the tagline and Download button
- **Features** — 6 feature cards
- **How it works** — 3-step walkthrough
- **Screenshots placeholder** — replace when ready
- **Pricing** — Free trial vs Rp 75.000 / 30-day license
- **Download CTA** — links directly to GitHub Releases
- **Footer** — Aldeo Studio branding + `aldeojason@gmail.com`
- **Bilingual** — EN/ID toggle, preference saved to `localStorage`, defaults to Indonesian

### Adding screenshots later
Find this block in `index.html`:
```html
<div class="screenshots-placeholder">
  ...
</div>
```
Replace it with your screenshot images:
```html
<div class="screenshots-gallery">
  <img src="screenshot-scan.png" alt="Scan tab" />
  <img src="screenshot-search.png" alt="Search tab" />
</div>
```
Upload the image files to `license-server/public/` and they will be served automatically.

### Updated purchase flow
The purchase page (`purchase.html`) no longer shows a license key to copy. Instead:
1. User opens the app → registers/logs in
2. Clicks **"Buy License"** button in the nav bar
3. Browser opens `purchase.html?token=...` (JWT passed automatically)
4. User pays via QRIS
5. On success, the page shows the license expiry date
6. User closes the browser and reopens the app — the license badge appears automatically

---

## Pre-launch Checklist

- [ ] `license-server/` deployed to Railway with green status
- [ ] `DATABASE_URL` linked via Railway reference (not typed manually)
- [ ] `JWT_SECRET` set to a long random string (`openssl rand -hex 32`)
- [ ] `MIDTRANS_SERVER_KEY` set (sandbox or production)
- [ ] `MIDTRANS_ENVIRONMENT` set (`sandbox` or `production`)
- [ ] Railway public domain generated and copied into `main.js` line 14
- [ ] Midtrans webhook URL configured to point to your Railway domain
- [ ] Marketing website loads at Railway root URL
- [ ] GitHub repo is private
- [ ] First GitHub Release published with `PackingRecorder-Setup.exe` attached
- [ ] Download button on website resolves correctly
- [ ] Full sandbox payment test completed (license badge appears in app after payment)
- [ ] (Production only) Midtrans business verification approved
- [ ] (Production only) Production server key and environment set in Railway

---

## Useful URLs

| Service | URL |
|---|---|
| Railway Dashboard | https://railway.app/dashboard |
| Midtrans Dashboard | https://dashboard.midtrans.com |
| Midtrans Sandbox Simulator | https://simulator.sandbox.midtrans.com |
| Midtrans Docs (QRIS) | https://docs.midtrans.com/reference/qris |
| GitHub Releases (your repo) | https://github.com/JasonAldeo/packing-recorder/releases |

---

## Troubleshooting

**Website not loading at Railway URL?**
- Confirm the Root Directory in Railway is set to `license-server`
- Check that `license-server/public/index.html` exists and was pushed to GitHub

**Download button returns 404?**
- Confirm a GitHub Release exists with a file named exactly `PackingRecorder-Setup.exe`
- The `/releases/latest/` URL only works if at least one published (non-draft) release exists

**Webhook not firing?**
- Make sure the notification URL in Midtrans is your Railway URL (not localhost)
- Check Railway logs for incoming POST requests to `/midtrans-webhook`
- In sandbox, use the Simulator to trigger payment notifications manually

**Database errors on startup?**
- Confirm `DATABASE_URL` is a Railway reference, not a manually typed string
- Check that the Postgres service is running (green) in the Railway dashboard

**JWT errors in the app?**
- Make sure `JWT_SECRET` is set in Railway — the server falls back to a weak default if missing
- If users are getting logged out unexpectedly, the secret may have changed between deploys

**"License not detected" after payment?**
- The app checks license status on launch — close and reopen the app after paying
- Check Railway logs to confirm the webhook was received and processed

**Purchase page shows "Sesi tidak valid"?**
- This means the page was opened directly in the browser without a token
- The purchase page must be opened from inside the app via the "Buy License" button


---

## Part 1: Railway Setup

### Step 1: Create a Railway account
1. Go to [railway.app](https://railway.app) and sign up — GitHub login is easiest
2. Verify your account via email if prompted

### Step 2: Create a new project
1. Click **"New Project"**
2. Choose **"Deploy from GitHub repo"**
3. Connect your GitHub account and select your `packing-recorder` repository
4. When asked for the **Root Directory**, set it to `license-server`
5. Railway will detect `package.json` and use `npm start` automatically

### Step 3: Add a PostgreSQL database
1. Inside your project, click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway provisions it automatically — no configuration needed
3. It will appear as a separate service in your project dashboard

### Step 4: Set environment variables
Go to your `license-server` service → **"Variables"** tab and add the following:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | *(reference)* | Click **"Add Reference"** → select the Postgres service → `DATABASE_URL`. Do **not** type this manually. |
| `JWT_SECRET` | A long random string | Run `openssl rand -hex 32` in your terminal and paste the output |
| `MIDTRANS_SERVER_KEY` | Your Midtrans server key | From Part 2 below |
| `MIDTRANS_ENVIRONMENT` | `sandbox` | Change to `production` when going live |

> `PORT` does not need to be set — Railway injects it automatically.

### Step 5: Get your Railway public URL
1. Go to your `license-server` service → **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Copy the URL (e.g. `https://packing-recorder.up.railway.app`)
4. Open `main.js` and replace line 14:
   ```js
   const LICENSE_SERVER_URL = 'https://packing-recorder.up.railway.app';
   ```

### Step 6: Verify the deployment
1. Push your latest code to GitHub — Railway deploys automatically on every push
2. Check the **"Deployments"** tab in Railway — look for a green checkmark
3. Visit `https://your-url.up.railway.app` — you should see the purchase page load

---

## Part 2: Midtrans Setup (Starting Fresh)

### Step 1: Register for a Midtrans account
1. Go to [dashboard.midtrans.com](https://dashboard.midtrans.com)
2. Click **"Register"** and fill in your details
3. You will start in **Sandbox mode** by default — this is correct for testing

### Step 2: Get your Sandbox API keys
1. In the Midtrans dashboard, go to **Settings** → **Access Keys**
2. Make sure you are in **Sandbox** mode (toggle at the top of the page)
3. Copy the **Server Key** — it starts with `SB-Mid-server-...`
4. Paste it into Railway as `MIDTRANS_SERVER_KEY`

### Step 3: Configure the payment notification (webhook) URL
1. In Midtrans dashboard → **Settings** → **Configuration**
2. Set **Payment Notification URL** to:
   ```
   https://your-railway-url.up.railway.app/midtrans-webhook
   ```
3. Click **Save**

> This URL is how Midtrans tells your server that a payment was completed. It must be your live Railway URL, not localhost.

### Step 4: Test the full payment flow (Sandbox)
1. Open the Packing Recorder app
2. Register an account, then click **"Buy License"** in the nav bar
3. The purchase page opens in your browser — click **"Bayar dengan QRIS"**
4. A QR code appears — **do not scan it yet**
5. Go to Midtrans Sandbox dashboard → **"Simulator"** (in the left menu)
6. Find your order ID (shown in the URL or your Railway logs)
7. In the Simulator, enter the order ID and trigger a **"settlement"** status
8. Wait a few seconds — the purchase page should show the success screen
9. Reopen or restart the app — the license badge should appear in the nav bar

### Step 5: Go live (Production)

Before switching to production, Midtrans requires business verification:

1. In the Midtrans dashboard, go to **Settings** → **General Settings**
2. Fill in your business information (business name, address, website)
3. Upload the required documents — for individuals this is typically your **KTP** (national ID)
4. Submit and wait for approval (usually 1–3 business days)
5. Once approved, switch the dashboard toggle from **Sandbox** to **Production**
6. Go to **Settings** → **Access Keys** (now in Production mode)
7. Copy the **Production Server Key** — it starts with `Mid-server-...`
8. Update Railway environment variables:
   - `MIDTRANS_SERVER_KEY` → your Production Server Key
   - `MIDTRANS_ENVIRONMENT` → `production`
9. Also update the **Payment Notification URL** in Production mode (same URL as sandbox)

---

## Pre-launch Checklist

- [ ] `license-server/` deployed to Railway with green status
- [ ] `DATABASE_URL` linked via Railway reference (not typed manually)
- [ ] `JWT_SECRET` set to a long random string
- [ ] `MIDTRANS_SERVER_KEY` set (sandbox or production)
- [ ] `MIDTRANS_ENVIRONMENT` set (`sandbox` or `production`)
- [ ] Railway public domain generated and copied into `main.js` line 14
- [ ] Midtrans webhook URL configured to point to your Railway domain
- [ ] Full sandbox payment test completed successfully
- [ ] (Production only) Midtrans business verification approved
- [ ] (Production only) Production server key and environment set in Railway

---

## Useful URLs

| Service | URL |
|---|---|
| Railway Dashboard | https://railway.app/dashboard |
| Midtrans Dashboard | https://dashboard.midtrans.com |
| Midtrans Sandbox Simulator | https://simulator.sandbox.midtrans.com |
| Midtrans Docs (QRIS) | https://docs.midtrans.com/reference/qris |

---

## Troubleshooting

**Webhook not firing?**
- Make sure the notification URL in Midtrans is your Railway URL (not localhost)
- Check Railway logs for incoming POST requests to `/midtrans-webhook`
- In sandbox, use the Simulator to trigger payment notifications manually

**Database errors on startup?**
- Confirm `DATABASE_URL` is a Railway reference, not a manually typed string
- Check that the Postgres service is running (green) in the Railway dashboard

**JWT errors in the app?**
- Make sure `JWT_SECRET` is set in Railway — the server will fall back to a weak default if missing
- If users are getting logged out unexpectedly, the secret may have changed between deploys

**"License not detected" after payment?**
- The app checks license status on launch — close and reopen the app after paying
- Check Railway logs to confirm the webhook was received and processed
