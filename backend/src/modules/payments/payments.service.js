'use strict';

const { createHash } = require('node:crypto');
const config = require('../../config');
const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const idempotency = require('../../core/database/idempotency');
const { appendOutboxEvent } = require('../../core/events/outbox');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../core/logging/logger');
const { pageMeta } = require('../../core/utils/pagination');
const { toMinor, fromMinor } = require('../../core/utils/money');
const auditService = require('../audit/audit.service');
const bookingsService = require('../bookings/bookings.service');
const provider = require('./providers/razorpay');
const repository = require('./payments.repository');

const MAX_AUTOMATIC_REFUND_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 10 * 60_000;
const iso = (value) => (value ? value.toISOString() : null);
const errorText = (err) => String(err?.message ?? err).slice(0, 1000);

// ---- DTOs ----

const toOrder = (row) => ({
  id: row.id,
  bookingId: row.booking_id,
  provider: row.provider,
  providerOrderId: row.provider_order_id,
  amount: row.amount,
  currency: row.currency,
  status: row.status,
  expiresAt: iso(row.expires_at),
  createdAt: iso(row.created_at),
});

const toTransaction = (row) => ({
  id: row.id,
  orderId: row.payment_order_id,
  providerPaymentId: row.provider_payment_id,
  amount: row.amount,
  status: row.status,
  method: row.method,
  paidAt: iso(row.paid_at),
  failureReason: row.failure_reason,
});

function toRefund(row, { admin = false } = {}) {
  const refund = {
    id: row.id,
    bookingId: row.booking_id,
    amount: row.amount,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    providerRefundId: row.provider_refund_id,
    requestedAt: iso(row.requested_at),
    processedAt: iso(row.processed_at),
  };
  if (admin) Object.assign(refund, { attempts: row.attempts, lastError: row.last_error, requestedBy: row.requested_by });
  return refund;
}

/** What the browser needs to open Razorpay Checkout (never includes the key secret). */
function toCheckout(order, booking) {
  return {
    order: toOrder(order),
    checkout: {
      provider: order.provider,
      keyId: provider.checkoutKeyId(),
      orderId: order.provider_order_id,
      amount: toMinor(order.amount),
      currency: order.currency,
      name: 'Jharkhand Tourism',
      description: `Booking ${booking.booking_reference}`,
    },
  };
}

async function requireOwnBooking(db, ctx, bookingId, options) {
  const booking = await bookingsService.getForPayment(db, bookingId, options);
  if (!booking || booking.user_id !== ctx.actorUserId) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  return booking;
}

// ---- Orders ----

/**
 * Creates (or reuses) the provider order for a pending_payment booking. The booking row
 * is locked across the provider call so concurrent attempts produce one order.
 */
async function createPaymentOrder(ctx, bookingId, idempotencyKey) {
  provider.assertConfigured();
  const result = await withTransaction((client) =>
    idempotency.runOnce(client, { scope: `payments.order:${ctx.actorUserId}`, key: idempotencyKey, body: { bookingId } }, async () => {
      const booking = await requireOwnBooking(client, ctx, bookingId, { forUpdate: true });
      if (booking.booking_status !== 'pending_payment') {
        throw ApiError.conflict(`A ${booking.booking_status} booking cannot be paid`, 'BOOKING_NOT_PAYABLE');
      }
      if (booking.expires_at <= new Date()) throw ApiError.conflict('The payment window has elapsed', 'BOOKING_EXPIRED');

      let order = await repository.findOpenOrderForBooking(client, bookingId);
      if (!order) {
        const created = await provider.createOrder({
          amountMinor: toMinor(booking.total_amount),
          currency: booking.currency,
          receipt: booking.booking_reference,
          notes: { bookingId: booking.id, reference: booking.booking_reference },
        });
        order = await repository.insertOrder(client, {
          bookingId,
          provider: provider.NAME,
          providerOrderId: created.providerOrderId,
          amount: booking.total_amount,
          currency: booking.currency,
          expiresAt: booking.expires_at,
        });
        await bookingsService.setPaymentStatus(client, bookingId, 'pending');
      }
      return { status: 201, body: { orderId: order.id } };
    }),
  );
  const order = await repository.findOrder(pool, result.body.orderId);
  return { replayed: result.replayed, ...toCheckout(order, await bookingsService.getForPayment(pool, bookingId)) };
}

