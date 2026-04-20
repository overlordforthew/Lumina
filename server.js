try { require('dotenv/config'); } catch (e) {}
const compression = require('compression');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '15mb' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach((pair) => {
      try {
        const [name, ...rest] = pair.trim().split('=');
        if (name) req.cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
      } catch {
        // Ignore malformed cookies
      }
    });
  }
  next();
});

const DB_SCHEMA = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(process.env.DB_SCHEMA || 'lumina')
  ? (process.env.DB_SCHEMA || 'lumina')
  : 'lumina';
const DB_SCHEMA_IDENT = `"${DB_SCHEMA}"`;

const pool = new Pool({
  host: process.env.DB_HOST || 'namibarden-db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'namibarden',
  user: process.env.DB_USER || 'namibarden',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  options: `-c search_path=${DB_SCHEMA},public`,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

const JWT_SECRET = process.env.JWT_SECRET || 'lumina-change-this-secret-in-production';
const PORT = process.env.PORT || 3456;
const BASE = '';
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://lumina.namibarden.com').replace(/\/+$/, '');
const NAMI_API_BASE = (process.env.NAMI_API_BASE || 'https://namibarden.com/api/internal/lumina').replace(/\/+$/, '');
const NAMI_LUMINA_BRIDGE_SECRET = process.env.NAMI_LUMINA_BRIDGE_SECRET || '';
const LUMINA_ENABLE_TEST_USER = process.env.LUMINA_ENABLE_TEST_USER === '1';
const BILLING_CACHE_TTL = 60000;
const LEGACY_TOKEN_KEY = 'lumina_token';
const PUBLIC_DIR = path.join(__dirname, 'public');
const ALLOWED_ANALYTICS_EVENTS = new Set([
  'auth_login_completed',
  'auth_screen_viewed',
  'auth_signup_completed',
  'billing_access_granted',
  'billing_checkout_returned',
  'billing_checkout_started',
  'billing_portal_opened',
  'billing_refresh_requested',
  'billing_screen_viewed',
  'checkin_saved',
  'day_completed',
  'reflection_saved',
  'weekly_synthesis_viewed'
]);

const AUTH_COOKIE_NAME = 'lumina_auth_token';
const COOKIE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

const billingCache = new Map();
const rateLimits = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function getIP(req) {
  return req.headers['x-real-ip'] || req.ip;
}

function logRequestError(msg, err, req) {
  const ctx = {
    method: req.method,
    path: req.originalUrl || req.url,
    userId: req.user?.id || null,
    ip: getIP(req)
  };
  console.error(`[lumina] ${msg}:`, err.message, ctx, err.stack);
}

function handleServerError(res, err, code, fallbackMsg) {
  res.status(500).json({ error: fallbackMsg || 'Server error', code: code });
}

function rateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const entry = rateLimits.get(key) || { attempts: [] };
  entry.attempts = entry.attempts.filter((t) => now - t < windowMs);
  if (entry.attempts.length >= maxAttempts) return false;
  entry.attempts.push(now);
  rateLimits.set(key, entry);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    entry.attempts = entry.attempts.filter((t) => now - t < 3600000);
    if (entry.attempts.length === 0) rateLimits.delete(key);
  }
  for (const [key, entry] of billingCache.entries()) {
    if (now - entry.ts > BILLING_CACHE_TTL) billingCache.delete(key);
  }
}, 300000);

function setAuthCookie(res, token) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(COOKIE_MAX_AGE_MS / 1000)}`
  ];
  if (IS_PROD) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  const parts = [`${AUTH_COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (IS_PROD) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function signUserToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '180d' });
}

function auth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    const code = e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    logRequestError('Auth token error', e, req);
    res.status(401).json({ error: code === 'TOKEN_EXPIRED' ? 'Token expired' : 'Invalid token', code });
  }
}

function getOptionalAuthUser(req) {
  const token = req.cookies?.[AUTH_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function validateDayParam(day) {
  const dayNum = parseInt(day, 10);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) return null;
  return dayNum;
}

function sanitizeAnalyticsValue(value, depth) {
  const nextDepth = depth || 0;
  if (nextDepth > 3) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 400);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitizeAnalyticsValue(item, nextDepth + 1)).filter((item) => item !== null);
  }
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).slice(0, 16).forEach((key) => {
      const safeKey = String(key || '').trim().slice(0, 80);
      if (!safeKey) return;
      const safeValue = sanitizeAnalyticsValue(value[key], nextDepth + 1);
      if (safeValue !== null) result[safeKey] = safeValue;
    });
    return result;
  }
  return null;
}

