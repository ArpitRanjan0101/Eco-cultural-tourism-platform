'use strict';

async function findAll(db, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT key, value_json, updated_by, updated_at FROM platform_settings ORDER BY key ${forUpdate ? 'FOR UPDATE' : ''}`);
  return rows;
}

async function upsert(db, key, value, updatedBy) {
  await db.query(
    `INSERT INTO platform_settings (key, value_json, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), updatedBy],
  );
}

async function remove(db, key) {
  await db.query('DELETE FROM platform_settings WHERE key = $1', [key]);
}

module.exports = { findAll, upsert, remove };
