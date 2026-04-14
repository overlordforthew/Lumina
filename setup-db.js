// Run this once to create the Lumina schema tables in the shared Nami database.
// Usage: node setup-db.js

require('dotenv/config');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DB_SCHEMA = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(process.env.DB_SCHEMA || 'lumina')
  ? (process.env.DB_SCHEMA || 'lumina')
  : 'lumina';
const DB_SCHEMA_IDENT = `"${DB_SCHEMA}"`;
const LUMINA_ENABLE_TEST_USER = process.env.LUMINA_ENABLE_TEST_USER === '1';

const pool = new Pool({
  host: process.env.DB_HOST || 'namibarden-db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'namibarden',
  user: process.env.DB_USER || 'namibarden',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  options: `-c search_path=${DB_SCHEMA},public`,
});

async function setup() {
  console.log(`Setting up Lumina schema "${DB_SCHEMA}" in the shared database...`);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA_IDENT}`);
  await pool.query(`SET search_path TO ${DB_SCHEMA_IDENT}, public`);

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
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lumina_progress_user_day ON progress(user_id, day_num)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lumina_checkins_user_day ON checkins(user_id, day_num)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lumina_reflections_user_day ON reflections(user_id, day_num)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lumina_analytics_event_created ON analytics_events(event_name, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lumina_analytics_email_created ON analytics_events(email, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lumina_analytics_user_created ON analytics_events(user_id, created_at DESC)`);

  if (LUMINA_ENABLE_TEST_USER) {
    const existing = await pool.query("SELECT id FROM users WHERE email = 'test@test.com'");
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('testtest', 10);
      await pool.query(
        "INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ('test@test.com', 'Test User', $1, 'en', CURRENT_DATE)",
        [hash]
      );
      console.log('Test user created (test@test.com / testtest)');
    } else {
      console.log('Test user already exists');
    }
  }

  console.log('Database setup complete.');
  await pool.end();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