async function getOrder(ctx, orderId) {
  const order = await repository.findOrder(pool, orderId);
  if (!order) throw ApiError.notFound('Payment order not found', 'PAYMENT_ORDER_NOT_FOUND');
  await requireOwnBooking(pool, ctx, order.booking_id).catch(() => {
    throw ApiError.notFound('Payment order not found', 'PAYMENT_ORDER_NOT_FOUND');
  });
  return toOrder(order);
}

async function bookingPayments(ctx, bookingId) {
  await requireOwnBooking(pool, ctx, bookingId);
  const [orders, transactions, refunds] = await Promise.all([
    repository.listOrdersForBooking(pool, bookingId),
    repository.listTransactionsForBooking(pool, bookingId),
    repository.listRefundsForBooking(pool, bookingId),
  ]);
  return { orders: orders.map(toOrder), transactions: transactions.map(toTransaction), refunds: refunds.map((r) => toRefund(r)) };
}

// ---- Settlement (callback, webhook and reconciliation all converge here) ----

/**
 * Records an authoritative provider payment and drives the booking. Never trusts the
 * browser: the payment is fetched from the provider and matched to our order by id,
 * amount and currency. Idempotent: repeated calls for the same payment are no-ops.
 * A captured payment that can no longer confirm its booking is refunded in full.
 */
async function settlePayment(providerPaymentId) {
  let payment = await provider.fetchPayment(providerPaymentId);
  const order = await repository.findOrderByProviderId(pool, provider.NAME, payment.orderId);
  if (!order) {
    logger.warn({ providerPaymentId }, 'Payment for an unknown order ignored');
    return { outcome: 'unknown_order' };
  }
  if (payment.amountMinor !== toMinor(order.amount) || payment.currency !== order.currency) {
    logger.error({ providerPaymentId, orderId: order.id }, 'Payment amount/currency mismatch');
    await withTransaction((client) =>
      repository.upsertTransaction(client, {
        paymentOrderId: order.id,
        provider: provider.NAME,
        providerPaymentId,
        amount: fromMinor(payment.amountMinor),
        status: 'failed',
        failureReason: 'Amount or currency does not match the order',
      }),
    );
    return { outcome: 'mismatch', bookingId: order.booking_id };
  }
  if (payment.status === 'authorized') payment = await provider.capturePayment(providerPaymentId, payment.amountMinor, payment.currency);

  if (payment.status === 'failed') {
    await withTransaction(async (client) => {
      const locked = await repository.findOrder(client, order.id, { forUpdate: true });
      await repository.upsertTransaction(client, {
        paymentOrderId: order.id,
        provider: provider.NAME,
        providerPaymentId,
        amount: order.amount,
        status: 'failed',
        method: payment.method,
        failureReason: payment.errorDescription ?? 'Payment failed',
      });
      if (locked.status !== 'paid') {
        await repository.updateOrder(client, order.id, { status: 'pending' });
        const booking = await bookingsService.getForPayment(client, order.booking_id, { forUpdate: true });
        if (booking.payment_status === 'pending') await bookingsService.setPaymentStatus(client, order.booking_id, 'failed');
      }
    });
    return { outcome: 'failed', bookingId: order.booking_id };
  }
  if (payment.status !== 'captured') return { outcome: 'pending', bookingId: order.booking_id };

  const result = await withTransaction(
    async (client) => {
      await repository.findOrder(client, order.id, { forUpdate: true });
      // Under the order lock: a capture we already settled is acknowledged without side effects.
      const previous = await repository.findTransactionByProviderId(client, provider.NAME, providerPaymentId);
      if (previous?.status === 'captured') return { confirmation: { confirmed: true, alreadySettled: true }, refundId: null };
      const tx = await repository.upsertTransaction(client, {
        paymentOrderId: order.id,
        provider: provider.NAME,
        providerPaymentId,
        amount: order.amount,
        status: 'captured',
        method: payment.method,
        paidAt: new Date(),
      });
      await repository.updateOrder(client, order.id, { status: 'paid' });

      const captured = await repository.capturedForBooking(client, order.booking_id);
      const confirmedByOther = captured.some((other) => other.id !== tx.id);
      let confirmation = await bookingsService.confirmAfterPayment(client, order.booking_id);
      if (!confirmation.confirmed && ['HOLD_EXPIRED', 'BOOKING_EXPIRED'].includes(confirmation.reason)) {
        confirmation = await bookingsService.reconfirmLatePayment(client, order.booking_id);
      }

      let refundId = null;
      if (confirmation.alreadyConfirmed && confirmedByOther) {
        refundId = await requestRefund(client, {
          bookingId: order.booking_id,
          transactionId: tx.id,
          amountMinor: toMinor(order.amount),
          kind: 'duplicate_payment',
          reason: 'Second payment for an already confirmed booking',
        });
      } else if (!confirmation.confirmed) {
        await bookingsService.setPaymentStatus(client, order.booking_id, 'paid');
        refundId = await requestRefund(client, {
          bookingId: order.booking_id,
          transactionId: tx.id,
          amountMinor: toMinor(order.amount),
          kind: 'late_payment',
          reason: `Payment could not confirm the booking (${confirmation.reason})`,
        });
      }
      return { confirmation, refundId };
    },
    { retries: 2 },
  );
  if (result.refundId) await processRefund(result.refundId);
  return {
    outcome: result.refundId ? 'refunded' : 'confirmed',
    bookingId: order.booking_id,
    latePayment: Boolean(result.confirmation.latePayment),
  };
}

