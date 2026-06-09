'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY || '';
const IS_PRODUCTION = process.env.MIDTRANS_ENVIRONMENT === 'production';
const MIDTRANS_SNAP_URL = IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const PRODUCT_PRICE = 75000; // IDR
const LICENSE_DAYS = 30;
const PAYMENT_DISABLED = process.env.PAYMENT_DISABLED === 'true';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('[startup] JWT_SECRET env var is required. Set it in your Railway environment variables.');
const JWT_EXPIRY = '7d'; // sliding window — renewed on each /me call

// ─── Pricing ──────────────────────────────────────────────────────────────────
const DEFAULT_PRICING = {
  publishedPrice: 199000,
  rsp:            149000,
  promoLabelId:   'Promo Peluncuran',
  promoLabelEn:   'Launching Promo',
  promoEndsAt:    null,  // null = no promo; ISO string = promo active until that date
};

let pricingConfig = { ...DEFAULT_PRICING };

/** Returns true if a promo is currently active. */
function isPromoActive(cfg) {
  return !!(cfg.promoEndsAt && new Date(cfg.promoEndsAt) > new Date());
}

/** Returns the price customers are actually charged (RSP if promo active, publishedPrice otherwise). */
function getEffectivePrice(cfg) {
  return isPromoActive(cfg) ? cfg.rsp : cfg.publishedPrice;
}

/** Loads pricing config from app_meta, falling back to defaults. */
async function loadPricingConfig() {
  try {
    const result = await pool.query(`SELECT value FROM app_meta WHERE key = 'pricing_config'`);
    if (result.rows.length > 0) {
      pricingConfig = { ...DEFAULT_PRICING, ...JSON.parse(result.rows[0].value) };
    }
  } catch (err) {
    console.warn('[pricing] Failed to load pricing config, using defaults:', err.message);
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  // App metadata table (stores current app version for website display)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key   VARCHAR(64) PRIMARY KEY,
      value TEXT        NOT NULL
    )
  `);

  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      VARCHAR(50)  UNIQUE NOT NULL,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role          VARCHAR(20)  NOT NULL DEFAULT 'user',
      machine_id    VARCHAR(255),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  // Licenses table — each row represents a period grant; expires_at can be extended
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      id          SERIAL PRIMARY KEY,
      user_id     INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TIMESTAMPTZ  NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  // Orders table — now linked to user_id
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id           SERIAL PRIMARY KEY,
      order_id     VARCHAR(60)  UNIQUE NOT NULL,
      user_id      INT          REFERENCES users(id) ON DELETE SET NULL,
      email        VARCHAR(255) NOT NULL,
      status       VARCHAR(20)  NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      recovered_at TIMESTAMPTZ
    )
  `);

  // Add recovered_at column to existing deployments that don't have it yet
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ
  `);

  // Add user_id column to existing deployments that don't have it yet
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL
  `);

  // Add machine_id column to existing deployments that don't have it yet
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS machine_id VARCHAR(255)
  `);

  // Seed admin account
  await seedAdmin();

  // Load pricing config from DB
  await loadPricingConfig();
}

async function seedAdmin() {
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'aldeojason@gmail.com';
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'JasonAdmin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ADMIN_ROLE     = 'admin';

  if (!ADMIN_PASSWORD) {
    throw new Error('[seed] ADMIN_PASSWORD env var is required. Set it in your Railway environment variables.');
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [ADMIN_USERNAME, ADMIN_EMAIL, hash, ADMIN_ROLE]
    );
    console.log('[seed] Admin account created:', ADMIN_EMAIL);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOrderId() {
  return `PR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Calls Midtrans Snap API to create a payment token. */
async function createSnapToken(orderId, email) {
  const auth = Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');
  const response = await fetch(MIDTRANS_SNAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: getEffectivePrice(pricingConfig) },
      customer_details: { email },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Midtrans error ${response.status}: ${data.error_messages ? data.error_messages.join(', ') : JSON.stringify(data)}`);
  }
  return data;
}

/** Signs a JWT for a user row. Returns a fresh token valid for JWT_EXPIRY. */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/** Returns the active license expiry for a user (or null if no active license). */
async function getActiveLicense(userId) {
  const result = await pool.query(
    `SELECT expires_at FROM licenses
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY expires_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].expires_at : null;
}

