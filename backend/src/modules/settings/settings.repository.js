'use strict';

async function findAll(db) {
  const { rows } = await db.query('SELECT key, value_json, updated_by, updated_at FROM platform_settings ORDER BY key');
  return rows;
}

module.exports = { findAll };
