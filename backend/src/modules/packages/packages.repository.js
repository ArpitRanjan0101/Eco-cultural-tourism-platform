'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

const PUBLIC = `k.status = 'published' AND EXISTS (SELECT 1 FROM partners pa WHERE pa.id = k.partner_id AND pa.status = 'approved')`;

const COLUMNS = `k.id, k.partner_id, k.name, k.slug, k.summary, k.description, k.duration_days, k.duration_nights,
  k.starting_price, k.min_travelers, k.max_travelers, k.booking_mode, k.status, k.created_at, k.updated_at,
  (SELECT pm.media_id FROM package_media pm WHERE pm.package_id = k.id ORDER BY pm.sort_order, pm.media_id LIMIT 1) AS cover_media_id,
  (SELECT to_char(min(d.start_date), 'YYYY-MM-DD') FROM package_departures d
     WHERE d.package_id = k.id AND d.status = 'scheduled' AND d.start_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS next_departure`;
const SORT_COLUMNS = { name: 'k.name', startingPrice: 'k.starting_price', durationDays: 'k.duration_days', nextDeparture: 'next_departure', createdAt: 'k.created_at' };

async function list(db, { publicOnly, partnerId, statuses, destinationId, q, sort, page, limit }) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  };
  if (publicOnly) conditions.push(PUBLIC);
  if (partnerId) add('k.partner_id = ?', partnerId);
  if (statuses) add('k.status = ANY(?::text[])', statuses);
  if (destinationId) add('EXISTS (SELECT 1 FROM package_destinations pd WHERE pd.package_id = k.id AND pd.destination_id = ?)', destinationId);
  if (q) add('k.name ILIKE ?', likePattern(q));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const window = pageWindow({ page, limit });
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${COLUMNS} FROM packages k ${where} ORDER BY ${orderBy(sort, SORT_COLUMNS, 'k.id')} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [
      ...values,
      window.limit,
      window.offset,
    ]),
    db.query(`SELECT count(*)::int AS total FROM packages k ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function find(db, { id, slug }, { forUpdate = false, publicOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM packages k WHERE ${id ? 'k.id = $1' : 'k.slug = $1'} ${publicOnly ? `AND ${PUBLIC}` : ''}
     ${forUpdate ? 'FOR UPDATE OF k' : ''}`,
    [id ?? slug],
  );
  return rows[0] ?? null;
}

async function findPublicByIds(db, ids) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM packages k WHERE k.id = ANY($1::uuid[]) AND ${PUBLIC}`, [ids]);
  return rows;
}

async function insert(db, input) {
  const { rows } = await db.query(
    `INSERT INTO packages (partner_id, name, slug, summary, description, duration_days, duration_nights, min_travelers, max_travelers, booking_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      input.partnerId,
      input.name,
      input.slug,
      input.summary ?? null,
      input.description ?? null,
      input.durationDays,
      input.durationNights,
      input.minTravelers ?? 1,
      input.maxTravelers,
      input.bookingMode ?? 'instant',
    ],
  );
  return rows[0].id;
}

