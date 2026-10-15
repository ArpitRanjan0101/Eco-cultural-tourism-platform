'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const bookingsService = require('../../src/modules/bookings/bookings.service');
const paymentsService = require('../../src/modules/payments/payments.service');
const h = require('../helpers');
const fx = require('../fixtures');
const fake = require('../fakeRazorpay');

const app = createApp();
const { day, book } = fx;

before(async () => {
  await h.migrateTestDatabase();
  await h.ensureTestBuckets();
  await fake.start();
});
beforeEach(async () => {
  await h.resetData();
  await h.seedReference();
  fake.reset();
});
after(async () => {
  await fake.stop();
  await h.closeConnections();
});

const roomBody = (room) => ({ itemType: 'property_room', resourceId: room.id, checkIn: day(10), checkOut: day(12), rooms: 1, adults: 2 });
const key = () => `pay-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const count = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;

/** A tourist with a pending_payment room booking (2 nights x 2000.00) and its Razorpay order. */
async function pendingBooking({ totalUnits = 1 } = {}) {
  const admin = await fx.actor(app, ['admin']);
  const { room, hotel, property } = await fx.publishedRoom(app, admin, { totalUnits });
  const tourist = await fx.actor(app);
  const booking = (await book(tourist, roomBody(room)).expect(201)).body.data;
  const checkout = (await tourist.as.post(`/bookings/${booking.id}/payment-order`).set('Idempotency-Key', key()).expect(201)).body.data;
  return { admin, room, hotel, property, tourist, booking, checkout };
}

const webhook = (event, entities, eventId) => {
  const delivery = fake.webhook(event, entities, eventId);
  return request(app).post('/api/v1/webhooks/payments/razorpay').set(delivery.headers).send(delivery.body);
};
const paymentEntity = (paymentId) => ({ payment: { entity: { ...fake.state.payments.get(paymentId), email: 'guest@example.com', contact: '+919800000000', vpa: 'guest@upi' } } });

describe('checkout and verification', () => {
  it('creates one order per booking and confirms only after server-side verification', async () => {
    const { tourist, booking, checkout } = await pendingBooking();
    assert.equal(checkout.checkout.amount, 400000, 'paise');
    assert.equal(checkout.checkout.keyId, 'rzp_test_suite');
    assert.equal(checkout.order.status, 'created');
    const again = (await tourist.as.post(`/bookings/${booking.id}/payment-order`).set('Idempotency-Key', key()).expect(201)).body.data;
    assert.equal(again.order.id, checkout.order.id, 'an open order is reused');
    assert.equal(fake.state.orders.size, 1);
    assert.equal((await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data.paymentStatus, 'pending');

    const handler = fake.pay(checkout.checkout.orderId);
    await tourist.as.post('/payments/verify').send({ ...handler, signature: 'f'.repeat(64) }).expect(400);
    const stranger = await fx.actor(app);
    await stranger.as.post('/payments/verify').send(handler).expect(404);

    const verified = (await tourist.as.post('/payments/verify').send(handler).expect(200)).body.data;
    assert.deepEqual(verified, { outcome: 'confirmed', bookingId: booking.id, bookingStatus: 'confirmed', paymentStatus: 'paid' });
    await tourist.as.post('/payments/verify').send(handler).expect(200);
    assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE status = 'captured'"), 1);
    assert.equal(await count("SELECT count(*)::int AS n FROM booking_status_history WHERE new_status = 'confirmed'"), 1);

    const history = (await tourist.as.get(`/payments/booking/${booking.id}`).expect(200)).body.data;
    assert.equal(history.orders[0].status, 'paid');
    assert.equal(history.transactions[0].status, 'captured');
    await stranger.as.get(`/payments/booking/${booking.id}`).expect(404);
    await stranger.as.get(`/payments/orders/${checkout.order.id}`).expect(404);
    await tourist.as.post(`/bookings/${booking.id}/payment-order`).set('Idempotency-Key', key()).expect(409);
  });

  it('rejects a payment whose amount does not match the order', async () => {
    const { tourist, booking, checkout } = await pendingBooking();
    const handler = fake.pay(checkout.checkout.orderId, { amount: 100 });
    const res = await tourist.as.post('/payments/verify').send(handler).expect(409);
    assert.equal(res.body.error.code, 'PAYMENT_MISMATCH');
    assert.equal((await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data.status, 'pending_payment');
  });

  it('captures authorized payments and records failed attempts without losing the booking', async () => {
    const { tourist, booking, checkout } = await pendingBooking();
    const failed = fake.pay(checkout.checkout.orderId, { status: 'failed' });
    assert.equal((await tourist.as.post('/payments/verify').send(failed).expect(200)).body.data.outcome, 'failed');
    let detail = (await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data;
    assert.deepEqual([detail.status, detail.paymentStatus], ['pending_payment', 'failed']);

    const authorized = fake.pay(checkout.checkout.orderId, { status: 'authorized' });
    await tourist.as.post('/payments/verify').send(authorized).expect(200);
    assert.ok(fake.state.calls.includes('POST /payments/:id/capture'));
    detail = (await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data;
    assert.deepEqual([detail.status, detail.paymentStatus], ['confirmed', 'paid']);
  });
});

describe('webhooks', () => {
  it('verifies signatures, stores redacted events and is idempotent across webhook + callback', async () => {
    const { tourist, booking, checkout } = await pendingBooking();
    const handler = fake.pay(checkout.checkout.orderId);

    const forged = fake.webhook('payment.captured', paymentEntity(handler.providerPaymentId));
    await request(app).post('/api/v1/webhooks/payments/razorpay').set({ ...forged.headers, 'X-Razorpay-Signature': 'a'.repeat(64) }).send(forged.body).expect(400);
    await request(app).post('/api/v1/webhooks/payments/stripe').set(forged.headers).send(forged.body).expect(404);

    const first = await webhook('payment.captured', paymentEntity(handler.providerPaymentId), 'evt_one').expect(200);
    assert.equal(first.body.data.status, 'processed');
    const duplicate = await webhook('payment.captured', paymentEntity(handler.providerPaymentId), 'evt_one').expect(200);
    assert.equal(duplicate.body.data.duplicate, true);
    await webhook('order.paid', paymentEntity(handler.providerPaymentId), 'evt_two').expect(200);
    await tourist.as.post('/payments/verify').send(handler).expect(200);

    assert.equal((await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data.status, 'confirmed');
    assert.equal(await count('SELECT count(*)::int AS n FROM payment_transactions'), 1);
    assert.equal(await count("SELECT count(*)::int AS n FROM booking_status_history WHERE new_status = 'confirmed'"), 1);
    const stored = (await pool.query("SELECT payload FROM payment_webhook_events WHERE provider_event_id = 'evt_one'")).rows[0].payload;
    assert.equal(JSON.stringify(stored).includes('guest@'), false, 'contact details are not persisted');
    assert.equal(stored.payment.id, handler.providerPaymentId);
    await webhook('payment.dispute.created', {}, 'evt_three').expect(200, /ignored/);
  });

  it('retries failed event processing from the maintenance job', async () => {
    const { booking, checkout } = await pendingBooking();
    const handler = fake.pay(checkout.checkout.orderId);
    fake.state.down = true;
    const res = await webhook('payment.captured', paymentEntity(handler.providerPaymentId), 'evt_retry').expect(200);
    assert.equal(res.body.data.status, 'failed');
    fake.state.down = false;
    await pool.query("UPDATE payment_webhook_events SET received_at = now() - interval '5 minutes'");
    const stats = await paymentsService.runMaintenance();
    assert.equal(stats.eventsRetried, 1);
    assert.equal((await bookingsService.getForPayment(pool, booking.id)).booking_status, 'confirmed');
  });
});

describe('late, duplicate and reconciled payments', () => {
  it('re-acquires capacity for a late payment when available, otherwise refunds in full', async () => {
    const late = await pendingBooking({ totalUnits: 1 });
    await pool.query("UPDATE inventory_holds SET expires_at = now() - interval '1 minute'");
    await pool.query("UPDATE bookings SET expires_at = now() - interval '1 minute'");
    await bookingsService.runMaintenance();
    const ok = (await late.tourist.as.post('/payments/verify').send(fake.pay(late.checkout.checkout.orderId)).expect(200)).body.data;
    assert.deepEqual([ok.outcome, ok.bookingStatus], ['confirmed', 'confirmed']);

    const lost = await pendingBooking({ totalUnits: 1 });
    await pool.query("UPDATE inventory_holds SET expires_at = now() - interval '1 minute' WHERE status = 'held'");
    await pool.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [lost.booking.id]);
    await bookingsService.runMaintenance();
    await book(await fx.actor(app), roomBody(lost.room)).expect(201);
    const refunded = (await lost.tourist.as.post('/payments/verify').send(fake.pay(lost.checkout.checkout.orderId)).expect(200)).body.data;
    assert.deepEqual([refunded.outcome, refunded.bookingStatus, refunded.paymentStatus], ['refunded', 'expired', 'refunded']);
    const refunds = (await lost.tourist.as.get(`/payments/booking/${lost.booking.id}`).expect(200)).body.data.refunds;
    assert.deepEqual(refunds.map((r) => [r.kind, r.amount, r.status]), [['late_payment', '4000.00', 'succeeded']]);
    const held = await count("SELECT coalesce(sum(quantity), 0)::int AS n FROM inventory_holds WHERE resource_id = $1 AND (status = 'confirmed' OR (status = 'held' AND expires_at > now()))", [lost.room.id]);
    assert.equal(held, 1, 'no overbooking: only the rival holds the room');
  });

  it('refunds a second captured payment for an already confirmed booking', async () => {
    const { tourist, booking, checkout } = await pendingBooking();
    await tourist.as.post('/payments/verify').send(fake.pay(checkout.checkout.orderId)).expect(200);
    const second = (await tourist.as.post('/payments/verify').send(fake.pay(checkout.checkout.orderId)).expect(200)).body.data;
    assert.equal(second.outcome, 'refunded');
    const refunds = (await tourist.as.get(`/payments/booking/${booking.id}`).expect(200)).body.data.refunds;
    assert.deepEqual(refunds.map((r) => [r.kind, r.status]), [['duplicate_payment', 'succeeded']]);
    const detail = (await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data;
    assert.deepEqual([detail.status, detail.paymentStatus], ['confirmed', 'paid']);
  });

  it('reconciles a captured payment whose callback and webhook were both lost', async () => {
    const { booking, checkout } = await pendingBooking();
    fake.pay(checkout.checkout.orderId);
    await pool.query("UPDATE payment_orders SET created_at = now() - interval '3 minutes'");
    assert.equal((await paymentsService.runMaintenance()).ordersReconciled, 1);
    assert.equal((await bookingsService.getForPayment(pool, booking.id)).booking_status, 'confirmed');
  });
});

describe('refunds', () => {
  async function confirmedBooking() {
    const setup = await pendingBooking({ totalUnits: 2 });
    await setup.tourist.as.post('/payments/verify').send(fake.pay(setup.checkout.checkout.orderId)).expect(200);
    return setup;
  }

  it('turns a paid cancellation into exactly one provider refund', async () => {
    const { tourist, booking } = await confirmedBooking();
    const cancelled = (await tourist.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(200)).body.data;
    assert.equal(cancelled.cancellation.status, 'refund_pending');
    assert.equal(cancelled.cancellation.refundAmount, '4000.00');

    assert.equal((await paymentsService.runMaintenance()).cancellationRefunds, 1);
    await paymentsService.runMaintenance();
    assert.equal(fake.state.refunds.size, 1);
    const detail = (await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data;
    assert.deepEqual([detail.paymentStatus, detail.cancellation.status], ['refunded', 'refunded']);

    const [refund] = (await tourist.as.get(`/payments/booking/${booking.id}`).expect(200)).body.data.refunds;
    assert.equal((await tourist.as.get(`/refunds/${refund.id}`).expect(200)).body.data.status, 'succeeded');
    await (await fx.actor(app)).as.get(`/refunds/${refund.id}`).expect(404);
    const providerRefund = [...fake.state.refunds.values()][0];
    await webhook('refund.failed', { refund: { entity: { ...providerRefund, status: 'failed' } } }).expect(200);
    assert.equal((await tourist.as.get(`/refunds/${refund.id}`).expect(200)).body.data.status, 'succeeded', 'succeeded never regresses');
  });

  it('retries failed refunds without ever paying twice', async () => {
    const { tourist, booking } = await confirmedBooking();
    await tourist.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(200);
    fake.state.failRefunds = 1;
    await paymentsService.runMaintenance();
    const [failed] = (await tourist.as.get(`/payments/booking/${booking.id}`).expect(200)).body.data.refunds;
    assert.equal(failed.status, 'failed');
    assert.equal((await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data.cancellation.status, 'refund_failed');

    // Simulate a lost response: the provider already holds a refund with our receipt.
    fake.state.refunds.set('rfnd_existing', { id: 'rfnd_existing', payment_id: [...fake.state.payments.keys()][0], amount: 400000, receipt: failed.id, status: 'processed' });
    const root = await fx.actor(app, ['super_admin']);
    const admin = await fx.actor(app, ['admin']);
    await admin.as.post(`/admin/refunds/${failed.id}/retry`).expect(403);
    const retried = (await root.as.post(`/admin/refunds/${failed.id}/retry`).expect(200)).body.data;
    assert.deepEqual([retried.status, retried.providerRefundId], ['succeeded', 'rfnd_existing']);
    assert.equal(fake.state.refunds.size, 1, 'no second refund was created');
    await root.as.post(`/admin/refunds/${failed.id}/retry`).expect(409);
  });

  it('lets an authorised admin refund part of a payment, idempotently and within the captured amount', async () => {
    const { booking } = await confirmedBooking();
    const admin = await fx.actor(app, ['admin']);
    const root = await fx.actor(app, ['super_admin']);
    await admin.as.post(`/admin/bookings/${booking.id}/refund`).set('Idempotency-Key', key()).send({ amount: '500.00', reason: 'Goodwill' }).expect(403);

    const idemKey = key();
    const partial = (await root.as.post(`/admin/bookings/${booking.id}/refund`).set('Idempotency-Key', idemKey).send({ amount: '500.00', reason: 'Goodwill' }).expect(201)).body.data;
    assert.deepEqual([partial.amount, partial.status, partial.kind], ['500.00', 'succeeded', 'manual']);
    const replay = (await root.as.post(`/admin/bookings/${booking.id}/refund`).set('Idempotency-Key', idemKey).send({ amount: '500.00', reason: 'Goodwill' }).expect(201)).body.data;
    assert.equal(replay.id, partial.id);
    const tooMuch = await root.as.post(`/admin/bookings/${booking.id}/refund`).set('Idempotency-Key', key()).send({ amount: '3600.00', reason: 'Too much' }).expect(409);
    assert.equal(tooMuch.body.error.code, 'REFUND_EXCEEDS_PAYMENT');
    assert.equal((await bookingsService.getForPayment(pool, booking.id)).payment_status, 'partially_refunded');

    const listed = (await admin.as.get(`/admin/refunds?bookingId=${booking.id}`).expect(200)).body;
    assert.equal(listed.meta.total, 1);
    assert.equal((await admin.as.get('/admin/payments?status=paid').expect(200)).body.data[0].capturedPayments, 1);
    assert.equal(await count("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'refunds.initiated'"), 1);
  });
});
