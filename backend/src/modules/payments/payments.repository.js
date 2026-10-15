'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { pageWindow } = require('../../core/utils/pagination');

// ---- orders ----

const ORDER_COLUMNS = 'id, booking_id, provider, provider_order_id, amount, currency, status, expires_at, reconciled_at, created_at, updated_at';

async function insertOrder(db, order) {
  const { rows } = await db.query(
    `INSERT INTO payment_orders (booking_id, provider, provider_order_id, amount, currency, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ORDER_COLUMNS}`,
    [order.bookingId, order.provider, order.providerOrderId, order.amount, order.currency, order.expiresAt],
  );
  return rows[0];
}

async function findOrder(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${ORDER_COLUMNS} FROM payment_orders WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function findOrderByProviderId(db, provider, providerOrderId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM payment_orders WHERE provider = $1 AND provider_order_id = $2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [provider, providerOrderId],
  );
  return rows[0] ?? null;
}

async function findOpenOrderForBooking(db, bookingId) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM payment_orders
     WHERE booking_id = $1 AND status IN ('created', 'pending') AND expires_at > now() ORDER BY created_at DESC LIMIT 1`,
    [bookingId],
  );
  return rows[0] ?? null;
}

async function listOrdersForBooking(db, bookingId) {
  const { rows } = await db.query(`SELECT ${ORDER_COLUMNS} FROM payment_orders WHERE booking_id = $1 ORDER BY created_at`, [bookingId]);
  return rows;
}

async function updateOrder(db, id, fields) {
  const query = buildUpdate('payment_orders', id, fields, { status: 'status', reconciledAt: 'reconciled_at' });
  if (query) await db.query(query.text, query.values);
}

/** Unpaid orders old enough that a callback/webhook may have been lost. */
async function listOrdersToReconcile(db, limit) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM payment_orders
     WHERE status IN ('created', 'pending') AND created_at < now() - interval '2 minutes' AND created_at > now() - interval '3 days'
       AND (reconciled_at IS NULL OR reconciled_at < now() - interval '5 minutes')
     ORDER BY reconciled_at NULLS FIRST, created_at LIMIT $1`,
    [limit],
  );
  return rows;
}

async function searchOrders(db, { status, bookingId, page, limit }) {
  const values = [status ?? null, bookingId ?? null];
  const where = 'WHERE ($1::text IS NULL OR o.status = $1) AND ($2::uuid IS NULL OR o.booking_id = $2)';
  const window = pageWindow({ page, limit });
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT o.*, (SELECT count(*)::int FROM payment_transactions t WHERE t.payment_order_id = o.id AND t.status = 'captured') AS captured_count
       FROM payment_orders o ${where}
       ORDER BY o.created_at DESC, o.id LIMIT $3 OFFSET $4`,
      [...values, window.limit, window.offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM payment_orders o ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

// ---- transactions ----

const TRANSACTION_COLUMNS = 't.id, t.payment_order_id, t.provider, t.provider_payment_id, t.amount, t.status, t.method, t.paid_at, t.failure_reason, t.created_at';

/** Inserts or advances a transaction; a captured row never regresses. Returns { row, created }. */
async function upsertTransaction(db, tx) {
  const { rows } = await db.query(
    `INSERT INTO payment_transactions (payment_order_id, provider, provider_payment_id, amount, status, method, paid_at, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (provider, provider_payment_id) DO UPDATE SET
       status = CASE WHEN payment_transactions.status = 'captured' THEN 'captured' ELSE EXCLUDED.status END,
       paid_at = COALESCE(payment_transactions.paid_at, EXCLUDED.paid_at),
       failure_reason = CASE WHEN payment_transactions.status = 'captured' THEN payment_transactions.failure_reason ELSE EXCLUDED.failure_reason END
     RETURNING id, status, (xmax = 0) AS created`,
    [tx.paymentOrderId, tx.provider, tx.providerPaymentId, tx.amount, tx.status, tx.method ?? null, tx.paidAt ?? null, tx.failureReason ?? null],
  );
  return rows[0];
}

async function findTransaction(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${TRANSACTION_COLUMNS} FROM payment_transactions t WHERE t.id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function findTransactionByProviderId(db, providerName, providerPaymentId) {
  const { rows } = await db.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM payment_transactions t WHERE t.provider = $1 AND t.provider_payment_id = $2`,
    [providerName, providerPaymentId],
  );
  return rows[0] ?? null;
}

async function listTransactionsForBooking(db, bookingId) {
  const { rows } = await db.query(
    `SELECT ${TRANSACTION_COLUMNS}, o.booking_id FROM payment_transactions t JOIN payment_orders o ON o.id = t.payment_order_id
     WHERE o.booking_id = $1 ORDER BY t.created_at`,
    [bookingId],
  );
  return rows;
}

