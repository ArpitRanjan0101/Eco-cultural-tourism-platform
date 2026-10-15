'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { pageWindow } = require('../../core/utils/pagination');

const TRIP_COLUMNS = `t.id, t.user_id, t.title, to_char(t.start_date, 'YYYY-MM-DD') AS start_date, to_char(t.end_date, 'YYYY-MM-DD') AS end_date,
  t.traveler_count, t.status, t.created_at, t.updated_at,
  (SELECT count(*)::int FROM trip_days d WHERE d.trip_id = t.id) AS day_count,
  (SELECT count(*)::int FROM trip_stops s JOIN trip_days d ON d.id = s.trip_day_id WHERE d.trip_id = t.id) AS stop_count`;

async function list(db, userId, { status, page, limit }) {
  const window = pageWindow({ page, limit });
  const values = [userId, status ?? null];
  const where = 'WHERE t.user_id = $1 AND ($2::text IS NULL OR t.status = $2)';
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${TRIP_COLUMNS} FROM trips t ${where} ORDER BY t.updated_at DESC, t.id LIMIT $3 OFFSET $4`, [...values, window.limit, window.offset]),
    db.query(`SELECT count(*)::int AS total FROM trips t ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function find(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${TRIP_COLUMNS} FROM trips t WHERE t.id = $1 ${forUpdate ? 'FOR UPDATE OF t' : ''}`, [id]);
  return rows[0] ?? null;
}

async function insert(db, trip) {
  const { rows } = await db.query(
    'INSERT INTO trips (user_id, title, start_date, end_date, traveler_count) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [trip.userId, trip.title, trip.startDate ?? null, trip.endDate ?? null, trip.travelerCount ?? 1],
  );
  return rows[0].id;
}

async function update(db, id, fields) {
  const query = buildUpdate('trips', id, fields, {
    title: 'title',
    startDate: 'start_date',
    endDate: 'end_date',
    travelerCount: 'traveler_count',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

async function remove(db, id) {
  await db.query('DELETE FROM trips WHERE id = $1', [id]);
}

/** Bumps updated_at after a day/stop change so trip lists sort by last edit. */
async function touch(db, id) {
  await db.query('UPDATE trips SET updated_at = now() WHERE id = $1', [id]);
}

// ---- days ----

const DAY_COLUMNS = "id, trip_id, day_number, to_char(trip_date, 'YYYY-MM-DD') AS trip_date, title";

async function listDays(db, tripId) {
  const { rows } = await db.query(`SELECT ${DAY_COLUMNS} FROM trip_days WHERE trip_id = $1 ORDER BY day_number`, [tripId]);
  return rows;
}

async function findDay(db, tripId, dayId) {
  const { rows } = await db.query(`SELECT ${DAY_COLUMNS} FROM trip_days WHERE id = $1 AND trip_id = $2`, [dayId, tripId]);
  return rows[0] ?? null;
}

async function maxDayNumber(db, tripId) {
  const { rows } = await db.query('SELECT coalesce(max(day_number), 0)::int AS n FROM trip_days WHERE trip_id = $1', [tripId]);
  return rows[0].n;
}

async function insertDay(db, tripId, { dayNumber, title }) {
  const { rows } = await db.query('INSERT INTO trip_days (trip_id, day_number, title) VALUES ($1, $2, $3) RETURNING id', [
    tripId,
    dayNumber,
    title ?? null,
  ]);
  return rows[0].id;
}

async function updateDay(db, dayId, fields) {
  const query = buildUpdate('trip_days', dayId, fields, { dayNumber: 'day_number', title: 'title' });
  if (query) await db.query(query.text, query.values);
}

async function deleteDay(db, dayId) {
  await db.query('DELETE FROM trip_days WHERE id = $1', [dayId]);
}

/** Keeps each day's calendar date in step with the trip's start date. */
async function recomputeDayDates(db, tripId) {
  await db.query(
    `UPDATE trip_days d SET trip_date = CASE WHEN t.start_date IS NULL THEN NULL ELSE t.start_date + (d.day_number - 1) END
     FROM trips t WHERE t.id = d.trip_id AND d.trip_id = $1`,
    [tripId],
  );
}

// ---- stops ----

const STOP_COLUMNS = `s.id, s.trip_day_id, s.destination_id, s.title, s.notes, to_char(s.start_time, 'HH24:MI') AS start_time,
  to_char(s.end_time, 'HH24:MI') AS end_time, s.sort_order`;

async function listStops(db, tripId) {
  const { rows } = await db.query(
    `SELECT ${STOP_COLUMNS} FROM trip_stops s JOIN trip_days d ON d.id = s.trip_day_id WHERE d.trip_id = $1 ORDER BY d.day_number, s.sort_order`,
    [tripId],
  );
  return rows;
}

async function findStop(db, tripId, stopId) {
  const { rows } = await db.query(
    `SELECT ${STOP_COLUMNS} FROM trip_stops s JOIN trip_days d ON d.id = s.trip_day_id WHERE s.id = $1 AND d.trip_id = $2`,
    [stopId, tripId],
  );
  return rows[0] ?? null;
}

async function countStops(db, dayId) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM trip_stops WHERE trip_day_id = $1', [dayId]);
  return rows[0].n;
}

async function insertStop(db, dayId, stop) {
  const { rows } = await db.query(
    `INSERT INTO trip_stops (trip_day_id, destination_id, title, notes, start_time, end_time, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT coalesce(max(sort_order) + 1, 0) FROM trip_stops WHERE trip_day_id = $1))
     RETURNING id`,
    [dayId, stop.destinationId ?? null, stop.title, stop.notes ?? null, stop.startTime ?? null, stop.endTime ?? null],
  );
  return rows[0].id;
}

async function updateStop(db, stopId, fields) {
  const query = buildUpdate('trip_stops', stopId, fields, {
    destinationId: 'destination_id',
    title: 'title',
    notes: 'notes',
    startTime: 'start_time',
    endTime: 'end_time',
  });
  if (query) await db.query(query.text, query.values);
}

async function deleteStop(db, stopId) {
  await db.query('DELETE FROM trip_stops WHERE id = $1', [stopId]);
}

/** Renumbers a day's stops 0..n-1 in their current order (after a removal). */
async function compactStops(db, dayId) {
  await db.query(
    `UPDATE trip_stops s SET sort_order = ordered.position
     FROM (SELECT id, row_number() OVER (ORDER BY sort_order) - 1 AS position FROM trip_stops WHERE trip_day_id = $1) AS ordered
     WHERE s.id = ordered.id`,
    [dayId],
  );
}

/** Places a stop on a day at a position (unique order is checked at commit: the constraint is deferred). */
async function placeStop(db, stopId, dayId, sortOrder) {
  await db.query('UPDATE trip_stops SET trip_day_id = $2, sort_order = $3 WHERE id = $1', [stopId, dayId, sortOrder]);
}

module.exports = {
  list,
  find,
  insert,
  update,
  remove,
  touch,
  listDays,
  findDay,
  maxDayNumber,
  insertDay,
  updateDay,
  deleteDay,
  recomputeDayDates,
  listStops,
  findStop,
  countStops,
  insertStop,
  updateStop,
  deleteStop,
  compactStops,
  placeStop,
};
