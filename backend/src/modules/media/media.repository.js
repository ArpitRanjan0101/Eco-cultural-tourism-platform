'use strict';

const COLUMNS = `id, uploaded_by, purpose, storage_key, public_url, mime_type, file_size, width, height,
  alt_text, visibility, status, created_at, updated_at`;

async function insert(db, media) {
  const { rows } = await db.query(
    `INSERT INTO media_assets (id, uploaded_by, purpose, storage_key, mime_type, file_size, alt_text, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
    [media.id, media.uploadedBy, media.purpose, media.storageKey, media.mimeType, media.fileSize, media.altText ?? null, media.visibility],
  );
  return rows[0];
}

async function findById(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM media_assets WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function findReadyByIds(db, ids) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM media_assets WHERE id = ANY($1::uuid[]) AND status = 'ready'`, [ids]);
  return rows;
}

async function markReady(db, id, publicUrl) {
  const { rows } = await db.query(
    `UPDATE media_assets SET status = 'ready', public_url = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, publicUrl],
  );
  return rows[0];
}

async function updateProcessed(db, id, { width, height, fileSize }) {
  await db.query('UPDATE media_assets SET width = $2, height = $3, file_size = $4 WHERE id = $1', [id, width, height, fileSize]);
}

/** Platform-generated file that is complete at creation (e.g. voucher PDFs). */
async function insertReady(db, media) {
  const { rows } = await db.query(
    `INSERT INTO media_assets (id, uploaded_by, purpose, storage_key, mime_type, file_size, visibility, status, public_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready', NULL) RETURNING id`,
    [media.id, media.uploadedBy, media.purpose, media.storageKey, media.mimeType, media.fileSize, media.visibility],
  );
  return rows[0].id;
}

/** Pending uploads never completed (abandoned presigned URLs) — housekeeping removes them. */
async function listStalePending(db, olderThanHours, limit) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM media_assets WHERE status IN ('pending', 'rejected') AND created_at < now() - make_interval(hours => $1)
     ORDER BY created_at LIMIT $2`,
    [olderThanHours, limit],
  );
  return rows;
}

async function markRejected(db, id) {
  await db.query("UPDATE media_assets SET status = 'rejected' WHERE id = $1", [id]);
}

async function deleteById(db, id) {
  await db.query('DELETE FROM media_assets WHERE id = $1', [id]);
}

module.exports = { insert, findById, findReadyByIds, markReady, updateProcessed, insertReady, listStalePending, markRejected, deleteById };
