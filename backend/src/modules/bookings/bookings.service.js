'use strict';

const { randomBytes } = require('node:crypto');
const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const idempotency = require('../../core/database/idempotency');
const { appendOutboxEvent } = require('../../core/events/outbox');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { toMinor, fromMinor } = require('../../core/utils/money');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const settingsService = require('../settings/settings.service');
const propertiesService = require('../properties/properties.service');
const guidesService = require('../guides/guides.service');
const experiencesService = require('../experiences/experiences.service');
const packagesService = require('../packages/packages.service');
const allocations = require('./allocations.repository');
const repository = require('./bookings.repository');

const CURRENCY = 'INR';
const HOUR_MS = 3_600_000;

/** Each booking type is priced and capacity-checked by the module that owns the supply. */
const SUPPLY = {
  property_room: propertiesService,
  guide_service: guidesService,
  experience_session: experiencesService,
  package_departure: packagesService,
};

/**
 * Allowed transitions (Report §8.3). Payment-driven ones (pending_payment -> confirmed)
 * are performed by the payments module through confirmAfterPayment().
 */
const TRANSITIONS = {
  requested: ['pending_payment', 'rejected', 'expired', 'cancelled'],
  pending_payment: ['confirmed', 'expired', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
};

const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');

function assertTransition(from, to) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw ApiError.conflict(`Booking cannot move from ${from} to ${to}`, 'INVALID_BOOKING_STATE', { status: from });
  }
}

function generateReference(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = [...randomBytes(6)].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `JHT-${date}-${suffix}`;
}

async function totals(subtotal) {
  const rate = Number(await settingsService.get('booking.tax_rate_percent'));
  const subtotalMinor = toMinor(subtotal);
  const taxMinor = Math.round((subtotalMinor * rate) / 100);
  return { subtotal: fromMinor(subtotalMinor), taxAmount: fromMinor(taxMinor), discountAmount: '0.00', totalAmount: fromMinor(subtotalMinor + taxMinor) };
}

/** Rejects services that already started or lie beyond the advance-booking horizon. */
async function assertBookableWindow(offer) {
  const maxDays = Number(await settingsService.get('booking.max_advance_days'));
  if (offer.serviceStartAt <= new Date()) throw ApiError.validation([{ location: 'body', path: 'resourceId', message: 'the service has already started' }]);
  if (offer.serviceStartAt.getTime() > Date.now() + maxDays * 24 * HOUR_MS) {
    throw ApiError.validation([{ location: 'body', path: 'resourceId', message: `bookings open at most ${maxDays} days ahead` }]);
  }
}

const toTraveler = (row) => ({ fullName: row.full_name, age: row.age, isPrimary: row.is_primary });

function toSummary(row, { admin = false } = {}) {
  const summary = {
    id: row.id,
    reference: row.booking_reference,
    bookingType: row.booking_type,
    bookingMode: row.booking_mode,
    status: row.booking_status,
    paymentStatus: row.payment_status,
    currency: row.currency,
    subtotal: row.subtotal,
    taxAmount: row.tax_amount,
    discountAmount: row.discount_amount,
    totalAmount: row.total_amount,
    serviceStartAt: iso(row.service_start_at),
    serviceEndAt: iso(row.service_end_at),
    expiresAt: iso(row.expires_at),
    confirmedAt: iso(row.confirmed_at),
    cancelledAt: iso(row.cancelled_at),
    createdAt: iso(row.created_at),
    item: {
      itemType: row.item_type,
      resourceId: row.item_reference_id,
      description: row.description_snapshot,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      totalAmount: row.item_total,
    },
  };
  if (admin) Object.assign(summary, { userId: row.user_id, partnerId: row.partner_id });
  return summary;
}

