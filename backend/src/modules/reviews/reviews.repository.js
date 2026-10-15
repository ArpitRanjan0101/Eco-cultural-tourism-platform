'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { pageWindow } = require('../../core/utils/pagination');

async function find(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT * FROM reviews WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function insert(db, review) {
  const { rows } = await db.query(
    `INSERT INTO reviews (user_id, booking_id, subject_type, subject_id, rating, title, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [review.userId, review.bookingId ?? null, review.subjectType, review.subjectId, review.rating, review.title ?? null, review.comment ?? null],
  );
  return rows[0].id;
}

async function update(db, id, fields) {
  const query = buildUpdate('reviews', id, fields, {
    rating: 'rating',
    title: 'title',
    comment: 'comment',
    status: 'status',
    moderatedBy: 'moderated_by',
    moderationNote: 'moderation_note',
  });
  if (query) await db.query(query.text, query.values);
}

async function remove(db, id) {
  await db.query('DELETE FROM reviews WHERE id = $1', [id]);
}

/** Approved reviews of one subject, newest first. */
async function listApproved(db, subjectType, subjectId, { page, limit }) {
  const window = pageWindow({ page, limit });
  const { rows } = await db.query(
    `SELECT * FROM reviews WHERE subject_type = $1 AND subject_id = $2 AND status = 'approved'
     ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
    [subjectType, subjectId, window.limit, window.offset],
  );
  return rows;
}

/** Rating count/average/distribution over approved reviews. */
async function summary(db, subjectType, subjectId) {
  const { rows } = await db.query(
    `SELECT rating, count(*)::int AS n FROM reviews
     WHERE subject_type = $1 AND subject_id = $2 AND status = 'approved' GROUP BY rating`,
    [subjectType, subjectId],
  );
  return rows;
}

async function listForModeration(db, { status, subjectType, page, limit }) {
  const window = pageWindow({ page, limit });
  const values = [status ?? null, subjectType ?? null];
  const where = 'WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR subject_type = $2)';
  const [rows, count] = await Promise.all([
    // Oldest first so the moderation queue is worked in arrival order.
    db.query(`SELECT * FROM reviews ${where} ORDER BY created_at ASC, id ASC LIMIT $3 OFFSET $4`, [...values, window.limit, window.offset]),
    db.query(`SELECT count(*)::int AS total FROM reviews ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

module.exports = { find, insert, update, remove, listApproved, summary, listForModeration };
