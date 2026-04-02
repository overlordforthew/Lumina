try { require('dotenv/config'); } catch(e) {}
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const logger = require('./lib/logger');
const validateEnv = require('./lib/validate-env');
const rateLimit = require('./lib/rate-limit');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  next(err);
});

// Simple cookie parser middleware
app.use((req, res, next) => {
  req.cookies = {};
  const hdr = req.headers.cookie;
  if (hdr) {
    hdr.split(';').forEach(pair => {
      try {
        const [k, ...v] = pair.trim().split('=');
        if (k) req.cookies[k.trim()] = decodeURIComponent(v.join('='));
      } catch (e) {
        // Skip malformed cookie values that fail decodeURIComponent
      }
    });
  }
  next();
});

// Cookie options for auth token
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
  maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days (matches JWT expiry)
};

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
    });

// Handle unexpected pool errors to prevent process crash
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

// No fallback — validateEnv() guarantees JWT_SECRET exists
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3456;

// Rate limiters for auth routes
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts, please try again later' });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many signup attempts, please try again later' });

// ─── AUTH MIDDLEWARE ───
function auth(req, res, next) {
  // Prefer httpOnly cookie, fall back to Authorization header
  let token = req.cookies && req.cookies.lumina_token;
  if (!token) {
    const hdr = req.headers.authorization;
    if (hdr) token = hdr.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      res.clearCookie('lumina_token', { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── ADMIN MIDDLEWARE ───
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── STATIC FILES ───
app.use(express.static(path.join(__dirname, 'public')));

// ─── INPUT VALIDATORS ───
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 255;
const MAX_PASSWORD_LEN = 128;
const VALID_LANGS = ['en', 'ja'];
// 10 MB limit for base64-encoded audio/image data
const MAX_DATA_PAYLOAD = 10 * 1024 * 1024;

// ─── AUTH ROUTES ───
app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  try {
    const { email, name, password, lang } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'fillAll' });
    if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (email.length > MAX_EMAIL_LEN) return res.status(400).json({ error: 'Email too long' });
    if (name.length > MAX_NAME_LEN) return res.status(400).json({ error: 'Name too long' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (password.length > MAX_PASSWORD_LEN) return res.status(400).json({ error: 'Password too long' });
    if (lang && !VALID_LANGS.includes(lang)) return res.status(400).json({ error: 'Invalid language' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'exists' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ($1, $2, $3, $4, CURRENT_DATE) RETURNING id, email, name, lang, role, start_date',
      [email.toLowerCase(), name, hash, lang || 'en']
    );
    const u = result.rows[0];
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role || 'user' }, JWT_SECRET, { expiresIn: '180d' });
    res.cookie('lumina_token', token, COOKIE_OPTS);
    res.json({
      user: { email: u.email, name: u.name, lang: u.lang, startDate: u.start_date }
    });
  } catch (e) {
    logger.error({ err: e }, 'Signup error');
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'fillAll' });
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email format' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'noAccount' });

    const u = result.rows[0];
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(401).json({ error: 'wrongPw' });

    const token = jwt.sign({ id: u.id, email: u.email, role: u.role || 'user' }, JWT_SECRET, { expiresIn: '180d' });
    res.cookie('lumina_token', token, COOKIE_OPTS);
    res.json({
      user: { email: u.email, name: u.name, lang: u.lang, startDate: u.start_date }
    });
  } catch (e) {
    logger.error({ err: e }, 'Login error');
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('lumina_token', { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/session', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, lang, start_date FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      // User was deleted but token is still valid -- clear the stale cookie
      res.clearCookie('lumina_token', { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    const u = result.rows[0];
    res.json({ email: u.email, name: u.name, lang: u.lang, startDate: u.start_date });
  } catch (e) {
    logger.error({ err: e }, 'Session error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── USER ROUTES ───
app.put('/api/user/lang', auth, async (req, res) => {
  try {
    const { lang } = req.body;
    if (!lang || !VALID_LANGS.includes(lang)) {
      return res.status(400).json({ error: 'Invalid language. Supported: ' + VALID_LANGS.join(', ') });
    }
    await pool.query('UPDATE users SET lang = $1 WHERE id = $2', [lang, req.user.id]);
    res.json({ ok: true, lang });
  } catch (e) {
    logger.error({ err: e }, 'Update lang error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PROGRESS ROUTES ───
app.get('/api/progress', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT day_num, completed_at FROM progress WHERE user_id = $1 ORDER BY day_num',
      [req.user.id]
    );
    // Return as object keyed by day_num (same format the frontend expects)
    const progress = {};
    result.rows.forEach(r => {
      progress[r.day_num] = { completedAt: r.completed_at.toISOString() };
    });
    res.json(progress);
  } catch (e) {
    logger.error({ err: e }, 'Get progress error');
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/progress/:day', auth, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) {
      return res.status(400).json({ error: 'Invalid day' });
    }
    await pool.query(
      'INSERT INTO progress (user_id, day_num) VALUES ($1, $2) ON CONFLICT (user_id, day_num) DO NOTHING',
      [req.user.id, dayNum]
    );
    res.json({ ok: true, day: dayNum });
  } catch (e) {
    logger.error({ err: e }, 'Complete day error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── AUDIO ROUTES ───
app.get('/api/audio/:day', auth, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) return res.status(400).json({ error: 'Invalid day' });
    const result = await pool.query(
      'SELECT audio_data FROM audio WHERE user_id = $1 AND day_num = $2',
      [req.user.id, dayNum]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No audio' });
    res.json({ data: result.rows[0].audio_data });
  } catch (e) {
    logger.error({ err: e }, 'Get audio error');
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/audio/:day', auth, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) return res.status(400).json({ error: 'Invalid day' });
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No audio data' });
    if (typeof data !== 'string') return res.status(400).json({ error: 'Invalid audio data format' });
    if (data.length > MAX_DATA_PAYLOAD) return res.status(413).json({ error: 'Audio file too large (max 10MB)' });
    if (!data.startsWith('data:audio/')) return res.status(400).json({ error: 'Invalid audio format. Must be an audio file.' });
    await pool.query(
      'INSERT INTO audio (user_id, day_num, audio_data) VALUES ($1, $2, $3) ON CONFLICT (user_id, day_num) DO UPDATE SET audio_data = $3',
      [req.user.id, dayNum, data]
    );
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, 'Save audio error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── IMAGE ROUTES (admin-uploaded per-day images) ───
app.get('/api/image/:day', async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) return res.status(400).json({ error: 'Invalid day' });
    const result = await pool.query('SELECT image_data FROM images WHERE day_num = $1', [dayNum]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No image' });
    res.json({ data: result.rows[0].image_data });
  } catch (e) {
    logger.error({ err: e }, 'Get image error');
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/image/:day', auth, adminOnly, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) return res.status(400).json({ error: 'Invalid day' });
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No image data' });
    if (typeof data !== 'string') return res.status(400).json({ error: 'Invalid image data format' });
    if (data.length > MAX_DATA_PAYLOAD) return res.status(413).json({ error: 'Image file too large (max 10MB)' });
    if (!data.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format. Must be an image file.' });
    await pool.query(
      'INSERT INTO images (day_num, image_data) VALUES ($1, $2) ON CONFLICT (day_num) DO UPDATE SET image_data = $2',
      [dayNum, data]
    );
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, 'Save image error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SPA FALLBACK ───
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── GLOBAL ERROR HANDLER ───
app.use((err, req, res, _next) => {
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled route error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── START ───
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        lang VARCHAR(10) DEFAULT 'en',
        role VARCHAR(20) DEFAULT 'user',
        start_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
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
    `);

    // Add role column to existing databases (safe to run multiple times)
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
    `);

    // Add indices for frequently queried columns
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_audio_user_day ON audio(user_id, day_num);
    `);
    logger.info('Database tables ready');

    // Create test user only in development
    if (process.env.NODE_ENV !== 'production') {
      const existing = await pool.query("SELECT id FROM users WHERE email = 'test@test.com'");
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash('test', 10);
        await pool.query(
          "INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ('test@test.com', 'Test User', $1, 'en', CURRENT_DATE)",
          [hash]
        );
        logger.info('Test user created (test@test.com / test)');
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'DB init error');
    throw e;
  }
}

// Allow setup-db.js to reuse pool and initDB without starting the server
module.exports = { pool, initDB };

if (require.main === module) {
  // Validate required environment variables before starting
  validateEnv();
  initDB().then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'LUMINA server running');
    });
    server.on('error', (err) => {
      logger.fatal({ err }, 'Server failed to start');
      process.exit(1);
    });

    // ─── GRACEFUL SHUTDOWN ───
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutdown signal received, closing gracefully...');
      server.close(() => {
        logger.info('HTTP server closed');
        pool.end().then(() => {
          logger.info('Database pool closed');
          process.exit(0);
        }).catch((err) => {
          logger.error({ err }, 'Error closing database pool');
          process.exit(1);
        });
      });
      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }).catch((err) => {
    logger.fatal({ err }, 'Database initialization failed, aborting startup');
    process.exit(1);
  });

  // Catch unhandled rejections and uncaught exceptions
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception, shutting down');
    process.exit(1);
  });
}