async function toDetail(row, options) {
  const parts = await repository.detailParts(pool, row.id);
  const { request: _request, cancellationPolicy, ...details } = row.booking_details;
  const summary = toSummary(row, options);
  return {
    ...summary,
    item: { ...summary.item, details, cancellationPolicy },
    travelers: parts.travelers.map(toTraveler),
    cancellation: parts.cancellation && {
      reason: parts.cancellation.reason,
      cancellationFee: parts.cancellation.cancellation_fee,
      refundAmount: parts.cancellation.refund_amount,
      status: parts.cancellation.status,
      createdAt: iso(parts.cancellation.created_at),
    },
    history: parts.history.map((h) => ({ oldStatus: h.old_status, newStatus: h.new_status, reason: h.reason, createdAt: iso(h.created_at) })),
  };
}

async function setStatus(client, booking, status, { changedBy, reason, fields = {} }) {
  assertTransition(booking.booking_status, status);
  await repository.update(client, booking.id, { status, ...fields });
  await repository.insertHistory(client, { bookingId: booking.id, oldStatus: booking.booking_status, newStatus: status, changedBy, reason });
}

async function emit(client, eventType, booking, payload = {}) {
  await appendOutboxEvent(client, {
    eventType,
    aggregateType: 'booking',
    aggregateId: booking.id,
    payload: { bookingId: booking.id, reference: booking.booking_reference, userId: booking.user_id, partnerId: booking.partner_id, ...payload },
  });
}

/** Inserts the capacity hold for a priced offer (lapsed guide holds are retired first). */
async function placeHold(client, offer, bookingItemId, expiresAt) {
  if (offer.hold.resourceType === 'guide') await allocations.expireLapsedGuideHolds(client, offer.hold.resourceId);
  try {
    await allocations.insertHold(client, { ...offer.hold, bookingItemId, expiresAt });
  } catch (err) {
    if (err.code === '23P01') throw ApiError.conflict('The guide is already booked at that time', 'INSUFFICIENT_AVAILABILITY');
    throw err;
  }
}

function requireAvailable(offer) {
  if (!offer.available) throw ApiError.conflict(offer.unavailableReason || 'Not available', 'INSUFFICIENT_AVAILABILITY');
}

// ---- Tourist ----

/** Authoritative price and availability at this moment. A quote is not a reservation. */
async function quote(input) {
  const offer = await SUPPLY[input.itemType].prepareBooking(pool, input);
  await assertBookableWindow(offer);
  const holdMinutes = Number(await settingsService.get('booking.hold_minutes'));
  return {
    itemType: offer.itemType,
    resourceId: offer.itemReferenceId,
    description: offer.description,
    bookingMode: offer.bookingMode,
    currency: CURRENCY,
    quantity: offer.quantity,
    unitPrice: offer.unitPrice,
    ...(await totals(offer.subtotal)),
    available: offer.available,
    unavailableReason: offer.unavailableReason,
    serviceStartAt: iso(offer.serviceStartAt),
    serviceEndAt: iso(offer.serviceEndAt),
    cancellationPolicy: offer.cancellationPolicy ?? (await settingsService.get('booking.default_cancellation_policy')),
    details: offer.details,
    priceValidUntil: new Date(Date.now() + holdMinutes * 60_000).toISOString(),
  };
}

/**
 * Creates an instant booking (capacity held until the payment deadline) or a
 * request-to-book (no capacity reserved until the partner approves). The supply row is
 * locked for the whole transaction, so concurrent attempts on the last unit serialise
 * and exactly one succeeds. Idempotent per user and Idempotency-Key.
 */