/** Stacks LICENSE_DAYS days onto existing remaining time (or NOW) for a user. */
async function stackLicense(userId) {
  // Find current expiry if any (must be future)
  const current = await getActiveLicense(userId);
  const base = current ? new Date(current) : new Date();
  const newExpiry = new Date(base.getTime() + LICENSE_DAYS * 24 * 60 * 60 * 1000);

  if (current) {
    // Update the existing active row
    await pool.query(
      `UPDATE licenses SET expires_at = $1
        WHERE user_id = $2 AND expires_at = $3`,
      [newExpiry, userId, current]
    );
  } else {
    // Insert a new license row
    await pool.query(
      'INSERT INTO licenses (user_id, expires_at) VALUES ($1, $2)',
      [userId, newExpiry]
    );
  }
  return newExpiry;
}

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// ─── Clean URL redirects (301) — must be before express.static ───────────────
// Preserves query strings so existing Electron app links (/purchase.html?token=)
// continue to work. Also blocks direct unauthenticated access to admin.html.
app.get('/admin.html', requireAdmin, (req, res) => res.redirect(301, '/admin'));
['/tutorial.html', '/terms.html', '/purchase.html'].forEach(page => {
  app.get(page, (req, res) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, page.replace('.html', '') + qs);
  });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
  }
}

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /register
 * Body: { username, email, password, machineId }
 * Returns: { token, username, email, role, licenseExpiresAt }
 */
