// Run this once to create the database tables
// Usage: node setup-db.js
//
// Note: server.js also runs initDB() on every startup, so this script
// is only needed for manual/one-off setup without starting the server.

const { pool, initDB } = require('./server');

async function setup() {
  console.log('Setting up LUMINA database...');
  await initDB();
  console.log('\nDatabase setup complete!');
  await pool.end();
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
