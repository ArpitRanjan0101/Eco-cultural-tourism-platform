'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { orderBy, pageWindow } = require('../../core/utils/pagination');

const BOOKING_COLUMNS = `b.id, b.booking_reference, b.user_id, b.partner_id, b.booking_type, b.booking_mode, b.booking_status,
  b.payment_status, b.currency, b.subtotal, b.tax_amount, b.discount_amount, b.total_amount, b.service_start_at,
  b.service_end_at, b.expires_at, b.confirmed_at, b.cancelled_at, b.created_at, b.updated_at,
  i.id AS item_id, i.item_type, i.item_reference_id, i.description_snapshot, i.quantity, i.unit_price,
  i.total_amount AS item_total, i.booking_details`;
const FROM = 'bookings b JOIN booking_items i ON i.booking_id = b.id';
const SORT_COLUMNS = { createdAt: 'b.created_at', serviceStartAt: 'b.service_start_at', totalAmount: 'b.total_amount' };

async function insertBooking(db, booking) {
  const { rows } = await db.query(
    `INSERT INTO bookings (booking_reference, user_id, partner_id, booking_type, booking_mode, booking_status, currency,
                           subtotal, tax_amount, discount_amount, total_amount, service_start_at, service_end_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      booking.reference,
      booking.userId,
      booking.partnerId,
      booking.bookingType,
      booking.bookingMode,
      booking.status,
      booking.currency,
      booking.subtotal,
      booking.taxAmount,
      booking.discountAmount,
      booking.totalAmount,
      booking.serviceStartAt,
      booking.serviceEndAt,
      booking.expiresAt,
    ],
  );
  return rows[0].id;
}

async function insertItem(db, bookingId, item) {
  const { rows } = await db.query(
    `INSERT INTO booking_items (booking_id, item_type, item_reference_id, description_snapshot, quantity, unit_price, tax_amount, total_amount, booking_details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [bookingId, item.itemType, item.itemReferenceId, item.description, item.quantity, item.unitPrice, item.taxAmount, item.totalAmount, item.details],
  );
  return rows[0].id;
}

async function insertTravelers(db, bookingId, travelers) {
  for (const traveler of travelers) {
    await db.query('INSERT INTO booking_travelers (booking_id, full_name, age, is_primary) VALUES ($1, $2, $3, $4)', [
      bookingId,
      traveler.fullName,
      traveler.age ?? null,
      traveler.isPrimary,
    ]);
  }
}

async function insertHistory(db, { bookingId, oldStatus, newStatus, changedBy, reason }) {
  await db.query('INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, reason) VALUES ($1, $2, $3, $4, $5)', [
    bookingId,
    oldStatus,
    newStatus,
    changedBy ?? null,
    reason ?? null,
  ]);
}

async function find(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${BOOKING_COLUMNS} FROM ${FROM} WHERE b.id = $1 ${forUpdate ? 'FOR UPDATE OF b' : ''}`, [id]);
  return rows[0] ?? null;
}

async function update(db, id, fields) {
  const query = buildUpdate('bookings', id, fields, {
    status: 'booking_status',
    paymentStatus: 'payment_status',
    expiresAt: 'expires_at',
    confirmedAt: 'confirmed_at',
    cancelledAt: 'cancelled_at',
  });
  if (query) await db.query(query.text, query.values);
}

async function detailParts(db, id) {
  const [travelers, history, cancellation, documents] = await Promise.all([
    db.query('SELECT full_name, age, is_primary FROM booking_travelers WHERE booking_id = $1 ORDER BY is_primary DESC, created_at', [id]),
    db.query('SELECT old_status, new_status, reason, created_at FROM booking_status_history WHERE booking_id = $1 ORDER BY created_at, id', [id]),
    db.query('SELECT reason, cancellation_fee, refund_amount, status, created_at FROM booking_cancellations WHERE booking_id = $1', [id]),
    db.query('SELECT id, media_id, document_type, created_at FROM booking_documents WHERE booking_id = $1 ORDER BY created_at', [id]),
  ]);
  return { travelers: travelers.rows, history: history.rows, cancellation: cancellation.rows[0] ?? null, documents: documents.rows };
}

async function list(db, { userId, partnerId, statuses, bookingType, paymentStatus, reference, from, to, sort, page, limit }) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  };
  if (userId) add('b.user_id = ?', userId);
  if (partnerId) add('b.partner_id = ?', partnerId);
  if (statuses) add('b.booking_status = ANY(?::text[])', statuses);
  if (bookingType) add('b.booking_type = ?', bookingType);
  if (paymentStatus) add('b.payment_status = ?', paymentStatus);
  if (reference) add('b.booking_reference = ?', reference);
  if (from) add('b.service_start_at >= ?', from);
  if (to) add('b.service_start_at < ?', to);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const window = pageWindow({ page, limit });
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${BOOKING_COLUMNS} FROM ${FROM} ${where} ORDER BY ${orderBy(sort, SORT_COLUMNS, 'b.id')} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [
      ...values,
      window.limit,
      window.offset,
    ]),
    db.query(`SELECT count(*)::int AS total FROM bookings b ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function insertCancellation(db, { bookingId, reason, cancellationFee, refundAmount, requestedBy, status }) {
  await db.query(
    `INSERT INTO booking_cancellations (booking_id, reason, cancellation_fee, refund_amount, requested_by, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [bookingId, reason ?? null, cancellationFee, refundAmount, requestedBy ?? null, status],
  );
}

async function setCancellationStatus(db, bookingId, status) {
  await db.query('UPDATE booking_cancellations SET status = $2 WHERE booking_id = $1', [bookingId, status]);
}

async function findCancellation(db, bookingId) {
  const { rows } = await db.query('SELECT refund_amount, status FROM booking_cancellations WHERE booking_id = $1', [bookingId]);
  return rows[0] ?? null;
}

async function listRefundPendingCancellations(db, limit) {
  const { rows } = await db.query(
    "SELECT booking_id, refund_amount, reason FROM booking_cancellations WHERE status = 'refund_pending' ORDER BY created_at LIMIT $1",
    [limit],
  );
  return rows;
}

/** Locks a batch of bookings whose approval/payment deadline passed (skips rows other workers hold). */
async function lockDueForExpiry(db, limit) {
  const { rows } = await db.query(
    `SELECT id, booking_status FROM bookings
     WHERE booking_status IN ('requested', 'pending_payment') AND expires_at <= now()
     ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  return rows;
}

async function lockDueForCompletion(db, limit) {
  const { rows } = await db.query(
    `SELECT id FROM bookings WHERE booking_status = 'confirmed' AND service_end_at <= now()
     ORDER BY service_end_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  return rows;
}

module.exports = {
  SORT_COLUMNS,
  insertBooking,
  insertItem,
  insertTravelers,
  insertHistory,
  find,
  update,
  detailParts,
  list,
  insertCancellation,
  setCancellationStatus,
  findCancellation,
  listRefundPendingCancellations,
  lockDueForExpiry,
  lockDueForCompletion,
};
