'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { withTransaction } = require('../../src/core/database/transaction');
const bookingsService = require('../../src/modules/bookings/bookings.service');
const h = require('../helpers');
const fx = require('../fixtures');

const app = createApp();
const { day, book } = fx;

before(async () => {
  await h.migrateTestDatabase();
  await h.ensureTestBuckets();
});
beforeEach(async () => {
  await h.resetData();
  await h.seedReference();
});
after(h.closeConnections);

const roomBody = (room, overrides = {}) => ({ itemType: 'property_room', resourceId: room.id, checkIn: day(10), checkOut: day(12), rooms: 1, adults: 2, ...overrides });
const holdsOf = async (bookingId) =>
  (await pool.query('SELECT h.status FROM inventory_holds h JOIN booking_items i ON i.id = h.booking_item_id WHERE i.booking_id = $1', [bookingId])).rows.map((r) => r.status);
const confirm = (bookingId) => withTransaction((client) => bookingsService.confirmAfterPayment(client, bookingId));

describe('quote and instant booking', () => {
  it('quotes without reserving, then books idempotently with a snapshotted price', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { hotel, room } = await fx.publishedRoom(app, admin, { totalUnits: 2 });
    await hotel.as.put(`/partners/me/rooms/${room.id}/rates`).send({ ranges: [{ from: day(11), to: day(11), nightlyPrice: '2600.50' }] }).expect(200);
    const tourist = await fx.actor(app);

    const quote = (await tourist.as.post('/bookings/quote').send(roomBody(room)).expect(200)).body.data;
    assert.equal(quote.totalAmount, '4600.50');
    assert.equal(quote.available, true);
    assert.equal(quote.cancellationPolicy.tiers[0].refundPercent, 100);

    await tourist.as.post('/bookings').send({ ...roomBody(room), travelers: fx.traveler() }).expect(400);
    const unverified = await fx.actor(app, ['tourist'], { verified: false });
    const blocked = await book(unverified, roomBody(room)).expect(403);
    assert.equal(blocked.body.error.code, 'EMAIL_NOT_VERIFIED');

    const key = 'booking-key-0001';
    const first = await book(tourist, roomBody(room), key).expect(201);
    const booking = first.body.data;
    assert.equal(booking.status, 'pending_payment');
    assert.match(booking.reference, /^JHT-\d{6}-[A-Z0-9]{6}$/);
    assert.equal(booking.totalAmount, '4600.50');
    assert.deepEqual(booking.item.details.nightly.map((n) => n.price), ['2000.00', '2600.50']);
    const holdMinutes = (Date.parse(booking.expiresAt) - Date.now()) / 60_000;
    assert.ok(holdMinutes > 14 && holdMinutes <= 15, 'held for the 15-minute payment window');
    assert.deepEqual(await holdsOf(booking.id), ['held']);

    const replay = await book(tourist, roomBody(room), key).expect(201);
    assert.equal(replay.body.data.id, booking.id);
    assert.equal(replay.headers['idempotent-replay'], 'true');
    const reused = await book(tourist, roomBody(room, { adults: 1 }), key).expect(409);
    assert.equal(reused.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n, 1);

    const availability = (await h.api(app).get(`/properties/${(await pool.query('SELECT property_id FROM room_types WHERE id = $1', [room.id])).rows[0].property_id}/availability?checkIn=${day(10)}&checkOut=${day(12)}`).expect(200)).body.data;
    assert.equal(availability.rooms[0].availableUnits, 1, 'the hold is subtracted from availability');

    await hotel.as.put(`/partners/me/rooms/${room.id}/rates`).send({ ranges: [{ from: day(10), to: day(11), nightlyPrice: '9999.00' }] }).expect(200);
    assert.equal((await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data.totalAmount, '4600.50', 'later rate changes never alter a booking');

    const shrink = await hotel.as.put(`/partners/me/rooms/${room.id}/inventory`).send({ ranges: [{ from: day(10), to: day(11), blockedUnits: 2 }] }).expect(409);
    assert.equal(shrink.body.error.code, 'INVENTORY_BELOW_ALLOCATED');
  });

  it('two (or more) simultaneous customers for the last room: exactly one wins', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { room } = await fx.publishedRoom(app, admin, { totalUnits: 1 });
    const tourists = await Promise.all(Array.from({ length: 6 }, () => fx.actor(app)));

    const results = await Promise.all(tourists.map((tourist) => book(tourist, roomBody(room))));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409]);
    assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'INSUFFICIENT_AVAILABILITY'));
    const held = await pool.query("SELECT coalesce(sum(quantity), 0)::int AS units FROM inventory_holds WHERE resource_id = $1 AND status = 'held'", [room.id]);
    assert.equal(held.rows[0].units, 1);
  });

  it('guide slots cannot be double-booked, even concurrently', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { agency, guide, service } = await fx.publishedGuideService(app, admin);
    const body = (startTime) => ({ itemType: 'guide_service', resourceId: service.id, date: day(5), startTime, participants: 2 });
    const tourists = await Promise.all(Array.from({ length: 4 }, () => fx.actor(app)));

    const results = await Promise.all(tourists.map((tourist) => book(tourist, body('09:00'))));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409]);
    await book(tourists[0], body('10:30')).expect(409);
    await book(tourists[0], body('11:00')).expect(201);
    await book(tourists[0], body('13:00')).expect(409, /not available at that time/);
    await book(tourists[0], { ...body('11:00'), participants: 7 }).expect(409);

    const slots = (await h.api(app).get(`/guides/${guide.id}/availability?from=${day(5)}&to=${day(5)}`).expect(200)).body.data.slots;
    assert.deepEqual(slots, [{ date: day(5), startTime: '08:00', endTime: '09:00' }, { date: day(5), startTime: '13:00', endTime: '14:00' }]);
    const shrink = await agency.as
      .put(`/partners/me/guides/${guide.id}/availability`)
      .send({ from: day(5), to: day(5), slots: [{ date: day(5), startTime: '08:00', endTime: '10:00' }] })
      .expect(409);
    assert.equal(shrink.body.error.code, 'GUIDE_HAS_BOOKINGS');
  });

  it('experience seats are counted once and protected from partner changes', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { operator, experience, session } = await fx.publishedSession(app, admin, { capacity: 3 });
    const body = { itemType: 'experience_session', resourceId: session.id, participants: 2 };
    const tourists = await Promise.all(Array.from({ length: 3 }, () => fx.actor(app)));

    const results = await Promise.all(tourists.map((tourist) => book(tourist, body)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    await book(tourists[0], { ...body, participants: 1 }).expect(201);
    await book(tourists[0], { ...body, participants: 1 }).expect(409);

    const seats = (await h.api(app).get(`/experiences/${experience.id}/sessions`).expect(200)).body.data;
    assert.equal(seats[0].seatsAvailable, 0);
    const del = await operator.as.delete(`/partners/me/experiences/${experience.id}/sessions/${session.id}`).expect(409);
    assert.equal(del.body.error.code, 'SESSION_HAS_BOOKINGS');
    await operator.as.patch(`/partners/me/experiences/${experience.id}/sessions/${session.id}`).send({ capacity: 2 }).expect(409);
    await operator.as.patch(`/partners/me/experiences/${experience.id}/sessions/${session.id}`).send({ capacity: 5 }).expect(200);
  });
});