function sanitizeAnalyticsProperties(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return sanitizeAnalyticsValue(input, 0) || {};
}

function buildUserPayload(row) {
  return {
    email: row.email,
    name: row.name,
    lang: row.lang,
    startDate: row.start_date
  };
}

async function namiRequest(pathname, body) {
  if (!NAMI_LUMINA_BRIDGE_SECRET) {
    return {
      configured: false,
      entitlement: {
        hasAccess: false,
        accessState: 'unconfigured',
        planCode: null,
        status: 'unconfigured'
      }
    };
  }

  let response;
  try {
    response = await fetch(`${NAMI_API_BASE}${pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lumina-Bridge-Key': NAMI_LUMINA_BRIDGE_SECRET
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('[lumina] Billing service unreachable:', err.message);
    throw new Error('Billing service unavailable');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Unexpected response from billing service.');
  }
  if (!response.ok) {
    throw new Error(data.error || 'Billing service request failed.');
  }
  return data;
}

async function getBillingStatusForEmail(email, options) {
  const opts = options || {};
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) {
    return {
      configured: !!NAMI_LUMINA_BRIDGE_SECRET,
      entitlement: {
        hasAccess: false,
        accessState: 'inactive',
        planCode: null,
        status: 'inactive'
      }
    };
  }

  const cached = billingCache.get(safeEmail);
  if (!opts.force && cached && Date.now() - cached.ts < BILLING_CACHE_TTL) {
    return cached.value;
  }

  const value = await namiRequest('/entitlement', { email: safeEmail });
  billingCache.set(safeEmail, { value, ts: Date.now() });
  return value;
}

async function createBillingPortal(email, returnUrl) {
  const safeEmail = normalizeEmail(email);
  const result = await namiRequest('/customer-portal', {
    email: safeEmail,
    return_url: returnUrl || `${APP_BASE_URL}/`
  });
  billingCache.delete(safeEmail);
  return result;
}

function serializeMap(rows, serializer) {
  const result = {};
  rows.forEach((row) => {
    result[row.day_num] = serializer(row);
  });
  return result;
}

function toISOStringOrNull(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toISOString === 'function') return value.toISOString();
  return String(value);
}

// Static files
app.use(BASE, express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/\.(html|xml|txt)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return;
    }
    if (/\.(js|css|svg|json)$/i.test(filePath)) {
      res.setHeader(
        'Cache-Control',
        IS_PROD
          ? 'public, max-age=86400, stale-while-revalidate=604800'
          : 'public, max-age=0, must-revalidate'
      );
    }
  }
}));

app.get(BASE + '/favicon.ico', (req, res) => {
  res.redirect(308, '/favicon.svg');
});

// Auth routes
app.post(BASE + '/api/auth/signup', async (req, res) => {
  try {
    const ip = getIP(req);
    if (!rateLimit(`auth-signup:${ip}`, 5, 300000)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    const lang = req.body?.lang === 'ja' ? 'ja' : 'en';

    if (!email || !name || !password) return res.status(400).json({ error: 'fillAll' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'invalidEmail' });
    if (password.length < 8) return res.status(400).json({ error: 'passwordShort' });

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'exists' });

    const hash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      `INSERT INTO users (email, name, password_hash, lang, start_date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING id, email, name, lang, start_date`,
      [email, name, hash, lang]
    );

    const user = inserted.rows[0];
    const token = signUserToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: buildUserPayload(user), legacyTokenKey: LEGACY_TOKEN_KEY });
  } catch (e) {
    logRequestError('Signup error', e, req);
    handleServerError(res, e, 'AUTH_SIGNUP_ERROR');
  }
});

app.post(BASE + '/api/auth/login', async (req, res) => {
  try {
    const ip = getIP(req);
    if (!rateLimit(`auth-login:${ip}`, 8, 300000)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'fillAll' });

    const result = await pool.query(
      'SELECT id, email, name, lang, start_date, password_hash FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'noAccount' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'wrongPw' });

    const token = signUserToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: buildUserPayload(user), legacyTokenKey: LEGACY_TOKEN_KEY });
  } catch (e) {
    logRequestError('Login error', e, req);
    handleServerError(res, e, 'AUTH_LOGIN_ERROR');
  }
});

app.post(BASE + '/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get(BASE + '/api/auth/session', async (req, res) => {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.json(null);
    let authUser;
    try {
      authUser = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.json(null);
    }
    const result = await pool.query(
      'SELECT id, email, name, lang, start_date FROM users WHERE id = $1 LIMIT 1',
      [authUser.id]
    );
    if (result.rows.length === 0) return res.json(null);
    res.json(buildUserPayload(result.rows[0]));
  } catch (e) {
    logRequestError('Session error', e, req);
    handleServerError(res, e, 'SESSION_ERROR');
  }
});

// Billing routes
app.get(BASE + '/api/billing/status', auth, async (req, res) => {
  try {
    const refresh = req.query.refresh === '1';
    if (refresh) billingCache.delete(normalizeEmail(req.user.email));
    const data = await getBillingStatusForEmail(req.user.email, { force: refresh });
    res.json(data);
  } catch (e) {
    logRequestError('Billing status error', e, req);
    handleServerError(res, e, 'BILLING_STATUS_ERROR', e.message || 'Billing status unavailable');
  }
});

app.post(BASE + '/api/billing/portal', auth, async (req, res) => {
  try {
    const returnUrl = req.body?.return_url || `${APP_BASE_URL}/`;
    const data = await createBillingPortal(req.user.email, returnUrl);
    res.json(data);
  } catch (e) {
    logRequestError('Billing portal error', e, req);
    const status = e.message === 'No subscription found for this email' ? 404 : 500;
    res.status(status).json({ error: e.message || 'Billing portal unavailable', code: 'BILLING_PORTAL_ERROR' });
  }
});

app.post(BASE + '/api/internal/entitlement-cache-bust', async (req, res) => {
  if (!NAMI_LUMINA_BRIDGE_SECRET) return res.status(503).json({ error: 'Bridge not configured' });
  if (req.headers['x-lumina-bridge-key'] !== NAMI_LUMINA_BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email required' });
  billingCache.delete(email);
  res.json({ ok: true });
});

app.post(BASE + '/api/analytics/track', async (req, res) => {
  try {
    const ip = getIP(req);
    if (!rateLimit(`analytics:${ip}`, 180, 900000)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const eventName = String(req.body?.event || '').trim();
    if (!ALLOWED_ANALYTICS_EVENTS.has(eventName)) {
      return res.status(400).json({ error: 'Invalid event' });
    }

    const sessionId = String(req.body?.session_id || '').trim().slice(0, 80);
    if (!sessionId) return res.status(400).json({ error: 'Session id required' });

    const authUser = getOptionalAuthUser(req);
    const email = normalizeEmail(authUser?.email || req.body?.email || '');
    const source = String(req.body?.source || 'app').trim().slice(0, 40) || 'app';
    const pagePath = String(req.body?.page_path || '').trim().slice(0, 255) || null;
    const properties = sanitizeAnalyticsProperties(req.body?.properties);

    await pool.query(
      `INSERT INTO analytics_events (
         user_id, email, session_id, event_name, event_source, page_path, ip, user_agent, properties
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        authUser?.id || null,
        email || null,
        sessionId,
        eventName,
        source,
        pagePath,
        ip || null,
        String(req.headers['user-agent'] || '').slice(0, 500) || null,
        JSON.stringify(properties)
      ]
    );

    res.json({ ok: true });
  } catch (e) {
    logRequestError('Analytics track error', e, req);
    handleServerError(res, e, 'ANALYTICS_TRACK_ERROR');
  }
});

