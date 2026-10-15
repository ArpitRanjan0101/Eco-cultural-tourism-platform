'use strict';

const { BUSINESS_TIME_ZONE } = require('../../core/utils/dates');

/**
 * Read-only reporting queries (DECISIONS I1). This repository aggregates across the
 * transactional tables of other modules but never writes; every query is parameterised
 * and ranges are local (Asia/Kolkata) calendar dates, `to` inclusive.
 */
const TZ = `'${BUSINESS_TIME_ZONE}'`;
const inRange = (column, from, to) =>
  `${column} >= (${from}::date::timestamp AT TIME ZONE ${TZ}) AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE ${TZ})`;
const bucket = (column, groupBy) => `date_trunc(${groupBy}::text, ${column} AT TIME ZONE ${TZ})::date`;
const money = (expression) => `coalesce(${expression}, 0)::numeric(14, 2)::text`;
const buckets = (from, to, groupBy) =>
  `SELECT generate_series(date_trunc(${groupBy}::text, ${from}::date::timestamp), ${to}::date::timestamp, ('1 ' || ${groupBy}::text)::interval)::date AS period`;

const CONFIRMED = "b.booking_status IN ('confirmed', 'completed')";
const PENDING = "b.booking_status IN ('requested', 'pending_payment')";
const BOOKING_COUNTS = `count(*)::int AS bookings,
  count(*) FILTER (WHERE ${CONFIRMED})::int AS confirmed,
  count(*) FILTER (WHERE b.booking_status = 'cancelled')::int AS cancelled,
  count(*) FILTER (WHERE b.booking_status = 'rejected')::int AS rejected,
  count(*) FILTER (WHERE b.booking_status = 'expired')::int AS expired,
  count(*) FILTER (WHERE ${PENDING})::int AS pending,
  ${money(`sum(b.total_amount) FILTER (WHERE ${CONFIRMED})`)} AS booked_value`;
const bookingFilter = `${inRange('b.created_at', '$1', '$2')} AND ($3::uuid IS NULL OR b.partner_id = $3) AND ($4::text IS NULL OR b.booking_type = $4)`;

// ---- bookings ----

async function bookingTotals(db, { from, to, partnerId, bookingType }) {
  const values = [from, to, partnerId ?? null, bookingType ?? null];
  const [totals, byType] = await Promise.all([
    db.query(
      `SELECT ${BOOKING_COUNTS}, ${money(`round(avg(b.total_amount) FILTER (WHERE ${CONFIRMED}), 2)`)} AS average_value
       FROM bookings b WHERE ${bookingFilter}`,
      values,
    ),
    db.query(`SELECT b.booking_type, ${BOOKING_COUNTS} FROM bookings b WHERE ${bookingFilter} GROUP BY b.booking_type ORDER BY b.booking_type`, values),
  ]);
  return { totals: totals.rows[0], byType: byType.rows };
}

async function bookingSeries(db, { from, to, groupBy, partnerId, bookingType }) {
  const { rows } = await db.query(
    `WITH buckets AS (${buckets('$1', '$2', '$5')}),
     agg AS (SELECT ${bucket('b.created_at', '$5')} AS period, ${BOOKING_COUNTS} FROM bookings b WHERE ${bookingFilter} GROUP BY 1)
     SELECT to_char(k.period, 'YYYY-MM-DD') AS period, coalesce(a.bookings, 0) AS bookings, coalesce(a.confirmed, 0) AS confirmed,
       coalesce(a.cancelled, 0) AS cancelled, coalesce(a.booked_value, '0.00') AS booked_value
     FROM buckets k LEFT JOIN agg a USING (period) ORDER BY k.period`,
    [from, to, partnerId ?? null, bookingType ?? null, groupBy],
  );
  return rows;
}

// ---- revenue (captured payments minus succeeded refunds, by money-movement date) ----

const CAPTURED = `FROM payment_transactions t JOIN payment_orders o ON o.id = t.payment_order_id JOIN bookings b ON b.id = o.booking_id
  WHERE t.status = 'captured' AND ${inRange('t.paid_at', '$1', '$2')} AND ($3::uuid IS NULL OR b.partner_id = $3) AND ($4::text IS NULL OR b.booking_type = $4)`;
const REFUNDED = `FROM refunds r JOIN bookings b ON b.id = r.booking_id
  WHERE r.status = 'succeeded' AND ${inRange('r.processed_at', '$1', '$2')} AND ($3::uuid IS NULL OR b.partner_id = $3) AND ($4::text IS NULL OR b.booking_type = $4)`;

