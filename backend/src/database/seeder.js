'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DIR = path.join(__dirname, 'seeds');
const SEED_FILE = /^\d{3}_[a-z0-9_]+\.js$/;

/**
 * Runs version-controlled reference seeds in filename order. Each seed exports
 * `run(client)` and must be idempotent (upserts), because seeding is re-runnable.
 * Each seed runs in its own transaction.
 */
async function runSeeds({ db, dir = DEFAULT_DIR, log = () => {} }) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => SEED_FILE.test(file)).sort();
  const executed = [];
  for (const file of files) {
    const seed = require(path.join(dir, file));
    if (typeof seed.run !== 'function') throw new Error(`Seed ${file} must export run(client)`);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await seed.run(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      err.message = `Seed ${file} failed: ${err.message}`;
      throw err;
    } finally {
      client.release();
    }
    log(`seeded ${file}`);
    executed.push(file);
  }
  return executed;
}

module.exports = { runSeeds };
