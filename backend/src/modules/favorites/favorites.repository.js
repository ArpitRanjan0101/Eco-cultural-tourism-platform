'use strict';

const { pageWindow } = require('../../core/utils/pagination');

async function list(db, userId, { subjectType, page, limit }) {
  const window = pageWindow({ page, limit });
  const values = [userId, subjectType ?? null];
  const where = 'WHERE user_id = $1 AND ($2::text IS NULL OR subject_type = $2)';
  const [rows, count] = await Promise.all([
    db.query(`SELECT * FROM favorites ${where} ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`, [...values, window.limit, window.offset]),
    db.query(`SELECT count(*)::int AS total FROM favorites ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

/** Inserts unless already saved; `created` tells the two apart. */
async function upsert(db, userId, subjectType, subjectId) {
  const inserted = await db.query(
    `INSERT INTO favorites (user_id, subject_type, subject_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, subject_type, subject_id) DO NOTHING RETURNING *`,
    [userId, subjectType, subjectId],
  );
  if (inserted.rows[0]) return { row: inserted.rows[0], created: true };
  const { rows } = await db.query('SELECT * FROM favorites WHERE user_id = $1 AND subject_type = $2 AND subject_id = $3', [
    userId,
    subjectType,
    subjectId,
  ]);
  return { row: rows[0], created: false };
}

async function remove(db, userId, subjectType, subjectId) {
  const { rowCount } = await db.query('DELETE FROM favorites WHERE user_id = $1 AND subject_type = $2 AND subject_id = $3', [
    userId,
    subjectType,
    subjectId,
  ]);
  return rowCount > 0;
}

module.exports = { list, upsert, remove };