async function revenueTotals(db, { from, to, partnerId, bookingType }) {
  const values = [from, to, partnerId ?? null, bookingType ?? null];
  const { rows } = await db.query(
    `WITH captured AS (SELECT b.booking_type, count(*)::int AS payments, sum(t.amount) AS amount ${CAPTURED} GROUP BY b.booking_type),
     refunded AS (SELECT b.booking_type, count(*)::int AS refunds, sum(r.amount) AS amount ${REFUNDED} GROUP BY b.booking_type)
     SELECT coalesce(c.booking_type, r.booking_type) AS booking_type, coalesce(c.payments, 0) AS payments, coalesce(r.refunds, 0) AS refunds,
       ${money('c.amount')} AS captured, ${money('r.amount')} AS refunded, ${money('coalesce(c.amount, 0) - coalesce(r.amount, 0)')} AS net
     FROM captured c FULL JOIN refunded r ON r.booking_type = c.booking_type ORDER BY 1`,
    values,
  );
  return rows;
}

async function revenueSeries(db, { from, to, groupBy, partnerId, bookingType }) {
  const { rows } = await db.query(
    `WITH buckets AS (${buckets('$1', '$2', '$5')}),
     captured AS (SELECT ${bucket('t.paid_at', '$5')} AS period, sum(t.amount) AS amount ${CAPTURED} GROUP BY 1),
     refunded AS (SELECT ${bucket('r.processed_at', '$5')} AS period, sum(r.amount) AS amount ${REFUNDED} GROUP BY 1)
     SELECT to_char(k.period, 'YYYY-MM-DD') AS period, ${money('c.amount')} AS captured, ${money('r.amount')} AS refunded,
       ${money('coalesce(c.amount, 0) - coalesce(r.amount, 0)')} AS net
     FROM buckets k LEFT JOIN captured c USING (period) LEFT JOIN refunded r USING (period) ORDER BY k.period`,
    [from, to, partnerId ?? null, bookingType ?? null, groupBy],
  );
  return rows;
}

// ---- destinations ----

/**
 * Bookings are attributed to destinations through the booked item: property/experience
 * destination, or every destination linked to the guide/package (one booking can count
 * towards several destinations).
 */
const DESTINATION_SORT = {
  bookings: 'bookings DESC',
  bookedValue: 'booked_value_num DESC',
  favorites: 'favorites DESC',
  tripStops: 'trip_stops DESC',
  reviews: 'reviews DESC',
  rating: 'average_rating DESC NULLS LAST',
};