/** Checkout callback from the browser (via BFF): signature first, then authoritative settlement. */
async function verifyCheckout(ctx, { providerOrderId, providerPaymentId, signature }) {
  if (!provider.verifyCheckoutSignature(providerOrderId, providerPaymentId, signature)) {
    throw ApiError.badRequest('Payment signature verification failed', undefined, 'INVALID_PAYMENT_SIGNATURE');
  }
  const order = await repository.findOrderByProviderId(pool, provider.NAME, providerOrderId);
  if (!order) throw ApiError.notFound('Payment order not found', 'PAYMENT_ORDER_NOT_FOUND');
  await requireOwnBooking(pool, ctx, order.booking_id);
  const result = await settlePayment(providerPaymentId);
  if (result.outcome === 'mismatch') throw ApiError.conflict('Payment does not match the order', 'PAYMENT_MISMATCH');
  const booking = await bookingsService.getForPayment(pool, order.booking_id);
  return { outcome: result.outcome, bookingId: booking.id, bookingStatus: booking.booking_status, paymentStatus: booking.payment_status };
}

// ---- Webhooks ----

const REFUND_STATUS = { processed: 'succeeded', failed: 'failed', pending: 'processing', created: 'processing' };

async function processEvent(event) {
  const { eventType, payment, refund } = event.payload;
  try {
    let status = 'processed';
    if (['payment.captured', 'payment.authorized', 'payment.failed', 'order.paid'].includes(eventType) && payment) {
      await settlePayment(payment.id);
    } else if (['refund.processed', 'refund.failed', 'refund.created'].includes(eventType) && refund) {
      await syncProviderRefund(refund);
    } else {
      status = 'ignored';
    }
    await repository.markEvent(pool, event.id, { status });
    return status;
  } catch (err) {
    logger.error({ err, eventId: event.id }, 'Webhook processing failed; will retry');
    await repository.markEvent(pool, event.id, { status: 'failed', error: errorText(err) });
    return 'failed';
  }
}

/**
 * Verified provider webhook. The event is stored (redacted) before processing; repeated
 * deliveries of a processed event are acknowledged without side effects, and failed
 * processing is retried by the maintenance job.
 */
async function handleWebhook(providerName, { rawBody, signature, eventId, body }) {
  if (providerName !== provider.NAME) throw ApiError.notFound('Unknown payment provider', 'UNKNOWN_PROVIDER');
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    logger.warn({ providerName }, 'Webhook with invalid signature rejected');
    throw ApiError.badRequest('Invalid webhook signature', undefined, 'INVALID_WEBHOOK_SIGNATURE');
  }
  const payload = provider.parseWebhook(body);
  const providerEventId = eventId || createHash('sha256').update(rawBody).digest('hex');
  const event =
    (await repository.insertEvent(pool, { provider: provider.NAME, providerEventId, eventType: payload.eventType, payload })) ??
    (await repository.findEvent(pool, provider.NAME, providerEventId));
  if (['processed', 'ignored'].includes(event.processing_status)) return { received: true, duplicate: true };
  const status = await processEvent(event);
  return { received: true, status };
}