/** Captured transactions of a booking, newest first (refunds draw from these). */
async function capturedForBooking(db, bookingId) {
  const { rows } = await db.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM payment_transactions t JOIN payment_orders o ON o.id = t.payment_order_id
     WHERE o.booking_id = $1 AND t.status = 'captured' ORDER BY t.paid_at DESC`,
    [bookingId],
  );
  return rows;
}

// ---- webhook events ----

/** Persists the event; returns null when this event id was already received. */
async function insertEvent(db, event) {
  const { rows } = await db.query(
    `INSERT INTO payment_webhook_events (provider, provider_event_id, event_type, payload) VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id, processing_status, payload, event_type`,
    [event.provider, event.providerEventId, event.eventType, event.payload],
  );
  return rows[0] ?? null;
}

async function findEvent(db, provider, providerEventId) {
  const { rows } = await db.query(
    'SELECT id, processing_status, payload, event_type FROM payment_webhook_events WHERE provider = $1 AND provider_event_id = $2',
    [provider, providerEventId],
  );
  return rows[0] ?? null;
}

async function markEvent(db, id, { status, error }) {
  await db.query(
    `UPDATE payment_webhook_events SET processing_status = $2, last_error = $3, attempts = attempts + 1,
       processed_at = CASE WHEN $2 IN ('processed', 'ignored') THEN now() ELSE processed_at END
     WHERE id = $1`,
    [id, status, error ?? null],
  );
}

async function listRetryableEvents(db, limit) {
  const { rows } = await db.query(
    `SELECT id, processing_status, payload, event_type FROM payment_webhook_events
     WHERE processing_status IN ('received', 'failed') AND attempts < 10 AND received_at < now() - interval '1 minute'
     ORDER BY received_at LIMIT $1`,
    [limit],
  );
  return rows;
}

// ---- refunds ----

const REFUND_COLUMNS = `r.id, r.booking_id, r.payment_transaction_id, r.provider_refund_id, r.amount, r.kind, r.reason, r.status,
  r.attempts, r.last_error, r.requested_by, r.requested_at, r.processed_at, r.updated_at`;

/** Returns the new refund id, or null when an automatic refund of this kind already exists. */
async function insertRefund(db, refund) {
  const { rows } = await db.query(
    `INSERT INTO refunds (booking_id, payment_transaction_id, amount, kind, reason, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`,
    [refund.bookingId, refund.paymentTransactionId, refund.amount, refund.kind, refund.reason ?? null, refund.requestedBy ?? null],
  );
  return rows[0]?.id ?? null;
}

async function findRefund(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${REFUND_COLUMNS}, t.provider_payment_id FROM refunds r
     JOIN payment_transactions t ON t.id = r.payment_transaction_id WHERE r.id = $1 ${forUpdate ? 'FOR UPDATE OF r' : ''}`, [id]);
  return rows[0] ?? null;
}

async function findRefundByProviderId(db, providerRefundId) {
  const { rows } = await db.query(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.provider_refund_id = $1`, [providerRefundId]);
  return rows[0] ?? null;
}

async function updateRefund(db, id, fields) {
  const query = buildUpdate('refunds', id, fields, {
    status: 'status',
    providerRefundId: 'provider_refund_id',
    attempts: 'attempts',
    lastError: 'last_error',
    processedAt: 'processed_at',
  });
  if (query) await db.query(query.text, query.values);
}

/** Minor units already refunded or in flight against a transaction (failed refunds excluded). */
async function refundedAgainstTransaction(db, transactionId) {
  const { rows } = await db.query(
    "SELECT coalesce(sum(amount), 0)::text AS total FROM refunds WHERE payment_transaction_id = $1 AND status <> 'failed'",
    [transactionId],
  );
  return rows[0].total;
}

async function refundTotalsForBooking(db, bookingId, { excludeKind = null } = {}) {
  const { rows } = await db.query(
    `SELECT coalesce(sum(amount) FILTER (WHERE status = 'succeeded'), 0)::text AS succeeded FROM refunds
     WHERE booking_id = $1 AND ($2::text IS NULL OR kind <> $2)`,
    [bookingId, excludeKind],
  );
  return rows[0].succeeded;
}

/** Transactions returned as duplicate payments (excluded from the booking's paid total). */
async function duplicateRefundedTransactionIds(db, bookingId) {
  const { rows } = await db.query("SELECT payment_transaction_id FROM refunds WHERE booking_id = $1 AND kind = 'duplicate_payment'", [bookingId]);
  return rows.map((row) => row.payment_transaction_id);
}

async function listRefundsForBooking(db, bookingId) {
  const { rows } = await db.query(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.booking_id = $1 ORDER BY r.requested_at`, [bookingId]);
  return rows;
}

/** Refunds needing (re)submission: never attempted, stuck in processing, or failed with backoff elapsed. */
async function listRefundsToProcess(db, limit) {
  const { rows } = await db.query(
    `SELECT r.id FROM refunds r
     WHERE (r.status = 'requested')
        OR (r.status = 'processing' AND r.updated_at < now() - interval '10 minutes')
        OR (r.status = 'failed' AND r.kind <> 'manual' AND r.attempts < 5
            AND r.updated_at < now() - make_interval(mins => power(2, r.attempts)::int))
     ORDER BY r.updated_at LIMIT $1`,
    [limit],
  );
  return rows.map((row) => row.id);
}

async function searchRefunds(db, { status, bookingId, page, limit }) {
  const values = [status ?? null, bookingId ?? null];
  const where = 'WHERE ($1::text IS NULL OR r.status = $1) AND ($2::uuid IS NULL OR r.booking_id = $2)';
  const window = pageWindow({ page, limit });
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${REFUND_COLUMNS} FROM refunds r ${where} ORDER BY r.requested_at DESC, r.id LIMIT $3 OFFSET $4`, [
      ...values,
      window.limit,
      window.offset,
    ]),
    db.query(`SELECT count(*)::int AS total FROM refunds r ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

module.exports = {
  insertOrder,
  findOrder,
  findOrderByProviderId,
  findOpenOrderForBooking,
  listOrdersForBooking,
  updateOrder,
  listOrdersToReconcile,
  searchOrders,
  upsertTransaction,
  findTransaction,
  findTransactionByProviderId,
  listTransactionsForBooking,
  capturedForBooking,
  insertEvent,
  findEvent,
  markEvent,
  listRetryableEvents,
  insertRefund,
  findRefund,
  findRefundByProviderId,
  updateRefund,
  refundedAgainstTransaction,
  refundTotalsForBooking,
  duplicateRefundedTransactionIds,
  listRefundsForBooking,
  listRefundsToProcess,
  searchRefunds,
};