async function create(ctx, input, idempotencyKey) {
  if (!ctx.actorEmailVerified) throw ApiError.forbidden('Verify your email address before booking', 'EMAIL_NOT_VERIFIED');
  const { travelers, ...request } = input;

  const result = await withTransaction(
    (client) =>
      idempotency.runOnce(client, { scope: `bookings.create:${ctx.actorUserId}`, key: idempotencyKey, body: input }, async () => {
        const offer = await SUPPLY[input.itemType].prepareBooking(client, request, { lock: true });
        await assertBookableWindow(offer);
        requireAvailable(offer);

        const [amounts, holdMinutes, approvalHours, defaultPolicy] = await Promise.all([
          totals(offer.subtotal),
          settingsService.get('booking.hold_minutes'),
          settingsService.get('booking.request_approval_hours'),
          settingsService.get('booking.default_cancellation_policy'),
        ]);
        const instant = offer.bookingMode === 'instant';
        const status = instant ? 'pending_payment' : 'requested';
        const expiresAt = new Date(Date.now() + (instant ? Number(holdMinutes) * 60_000 : Number(approvalHours) * HOUR_MS));

        let bookingId;
        for (let attempt = 0; !bookingId; attempt += 1) {
          try {
            await client.query('SAVEPOINT booking_reference');
            bookingId = await repository.insertBooking(client, {
              reference: generateReference(),
              userId: ctx.actorUserId,
              partnerId: offer.partnerId,
              bookingType: offer.itemType,
              bookingMode: offer.bookingMode,
              status,
              currency: CURRENCY,
              ...amounts,
              serviceStartAt: offer.serviceStartAt,
              serviceEndAt: offer.serviceEndAt,
              expiresAt,
            });
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT booking_reference');
            if (err.code !== '23505' || attempt >= 3) throw err;
          }
        }
        const itemId = await repository.insertItem(client, bookingId, {
          itemType: offer.itemType,
          itemReferenceId: offer.itemReferenceId,
          description: offer.description,
          quantity: offer.quantity,
          unitPrice: offer.unitPrice,
          taxAmount: amounts.taxAmount,
          totalAmount: amounts.totalAmount,
          // Terms are snapshotted: later supply edits never change this booking (Report §8.2).
          details: { ...offer.details, cancellationPolicy: offer.cancellationPolicy ?? defaultPolicy, request },
        });
        await repository.insertTravelers(client, bookingId, travelers);
        await repository.insertHistory(client, { bookingId, oldStatus: null, newStatus: status, changedBy: ctx.actorUserId });
        if (instant) await placeHold(client, offer, itemId, expiresAt);

        const booking = await repository.find(client, bookingId);
        await emit(client, instant ? 'booking.created' : 'booking.requested', booking, { status, expiresAt: expiresAt.toISOString() });
        return { status: 201, body: { bookingId } };
      }),
    { retries: 2 },
  );
  return { replayed: result.replayed, booking: await getOwn(ctx, result.body.bookingId) };
}

async function requireOwn(ctx, id) {
  const row = await repository.find(pool, id);
  if (!row || row.user_id !== ctx.actorUserId) throw notFound();
  return row;
}

async function getOwn(ctx, id) {
  return toDetail(await requireOwn(ctx, id));
}

async function listOwn(ctx, { status, bookingType, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { userId: ctx.actorUserId, statuses: status ? [status] : undefined, bookingType, sort, page, limit });
  return { items: rows.map((row) => toSummary(row)), meta: pageMeta({ page, limit }, total) };
}

async function getStatus(ctx, id) {
  const row = await requireOwn(ctx, id);
  const active = ['requested', 'pending_payment'].includes(row.booking_status);
  return {
    id: row.id,
    reference: row.booking_reference,
    status: row.booking_status,
    paymentStatus: row.payment_status,
    expiresAt: active ? iso(row.expires_at) : null,
    secondsRemaining: active ? Math.max(0, Math.floor((row.expires_at - Date.now()) / 1000)) : null,
  };
}

async function listDocuments(ctx, id) {
  await requireOwn(ctx, id);
  const { documents } = await repository.detailParts(pool, id);
  return Promise.all(
    documents.map(async (doc) => ({
      id: doc.id,
      documentType: doc.document_type,
      createdAt: iso(doc.created_at),
      media: await mediaService.getForAuthorizedReview(doc.media_id),
    })),
  );
}

// ---- Cancellation ----

/** Refund from the policy snapshotted at purchase (Report §8.2), never the current policy. */
function computeRefund(booking, { waiveFee = false, now = new Date() } = {}) {
  const totalMinor = toMinor(booking.total_amount);
  if (booking.payment_status !== 'paid') return { cancellationFee: '0.00', refundAmount: '0.00', refundPercent: 0 };
  if (waiveFee) return { cancellationFee: '0.00', refundAmount: fromMinor(totalMinor), refundPercent: 100 };
  const hoursBefore = (booking.service_start_at - now) / HOUR_MS;
  const tiers = [...(booking.booking_details.cancellationPolicy?.tiers ?? [])].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn);
  const refundPercent = tiers.find((tier) => hoursBefore >= tier.hoursBeforeCheckIn)?.refundPercent ?? 0;
  const refundMinor = Math.round((totalMinor * refundPercent) / 100);
  return { cancellationFee: fromMinor(totalMinor - refundMinor), refundAmount: fromMinor(refundMinor), refundPercent };
}