describe('request-to-book', () => {
  it('reserves nothing until the partner approves; rejection leaves no payable reservation', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { operator, pkg, departure } = await fx.publishedDeparture(app, admin, { totalSeats: 4, bookingMode: 'request' });
    const tourist = await fx.actor(app);
    const body = { itemType: 'package_departure', resourceId: departure.id, travelerCount: 3 };

    const requested = (await book(tourist, body).expect(201)).body.data;
    assert.equal(requested.status, 'requested');
    assert.deepEqual(await holdsOf(requested.id), []);
    const approvalHours = (Date.parse(requested.expiresAt) - Date.now()) / 3_600_000;
    assert.ok(approvalHours > 23.9 && approvalHours <= 24);
    const second = (await book(await fx.actor(app), body).expect(201)).body.data;

    const outsider = await fx.approvedPartner(app, admin, 'operator');
    await outsider.as.post(`/partners/me/bookings/${requested.id}/approve`).send({}).expect(404);
    assert.equal((await operator.as.get('/partners/me/bookings?status=requested').expect(200)).body.meta.total, 2);

    const approved = (await operator.as.post(`/partners/me/bookings/${requested.id}/approve`).send({ note: 'See you' }).expect(200)).body.data;
    assert.equal(approved.status, 'pending_payment');
    assert.deepEqual(await holdsOf(requested.id), ['held']);
    const paymentHours = (Date.parse(approved.expiresAt) - Date.now()) / 3_600_000;
    assert.ok(paymentHours > 23.9 && paymentHours <= 24);

    const noSeats = await operator.as.post(`/partners/me/bookings/${second.id}/approve`).send({}).expect(409);
    assert.equal(noSeats.body.error.code, 'INSUFFICIENT_AVAILABILITY');
    const rejected = (await operator.as.post(`/partners/me/bookings/${second.id}/reject`).send({ reason: 'Fully booked' }).expect(200)).body.data;
    assert.equal(rejected.status, 'rejected');
    await operator.as.post(`/partners/me/bookings/${second.id}/approve`).send({}).expect(409);

    const moved = await operator.as.patch(`/partners/me/packages/${pkg.id}/departures/${departure.id}`).send({ startDate: day(15) }).expect(409);
    assert.equal(moved.body.error.code, 'DEPARTURE_HAS_BOOKINGS');
    assert.equal((await h.api(app).get(`/packages/${pkg.id}/departures`).expect(200)).body.data[0].seatsAvailable, 1);
  });
});

