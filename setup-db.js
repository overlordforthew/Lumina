// Run this once to create the database tables
// Usage: node setup-db.js

require('dotenv/config');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lumina',
  user: process.env.DB_USER || 'lumina',
  password: process.env.DB_PASS || 'lumina',
});

async function setup() {
  console.log('Setting up LUMINA database...');

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
  `);
  console.log('  ✓ users table');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_num INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, day_num)
    );
  `);
  console.log('  ✓ progress table');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audio (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_num INTEGER NOT NULL,
      audio_data TEXT NOT NULL,
      UNIQUE(user_id, day_num)
    );
  `);
  console.log('  ✓ audio table');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      day_num INTEGER UNIQUE NOT NULL,
      image_data TEXT NOT NULL
    );
  `);
  console.log('  ✓ images table');

  // Create test user (password: "test")
  const existing = await pool.query("SELECT id FROM users WHERE email = 'test@test.com'");
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('test', 10);
    await pool.query(
      "INSERT INTO users (email, name, password_hash, lang, start_date) VALUES ('test@test.com', 'Test User', $1, 'en', CURRENT_DATE)",
      [hash]
    );
    console.log('  ✓ test user created (test@test.com / test)');
  } else {
    console.log('  ✓ test user already exists');
  }

  console.log('\nDatabase setup complete!');
  await pool.end();
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
