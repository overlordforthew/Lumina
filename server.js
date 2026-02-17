try { require('dotenv/config'); } catch(e) {}
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json({ limit: '15mb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lumina',
  user: process.env.DB_USER || 'lumina',
  password: process.env.DB_PASS || 'lumina',
});

const JWT_SECRET = process.env.JWT_SECRET || 'lumina-change-this-secret-in-production';
const PORT = process.env.PORT || 3456;
const BASE = '/lumina';

// ─── AUTH MIDDLEWARE ───
function auth(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.status(401).json({ error: 'Not authenticated' });
  const token = hdr.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── STATIC FILES ───
app.use(BASE, express.static(path.join(__dirname, 'public')));

// ─── AUTH ROUTES ───
app.post(BASE + '/api/auth/signup', async (req, res) => {
  try {
    const { email, name, password, lang } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'fillAll' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'exists' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ($1, $2, $3, $4, CURRENT_DATE) RETURNING id, email, name, lang, start_date',
      [email.toLowerCase(), name, hash, lang || 'en']
    );
    const u = result.rows[0];
    const token = jwt.sign({ id: u.id, email: u.email }, JWT_SECRET, { expiresIn: '180d' });
    res.json({
      token,
      user: { email: u.email, name: u.name, lang: u.lang, startDate: u.start_date }
    });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(BASE + '/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'fillAll' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'noAccount' });

    const u = result.rows[0];
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(401).json({ error: 'wrongPw' });

    const token = jwt.sign({ id: u.id, email: u.email }, JWT_SECRET, { expiresIn: '180d' });
    res.json({
      token,
      user: { email: u.email, name: u.name, lang: u.lang, startDate: u.start_date }
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get(BASE + '/api/auth/session', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, lang, start_date FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = result.rows[0];
    res.json({ email: u.email, name: u.name, lang: u.lang, startDate: u.start_date });
  } catch (e) {
    console.error('Session error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── USER ROUTES ───
app.put(BASE + '/api/user/lang', auth, async (req, res) => {
  try {
    const { lang } = req.body;
    await pool.query('UPDATE users SET lang = $1 WHERE id = $2', [lang, req.user.id]);
    res.json({ ok: true, lang });
  } catch (e) {
    console.error('Update lang error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PROGRESS ROUTES ───
app.get(BASE + '/api/progress', auth, async (req, res) => {
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
    console.error('Get progress error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(BASE + '/api/progress/:day', auth, async (req, res) => {
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
    console.error('Complete day error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── AUDIO ROUTES ───
app.get(BASE + '/api/audio/:day', auth, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    const result = await pool.query(
      'SELECT audio_data FROM audio WHERE user_id = $1 AND day_num = $2',
      [req.user.id, dayNum]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No audio' });
    res.json({ data: result.rows[0].audio_data });
  } catch (e) {
    console.error('Get audio error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(BASE + '/api/audio/:day', auth, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No audio data' });
    await pool.query(
      'INSERT INTO audio (user_id, day_num, audio_data) VALUES ($1, $2, $3) ON CONFLICT (user_id, day_num) DO UPDATE SET audio_data = $3',
      [req.user.id, dayNum, data]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Save audio error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── IMAGE ROUTES (admin-uploaded per-day images) ───
app.get(BASE + '/api/image/:day', async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    const result = await pool.query('SELECT image_data FROM images WHERE day_num = $1', [dayNum]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No image' });
    res.json({ data: result.rows[0].image_data });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(BASE + '/api/image/:day', auth, async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day);
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No image data' });
    await pool.query(
      'INSERT INTO images (day_num, image_data) VALUES ($1, $2) ON CONFLICT (day_num) DO UPDATE SET image_data = $2',
      [dayNum, data]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Save image error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SPA FALLBACK ───
app.get(BASE + '/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get(BASE, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    console.log('Database tables ready');

    // Create test user if not exists
    const existing = await pool.query("SELECT id FROM users WHERE email = 'test@test.com'");
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('test', 10);
      await pool.query(
        "INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ('test@test.com', 'Test User', $1, 'en', CURRENT_DATE)",
        [hash]
      );
      console.log('Test user created (test@test.com / test)');
    }
  } catch (e) {
    console.error('DB init error:', e.message);
  }
}

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LUMINA server running on port ${PORT}`);
  });
});