describe('cancellation, confirmation, expiry and completion', () => {
  it('cancels unpaid bookings for free and releases capacity', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { room } = await fx.publishedRoom(app, admin, { totalUnits: 1 });
    const tourist = await fx.actor(app);
    const booking = (await book(tourist, roomBody(room)).expect(201)).body.data;

    const cancelled = (await tourist.as.post(`/bookings/${booking.id}/cancel`).send({ reason: 'Change of plans' }).expect(200)).body.data;
    assert.equal(cancelled.status, 'cancelled');
    assert.deepEqual(cancelled.cancellation, { ...cancelled.cancellation, refundAmount: '0.00', cancellationFee: '0.00', status: 'completed' });
    assert.deepEqual(await holdsOf(booking.id), ['released']);
    await tourist.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(409);
    await book(await fx.actor(app), roomBody(room)).expect(201);
  });

  it('confirms after payment and refunds paid cancellations from the snapshotted policy', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { hotel, property, room } = await fx.publishedRoom(app, admin, { totalUnits: 2 });
    await hotel.as
      .put(`/partners/me/properties/${property.id}/policies`)
      .send({ cancellationPolicy: { tiers: [{ hoursBeforeCheckIn: 168, refundPercent: 80 }, { hoursBeforeCheckIn: 0, refundPercent: 0 }] } })
      .expect(200);
    const tourist = await fx.actor(app);
    const booking = (await book(tourist, roomBody(room)).expect(201)).body.data;
    assert.deepEqual(await confirm(booking.id), { confirmed: true });
    assert.deepEqual(await confirm(booking.id), { confirmed: true, alreadyConfirmed: true });
    assert.deepEqual(await holdsOf(booking.id), ['confirmed']);

    await hotel.as
      .put(`/partners/me/properties/${property.id}/policies`)
      .send({ cancellationPolicy: { tiers: [{ hoursBeforeCheckIn: 0, refundPercent: 0 }] } })
      .expect(200);
    const cancelled = (await tourist.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(200)).body.data;
    assert.equal(cancelled.cancellation.refundAmount, '3200.00', '80% under the policy in force at booking time');
    assert.equal(cancelled.cancellation.cancellationFee, '800.00');
    assert.equal(cancelled.cancellation.status, 'refund_pending');
    const event = await pool.query("SELECT payload FROM outbox_events WHERE event_type = 'booking.cancelled' AND aggregate_id = $1", [booking.id]);
    assert.equal(event.rows[0].payload.refundAmount, '3200.00');

    const second = (await book(tourist, roomBody(room)).expect(201)).body.data;
    await confirm(second.id);
    const waived = (await admin.as.post(`/admin/bookings/${second.id}/cancel`).send({ reason: 'Property flooded', waiveFee: true }).expect(200)).body.data;
    assert.equal(waived.cancellation.refundAmount, '4000.00');
    const audit = await pool.query("SELECT action FROM audit_logs WHERE entity_id = $1", [second.id]);
    assert.deepEqual(audit.rows.map((r) => r.action), ['bookings.cancelled_by_admin']);
  });

  it('computes refund tiers by hours before service start', () => {
    const start = new Date('2026-12-10T12:00:00+05:30');
    const booking = {
      payment_status: 'paid',
      total_amount: '1000.00',
      service_start_at: start,
      booking_details: { cancellationPolicy: { tiers: [{ hoursBeforeCheckIn: 0, refundPercent: 0 }, { hoursBeforeCheckIn: 72, refundPercent: 100 }, { hoursBeforeCheckIn: 24, refundPercent: 50 }] } },
    };
    const at = (hours) => bookingsService.computeRefund(booking, { now: new Date(start.getTime() - hours * 3_600_000) }).refundAmount;
    assert.equal(at(100), '1000.00');
    assert.equal(at(72), '1000.00');
    assert.equal(at(30), '500.00');
    assert.equal(at(2), '0.00');
    assert.equal(bookingsService.computeRefund({ ...booking, payment_status: 'unpaid' }).refundAmount, '0.00');
  });

  it('expires lapsed requests and holds, frees capacity, and refuses late confirmation', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { room } = await fx.publishedRoom(app, admin, { totalUnits: 1 });
    const tourist = await fx.actor(app);
    const booking = (await book(tourist, roomBody(room)).expect(201)).body.data;

    await pool.query("UPDATE inventory_holds SET expires_at = now() - interval '1 minute'");
    assert.deepEqual(await confirm(booking.id), { confirmed: false, reason: 'HOLD_EXPIRED' });
    const rival = (await book(await fx.actor(app), roomBody(room)).expect(201)).body.data;
    assert.ok(rival.id, 'a lapsed hold no longer blocks capacity, even before the sweep runs');

    await pool.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [booking.id]);
    const result = await bookingsService.runMaintenance();
    assert.equal(result.expired, 1);
    const expired = (await tourist.as.get(`/bookings/${booking.id}`).expect(200)).body.data;
    assert.equal(expired.status, 'expired');
    assert.deepEqual(expired.history.map((h) => h.newStatus), ['pending_payment', 'expired']);
    assert.deepEqual(await holdsOf(booking.id), ['expired']);
    assert.deepEqual(await confirm(booking.id), { confirmed: false, reason: 'BOOKING_EXPIRED' });
  });

  it('completes confirmed bookings after the service period', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { session } = await fx.publishedSession(app, admin);
    const tourist = await fx.actor(app);
    const booking = (await book(tourist, { itemType: 'experience_session', resourceId: session.id, participants: 1 }).expect(201)).body.data;
    await confirm(booking.id);
    await pool.query("UPDATE bookings SET service_start_at = now() - interval '3 hours', service_end_at = now() - interval '1 hour' WHERE id = $1", [booking.id]);
    assert.equal((await bookingsService.runMaintenance()).completed, 1);
    assert.equal((await tourist.as.get(`/bookings/${booking.id}/status`).expect(200)).body.data.status, 'completed');
    await tourist.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(409);
  });
});

