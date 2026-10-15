'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

// Public visibility: active, verified guide of an approved partner organisation.
const PUBLIC = `g.status = 'active' AND g.verification_status = 'verified'
  AND EXISTS (SELECT 1 FROM partners pa WHERE pa.id = g.partner_id AND pa.status = 'approved')`;

const COLUMNS = `g.id, g.user_id, g.partner_id, g.display_name, g.photo_media_id, g.bio, g.years_experience,
  g.verification_status, g.status, g.created_at, g.updated_at,
  (SELECT min(s.price) FROM guide_services s WHERE s.guide_id = g.id AND s.status = 'active') AS starting_price`;
const SORT_COLUMNS = { displayName: 'g.display_name', yearsExperience: 'g.years_experience', startingPrice: 'starting_price', createdAt: 'g.created_at' };

function filters({ publicOnly, partnerId, verificationStatus, status, destinationId, languageCode, q }) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  };
  if (publicOnly) conditions.push(PUBLIC);
  if (partnerId) add('g.partner_id = ?', partnerId);
  if (verificationStatus) add('g.verification_status = ?', verificationStatus);
  if (status) add('g.status = ?', status);
  if (destinationId) add('EXISTS (SELECT 1 FROM guide_destinations gd WHERE gd.guide_id = g.id AND gd.destination_id = ?)', destinationId);
  if (languageCode) {
    add('EXISTS (SELECT 1 FROM guide_language_links l JOIN guide_languages gl ON gl.id = l.language_id WHERE l.guide_id = g.id AND gl.code = ?)', languageCode);
  }
  if (q) add('g.display_name ILIKE ?', likePattern(q));
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function list(db, query) {
  const { where, values } = filters(query);
  const { limit, offset } = pageWindow(query);
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS} FROM guides g ${where} ORDER BY ${orderBy(query.sort, SORT_COLUMNS, 'g.id')}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM guides g ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function find(db, id, { forUpdate = false, publicOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM guides g WHERE g.id = $1 ${publicOnly ? `AND ${PUBLIC}` : ''} ${forUpdate ? 'FOR UPDATE OF g' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

async function insert(db, input) {
  const { rows } = await db.query(
    `INSERT INTO guides (partner_id, user_id, display_name, photo_media_id, bio, years_experience)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.partnerId, input.userId ?? null, input.displayName, input.photoMediaId ?? null, input.bio ?? null, input.yearsExperience ?? 0],
  );
  return rows[0].id;
}

async function update(db, id, fields) {
  const query = buildUpdate('guides', id, fields, {
    userId: 'user_id',
    displayName: 'display_name',
    photoMediaId: 'photo_media_id',
    bio: 'bio',
    yearsExperience: 'years_experience',
    verificationStatus: 'verification_status',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

async function search(db, { q, limit }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, similarity(g.display_name, $1) + CASE WHEN g.display_name ILIKE $2 THEN 0.5 ELSE 0 END AS rank
     FROM guides g WHERE ${PUBLIC} AND (g.display_name ILIKE $2 OR g.display_name % $1)
     ORDER BY rank DESC, g.display_name LIMIT $3`,
    [q, likePattern(q), limit],
  );
  return rows;
}

// ---- languages ----

async function listLanguages(db) {
  const { rows } = await db.query('SELECT id, code, name, created_at, updated_at FROM guide_languages ORDER BY name');
  return rows;
}

async function findLanguage(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT id, code, name FROM guide_languages WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function countLanguages(db, ids) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM guide_languages WHERE id = ANY($1::uuid[])', [ids]);
  return rows[0].n;
}

async function insertLanguage(db, { code, name }) {
  const { rows } = await db.query('INSERT INTO guide_languages (code, name) VALUES ($1, $2) RETURNING id', [code, name]);
  return rows[0].id;
}

async function updateLanguage(db, id, { name }) {
  await db.query('UPDATE guide_languages SET name = $2 WHERE id = $1', [id, name]);
}

async function languagesFor(db, guideIds) {
  const { rows } = await db.query(
    `SELECT l.guide_id AS owner_id, gl.id, gl.code, gl.name FROM guide_language_links l JOIN guide_languages gl ON gl.id = l.language_id
     WHERE l.guide_id = ANY($1::uuid[]) ORDER BY gl.name`,
    [guideIds],
  );
  return rows;
}

async function replaceLanguages(db, guideId, languageIds) {
  await db.query('DELETE FROM guide_language_links WHERE guide_id = $1', [guideId]);
  await db.query('INSERT INTO guide_language_links (guide_id, language_id) SELECT $1, unnest($2::uuid[])', [guideId, languageIds]);
}

async function destinationIdsFor(db, guideIds) {
  const { rows } = await db.query('SELECT guide_id AS owner_id, destination_id FROM guide_destinations WHERE guide_id = ANY($1::uuid[])', [guideIds]);
  return rows;
}

async function replaceDestinations(db, guideId, destinationIds) {
  await db.query('DELETE FROM guide_destinations WHERE guide_id = $1', [guideId]);
  await db.query('INSERT INTO guide_destinations (guide_id, destination_id) SELECT $1, unnest($2::uuid[])', [guideId, destinationIds]);
}

// ---- services ----

const SERVICE_COLUMNS = 's.id, s.guide_id, s.title, s.duration_minutes, s.price, s.max_group_size, s.description, s.booking_mode, s.status, s.created_at, s.updated_at';

async function listServices(db, guideIds, { activeOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${SERVICE_COLUMNS} FROM guide_services s WHERE s.guide_id = ANY($1::uuid[]) ${activeOnly ? "AND s.status = 'active'" : ''}
     ORDER BY s.price, s.title`,
    [guideIds],
  );
  return rows;
}

async function findService(db, serviceId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${SERVICE_COLUMNS}, g.partner_id FROM guide_services s JOIN guides g ON g.id = s.guide_id WHERE s.id = $1
     ${forUpdate ? 'FOR UPDATE OF s' : ''}`,
    [serviceId],
  );
  return rows[0] ?? null;
}

async function insertService(db, guideId, input) {
  const { rows } = await db.query(
    `INSERT INTO guide_services (guide_id, title, duration_minutes, price, max_group_size, description, booking_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [guideId, input.title, input.durationMinutes, input.price, input.maxGroupSize, input.description ?? null, input.bookingMode ?? 'instant'],
  );
  return rows[0].id;
}

async function updateService(db, serviceId, fields) {
  const query = buildUpdate('guide_services', serviceId, fields, {
    title: 'title',
    durationMinutes: 'duration_minutes',
    price: 'price',
    maxGroupSize: 'max_group_size',
    description: 'description',
    bookingMode: 'booking_mode',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

// ---- availability windows ----

async function listAvailability(db, guideId, { from, to, availableOnly = false }) {
  const { rows } = await db.query(
    `SELECT id, to_char(service_date, 'YYYY-MM-DD') AS service_date, to_char(start_time, 'HH24:MI') AS start_time,
            to_char(end_time, 'HH24:MI') AS end_time, status
     FROM guide_availability
     WHERE guide_id = $1 AND service_date BETWEEN $2 AND $3 ${availableOnly ? "AND status = 'available'" : ''}
     ORDER BY service_date, start_time`,
    [guideId, from, to],
  );
  return rows;
}

/** Replaces every window in [from, to]; overlapping windows violate the exclusion constraint (23P01). */
async function replaceAvailability(db, guideId, { from, to, slots }) {
  await db.query('DELETE FROM guide_availability WHERE guide_id = $1 AND service_date BETWEEN $2 AND $3', [guideId, from, to]);
  for (const slot of slots) {
    await db.query(
      'INSERT INTO guide_availability (guide_id, service_date, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5)',
      [guideId, slot.date, slot.startTime, slot.endTime, slot.status],
    );
  }
}

// ---- verification documents ----

async function insertDocument(db, { guideId, mediaId, documentType }) {
  const { rows } = await db.query(
    `INSERT INTO guide_verification_documents (guide_id, document_media_id, document_type) VALUES ($1, $2, $3)
     RETURNING id, document_media_id, document_type, review_status, reviewed_at, created_at`,
    [guideId, mediaId, documentType],
  );
  return rows[0];
}

async function listDocuments(db, guideId) {
  const { rows } = await db.query(
    `SELECT id, document_media_id, document_type, review_status, reviewed_by, reviewed_at, created_at
     FROM guide_verification_documents WHERE guide_id = $1 ORDER BY created_at`,
    [guideId],
  );
  return rows;
}

async function reviewPendingDocuments(db, guideId, reviewStatus, reviewerId) {
  await db.query(
    `UPDATE guide_verification_documents SET review_status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE guide_id = $1 AND review_status = 'pending'`,
    [guideId, reviewStatus, reviewerId],
  );
}

module.exports = {
  SORT_COLUMNS,
  list,
  find,
  insert,
  update,
  search,
  listLanguages,
  findLanguage,
  countLanguages,
  insertLanguage,
  updateLanguage,
  languagesFor,
  replaceLanguages,
  destinationIdsFor,
  replaceDestinations,
  listServices,
  findService,
  insertService,
  updateService,
  listAvailability,
  replaceAvailability,
  insertDocument,
  listDocuments,
  reviewPendingDocuments,
};
