const logger = require('./logger');

/**
 * Validate required environment variables at startup.
 * Exits with code 1 if any are missing.
 */
function validateEnv() {
  const errors = [];

  // JWT_SECRET is mandatory — no fallback allowed
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  }

  // Database: need either DATABASE_URL or all individual DB vars
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasDbParts = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASS && process.env.DB_NAME;
  if (!hasDbUrl && !hasDbParts) {
    errors.push('Database config required: set DATABASE_URL or all of DB_HOST, DB_USER, DB_PASS, DB_NAME');
  }

  // PORT is optional (has a sensible default), but if asked to validate it:
  // We keep it lenient — PORT defaults to 3456 in server.js

  if (errors.length > 0) {
    logger.fatal({ missing: errors }, 'Missing required environment variables');
    console.error('\n=== STARTUP FAILED ===');
    errors.forEach(e => console.error('  - ' + e));
    console.error('======================\n');
    process.exit(1);
  }

  logger.info('Environment validation passed');
}

module.exports = validateEnv;