async function destinationReport(db, { from, to, status, districtId, sort, page, limit }) {
  const filters = [status ?? null, districtId ?? null];
  const where = (a, b) => `WHERE (${a}::text IS NULL OR d.status = ${a}) AND (${b}::uuid IS NULL OR d.district_id = ${b})`;
  const [rows, count] = await Promise.all([
    db.query(
      `WITH attributed AS (
         SELECT DISTINCT b.id, b.total_amount, b.booking_status, x.destination_id
         FROM bookings b JOIN booking_items i ON i.booking_id = b.id
         CROSS JOIN LATERAL (
           SELECT p.destination_id FROM properties p WHERE i.item_type = 'property_room' AND p.id = (i.booking_details->>'propertyId')::uuid
           UNION SELECT e.destination_id FROM experiences e WHERE i.item_type = 'experience_session' AND e.id = (i.booking_details->>'experienceId')::uuid
           UNION SELECT pd.destination_id FROM package_destinations pd WHERE i.item_type = 'package_departure' AND pd.package_id = (i.booking_details->>'packageId')::uuid
           UNION SELECT gd.destination_id FROM guide_destinations gd WHERE i.item_type = 'guide_service' AND gd.guide_id = (i.booking_details->>'guideId')::uuid
         ) x
         WHERE x.destination_id IS NOT NULL AND ${inRange('b.created_at', '$1', '$2')}
       ),
       booking_agg AS (
         SELECT b.destination_id, count(*)::int AS bookings,
           sum(b.total_amount) FILTER (WHERE ${CONFIRMED}) AS booked_value
         FROM attributed b GROUP BY b.destination_id
       ),
       favorite_agg AS (
         SELECT subject_id AS destination_id, count(*)::int AS favorites FROM favorites
         WHERE subject_type = 'destination' AND ${inRange('created_at', '$1', '$2')} GROUP BY subject_id
       ),
       stop_agg AS (
         SELECT destination_id, count(*)::int AS trip_stops FROM trip_stops
         WHERE destination_id IS NOT NULL AND ${inRange('created_at', '$1', '$2')} GROUP BY destination_id
       ),
       review_agg AS (
         SELECT subject_id AS destination_id, count(*)::int AS reviews, round(avg(rating), 1)::float8 AS average_rating FROM reviews
         WHERE subject_type = 'destination' AND status = 'approved' AND ${inRange('created_at', '$1', '$2')} GROUP BY subject_id
       ),
       report AS (
         SELECT d.id, d.name, d.slug, d.status, coalesce(ba.bookings, 0) AS bookings, coalesce(ba.booked_value, 0) AS booked_value_num,
           coalesce(fa.favorites, 0) AS favorites, coalesce(sa.trip_stops, 0) AS trip_stops, coalesce(ra.reviews, 0) AS reviews, ra.average_rating
         FROM destinations d
         LEFT JOIN booking_agg ba ON ba.destination_id = d.id LEFT JOIN favorite_agg fa ON fa.destination_id = d.id
         LEFT JOIN stop_agg sa ON sa.destination_id = d.id LEFT JOIN review_agg ra ON ra.destination_id = d.id
         ${where('$3', '$4')}
       )
       SELECT *, booked_value_num::numeric(14, 2)::text AS booked_value FROM report
       ORDER BY ${DESTINATION_SORT[sort]}, name, id LIMIT $5 OFFSET $6`,
      [from, to, ...filters, limit, (page - 1) * limit],
    ),
    db.query(`SELECT count(*)::int AS total FROM destinations d ${where('$1', '$2')}`, filters),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

// ---- partners ----

const PARTNER_SORT = {
  bookedValue: 'booked_value_num DESC',
  net: 'net_num DESC',
  bookings: 'bookings DESC',
  name: 'business_name ASC',
};

async function partnerReport(db, { from, to, partnerType, status, sort, page, limit }) {
  const filters = [partnerType ?? null, status ?? null];
  const where = (a, b) => `WHERE (${a}::text IS NULL OR p.partner_type = ${a}) AND (${b}::text IS NULL OR p.status = ${b})`;
  const [rows, count] = await Promise.all([
    db.query(
      `WITH booking_agg AS (
         SELECT b.partner_id, count(*)::int AS bookings, count(*) FILTER (WHERE ${CONFIRMED})::int AS confirmed,
           count(*) FILTER (WHERE b.booking_status = 'cancelled')::int AS cancelled,
           sum(b.total_amount) FILTER (WHERE ${CONFIRMED}) AS booked_value
         FROM bookings b WHERE ${inRange('b.created_at', '$1', '$2')} GROUP BY b.partner_id
       ),
       captured AS (
         SELECT b.partner_id, sum(t.amount) AS amount
         FROM payment_transactions t JOIN payment_orders o ON o.id = t.payment_order_id JOIN bookings b ON b.id = o.booking_id
         WHERE t.status = 'captured' AND ${inRange('t.paid_at', '$1', '$2')} GROUP BY b.partner_id
       ),
       refunded AS (
         SELECT b.partner_id, sum(r.amount) AS amount FROM refunds r JOIN bookings b ON b.id = r.booking_id
         WHERE r.status = 'succeeded' AND ${inRange('r.processed_at', '$1', '$2')} GROUP BY b.partner_id
       ),
       report AS (
         SELECT p.id, p.business_name, p.partner_type, p.status, coalesce(ba.bookings, 0) AS bookings, coalesce(ba.confirmed, 0) AS confirmed,
           coalesce(ba.cancelled, 0) AS cancelled, coalesce(ba.booked_value, 0) AS booked_value_num,
           coalesce(c.amount, 0) AS captured_num, coalesce(r.amount, 0) AS refunded_num, coalesce(c.amount, 0) - coalesce(r.amount, 0) AS net_num
         FROM partners p
         LEFT JOIN booking_agg ba ON ba.partner_id = p.id LEFT JOIN captured c ON c.partner_id = p.id LEFT JOIN refunded r ON r.partner_id = p.id
         ${where('$3', '$4')}
       )
       SELECT *, booked_value_num::numeric(14, 2)::text AS booked_value, captured_num::numeric(14, 2)::text AS captured,
         refunded_num::numeric(14, 2)::text AS refunded, net_num::numeric(14, 2)::text AS net
       FROM report ORDER BY ${PARTNER_SORT[sort]}, business_name, id LIMIT $5 OFFSET $6`,
      [from, to, ...filters, limit, (page - 1) * limit],
    ),
    db.query(`SELECT count(*)::int AS total FROM partners p ${where('$1', '$2')}`, filters),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

// ---- dashboards ----

async function platformCounts(db) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM users) AS users_total,
       (SELECT count(*)::int FROM users WHERE status = 'active') AS users_active,
       (SELECT count(*)::int FROM users WHERE created_at >= now() - interval '30 days') AS users_new_30d,
       (SELECT count(*)::int FROM bookings WHERE created_at >= (current_date::timestamp AT TIME ZONE ${TZ})) AS bookings_today,
       (SELECT count(*)::int FROM bookings WHERE booking_status = 'confirmed' AND service_start_at BETWEEN now() AND now() + interval '7 days') AS upcoming_7d,
       (SELECT count(*)::int FROM bookings WHERE booking_status = 'requested') AS awaiting_partner,
       (SELECT count(*)::int FROM partners WHERE status = 'pending') AS partner_applications,
       (SELECT count(*)::int FROM properties WHERE status = 'pending_review') AS properties_pending,
       (SELECT count(*)::int FROM guides WHERE verification_status = 'pending') AS guides_pending,
       (SELECT count(*)::int FROM experiences WHERE status = 'pending_review') AS experiences_pending,
       (SELECT count(*)::int FROM packages WHERE status = 'pending_review') AS packages_pending,
       (SELECT count(*)::int FROM reviews WHERE status = 'pending') AS reviews_pending,
       (SELECT count(*)::int FROM refunds WHERE status = 'failed') AS refunds_failed,
       (SELECT count(*)::int FROM payment_webhook_events WHERE processing_status = 'failed') AS webhooks_failed,
       (SELECT count(*)::int FROM outbox_events WHERE status = 'failed') AS outbox_failed`,
  );
  return rows[0];
}

async function partnerCounts(db, partnerId) {
  const [counts, supply, rating, upcoming] = await Promise.all([
    db.query(
      `SELECT
         (SELECT count(*)::int FROM bookings WHERE partner_id = $1 AND booking_status = 'requested') AS awaiting_approval,
         (SELECT count(*)::int FROM bookings WHERE partner_id = $1 AND booking_status = 'confirmed'
            AND service_start_at BETWEEN now() AND now() + interval '7 days') AS upcoming_7d`,
      [partnerId],
    ),
    db.query(
      `SELECT 'property' AS type, status, count(*)::int AS n FROM properties WHERE partner_id = $1 GROUP BY status
       UNION ALL SELECT 'guide', verification_status, count(*)::int FROM guides WHERE partner_id = $1 GROUP BY verification_status
       UNION ALL SELECT 'experience', status, count(*)::int FROM experiences WHERE partner_id = $1 GROUP BY status
       UNION ALL SELECT 'package', status, count(*)::int FROM packages WHERE partner_id = $1 GROUP BY status
       ORDER BY 1, 2`,
      [partnerId],
    ),
    db.query(
      `SELECT count(*)::int AS count, round(avg(r.rating), 1)::float8 AS average FROM reviews r
       WHERE r.status = 'approved' AND (
         (r.subject_type = 'property' AND r.subject_id IN (SELECT id FROM properties WHERE partner_id = $1)) OR
         (r.subject_type = 'guide' AND r.subject_id IN (SELECT id FROM guides WHERE partner_id = $1)) OR
         (r.subject_type = 'experience' AND r.subject_id IN (SELECT id FROM experiences WHERE partner_id = $1)) OR
         (r.subject_type = 'package' AND r.subject_id IN (SELECT id FROM packages WHERE partner_id = $1)))`,
      [partnerId],
    ),
    db.query(
      `SELECT id, booking_reference, booking_type, booking_status, total_amount, service_start_at FROM bookings
       WHERE partner_id = $1 AND booking_status = 'confirmed' AND service_start_at >= now()
       ORDER BY service_start_at, id LIMIT 10`,
      [partnerId],
    ),
  ]);
  return { counts: counts.rows[0], supply: supply.rows, rating: rating.rows[0], upcoming: upcoming.rows };
}

module.exports = {
  DESTINATION_SORT,
  PARTNER_SORT,
  bookingTotals,
  bookingSeries,
  revenueTotals,
  revenueSeries,
  destinationReport,
  partnerReport,
  platformCounts,
  partnerCounts,
};
