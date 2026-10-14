'use strict';

const { pool } = require('../../config/database');

const ISOLATION_LEVELS = {
  readCommitted: 'READ COMMITTED',
  repeatableRead: 'REPEATABLE READ',
  serializable: 'SERIALIZABLE',
};

// Serialization failure and deadlock are safe to retry from the start of the transaction.
const RETRYABLE_CODES = new Set(['40001', '40P01']);

/**
 * Runs fn(client) inside a transaction. Commits on success, rolls back on error.
 * `retries` re-runs the whole callback on serialization/deadlock errors, so fn must
 * not perform non-transactional side effects (use the outbox for those).
 */
async function withTransaction(fn, { isolationLevel = 'readCommitted', retries = 0 } = {}) {
  const level = ISOLATION_LEVELS[isolationLevel];
  if (!level) throw new Error(`Unknown isolation level: ${isolationLevel}`);

  for (let attempt = 0; ; attempt += 1) {
    const client = await pool.connect();
    let releaseError;
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${level}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError = rollbackError;
      }
      if (RETRYABLE_CODES.has(err.code) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt + Math.random() * 20));
        continue;
      }
      throw err;
    } finally {
      // A client whose rollback failed is destroyed instead of returned to the pool.
      client.release(releaseError);
    }
  }
}

module.exports = { withTransaction };
