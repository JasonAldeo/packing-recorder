'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const IS_PRODUCTION = process.env.MIDTRANS_ENVIRONMENT === 'production';
const MIDTRANS_BASE_URL = IS_PRODUCTION
  ? 'https://api.midtrans.com/v2'
  : 'https://api.sandbox.midtrans.com/v2';
const PRODUCT_PRICE = 55000; // IDR

// ─── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id          SERIAL PRIMARY KEY,
      order_id    VARCHAR(60)  UNIQUE NOT NULL,
      email       VARCHAR(255) NOT NULL,
      status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
      license_key VARCHAR(50),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activations (
      id            SERIAL PRIMARY KEY,
      license_key   VARCHAR(50)  NOT NULL,
      machine_id    VARCHAR(100) NOT NULL,
      activated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE(license_key, machine_id)
    )
  `);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Generates a key in XXXX-XXXX-XXXX-XXXX format using cryptographically secure random bytes. */
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () => {
    const bytes = crypto.randomBytes(4);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  };
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

/** Generates a unique order ID. */
function generateOrderId() {
  return `PR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Calls Midtrans Core API to create a QRIS charge and returns the response JSON. */
async function createMidtransQRIS(orderId, email) {
  const auth = Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');
  const response = await fetch(`${MIDTRANS_BASE_URL}/charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({
      payment_type: 'qris',
      transaction_details: {
        order_id: orderId,
        gross_amount: PRODUCT_PRICE,
      },
      qris: { acquirer: 'gopay' },
      customer_details: { email },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Midtrans error ${response.status}: ${data.status_message || JSON.stringify(data)}`);
  }
  return data;
}

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiters
const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { valid: false, message: 'Too many requests, please try again later.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /create-order
 * Body: { email: string }
 * Creates a Midtrans QRIS charge and stores a pending order.
 * Returns: { orderId, qrCodeUrl, expiryTime }
 */
app.post('/create-order', createOrderLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const orderId = generateOrderId();

    // Persist pending order before calling Midtrans to prevent orphaned records
    await pool.query(
      'INSERT INTO orders (order_id, email) VALUES ($1, $2)',
      [orderId, email]
    );

    const charge = await createMidtransQRIS(orderId, email);

    res.json({
      orderId,
      qrCodeUrl: charge.qr_code_url,
      expiryTime: charge.expiry_time,
    });
  } catch (err) {
    console.error('[create-order]', err.message);
    res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  }
});

/**
 * GET /check-order/:orderId
 * Polling endpoint — returns payment status and license key (once paid).
 */
app.get('/check-order/:orderId', async (req, res) => {
  try {
    // Sanitize input
    const orderId = req.params.orderId.replace(/[^A-Z0-9\-]/gi, '');
    const result = await pool.query(
      'SELECT status, license_key FROM orders WHERE order_id = $1',
      [orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const { status, license_key } = result.rows[0];
    res.json({
      status,
      licenseKey: status === 'paid' ? license_key : null,
    });
  } catch (err) {
    console.error('[check-order]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /midtrans-webhook
 * Midtrans HTTP notification. Verifies signature and marks order as paid.
 * Configure this URL in: Midtrans Dashboard → Settings → Configuration → Payment Notification URL
 */
app.post('/midtrans-webhook', async (req, res) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = req.body;

    // Verify Midtrans signature: SHA512(order_id + status_code + gross_amount + server_key)
    const expectedSig = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    if (expectedSig !== signature_key) {
      console.warn('[webhook] Invalid signature for order:', order_id);
      return res.status(403).json({ error: 'Invalid signature.' });
    }

    // Determine if this is a successful payment
    const isPaid =
      (transaction_status === 'capture' && fraud_status === 'accept') ||
      transaction_status === 'settlement';

    if (isPaid) {
      const existing = await pool.query(
        'SELECT status FROM orders WHERE order_id = $1',
        [order_id]
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'pending') {
        const licenseKey = generateLicenseKey();
        await pool.query(
          'UPDATE orders SET status = $1, license_key = $2 WHERE order_id = $3',
          ['paid', licenseKey, order_id]
        );
        console.log(`[webhook] Order ${order_id} marked as paid. Key generated.`);
      }
    } else if (transaction_status === 'expire' || transaction_status === 'cancel' || transaction_status === 'deny') {
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

/**
 * POST /validate-license
 * Called by the Electron app on startup to validate a license key.
 * Body: { key: string, machineId: string }
 * Returns: { valid: boolean, message: string }
 */
app.post('/validate-license', validateLimiter, async (req, res) => {
  try {
    const { key, machineId } = req.body;
    if (!key || !machineId || typeof key !== 'string' || typeof machineId !== 'string') {
      return res.status(400).json({ valid: false, message: 'Missing parameters.' });
    }

    // Sanitize
    const cleanKey = key.trim().toUpperCase().slice(0, 50);
    const cleanMachineId = machineId.trim().slice(0, 100);

    // Check key exists and is paid
    const orderResult = await pool.query(
      "SELECT license_key FROM orders WHERE license_key = $1 AND status = 'paid'",
      [cleanKey]
    );
    if (orderResult.rows.length === 0) {
      return res.json({ valid: false, message: 'License key not found or not yet activated.' });
    }

    // Check activations for this key
    const activationResult = await pool.query(
      'SELECT machine_id FROM activations WHERE license_key = $1',
      [cleanKey]
    );

    if (activationResult.rows.length === 0) {
      // First time activation — register this machine
      await pool.query(
        'INSERT INTO activations (license_key, machine_id) VALUES ($1, $2)',
        [cleanKey, cleanMachineId]
      );
      return res.json({ valid: true, message: 'License activated successfully. Thank you!' });
    }

    // Already activated — verify it's the same machine
    if (activationResult.rows[0].machine_id === cleanMachineId) {
      return res.json({ valid: true, message: 'License valid.' });
    }

    return res.json({
      valid: false,
      message: 'This license key is already activated on another machine. Please contact support.',
    });
  } catch (err) {
    console.error('[validate-license]', err.message);
    res.status(500).json({ valid: false, message: 'Server error. Please try again later.' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
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