app.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, machineId } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 50) {
      return res.status(400).json({ error: 'Username must be between 2 and 50 characters.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMachineId = (machineId && typeof machineId === 'string') ? machineId.trim() : null;

    // Check if this machine has already used a free trial
    if (cleanMachineId) {
      const machineCheck = await pool.query(
        'SELECT id FROM users WHERE machine_id = $1 LIMIT 1',
        [cleanMachineId]
      );
      if (machineCheck.rows.length > 0) {
        return res.status(409).json({ error: 'A free trial has already been used on this device. Please log in to your existing account or purchase a license.' });
      }
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, machine_id) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [cleanUsername, cleanEmail, hash, cleanMachineId]
    );
    const user = result.rows[0];
    const token = signToken(user);

    res.json({ token, username: user.username, email: user.email, role: user.role, licenseExpiresAt: null });
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation
      if (err.constraint && err.constraint.includes('email')) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      if (err.constraint && err.constraint.includes('username')) {
        return res.status(409).json({ error: 'This username is already taken.' });
      }
      return res.status(409).json({ error: 'Account already exists.' });
    }
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /login
 * Body: { email, password }
 * Returns: { token, username, email, role, licenseExpiresAt }
 */
app.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await pool.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const licenseExpiresAt = await getActiveLicense(user.id);
    const token = signToken(user);

    res.json({
      token,
      username: user.username,
      email: user.email,
      role: user.role,
      licenseExpiresAt: licenseExpiresAt ? licenseExpiresAt.toISOString() : null,
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/**
 * GET /me
 * JWT required. Returns current user info + license status + trial status.
 * Also slides the token window (issues a new token in the response).
 * Returns: { token, username, email, role, licenseExpiresAt, trialDaysLeft, trialExpired }
 */
const TRIAL_DAYS = 14;
app.get('/me', requireAuth, async (req, res) => {
  try {
    // Re-fetch user from DB to pick up any role/username changes
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }
    const user = result.rows[0];
    const licenseExpiresAt = await getActiveLicense(user.id);

    // Check if the user has ever had a paid license (regardless of expiry)
    const licenseCountResult = await pool.query(
      'SELECT COUNT(*) FROM licenses WHERE user_id = $1',
      [user.id]
    );
    const hadLicense = parseInt(licenseCountResult.rows[0].count, 10) > 0;

    // Calculate trial status server-side from account creation date
    const daysElapsed = Math.floor((Date.now() - new Date(user.created_at)) / 86400000);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysElapsed);
    const trialExpired = trialDaysLeft === 0;

    // Issue a fresh token (sliding 14-day window)
    const newToken = signToken(user);

    res.json({
      token: newToken,
      username: user.username,
      email: user.email,
      role: user.role,
      licenseExpiresAt: licenseExpiresAt ? licenseExpiresAt.toISOString() : null,
      trialDaysLeft,
      trialExpired,
      hadLicense,
    });
  } catch (err) {
    console.error('[me]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * POST /create-order
 * JWT required.
 * Creates a Midtrans Snap token and stores a pending order linked to the user.
 * Returns: { orderId, snapToken }
 */
app.post('/create-order', requireAuth, createOrderLimiter, async (req, res) => {
  try {
    const userId = req.user.sub;
    const email  = req.user.email;
    const orderId = generateOrderId();

    await pool.query(
      'INSERT INTO orders (order_id, user_id, email) VALUES ($1, $2, $3)',
      [orderId, userId, email]
    );
    console.log(`[create-order] DB insert OK — orderId=${orderId} userId=${userId}`);

    const snap = await createSnapToken(orderId, email);
    console.log(`[create-order] Snap token created — orderId=${orderId}`);

    res.json({
      orderId,
      snapToken: snap.token,
    });
  } catch (err) {
    console.error('[create-order]', err.stack || err.message || err);
    res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  }
});

/**
 * GET /check-order/:orderId
 * JWT required. Polling endpoint — returns payment status.
 */
app.get('/check-order/:orderId', requireAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId.replace(/[^A-Z0-9\-]/gi, '');
    const result = await pool.query(
      'SELECT status, user_id FROM orders WHERE order_id = $1',
      [orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const { status } = result.rows[0];

    // If paid, return current license expiry so the UI can show it
    let licenseExpiresAt = null;
    if (status === 'paid') {
      licenseExpiresAt = await getActiveLicense(req.user.sub);
    }

    res.json({
      status,
      licenseExpiresAt: licenseExpiresAt ? licenseExpiresAt.toISOString() : null,
    });
  } catch (err) {
    console.error('[check-order]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /midtrans-webhook
 * Midtrans HTTP notification. Verifies signature and stacks license onto user account.
 */
app.post('/midtrans-webhook', async (req, res) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = req.body;

    const expectedSig = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    if (expectedSig !== signature_key) {
      console.warn('[webhook] Invalid signature for order:', order_id);
      return res.status(403).json({ error: 'Invalid signature.' });
    }

    const isPaid =
      (transaction_status === 'capture' && fraud_status === 'accept') ||
      transaction_status === 'settlement';

    if (isPaid) {
      const existing = await pool.query(
        'SELECT status, user_id FROM orders WHERE order_id = $1',
        [order_id]
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'pending') {
        const { user_id } = existing.rows[0];
        await pool.query(
          "UPDATE orders SET status = 'paid', recovered_at = NOW() WHERE order_id = $1",
          [order_id]
        );
        if (user_id) {
          const newExpiry = await stackLicense(user_id);
          console.log(`[webhook] Order ${order_id} paid. License stacked until ${newExpiry.toISOString()} for user ${user_id}.`);
        }
      }
    } else if (['expire', 'cancel', 'deny'].includes(transaction_status)) {
      await pool.query(
        "UPDATE orders SET status = $1 WHERE order_id = $2 AND status = 'pending'",
        [transaction_status, order_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── Admin Basic Auth Middleware ──────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin panel not configured. Set ADMIN_PASSWORD env var.' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Packing Recorder Admin"');
    return res.status(401).send('Authentication required.');
  }
  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const colonIdx = decoded.indexOf(':');
  const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
  if (password !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Packing Recorder Admin"');
    return res.status(401).send('Invalid password.');
  }
  next();
}

// ─── Admin Routes ─────────────────────────────────────────────────────────────

/**
 * GET /admin
 * Serves the admin panel HTML — no server-side auth here; the page handles
 * its own login gate and sends Basic credentials on every API call.
 */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/**
 * POST /admin/verify
 * Public. Validates the admin password without performing any action.
 * Returns 200 on success, 401 on wrong password. Used by the in-page login form.
 */
app.post('/admin/verify', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

/**
 * POST /admin/lookup-user
 * Body: { email }
 * Returns user info + license status + paid orders.
 */
app.post('/admin/lookup-user', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const userResult = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];
    const licenseExpiresAt = await getActiveLicense(user.id);

    const ordersResult = await pool.query(
      `SELECT order_id, status, created_at, recovered_at
         FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      licenseExpiresAt: licenseExpiresAt ? licenseExpiresAt.toISOString() : null,
      orders: ordersResult.rows,
    });
  } catch (err) {
    console.error('[admin/lookup-user]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * POST /admin/grant-license
 * Body: { email }
 * Manually stacks 30 days onto the user's license.
 */
app.post('/admin/grant-license', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const userResult = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];
    const newExpiry = await stackLicense(user.id);

    console.log(`[admin] Manually granted 30 days to ${user.email}. New expiry: ${newExpiry.toISOString()}`);
    res.json({
      success: true,
      username: user.username,
      email: user.email,
      newExpiresAt: newExpiry.toISOString(),
    });
  } catch (err) {
    console.error('[admin/grant-license]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * POST /recover-license
 * JWT required. Finds any paid orders for this user that haven't been recovered yet
 * and stacks the license for each one. Marks them as recovered to prevent double-stacking.
 * Returns: { recovered: boolean, licenseExpiresAt: string|null, count: number }
 */
app.post('/recover-license', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;

    // Find paid orders not yet recovered for this user
    const ordersResult = await pool.query(
      `SELECT id, order_id FROM orders
         WHERE user_id = $1 AND status = 'paid' AND recovered_at IS NULL`,
      [userId]
    );

    if (ordersResult.rows.length === 0) {
      return res.json({ recovered: false, count: 0, licenseExpiresAt: null });
    }

    // Stack license for each unrecovered paid order
    let newExpiry = null;
    for (const order of ordersResult.rows) {
      newExpiry = await stackLicense(userId);
      await pool.query(
        'UPDATE orders SET recovered_at = NOW() WHERE id = $1',
        [order.id]
      );
      console.log(`[recover] Order ${order.order_id} recovered for user ${userId}. Expiry: ${newExpiry.toISOString()}`);
    }

    res.json({
      recovered: true,
      count: ordersResult.rows.length,
      licenseExpiresAt: newExpiry ? newExpiry.toISOString() : null,
    });
  } catch (err) {
    console.error('[recover-license]', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});


// ─── App version ──────────────────────────────────────────────────────────────

// GET /latest-version — public, returns current app version
app.get('/latest-version', async (req, res) => {
  try {
    const result = await pool.query(`SELECT value FROM app_meta WHERE key = 'app_version'`);
    const version = result.rows.length > 0 ? result.rows[0].value : null;
    res.json({ version });
  } catch (err) {
    console.error('[latest-version]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /set-version — protected by VERSION_UPDATE_TOKEN, called by CI after each release
app.post('/set-version', async (req, res) => {
  const token = process.env.VERSION_UPDATE_TOKEN;
  const auth  = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token || auth !== token) return res.status(401).json({ error: 'Unauthorized.' });

  const { version } = req.body;
  if (!version || typeof version !== 'string') return res.status(400).json({ error: 'version required.' });

  try {
    await pool.query(
      `INSERT INTO app_meta (key, value) VALUES ('app_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [version]
    );
    console.log(`[set-version] App version set to ${version}`);
    res.json({ ok: true, version });
  } catch (err) {
    console.error('[set-version]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});


// ─── Pricing ──────────────────────────────────────────────────────────────────

/**
 * GET /pricing
 * Public. Returns current pricing config and effective price.
 */
app.get('/pricing', (req, res) => {
  const promoActive = isPromoActive(pricingConfig);
  res.json({
    publishedPrice: pricingConfig.publishedPrice,
    rsp:            pricingConfig.rsp,
    promoLabelId:   pricingConfig.promoLabelId,
    promoLabelEn:   pricingConfig.promoLabelEn,
    promoEndsAt:    pricingConfig.promoEndsAt,
    effectivePrice: getEffectivePrice(pricingConfig),
    promoActive,
    paymentDisabled: PAYMENT_DISABLED,
    clientKey: MIDTRANS_CLIENT_KEY,
  });
});

/**
 * POST /admin/set-pricing
 * Admin protected. Updates pricing config in app_meta and in memory.
 * Body: { publishedPrice, rsp, promoLabelId, promoLabelEn, promoEndsAt }
 */
app.post('/admin/set-pricing', requireAdmin, async (req, res) => {
  try {
    const { publishedPrice, rsp, promoLabelId, promoLabelEn, promoEndsAt } = req.body;

    if (!publishedPrice || !rsp || isNaN(publishedPrice) || isNaN(rsp)) {
      return res.status(400).json({ error: 'publishedPrice and rsp must be valid numbers.' });
    }
    if (publishedPrice < 1 || rsp < 1) {
      return res.status(400).json({ error: 'Prices must be greater than 0.' });
    }

    const newConfig = {
      publishedPrice: parseInt(publishedPrice, 10),
      rsp:            parseInt(rsp, 10),
      promoLabelId:   (promoLabelId || '').trim() || DEFAULT_PRICING.promoLabelId,
      promoLabelEn:   (promoLabelEn || '').trim() || DEFAULT_PRICING.promoLabelEn,
      promoEndsAt:    promoEndsAt || null,
    };

    await pool.query(
      `INSERT INTO app_meta (key, value) VALUES ('pricing_config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(newConfig)]
    );

    pricingConfig = newConfig;
    console.log('[pricing] Config updated:', newConfig);

    res.json({
      success: true,
      ...newConfig,
      effectivePrice: getEffectivePrice(newConfig),
      promoActive: isPromoActive(newConfig),
    });
  } catch (err) {
    console.error('[admin/set-pricing]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});


initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Packing Recorder license server running on port ${PORT}`);
      console.log(`Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
