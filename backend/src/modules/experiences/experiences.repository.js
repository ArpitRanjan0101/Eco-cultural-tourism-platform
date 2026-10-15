'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

const PUBLIC = `e.status = 'published' AND EXISTS (SELECT 1 FROM partners pa WHERE pa.id = e.partner_id AND pa.status = 'approved')`;

const COLUMNS = `e.id, e.partner_id, e.destination_id, e.name, e.slug, e.description, e.duration_minutes, e.min_participants,
  e.max_participants, e.booking_mode, e.status, e.created_at, e.updated_at,
  (SELECT em.media_id FROM experience_media em WHERE em.experience_id = e.id ORDER BY em.sort_order, em.media_id LIMIT 1) AS cover_media_id,
  (SELECT min(s.starts_at) FROM experience_sessions s WHERE s.experience_id = e.id AND s.status = 'scheduled' AND s.starts_at > now()) AS next_session_at,
  (SELECT min(s.price_per_person) FROM experience_sessions s WHERE s.experience_id = e.id AND s.status = 'scheduled' AND s.starts_at > now()) AS starting_price`;
const SORT_COLUMNS = { name: 'e.name', nextSessionAt: 'next_session_at', startingPrice: 'starting_price', createdAt: 'e.created_at' };

async function list(db, { publicOnly, partnerId, statuses, destinationId, q, sort, page, limit }) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  };
  if (publicOnly) conditions.push(PUBLIC);
  if (partnerId) add('e.partner_id = ?', partnerId);
  if (statuses) add('e.status = ANY(?::text[])', statuses);
  if (destinationId) add('e.destination_id = ?', destinationId);
  if (q) add('e.name ILIKE ?', likePattern(q));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const window = pageWindow({ page, limit });
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${COLUMNS} FROM experiences e ${where} ORDER BY ${orderBy(sort, SORT_COLUMNS, 'e.id')} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [
      ...values,
      window.limit,
      window.offset,
    ]),
    db.query(`SELECT count(*)::int AS total FROM experiences e ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function find(db, { id, slug }, { forUpdate = false, publicOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM experiences e WHERE ${id ? 'e.id = $1' : 'e.slug = $1'} ${publicOnly ? `AND ${PUBLIC}` : ''}
     ${forUpdate ? 'FOR UPDATE OF e' : ''}`,
    [id ?? slug],
  );
  return rows[0] ?? null;
}

async function findPublicByIds(db, ids) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM experiences e WHERE e.id = ANY($1::uuid[]) AND ${PUBLIC}`, [ids]);
  return rows;
}

async function insert(db, input) {
  const { rows } = await db.query(
    `INSERT INTO experiences (partner_id, destination_id, name, slug, description, duration_minutes, min_participants, max_participants, booking_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      input.partnerId,
      input.destinationId ?? null,
      input.name,
      input.slug,
      input.description ?? null,
      input.durationMinutes,
      input.minParticipants ?? 1,
      input.maxParticipants,
      input.bookingMode ?? 'instant',
    ],
  );
  return rows[0].id;
}

async function update(db, id, fields) {
  const query = buildUpdate('experiences', id, fields, {
    destinationId: 'destination_id',
    name: 'name',
    slug: 'slug',
    description: 'description',
    durationMinutes: 'duration_minutes',
    minParticipants: 'min_participants',
    maxParticipants: 'max_participants',
    bookingMode: 'booking_mode',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

async function search(db, { q, limit }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, similarity(e.name, $1) + CASE WHEN e.name ILIKE $2 THEN 0.5 ELSE 0 END AS rank
     FROM experiences e WHERE ${PUBLIC} AND (e.name ILIKE $2 OR e.name % $1) ORDER BY rank DESC, e.name LIMIT $3`,
    [q, likePattern(q), limit],
  );
  return rows;
}

// ---- sessions ----

const SESSION_COLUMNS = 's.id, s.experience_id, s.starts_at, s.ends_at, s.capacity, s.price_per_person, s.status, s.created_at, s.updated_at';

async function listSessions(db, experienceId, { from, to, scheduledOnly = false }) {
  const { rows } = await db.query(
    `SELECT ${SESSION_COLUMNS} FROM experience_sessions s
     WHERE s.experience_id = $1 AND s.starts_at >= $2 AND s.starts_at < $3 ${scheduledOnly ? "AND s.status = 'scheduled'" : ''}
     ORDER BY s.starts_at`,
    [experienceId, from, to],
  );
  return rows;
}

async function findSession(db, sessionId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${SESSION_COLUMNS}, e.partner_id, e.min_participants FROM experience_sessions s JOIN experiences e ON e.id = s.experience_id
     WHERE s.id = $1 ${forUpdate ? 'FOR UPDATE OF s' : ''}`,
    [sessionId],
  );
  return rows[0] ?? null;
}

async function insertSession(db, experienceId, input) {
  const { rows } = await db.query(
    `INSERT INTO experience_sessions (experience_id, starts_at, ends_at, capacity, price_per_person) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [experienceId, input.startsAt, input.endsAt, input.capacity, input.pricePerPerson],
  );
  return rows[0].id;
}

async function updateSession(db, sessionId, fields) {
  const query = buildUpdate('experience_sessions', sessionId, fields, {
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    capacity: 'capacity',
    pricePerPerson: 'price_per_person',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

async function deleteSession(db, sessionId) {
  await db.query('DELETE FROM experience_sessions WHERE id = $1', [sessionId]);
}

module.exports = { SORT_COLUMNS, list, find, findPublicByIds, insert, update, search, listSessions, findSession, insertSession, updateSession, deleteSession };