// ---- Refunds ----

/**
 * Creates a refund row against a captured transaction (caller's transaction). The
 * transaction row is locked so concurrent refunds can never exceed the captured amount.
 * Automatic kinds are unique per booking/payment, so retries cannot duplicate them.
 */
async function requestRefund(client, { bookingId, transactionId, amountMinor, kind, reason, requestedBy }) {
  const tx = await repository.findTransaction(client, transactionId, { forUpdate: true });
  const refundable = toMinor(tx.amount) - toMinor(await repository.refundedAgainstTransaction(client, transactionId));
  if (amountMinor > refundable) {
    if (kind === 'manual') throw ApiError.conflict(`At most ${fromMinor(Math.max(0, refundable))} can still be refunded`, 'REFUND_EXCEEDS_PAYMENT');
    return null;
  }
  return repository.insertRefund(client, { bookingId, paymentTransactionId: transactionId, amount: fromMinor(amountMinor), kind, reason, requestedBy });
}

async function applyRefundToBooking(client, refund, status) {
  // A duplicate-payment refund returns money the booking never needed; the booking stays paid.
  if (refund.kind !== 'duplicate_payment') {
    const [refunded, captured] = await Promise.all([
      repository.refundTotalsForBooking(client, refund.booking_id, { excludeKind: 'duplicate_payment' }),
      repository.capturedForBooking(client, refund.booking_id),
    ]);
    const duplicateTxIds = await repository.duplicateRefundedTransactionIds(client, refund.booking_id);
    const paidMinor = captured.filter((tx) => !duplicateTxIds.includes(tx.id)).reduce((total, tx) => total + toMinor(tx.amount), 0);
    const cancellationRefund = refund.kind === 'cancellation' ? (status === 'succeeded' ? 'refunded' : status === 'failed' ? 'refund_failed' : null) : null;
    await bookingsService.applyRefundOutcome(client, refund.booking_id, { refundedMinor: toMinor(refunded), paidMinor, cancellationRefund });
  }
  if (status === 'succeeded' || status === 'failed') {
    await appendOutboxEvent(client, {
      eventType: status === 'succeeded' ? 'refund.succeeded' : 'refund.failed',
      aggregateType: 'refund',
      aggregateId: refund.id,
      payload: { refundId: refund.id, bookingId: refund.booking_id, amount: refund.amount, kind: refund.kind },
    });
  }
}

async function setRefundStatus(refundId, status, fields = {}) {
  await withTransaction(async (client) => {
    const refund = await repository.findRefund(client, refundId, { forUpdate: true });
    if (refund.status === 'succeeded') return; // terminal: late/duplicate provider updates never regress it
    await repository.updateRefund(client, refundId, { status, ...fields, processedAt: status === 'succeeded' ? new Date() : undefined });
    if (status !== refund.status) await applyRefundToBooking(client, refund, status);
  });
}

/**
 * Submits a refund to the provider at most once in effect: the refund id is sent as the
 * provider receipt, and before any (re)submission existing provider refunds are checked
 * for that receipt, so a lost response never leads to a second refund.
 */
async function processRefund(refundId) {
  const claimed = await withTransaction(async (client) => {
    const refund = await repository.findRefund(client, refundId, { forUpdate: true });
    if (!refund || refund.status === 'succeeded') return null;
    // Another worker is submitting it right now; only a stale claim (lost response) may be retaken.
    if (refund.status === 'processing' && refund.updated_at > new Date(Date.now() - STALE_PROCESSING_MS)) return null;
    await repository.updateRefund(client, refundId, { status: 'processing', attempts: refund.attempts + 1 });
    return refund;
  });
  if (!claimed) return;
  try {
    const existing = (await provider.listPaymentRefunds(claimed.provider_payment_id)).find((r) => r.receipt === claimed.id);
    const providerRefund =
      existing ??
      (await provider.createRefund(claimed.provider_payment_id, {
        amountMinor: toMinor(claimed.amount),
        receipt: claimed.id,
        notes: { refundId: claimed.id, bookingId: claimed.booking_id, kind: claimed.kind },
      }));
    await setRefundStatus(refundId, REFUND_STATUS[providerRefund.status] ?? 'processing', { providerRefundId: providerRefund.id, lastError: null });
  } catch (err) {
    logger.error({ err: { message: err.message }, refundId }, 'Refund submission failed');
    await setRefundStatus(refundId, 'failed', { lastError: errorText(err) });
  }
}