// User routes
app.put(BASE + '/api/user/lang', auth, async (req, res) => {
  try {
    const lang = req.body?.lang === 'ja' ? 'ja' : 'en';
    await pool.query('UPDATE users SET lang = $1 WHERE id = $2', [lang, req.user.id]);
    res.json({ ok: true, lang });
  } catch (e) {
    logRequestError('Update lang error', e, req);
    handleServerError(res, e, 'UPDATE_LANG_ERROR');
  }
});

app.get(BASE + '/api/account/export', auth, async (req, res) => {
  try {
    const ip = getIP(req);
    if (!rateLimit(`account-export:${req.user.id}:${ip}`, 6, 3600000)) {
      return res.status(429).json({ error: 'Too many export requests. Please try again later.' });
    }

    const userResult = await pool.query(
      'SELECT id, email, name, lang, start_date, created_at, updated_at FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const results = await Promise.allSettled([
      pool.query(
        'SELECT day_num, completed_at FROM progress WHERE user_id = $1 ORDER BY day_num',
        [req.user.id]
      ),
      pool.query(
        `SELECT day_num, state, energy, intention, note, created_at, updated_at
         FROM checkins
         WHERE user_id = $1
         ORDER BY day_num`,
        [req.user.id]
      ),
      pool.query(
        `SELECT day_num, body, favorite, created_at, updated_at
         FROM reflections
         WHERE user_id = $1
         ORDER BY day_num`,
        [req.user.id]
      ),
      pool.query(
        'SELECT day_num, audio_data FROM audio WHERE user_id = $1 ORDER BY day_num',
        [req.user.id]
      ),
      pool.query(
        `SELECT event_name, event_source, page_path, properties, created_at
         FROM analytics_events
         WHERE user_id = $1 OR LOWER(email) = $2
         ORDER BY created_at ASC`,
        [req.user.id, normalizeEmail(req.user.email)]
      ),
      getBillingStatusForEmail(req.user.email).catch(() => null)
    ]);
    const [progressResult, checkinsResult, reflectionsResult, audioResult, analyticsResult, billingResult] = results.map(r => r.status === 'fulfilled' ? r.value : { rows: [] });

    const userRow = userResult.rows[0];
    const payload = {
      app: 'lumina',
      exportedAt: new Date().toISOString(),
      profile: {
        email: userRow.email,
        name: userRow.name,
        lang: userRow.lang,
        startDate: userRow.start_date,
        createdAt: toISOStringOrNull(userRow.created_at),
        updatedAt: toISOStringOrNull(userRow.updated_at)
      },
      membership: billingResult && billingResult.entitlement ? billingResult.entitlement : null,
      progress: progressResult.rows.map((row) => ({
        dayNum: row.day_num,
        completedAt: toISOStringOrNull(row.completed_at)
      })),
      checkins: checkinsResult.rows.map((row) => ({
        dayNum: row.day_num,
        state: row.state,
        energy: row.energy,
        intention: row.intention,
        note: row.note,
        createdAt: toISOStringOrNull(row.created_at),
        updatedAt: toISOStringOrNull(row.updated_at)
      })),
      reflections: reflectionsResult.rows.map((row) => ({
        dayNum: row.day_num,
        body: row.body,
        favorite: !!row.favorite,
        createdAt: toISOStringOrNull(row.created_at),
        updatedAt: toISOStringOrNull(row.updated_at)
      })),
      audio: audioResult.rows.map((row) => ({
        dayNum: row.day_num,
        data: row.audio_data
      })),
      analytics: analyticsResult.rows.map((row) => ({
        event: row.event_name,
        source: row.event_source,
        pagePath: row.page_path,
        properties: row.properties || {},
        createdAt: toISOStringOrNull(row.created_at)
      })),
      notes: [
        'This export covers your Lumina app data and usage history stored in the Lumina service.',
        'Subscription, invoice, and payment records may also remain in NamiBarden and Stripe where required for accounting, fraud prevention, or legal compliance.'
      ]
    };

    const filename = `lumina-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    logRequestError('Account export error', e, req);
    handleServerError(res, e, 'ACCOUNT_EXPORT_ERROR', 'Unable to export account data right now.');
  }
});

app.post(BASE + '/api/account/delete', auth, async (req, res) => {
  const ip = getIP(req);
  if (!rateLimit(`account-delete:${req.user.id}:${ip}`, 6, 3600000)) {
    return res.status(429).json({ error: 'Too many delete attempts. Please try again later.' });
  }

  const password = String(req.body?.password || '');
  const confirmText = String(req.body?.confirm_text || '').trim();
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (confirmText !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm account removal.' });

  let client;
  try {
    const userResult = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      clearAuthCookie(res);
      return res.json({ ok: true });
    }

    const userRow = userResult.rows[0];
    const passwordValid = await bcrypt.compare(password, userRow.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const billing = await getBillingStatusForEmail(userRow.email, { force: true }).catch(() => null);
    const entitlement = billing && billing.entitlement ? billing.entitlement : null;
    const renewalStillActive = entitlement &&
      entitlement.hasAccess &&
      String(entitlement.status || '').toLowerCase() !== 'lifetime' &&
      !entitlement.cancelAt &&
      !entitlement.canceledAt;
    if (renewalStillActive) {
      return res.status(409).json({ error: 'Please cancel your Lumina membership in Manage billing before deleting this account.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM analytics_events WHERE user_id = $1 OR LOWER(email) = $2',
      [userRow.id, normalizeEmail(userRow.email)]
    );
    await client.query('DELETE FROM users WHERE id = $1', [userRow.id]);
    await client.query('COMMIT');

    billingCache.delete(normalizeEmail(userRow.email));
    clearAuthCookie(res);
    res.json({ ok: true });
  } catch (e) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    logRequestError('Account delete error', e, req);
    handleServerError(res, e, 'ACCOUNT_DELETE_ERROR', 'Unable to delete this account right now.');
  } finally {
    if (client) client.release();
  }
});

// Progress routes
app.get(BASE + '/api/progress', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT day_num, completed_at FROM progress WHERE user_id = $1 ORDER BY day_num',
      [req.user.id]
    );
    res.json(serializeMap(result.rows, (row) => ({ completedAt: row.completed_at.toISOString() })));
  } catch (e) {
    logRequestError('Get progress error', e, req);
    handleServerError(res, e, 'GET_PROGRESS_ERROR');
  }
});

app.post(BASE + '/api/progress/:day', auth, async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });

    await pool.query(
      'INSERT INTO progress (user_id, day_num) VALUES ($1, $2) ON CONFLICT (user_id, day_num) DO NOTHING',
      [req.user.id, dayNum]
    );
    res.json({ ok: true, day: dayNum });
  } catch (e) {
    logRequestError('Complete day error', e, req);
    handleServerError(res, e, 'COMPLETE_DAY_ERROR');
  }
});

// Daily check-ins
app.get(BASE + '/api/checkins', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT day_num, state, energy, intention, note, created_at, updated_at
       FROM checkins
       WHERE user_id = $1
       ORDER BY day_num`,
      [req.user.id]
    );
    res.json(serializeMap(result.rows, (row) => ({
      state: row.state,
      energy: row.energy,
      intention: row.intention,
      note: row.note,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at
    })));
  } catch (e) {
    logRequestError('Get checkins error', e, req);
    handleServerError(res, e, 'GET_CHECKINS_ERROR');
  }
});

