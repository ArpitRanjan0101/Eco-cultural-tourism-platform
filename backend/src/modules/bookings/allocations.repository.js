'use strict';

// Owns inventory_holds. An allocation is active while confirmed, or held and not yet expired.
const ACTIVE = "(h.status = 'confirmed' OR (h.status = 'held' AND h.expires_at > now()))";

/** Units allocated per room type and night in [from, to) (dates are Asia/Kolkata calendar days). */
async function roomNightAllocations(db, roomTypeIds, from, to) {
  const { rows } = await db.query(
    `SELECT h.resource_id AS room_type_id, to_char(d, 'YYYY-MM-DD') AS stay_date, sum(h.quantity)::int AS units
     FROM inventory_holds h
     CROSS JOIN generate_series($2::date, $3::date - 1, interval '1 day') AS d
     WHERE h.resource_type = 'room_type' AND h.resource_id = ANY($1::uuid[]) AND ${ACTIVE}
       AND h.start_at <= (d::date::timestamp AT TIME ZONE 'Asia/Kolkata')
       AND h.end_at > (d::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     GROUP BY h.resource_id, d`,
    [roomTypeIds, from, to],
  );
  return rows;
}

/** Seats allocated per resource (experience sessions, package departures). */
async function seatAllocations(db, resourceType, resourceIds) {
  if (resourceIds.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT h.resource_id, sum(h.quantity)::int AS seats FROM inventory_holds h
     WHERE h.resource_type = $1 AND h.resource_id = ANY($2::uuid[]) AND ${ACTIVE} GROUP BY h.resource_id`,
    [resourceType, resourceIds],
  );
  return new Map(rows.map((row) => [row.resource_id, row.seats]));
}

/** Active guide allocations overlapping [from, to). */
async function guideBusyRanges(db, guideId, from, to) {
  const { rows } = await db.query(
    `SELECT h.start_at, h.end_at FROM inventory_holds h
     WHERE h.resource_type = 'guide' AND h.resource_id = $1 AND ${ACTIVE} AND h.start_at < $3 AND h.end_at > $2
     ORDER BY h.start_at`,
    [guideId, from, to],
  );
  return rows;
}

async function hasActiveAllocations(db, resourceType, resourceId) {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM inventory_holds h WHERE h.resource_type = $1 AND h.resource_id = $2 AND ${ACTIVE}) AS active`,
    [resourceType, resourceId],
  );
  return rows[0].active;
}

/**
 * Marks lapsed guide holds expired so they stop occupying the exclusion constraint.
 * Called under the guide row lock before inserting a new guide hold.
 */
async function expireLapsedGuideHolds(db, guideId) {
  await db.query(
    `UPDATE inventory_holds SET status = 'expired'
     WHERE resource_type = 'guide' AND resource_id = $1 AND status = 'held' AND expires_at <= now()`,
    [guideId],
  );
}

async function insertHold(db, hold) {
  const { rows } = await db.query(
    `INSERT INTO inventory_holds (booking_item_id, resource_type, resource_id, start_at, end_at, quantity, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'held') RETURNING id`,
    [hold.bookingItemId, hold.resourceType, hold.resourceId, hold.startAt, hold.endAt, hold.quantity, hold.expiresAt],
  );
  return rows[0].id;
}

/** Moves every hold of a booking from one of `fromStatuses` to `status`. */
async function transitionHolds(db, bookingId, fromStatuses, status) {
  const { rowCount } = await db.query(
    `UPDATE inventory_holds h SET status = $3
     FROM booking_items i WHERE i.id = h.booking_item_id AND i.booking_id = $1 AND h.status = ANY($2::text[])`,
    [bookingId, fromStatuses, status],
  );
  return rowCount;
}

/** True when every hold of the booking is still active (held and unexpired, or confirmed). */
async function bookingHoldsActive(db, bookingId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE ${ACTIVE})::int AS active
     FROM inventory_holds h JOIN booking_items i ON i.id = h.booking_item_id WHERE i.booking_id = $1`,
    [bookingId],
  );
  return rows[0].total > 0 && rows[0].total === rows[0].active;
}

module.exports = {
  roomNightAllocations,
  seatAllocations,
  guideBusyRanges,
  hasActiveAllocations,
  expireLapsedGuideHolds,
  insertHold,
  transitionHolds,
  bookingHoldsActive,
};
