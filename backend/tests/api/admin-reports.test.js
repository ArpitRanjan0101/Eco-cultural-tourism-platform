'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { todayLocal, addDays } = require('../../src/core/utils/dates');
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

const key = () => `rep-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/** Paid experience booking (2 x 500.00) with a 200.00 refund, plus an unpaid room booking. */
async function scenario() {
  const admin = await fx.actor(app, ['admin']);
  const root = await fx.actor(app, ['super_admin']);
  const { operator, experience, session } = await fx.publishedSession(app, admin);
  const { hotel, room } = await fx.publishedRoom(app, admin);
  const tourist = await fx.actor(app);

  const paid = (await book(tourist, { itemType: 'experience_session', resourceId: session.id, participants: 2 }).expect(201)).body.data;
  const checkout = (await tourist.as.post(`/bookings/${paid.id}/payment-order`).set('Idempotency-Key', key()).expect(201)).body.data;
  await tourist.as.post('/payments/verify').send(fake.pay(checkout.checkout.orderId)).expect(200);
  await root.as.post(`/admin/bookings/${paid.id}/refund`).set('Idempotency-Key', key()).send({ amount: '200.00', reason: 'Goodwill' }).expect(201);

  const unpaid = (await book(tourist, { itemType: 'property_room', resourceId: room.id, checkIn: day(10), checkOut: day(11), rooms: 1, adults: 1 }).expect(201)).body.data;
  return { admin, root, operator, hotel, tourist, experience, paid, unpaid };
}

describe('platform reports and dashboard', () => {
  it('reports bookings and revenue by type, period and partner', async () => {
    const { admin, operator, hotel } = await scenario();

    const bookings = (await admin.as.get('/admin/reports/bookings').expect(200)).body.data;
    assert.deepEqual(bookings.range, { from: addDays(todayLocal(), -29), to: todayLocal(), groupBy: 'day' });
    assert.deepEqual([bookings.totals.bookings, bookings.totals.confirmed, bookings.totals.pending], [2, 1, 1]);
    assert.equal(bookings.totals.bookedValue, '1000.00');
    assert.equal(bookings.totals.averageBookingValue, '1000.00');
    assert.deepEqual(bookings.byType.map((t) => [t.bookingType, t.bookings]), [['experience_session', 1], ['property_room', 1]]);
    assert.equal(bookings.series.length, 30);
    assert.deepEqual(bookings.series.at(-1), { period: todayLocal(), bookings: 2, confirmed: 1, cancelled: 0, bookedValue: '1000.00' });

    const monthly = (await admin.as.get('/admin/reports/bookings?groupBy=month').expect(200)).body.data;
    assert.equal(monthly.series.reduce((n, s) => n + s.bookings, 0), 2);
    const rooms = (await admin.as.get('/admin/reports/bookings?bookingType=property_room').expect(200)).body.data;
    assert.deepEqual([rooms.totals.bookings, rooms.totals.confirmed, rooms.totals.bookedValue], [1, 0, '0.00']);

    const revenue = (await admin.as.get('/admin/reports/revenue').expect(200)).body.data;
    assert.deepEqual(revenue.totals, { captured: '1000.00', refunded: '200.00', net: '800.00', payments: 1, refunds: 1 });
    assert.deepEqual(revenue.series.at(-1), { period: todayLocal(), captured: '1000.00', refunded: '200.00', net: '800.00' });
    assert.equal((await admin.as.get(`/admin/reports/revenue?partnerId=${hotel.partnerId}`).expect(200)).body.data.totals.captured, '0.00');
    assert.equal((await admin.as.get(`/admin/reports/revenue?partnerId=${operator.partnerId}`).expect(200)).body.data.totals.net, '800.00');

    // Ranges before the activity are empty; invalid ranges are refused.
    const past = (await admin.as.get(`/admin/reports/revenue?from=${addDays(todayLocal(), -60)}&to=${addDays(todayLocal(), -40)}`).expect(200)).body.data;
    assert.deepEqual([past.totals.net, past.series.length], ['0.00', 21]);
    await admin.as.get(`/admin/reports/bookings?from=${todayLocal()}&to=${addDays(todayLocal(), -1)}`).expect(422);
    await admin.as.get(`/admin/reports/bookings?from=${addDays(todayLocal(), -400)}&to=${todayLocal()}`).expect(422);
    await admin.as.get('/admin/reports/bookings?groupBy=year').expect(422);
  });

  it('ranks destinations and partners', async () => {
    const { admin, operator, hotel, tourist, experience } = await scenario();
    const destinationId = (await pool.query('SELECT destination_id FROM experiences WHERE id = $1', [experience.id])).rows[0].destination_id;
    await tourist.as.post('/favorites').send({ subjectType: 'destination', subjectId: destinationId }).expect(201);
    const trip = (await tourist.as.post('/trips').send({ title: 'Plan', startDate: day(3), endDate: day(3) }).expect(201)).body.data;
    await tourist.as.post(`/trips/${trip.id}/days/${trip.days[0].id}/stops`).send({ destinationId }).expect(201);

    const destinations = (await admin.as.get('/admin/reports/destinations').expect(200)).body;
    const top = destinations.data[0];
    assert.equal(top.destination.id, destinationId);
    assert.deepEqual([top.bookings, top.bookedValue, top.favorites, top.tripStops, top.reviews, top.averageRating], [1, '1000.00', 1, 1, 0, null]);
    assert.equal(destinations.meta.total, 1);
    assert.equal((await admin.as.get('/admin/reports/destinations?sort=favorites&status=draft').expect(200)).body.meta.total, 0);

    const partners = (await admin.as.get('/admin/reports/partners').expect(200)).body;
    assert.equal(partners.meta.total, 2);
    assert.deepEqual(partners.data.map((p) => p.partner.id), [operator.partnerId, hotel.partnerId]);
    assert.deepEqual(
      [partners.data[0].bookedValue, partners.data[0].captured, partners.data[0].refunded, partners.data[0].net, partners.data[0].cancellationRate],
      ['1000.00', '1000.00', '200.00', '800.00', 0],
    );
    assert.deepEqual([partners.data[1].bookings, partners.data[1].bookedValue], [1, '0.00']);
    const hotels = (await admin.as.get('/admin/reports/partners?partnerType=accommodation').expect(200)).body;
    assert.deepEqual(hotels.data.map((p) => p.partner.id), [hotel.partnerId]);
  });

  it('summarises the platform for admins only', async () => {
    const { admin, tourist } = await scenario();
    await (await fx.actor(app)).as
      .post('/partners/apply')
      .send({ partnerType: 'guide', businessName: 'Pending Org', legalName: 'Legal', email: 'pending@example.com' })
      .expect(201);

    const dash = (await admin.as.get('/admin/dashboard').expect(200)).body.data;
    assert.equal(dash.attention.partnerApplications, 1);
    assert.equal(dash.attention.reviewsPending, 0);
    assert.deepEqual(dash.last30Days.revenue, { captured: '1000.00', refunded: '200.00', net: '800.00' });
    assert.equal(dash.last30Days.bookings.bookings, 2);
    assert.equal(dash.bookings.createdToday, 2);
    assert.equal(dash.bookings.upcomingNext7Days, 1);
    assert.ok(dash.users.total >= 5);

    await tourist.as.get('/admin/dashboard').expect(403);
    await tourist.as.get('/admin/reports/revenue').expect(403);
  });
});

describe('partner dashboard and reports', () => {
  it('scopes figures to the caller’s organisation', async () => {
    const { operator, hotel, tourist } = await scenario();

    const dash = (await operator.as.get('/partners/me/dashboard').expect(200)).body.data;
    assert.equal(dash.partner.id, operator.partnerId);
    assert.deepEqual(dash.last30Days.revenue, { captured: '1000.00', refunded: '200.00', net: '800.00' });
    assert.equal(dash.upcoming.length, 1);
    assert.equal(dash.bookings.upcomingNext7Days, 1);
    assert.ok(dash.supply.some((s) => s.type === 'experience' && s.status === 'published' && s.count === 1));
    assert.deepEqual(dash.rating, { count: 0, average: null });

    const own = (await hotel.as.get('/partners/me/reports/bookings').expect(200)).body.data;
    assert.deepEqual([own.totals.bookings, own.totals.pending], [1, 1]);
    assert.equal((await hotel.as.get('/partners/me/reports/revenue').expect(200)).body.data.totals.captured, '0.00');
    assert.equal((await operator.as.get('/partners/me/reports/revenue?groupBy=week').expect(200)).body.data.totals.net, '800.00');
    await operator.as.get(`/partners/me/reports/revenue?partnerId=${hotel.partnerId}`).expect(422);
    await tourist.as.get('/partners/me/dashboard').expect(403);
  });
});

describe('platform settings and audit search', () => {
  it('validates, applies, resets and audits settings', async () => {
    const admin = await fx.actor(app, ['admin']);
    const root = await fx.actor(app, ['super_admin']);

    const initial = (await admin.as.get('/admin/settings').expect(200)).body.data;
    assert.equal(initial.length, 6);
    assert.ok(initial.every((s) => s.isDefault));
    await admin.as.patch('/admin/settings').send({ values: { 'booking.hold_minutes': 20 } }).expect(403);

    await root.as.patch('/admin/settings').send({ values: { 'booking.hold_minutes': 2 } }).expect(422);
    await root.as.patch('/admin/settings').send({ values: { 'booking.unknown': 1 } }).expect(422);
    await root.as.patch('/admin/settings').send({ values: {} }).expect(422);
    await root.as
      .patch('/admin/settings')
      .send({ values: { 'booking.default_cancellation_policy': { tiers: [{ hoursBeforeCheckIn: 0, refundPercent: 0 }, { hoursBeforeCheckIn: 0, refundPercent: 50 }] } } })
      .expect(422);

    const changed = (await root.as.patch('/admin/settings').send({ values: { 'booking.hold_minutes': 20, 'booking.tax_rate_percent': 5 } }).expect(200)).body.data;
    const hold = changed.find((s) => s.key === 'booking.hold_minutes');
    assert.deepEqual([hold.value, hold.defaultValue, hold.isDefault, hold.updatedBy], [20, 15, false, root.id]);

    // New bookings use the new hold window at once (this instance's cache is invalidated).
    const { room } = await fx.publishedRoom(app, admin);
    const booking = (await book(await fx.actor(app), { itemType: 'property_room', resourceId: room.id, checkIn: day(10), checkOut: day(11), rooms: 1, adults: 1 }).expect(201)).body.data;
    const minutes = (Date.parse(booking.expiresAt) - Date.now()) / 60_000;
    assert.ok(minutes > 19 && minutes <= 20, `held ${minutes} minutes`);

    const reset = (await root.as.patch('/admin/settings').send({ values: { 'booking.hold_minutes': null } }).expect(200)).body.data;
    assert.deepEqual(
      reset.filter((s) => !s.isDefault).map((s) => s.key),
      ['booking.tax_rate_percent'],
    );

    const logs = (await admin.as.get('/admin/audit-logs?action=settings.').expect(200)).body;
    assert.equal(logs.meta.total, 3);
    assert.deepEqual(logs.data[0].newValues, { value: 15 }, 'newest first');
    assert.deepEqual(logs.data[0].actor, { id: root.id, email: root.email, fullName: 'Test User' });
    const holdLogs = (await admin.as.get('/admin/audit-logs?entityType=platform_setting&entityId=booking.hold_minutes').expect(200)).body;
    assert.equal(holdLogs.meta.total, 2);
    assert.equal((await admin.as.get(`/admin/audit-logs?actorUserId=${root.id}`).expect(200)).body.meta.total, 3);
    assert.equal((await admin.as.get(`/admin/audit-logs?action=settings.&from=${addDays(todayLocal(), 1)}`).expect(200)).body.meta.total, 0);
    assert.equal((await admin.as.get(`/admin/audit-logs?action=settings.&to=${todayLocal()}`).expect(200)).body.meta.total, 3);
    await admin.as.get(`/admin/audit-logs?from=${todayLocal()}&to=${addDays(todayLocal(), -1)}`).expect(422);
    await admin.as.get('/admin/audit-logs?action=DROP%20TABLE').expect(422);
    await (await fx.actor(app)).as.get('/admin/audit-logs').expect(403);
    await (await fx.actor(app)).as.get('/admin/settings').expect(403);
  });
});

describe('own reviews', () => {
  it('lists the author’s reviews in every status with the item card', async () => {
    const admin = await fx.actor(app, ['admin']);
    const destinationId = await fx.publishedDestination(app, admin);
    const tourist = await fx.actor(app);
    const review = (await tourist.as.post('/reviews').send({ subjectType: 'destination', subjectId: destinationId, rating: 2, comment: 'Meh' }).expect(201)).body.data;
    await admin.as.patch(`/admin/reviews/${review.id}/status`).send({ status: 'rejected', note: 'Please add detail' }).expect(200);

    const mine = (await tourist.as.get('/users/me/reviews').expect(200)).body;
    assert.equal(mine.meta.total, 1);
    assert.deepEqual([mine.data[0].status, mine.data[0].moderationNote, mine.data[0].available, mine.data[0].item.name], ['rejected', 'Please add detail', true, 'Hundru Falls']);
    assert.equal((await tourist.as.get('/users/me/reviews?status=approved').expect(200)).body.meta.total, 0);
    assert.equal((await (await fx.actor(app)).as.get('/users/me/reviews').expect(200)).body.meta.total, 0);
    await h.api(app).get('/users/me/reviews').expect(401);
  });
});