describe('access control', () => {
  it('isolates bookings between tourists and partners; admins search everything', async () => {
    const admin = await fx.actor(app, ['admin']);
    const { hotel, room } = await fx.publishedRoom(app, admin, { totalUnits: 3 });
    const owner = await fx.actor(app);
    const stranger = await fx.actor(app);
    const booking = (await book(owner, roomBody(room)).expect(201)).body.data;

    await stranger.as.get(`/bookings/${booking.id}`).expect(404);
    await stranger.as.post(`/bookings/${booking.id}/cancel`).send({}).expect(404);
    assert.equal((await stranger.as.get('/bookings').expect(200)).body.meta.total, 0);
    const status = (await owner.as.get(`/bookings/${booking.id}/status`).expect(200)).body.data;
    assert.ok(status.secondsRemaining > 800);

    const partnerView = (await hotel.as.get(`/partners/me/bookings/${booking.id}`).expect(200)).body.data;
    assert.equal(partnerView.travelers[0].fullName, 'Asha Munda');
    assert.equal(partnerView.userId, undefined);
    const otherHotel = await fx.approvedPartner(app, admin, 'accommodation');
    await otherHotel.as.get(`/partners/me/bookings/${booking.id}`).expect(404);
    await owner.as.get('/partners/me/bookings').expect(403);

    const found = (await admin.as.get(`/admin/bookings?reference=${booking.reference}`).expect(200)).body.data;
    assert.equal(found[0].userId, owner.id);
    await owner.as.get('/admin/bookings').expect(403);
    assert.deepEqual((await owner.as.get(`/bookings/${booking.id}/documents`).expect(200)).body.data, []);
  });
});
