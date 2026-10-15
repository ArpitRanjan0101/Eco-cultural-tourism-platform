'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { pageWindow } = require('../../core/utils/pagination');

// ---- templates ----

const TEMPLATE_COLUMNS = 'id, code, channel, subject, body, status, updated_by, created_at, updated_at';

async function listTemplates(db) {
  const { rows } = await db.query(`SELECT ${TEMPLATE_COLUMNS} FROM notification_templates ORDER BY code, channel`);
  return rows;
}

async function findTemplate(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${TEMPLATE_COLUMNS} FROM notification_templates WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function activeTemplates(db, codes) {
  const { rows } = await db.query(`SELECT ${TEMPLATE_COLUMNS} FROM notification_templates WHERE code = ANY($1::text[]) AND status = 'active'`, [codes]);
  return rows;
}

async function updateTemplate(db, id, fields) {
  const query = buildUpdate('notification_templates', id, fields, { subject: 'subject', body: 'body', status: 'status', updatedBy: 'updated_by' });
  if (query) await db.query(query.text, query.values);
}

// ---- in-app notifications ----

/** Idempotent insert; returns the id (new or existing) for the dedupe key. */
async function insertNotification(db, n) {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, title, message, related_type, related_id, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key RETURNING id`,
    [n.userId, n.type, n.title, n.message, n.relatedType ?? null, n.relatedId ?? null, n.dedupeKey],
  );
  return rows[0].id;
}

async function listForUser(db, userId, { unreadOnly, page, limit }) {
  const where = `WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}`;
  const window = pageWindow({ page, limit });
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT id, type, title, message, related_type, related_id, read_at, created_at FROM notifications ${where}
       ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
      [userId, window.limit, window.offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM notifications ${where}`, [userId]),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function unreadCount(db, userId) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return rows[0].n;
}

async function markRead(db, userId, id) {
  const { rows } = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, message, related_type, related_id, read_at, created_at`,
    [id, userId],
  );
  return rows[0] ?? null;
}

async function markAllRead(db, userId) {
  const { rowCount } = await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return rowCount;
}

// ---- email deliveries ----

/** Idempotent insert; returns { id, status } of the delivery for this dedupe key. */
async function insertDelivery(db, d) {
  const { rows } = await db.query(
    `INSERT INTO notification_deliveries (notification_id, recipient, channel, template_code, dedupe_key)
     VALUES ($1, $2, 'email', $3, $4)
     ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key RETURNING id, status`,
    [d.notificationId ?? null, d.recipient, d.templateCode, d.dedupeKey],
  );
  return rows[0];
}

async function findDelivery(db, id) {
  const { rows } = await db.query('SELECT id, recipient, status, attempts FROM notification_deliveries WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function recordDeliveryAttempt(db, id, { status, providerMessageId, error }) {
  await db.query(
    `UPDATE notification_deliveries SET attempts = attempts + 1, status = $2,
       provider_message_id = COALESCE($3, provider_message_id), last_error = $4,
       sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
     WHERE id = $1`,
    [id, status, providerMessageId ?? null, error ?? null],
  );
}

module.exports = {
  listTemplates,
  findTemplate,
  activeTemplates,
  updateTemplate,
  insertNotification,
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
  insertDelivery,
  findDelivery,
  recordDeliveryAttempt,
};