async function cancelLocked(client, booking, { actorId, reason, waiveFee = false, allowAfterStart = false }) {
  if (booking.booking_status === 'confirmed' && booking.service_start_at <= new Date() && !allowAfterStart) {
    throw ApiError.conflict('The service has already started and can no longer be cancelled', 'SERVICE_STARTED');
  }
  const refund = computeRefund(booking, { waiveFee });
  await setStatus(client, booking, 'cancelled', { changedBy: actorId, reason, fields: { cancelledAt: new Date(), expiresAt: null } });
  await allocations.transitionHolds(client, booking.id, ['held', 'confirmed'], 'released');
  const refundPending = toMinor(refund.refundAmount) > 0;
  await repository.insertCancellation(client, {
    bookingId: booking.id,
    reason,
    cancellationFee: refund.cancellationFee,
    refundAmount: refund.refundAmount,
    requestedBy: actorId,
    status: refundPending ? 'refund_pending' : 'completed',
  });
  // The payments module (Phase 6) issues the refund from this event.
  await emit(client, 'booking.cancelled', booking, { ...refund, refundPending, cancelledBy: actorId });
  return refund;
}

async function cancelOwn(ctx, id, { reason }) {
  await withTransaction(async (client) => {
    const booking = await repository.find(client, id, { forUpdate: true });
    if (!booking || booking.user_id !== ctx.actorUserId) throw notFound();
    await cancelLocked(client, booking, { actorId: ctx.actorUserId, reason });
  });
  return getOwn(ctx, id);
}

// ---- Partner ----

async function requirePartnerBooking(db, ctx, id, options) {
  const row = await repository.find(db, id, options);
  if (!row || row.partner_id !== ctx.partner.partnerId) throw notFound();
  return row;
}

async function listForPartner(ctx, { status, bookingType, from, to, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, {
    partnerId: ctx.partner.partnerId,
    statuses: status ? [status] : undefined,
    bookingType,
    from,
    to,
    sort,
    page,
    limit,
  });
  return { items: rows.map((row) => toSummary(row)), meta: pageMeta({ page, limit }, total) };
}

async function getForPartner(ctx, id) {
  return toDetail(await requirePartnerBooking(pool, ctx, id));
}

/**
 * Approval reserves capacity (under the supply lock) and opens the payment window.
 * The originally quoted price stands; capacity must still be available.
 */
async function approve(ctx, id, { note }) {
  await withTransaction(
    async (client) => {
      const booking = await requirePartnerBooking(client, ctx, id, { forUpdate: true });
      assertTransition(booking.booking_status, 'pending_payment');
      if (booking.expires_at <= new Date()) throw ApiError.conflict('The approval window has elapsed', 'BOOKING_EXPIRED');
      const offer = await SUPPLY[booking.item_type].prepareBooking(client, booking.booking_details.request, { lock: true });
      requireAvailable(offer);
      const paymentHours = Number(await settingsService.get('booking.payment_window_hours'));
      const expiresAt = new Date(Date.now() + paymentHours * HOUR_MS);
      await placeHold(client, offer, booking.item_id, expiresAt);
      await setStatus(client, booking, 'pending_payment', { changedBy: ctx.actorUserId, reason: note, fields: { expiresAt } });
      await emit(client, 'booking.approved', booking, { expiresAt: expiresAt.toISOString() });
    },
    { retries: 2 },
  );
  return getForPartner(ctx, id);
}

async function reject(ctx, id, { reason }) {
  await withTransaction(async (client) => {
    const booking = await requirePartnerBooking(client, ctx, id, { forUpdate: true });
    await setStatus(client, booking, 'rejected', { changedBy: ctx.actorUserId, reason, fields: { expiresAt: null } });
    await emit(client, 'booking.rejected', booking, { reason });
  });
  return getForPartner(ctx, id);
}