async function update(db, id, fields) {
  const query = buildUpdate('packages', id, fields, {
    name: 'name',
    slug: 'slug',
    summary: 'summary',
    description: 'description',
    durationDays: 'duration_days',
    durationNights: 'duration_nights',
    minTravelers: 'min_travelers',
    maxTravelers: 'max_travelers',
    bookingMode: 'booking_mode',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

/** starting_price = lowest price among upcoming scheduled departures (NULL when none). */
async function refreshStartingPrice(db, id) {
  await db.query(
    `UPDATE packages SET starting_price = (
       SELECT min(price_per_person) FROM package_departures
       WHERE package_id = $1 AND status = 'scheduled' AND start_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
     WHERE id = $1`,
    [id],
  );
}

async function search(db, { q, limit }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, similarity(k.name, $1) + CASE WHEN k.name ILIKE $2 THEN 0.5 ELSE 0 END AS rank
     FROM packages k WHERE ${PUBLIC} AND (k.name ILIKE $2 OR k.name % $1) ORDER BY rank DESC, k.name LIMIT $3`,
    [q, likePattern(q), limit],
  );
  return rows;
}

// ---- destinations, itinerary, inclusions ----

async function destinationIds(db, id) {
  const { rows } = await db.query('SELECT destination_id FROM package_destinations WHERE package_id = $1 ORDER BY sort_order', [id]);
  return rows.map((row) => row.destination_id);
}

async function replaceDestinations(db, id, ids) {
  await db.query('DELETE FROM package_destinations WHERE package_id = $1', [id]);
  await db.query(
    `INSERT INTO package_destinations (package_id, destination_id, sort_order)
     SELECT $1, d.id, d.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS d (id, ord)`,
    [id, ids],
  );
}

async function itinerary(db, id) {
  const { rows } = await db.query(
    `SELECT d.id AS day_id, d.day_number, d.title, d.description,
            COALESCE(json_agg(json_build_object('activityTitle', i.activity_title, 'description', i.description, 'destinationId', i.destination_id)
                       ORDER BY i.sort_order) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
     FROM package_itinerary_days d LEFT JOIN package_itinerary_items i ON i.itinerary_day_id = d.id
     WHERE d.package_id = $1 GROUP BY d.id ORDER BY d.day_number`,
    [id],
  );
  return rows;
}

async function replaceItinerary(db, id, days) {
  await db.query('DELETE FROM package_itinerary_days WHERE package_id = $1', [id]);
  for (const day of days) {
    const { rows } = await db.query(
      'INSERT INTO package_itinerary_days (package_id, day_number, title, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [id, day.dayNumber, day.title, day.description ?? null],
    );
    for (const [index, item] of day.items.entries()) {
      await db.query(
        `INSERT INTO package_itinerary_items (itinerary_day_id, destination_id, activity_title, description, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, item.destinationId ?? null, item.activityTitle, item.description ?? null, index],
      );
    }
  }
}

async function inclusions(db, id) {
  const { rows } = await db.query(
    'SELECT description, inclusion_type FROM package_inclusions WHERE package_id = $1 ORDER BY sort_order',
    [id],
  );
  return rows;
}

async function replaceInclusions(db, id, items) {
  await db.query('DELETE FROM package_inclusions WHERE package_id = $1', [id]);
  for (const [index, item] of items.entries()) {
    await db.query('INSERT INTO package_inclusions (package_id, description, inclusion_type, sort_order) VALUES ($1, $2, $3, $4)', [
      id,
      item.description,
      item.inclusionType,
      index,
    ]);
  }
}

// ---- departures ----

const DEPARTURE_COLUMNS = `d.id, d.package_id, to_char(d.start_date, 'YYYY-MM-DD') AS start_date, to_char(d.end_date, 'YYYY-MM-DD') AS end_date,
  d.total_seats, d.price_per_person, d.status, d.created_at, d.updated_at`;

async function listDepartures(db, id, { from, scheduledOnly = false }) {
  const { rows } = await db.query(
    `SELECT ${DEPARTURE_COLUMNS} FROM package_departures d
     WHERE d.package_id = $1 AND d.start_date >= $2 ${scheduledOnly ? "AND d.status = 'scheduled'" : ''} ORDER BY d.start_date`,
    [id, from],
  );
  return rows;
}

async function findDeparture(db, departureId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${DEPARTURE_COLUMNS}, k.partner_id, k.duration_days FROM package_departures d JOIN packages k ON k.id = d.package_id
     WHERE d.id = $1 ${forUpdate ? 'FOR UPDATE OF d' : ''}`,
    [departureId],
  );
  return rows[0] ?? null;
}

async function insertDeparture(db, id, input) {
  const { rows } = await db.query(
    `INSERT INTO package_departures (package_id, start_date, end_date, total_seats, price_per_person) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [id, input.startDate, input.endDate, input.totalSeats, input.pricePerPerson],
  );
  return rows[0].id;
}

async function updateDeparture(db, departureId, fields) {
  const query = buildUpdate('package_departures', departureId, fields, {
    startDate: 'start_date',
    endDate: 'end_date',
    totalSeats: 'total_seats',
    pricePerPerson: 'price_per_person',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

module.exports = {
  SORT_COLUMNS,
  list,
  find,
  findPublicByIds,
  insert,
  update,
  refreshStartingPrice,
  search,
  destinationIds,
  replaceDestinations,
  itinerary,
  replaceItinerary,
  inclusions,
  replaceInclusions,
  listDepartures,
  findDeparture,
  insertDeparture,
  updateDeparture,
};