async function syncProviderRefund(providerRefund) {
  const refund =
    (await repository.findRefundByProviderId(pool, providerRefund.id)) ??
    (providerRefund.receipt && /^[0-9a-f-]{36}$/.test(providerRefund.receipt) ? await repository.findRefund(pool, providerRefund.receipt) : null);
  if (!refund) {
    logger.warn({ providerRefundId: providerRefund.id }, 'Refund event for an unknown refund ignored');
    return;
  }
  await setRefundStatus(refund.id, REFUND_STATUS[providerRefund.status] ?? 'processing', { providerRefundId: providerRefund.id });
}

async function getOwnRefund(ctx, refundId) {
  const refund = await repository.findRefund(pool, refundId);
  if (!refund) throw ApiError.notFound('Refund not found', 'REFUND_NOT_FOUND');
  await requireOwnBooking(pool, ctx, refund.booking_id).catch(() => {
    throw ApiError.notFound('Refund not found', 'REFUND_NOT_FOUND');
  });
  return toRefund(refund);
}

// ---- Administration ----

async function adminRefund(ctx, bookingId, { amount, reason }, idempotencyKey) {
  provider.assertConfigured();
  const result = await withTransaction((client) =>
    idempotency.runOnce(client, { scope: `refunds.manual:${ctx.actorUserId}`, key: idempotencyKey, body: { bookingId, amount, reason } }, async () => {
      const booking = await bookingsService.getForPayment(client, bookingId, { forUpdate: true });
      if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
      const [tx] = await repository.capturedForBooking(client, bookingId);
      if (!tx) throw ApiError.conflict('This booking has no captured payment to refund', 'NOTHING_TO_REFUND');
      const refundable = toMinor(tx.amount) - toMinor(await repository.refundedAgainstTransaction(client, tx.id));
      const amountMinor = amount ? toMinor(amount) : refundable;
      if (amountMinor <= 0) throw ApiError.conflict('Nothing left to refund', 'NOTHING_TO_REFUND');
      const refundId = await requestRefund(client, { bookingId, transactionId: tx.id, amountMinor, kind: 'manual', reason, requestedBy: ctx.actorUserId });
      await auditService.record(client, ctx, {
        action: 'refunds.initiated',
        entityType: 'booking',
        entityId: bookingId,
        newValues: { refundId, amount: fromMinor(amountMinor), reason },
      });
      return { status: 201, body: { refundId } };
    }),
  );
  if (!result.replayed) await processRefund(result.body.refundId);
  return toRefund(await repository.findRefund(pool, result.body.refundId), { admin: true });
}

async function retryRefund(ctx, refundId) {
  provider.assertConfigured();
  await auditService.auditedTransaction(ctx, 'refund', async (client) => {
    const refund = await repository.findRefund(client, refundId, { forUpdate: true });
    if (!refund) throw ApiError.notFound('Refund not found', 'REFUND_NOT_FOUND');
    if (refund.status !== 'failed') throw ApiError.conflict(`A ${refund.status} refund cannot be retried`, 'REFUND_NOT_RETRYABLE');
    await repository.updateRefund(client, refundId, { status: 'requested' });
    return { entityId: refundId, action: 'refunds.retried', oldValues: { status: 'failed', lastError: refund.last_error }, newValues: { status: 'requested' } };
  });
  await processRefund(refundId);
  return toRefund(await repository.findRefund(pool, refundId), { admin: true });
}