// ---- Admin ----

async function adminList({ status, paymentStatus, bookingType, reference, userId, partnerId, from, to, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, {
    statuses: status ? [status] : undefined,
    paymentStatus,
    bookingType,
    reference,
    userId,
    partnerId,
    from,
    to,
    sort,
    page,
    limit,
  });
  return { items: rows.map((row) => toSummary(row, { admin: true })), meta: pageMeta({ page, limit }, total) };
}

async function adminGet(id) {
  const row = await repository.find(pool, id);
  if (!row) throw notFound();
  return toDetail(row, { admin: true });
}

/** Platform cancellation (audited); may waive the policy fee and cancel after service start. */
async function adminCancel(ctx, id, { reason, waiveFee }) {
  await auditService.auditedTransaction(ctx, 'booking', async (client) => {
    const booking = await repository.find(client, id, { forUpdate: true });
    if (!booking) throw notFound();
    const refund = await cancelLocked(client, booking, { actorId: ctx.actorUserId, reason, waiveFee, allowAfterStart: true });
    return { entityId: id, action: 'bookings.cancelled_by_admin', oldValues: { status: booking.booking_status }, newValues: { status: 'cancelled', reason, waiveFee, ...refund } };
  });
  return adminGet(id);
}

// ---- Interfaces for payments (Phase 6) and the worker ----

/**
 * Confirms a pending_payment booking whose payment has been verified. Returns
 * { confirmed: false, reason } instead of throwing when the booking can no longer be
 * confirmed (e.g. its hold lapsed), so the payments module can reconcile/refund.
 */
async function confirmAfterPayment(client, bookingId) {
  const booking = await repository.find(client, bookingId, { forUpdate: true });
  if (!booking) throw notFound();
  if (booking.booking_status === 'confirmed') return { confirmed: true, alreadyConfirmed: true };
  if (booking.booking_status !== 'pending_payment') return { confirmed: false, reason: `BOOKING_${booking.booking_status.toUpperCase()}` };
  if (!(await allocations.bookingHoldsActive(client, bookingId))) return { confirmed: false, reason: 'HOLD_EXPIRED' };
  await allocations.transitionHolds(client, bookingId, ['held'], 'confirmed');
  await setStatus(client, booking, 'confirmed', { reason: 'Payment verified', fields: { paymentStatus: 'paid', confirmedAt: new Date(), expiresAt: null } });
  await emit(client, 'booking.confirmed', booking);
  return { confirmed: true };
}

/** Expires lapsed requests/holds and completes finished stays. Safe to run concurrently. */
async function runMaintenance({ batchSize = 100 } = {}) {
  const expired = await withTransaction(async (client) => {
    const due = await repository.lockDueForExpiry(client, batchSize);
    for (const row of due) {
      const booking = await repository.find(client, row.id);
      const reason = row.booking_status === 'requested' ? 'Partner did not respond in time' : 'Payment window elapsed';
      await setStatus(client, booking, 'expired', { reason, fields: { expiresAt: null } });
      await allocations.transitionHolds(client, row.id, ['held'], 'expired');
      await emit(client, 'booking.expired', booking, { previousStatus: row.booking_status });
    }
    return due.length;
  });
  const completed = await withTransaction(async (client) => {
    const due = await repository.lockDueForCompletion(client, batchSize);
    for (const row of due) {
      const booking = await repository.find(client, row.id);
      await setStatus(client, booking, 'completed', { reason: 'Service period ended' });
      await emit(client, 'booking.completed', booking);
    }
    return due.length;
  });
  return { expired, completed };
}

module.exports = {
  quote,
  create,
  getOwn,
  listOwn,
  getStatus,
  listDocuments,
  cancelOwn,
  listForPartner,
  getForPartner,
  approve,
  reject,
  adminList,
  adminGet,
  adminCancel,
  confirmAfterPayment,
  runMaintenance,
  computeRefund,
};