app.put(BASE + '/api/checkins/:day', auth, async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });

    const state = String(req.body?.state || '').trim() || 'ground';
    const energy = Math.min(Math.max(parseInt(req.body?.energy, 10) || 3, 1), 5);
    const intention = String(req.body?.intention || '').trim().slice(0, 180);
    const note = String(req.body?.note || '').trim().slice(0, 800);

    await pool.query(
      `INSERT INTO checkins (user_id, day_num, state, energy, intention, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, day_num) DO UPDATE SET
         state = EXCLUDED.state,
         energy = EXCLUDED.energy,
         intention = EXCLUDED.intention,
         note = EXCLUDED.note,
         updated_at = NOW()`,
      [req.user.id, dayNum, state, energy, intention || null, note || null]
    );
    res.json({ ok: true, day: dayNum });
  } catch (e) {
    logRequestError('Save checkin error', e, req);
    handleServerError(res, e, 'SAVE_CHECKIN_ERROR');
  }
});

// Reflections
app.get(BASE + '/api/reflections', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT day_num, body, favorite, created_at, updated_at
       FROM reflections
       WHERE user_id = $1
       ORDER BY day_num`,
      [req.user.id]
    );
    res.json(serializeMap(result.rows, (row) => ({
      body: row.body,
      favorite: !!row.favorite,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at
    })));
  } catch (e) {
    logRequestError('Get reflections error', e, req);
    handleServerError(res, e, 'GET_REFLECTIONS_ERROR');
  }
});

app.put(BASE + '/api/reflections/:day', auth, async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });

    const body = String(req.body?.body || '').trim().slice(0, 12000);
    const favorite = !!req.body?.favorite;

    await pool.query(
      `INSERT INTO reflections (user_id, day_num, body, favorite)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, day_num) DO UPDATE SET
         body = EXCLUDED.body,
         favorite = EXCLUDED.favorite,
         updated_at = NOW()`,
      [req.user.id, dayNum, body, favorite]
    );
    res.json({ ok: true, day: dayNum });
  } catch (e) {
    logRequestError('Save reflection error', e, req);
    handleServerError(res, e, 'SAVE_REFLECTION_ERROR');
  }
});

// Audio routes
app.get(BASE + '/api/audio/:day', auth, async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });
    const result = await pool.query(
      'SELECT audio_data FROM audio WHERE user_id = $1 AND day_num = $2',
      [req.user.id, dayNum]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No audio' });
    res.json({ data: result.rows[0].audio_data });
  } catch (e) {
    logRequestError('Get audio error', e, req);
    handleServerError(res, e, 'GET_AUDIO_ERROR');
  }
});

app.post(BASE + '/api/audio/:day', auth, async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });
    const data = req.body?.data;
    if (!data) return res.status(400).json({ error: 'No audio data' });

    await pool.query(
      `INSERT INTO audio (user_id, day_num, audio_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, day_num) DO UPDATE SET audio_data = EXCLUDED.audio_data`,
      [req.user.id, dayNum, data]
    );
    res.json({ ok: true });
  } catch (e) {
    logRequestError('Save audio error', e, req);
    handleServerError(res, e, 'SAVE_AUDIO_ERROR');
  }
});

// Image routes (shared by all users)
app.get(BASE + '/api/image/:day', async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });
    const result = await pool.query('SELECT image_data FROM images WHERE day_num = $1', [dayNum]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No image' });
    res.json({ data: result.rows[0].image_data });
  } catch (e) {
    logRequestError('Get image error', e, req);
    handleServerError(res, e, 'GET_IMAGE_ERROR');
  }
});

app.post(BASE + '/api/image/:day', auth, async (req, res) => {
  try {
    const dayNum = validateDayParam(req.params.day);
    if (!dayNum) return res.status(400).json({ error: 'Invalid day' });
    const data = req.body?.data;
    if (!data) return res.status(400).json({ error: 'No image data' });

    await pool.query(
      `INSERT INTO images (day_num, image_data)
       VALUES ($1, $2)
       ON CONFLICT (day_num) DO UPDATE SET image_data = EXCLUDED.image_data`,
      [dayNum, data]
    );
    res.json({ ok: true });
  } catch (e) {
    logRequestError('Save image error', e, req);
    handleServerError(res, e, 'SAVE_IMAGE_ERROR');
  }
});

// SPA fallback
app.get(BASE + '/*', (req, res) => {
  if (path.extname(req.path || '')) return res.status(404).end();
  if (!(req.headers.accept || '').includes('text/html')) return res.status(404).end();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to load application' });
    }
  });
});
app.get(BASE, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to load application' });
    }
  });
});

app.use((err, req, res, next) => {
  logRequestError('Unhandled route error', err, req);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', code: 'UNHANDLED_ERROR' });
  }
});

async function initDB() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA_IDENT}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      lang VARCHAR(10) DEFAULT 'en',
      start_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_num INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, day_num)
    );

    CREATE TABLE IF NOT EXISTS audio (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_num INTEGER NOT NULL,
      audio_data TEXT NOT NULL,
      UNIQUE(user_id, day_num)
    );

    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      day_num INTEGER UNIQUE NOT NULL,
      image_data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_num INTEGER NOT NULL,
      state VARCHAR(50) NOT NULL DEFAULT 'ground',
      energy INTEGER DEFAULT 3,
      intention VARCHAR(180),
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, day_num)
    );

    CREATE TABLE IF NOT EXISTS reflections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_num INTEGER NOT NULL,
      body TEXT DEFAULT '',
      favorite BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, day_num)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(255),
      session_id VARCHAR(80) NOT NULL,
      event_name VARCHAR(80) NOT NULL,
      event_source VARCHAR(40) DEFAULT 'app',
      page_path VARCHAR(255),
      ip VARCHAR(80),
      user_agent TEXT,
      properties JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_lumina_progress_user_day ON progress(user_id, day_num);
    CREATE INDEX IF NOT EXISTS idx_lumina_checkins_user_day ON checkins(user_id, day_num);
    CREATE INDEX IF NOT EXISTS idx_lumina_reflections_user_day ON reflections(user_id, day_num);
    CREATE INDEX IF NOT EXISTS idx_lumina_analytics_event_created ON analytics_events(event_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lumina_analytics_email_created ON analytics_events(email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lumina_analytics_user_created ON analytics_events(user_id, created_at DESC);
  `);

  if (LUMINA_ENABLE_TEST_USER) {
    const existing = await pool.query("SELECT id FROM users WHERE email = 'test@test.com'");
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('testtest', 10);
      await pool.query(
        "INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ('test@test.com', 'Test User', $1, 'en', CURRENT_DATE)",
        [hash]
      );
      console.log('Test user created (test@test.com / testtest)');
    }
  }
}

initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`LUMINA server running on port ${PORT}`);
    });
  })
  .catch((e) => {
    console.error('DB init error:', e);
    process.exit(1);
  });
