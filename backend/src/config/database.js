'use strict';

const { Pool, types } = require('pg');
const config = require('./index');
const logger = require('../core/logging/logger');

// DATE stays a 'YYYY-MM-DD' string: stay dates must never shift with time zones.
types.setTypeParser(types.builtins.DATE, (value) => value);
// NUMERIC stays a string (pg default) so money is never rounded through floats.

const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
  application_name: config.app.name,
  options: '-c timezone=UTC',
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL idle client error');
});

module.exports = { pool };
