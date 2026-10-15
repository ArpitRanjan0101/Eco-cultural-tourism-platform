'use strict';

/**
 * `npm run storage:verify` — confirms that every ready media asset recorded in the database
 * has its object in storage (used after a database restore or a storage migration).
 * Exits 1 when any referenced object is missing; prints keys only, never URLs or credentials.
 */
const { pool } = require('../config/database');
const storage = require('../config/storage');

const CONCURRENCY = 8;

async function verify() {
  const { rows } = await pool.query("SELECT id, storage_key, visibility FROM media_assets WHERE status = 'ready' ORDER BY created_at, id");
  const missing = [];
  let cursor = 0;
  async function next() {
    while (cursor < rows.length) {
      const row = rows[cursor];
      cursor += 1;
      if (!(await storage.headObject({ visibility: row.visibility, key: row.storage_key }))) missing.push(row);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  return { checked: rows.length, missing };
}

verify()
  .then(({ checked, missing }) => {
    process.stdout.write(`Checked ${checked} ready media object(s); ${missing.length} missing.\n`);
    for (const row of missing) process.stdout.write(`  missing ${row.visibility} ${row.storage_key} (media ${row.id})\n`);
    if (missing.length) process.exitCode = 1;
  })
  .catch((err) => {
    process.stderr.write(`Storage verification failed: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