async function adminPayments(query) {
  const { rows, total } = await repository.searchOrders(pool, query);
  return { items: rows.map((row) => ({ ...toOrder(row), capturedPayments: row.captured_count })), meta: pageMeta(query, total) };
}

async function adminRefunds(query) {
  const { rows, total } = await repository.searchRefunds(pool, query);
  return { items: rows.map((row) => toRefund(row, { admin: true })), meta: pageMeta(query, total) };
}

// ---- Maintenance (worker): cancellations -> refunds, retries, reconciliation, webhook retries ----

const paymentsConfigured = () => Boolean(config.payments.keyId && config.payments.keySecret);

/** Creates the refund owed by a paid cancellation (idempotent per booking). Returns the refund id or null. */
async function createCancellationRefund({ bookingId, refundAmount, reason }) {
  return withTransaction(async (client) => {
    const cancellation = await bookingsService.getCancellation(client, bookingId);
    if (!cancellation || cancellation.status !== 'refund_pending') return null;
    const [tx] = await repository.capturedForBooking(client, bookingId);
    if (!tx) return null;
    return requestRefund(client, {
      bookingId,
      transactionId: tx.id,
      amountMinor: toMinor(refundAmount ?? cancellation.refund_amount),
      kind: 'cancellation',
      reason: reason ?? 'Booking cancelled',
    });
  });
}

/** refund-processing job for a `booking.cancelled` event: create and submit the refund now. */
async function refundCancellation(bookingId) {
  if (!paymentsConfigured()) return { skipped: 'not_configured' };
  const refundId = await createCancellationRefund({ bookingId });
  if (refundId) await processRefund(refundId);
  return { refundId };
}

/** Sweep: cancellations still awaiting a refund (e.g. events lost before dispatch) and refund retries. */
async function sweepRefunds({ batchSize = 50 } = {}) {
  const stats = { cancellationRefunds: 0, refundsProcessed: 0 };
  if (!paymentsConfigured()) return stats;
  for (const cancellation of await bookingsService.listCancellationsAwaitingRefund(batchSize)) {
    if (await createCancellationRefund(cancellation)) stats.cancellationRefunds += 1;
  }
  for (const refundId of await repository.listRefundsToProcess(pool, batchSize)) {
    const refund = await repository.findRefund(pool, refundId);
    if (refund.status === 'failed' && refund.attempts >= MAX_AUTOMATIC_REFUND_ATTEMPTS) continue;
    await processRefund(refundId);
    stats.refundsProcessed += 1;
  }
  return stats;
}

/** payment-reconciliation job: re-check unpaid orders with the provider and retry failed webhook events. */
async function reconcile({ batchSize = 50 } = {}) {
  const stats = { ordersReconciled: 0, eventsRetried: 0 };
  if (!paymentsConfigured()) return stats;
  for (const order of await repository.listOrdersToReconcile(pool, batchSize)) {
    try {
      const payments = await provider.listOrderPayments(order.provider_order_id);
      for (const payment of payments.filter((p) => ['captured', 'authorized', 'failed'].includes(p.status))) {
        await settlePayment(payment.id);
      }
      const fresh = await repository.findOrder(pool, order.id);
      await repository.updateOrder(pool, order.id, {
        reconciledAt: new Date(),
        status: ['created', 'pending'].includes(fresh.status) && fresh.expires_at <= new Date() ? 'expired' : undefined,
      });
      stats.ordersReconciled += 1;
    } catch (err) {
      logger.warn({ err: { message: err.message }, orderId: order.id }, 'Order reconciliation failed');
    }
  }

  for (const event of await repository.listRetryableEvents(pool, batchSize)) {
    await processEvent(event);
    stats.eventsRetried += 1;
  }
  return stats;
}

/** All payment maintenance in one call (tests and manual runs). */
async function runMaintenance(options) {
  return { ...(await sweepRefunds(options)), ...(await reconcile(options)) };
}

module.exports = {
  createPaymentOrder,
  getOrder,
  bookingPayments,
  settlePayment,
  verifyCheckout,
  handleWebhook,
  processRefund,
  getOwnRefund,
  adminRefund,
  retryRefund,
  adminPayments,
  adminRefunds,
  refundCancellation,
  sweepRefunds,
  reconcile,
  runMaintenance,
};
