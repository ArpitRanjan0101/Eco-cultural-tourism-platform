'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const bookingsService = require('../../src/modules/bookings/bookings.service');
const h = require('../helpers');
const fx = require('../fixtures');
const fake = require('../fakeRazorpay');

const app = createApp();

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

describe('traveller journey (end to end through the API)', () => {
  it('registers, discovers, plans, books, pays, completes, reviews — and every role sees the outcome', async () => {
    // Supply: an approved operator with a published experience session.
    const admin = await fx.actor(app, ['admin']);
    const { operator, experience, session } = await fx.publishedSession(app, admin, { capacity: 4 });
    const destinationId = (await pool.query('SELECT destination_id FROM experiences WHERE id = $1', [experience.id])).rows[0].destination_id;
    const slug = (await pool.query('SELECT slug FROM destinations WHERE id = $1', [destinationId])).rows[0].slug;

    // 1. Registration and email verification.
    const credentials = { fullName: 'Birsa Oraon', email: 'birsa@example.com', password: 'jharkhand-2026' };
    await h.api(app).post('/auth/register').send(credentials).expect(202);
    const userId = (await pool.query('SELECT id FROM users WHERE email = $1', [credentials.email])).rows[0].id;
    const { token } = await h.latestOutboxEvent(userId, 'auth.email_verification_requested');
    await h.api(app).post('/auth/verify-email').send({ token }).expect(200);
    const session1 = (await h.api(app).post('/auth/login').send({ email: credentials.email, password: credentials.password }).expect(200)).body.data;
    const me = h.api(app, { token: session1.accessToken });
    assert.equal((await me.get('/auth/me').expect(200)).body.data.emailVerified, true);

    // 2. Discovery.
    const found = (await h.api(app).get(`/search?q=${encodeURIComponent(experience.name)}`).expect(200)).body.data;
    assert.ok(JSON.stringify(found).includes(experience.id), 'search finds the experience');
    const sessions = (await h.api(app).get(`/experiences/${experience.id}/sessions`).expect(200)).body.data;
    assert.equal(sessions[0].seatsAvailable, 4);

    // 3. Planning: favorite + trip with the destination.
    await me.post('/favorites').send({ subjectType: 'experience', subjectId: experience.id }).expect(201);
    const trip = (await me.post('/trips').send({ title: 'Monsoon trip', startDate: fx.day(6), endDate: fx.day(7), travelerCount: 2 }).expect(201)).body.data;
    await me.post(`/trips/${trip.id}/days/${trip.days[0].id}/stops`).send({ destinationId, startTime: '09:00' }).expect(201);
    await me.patch(`/trips/${trip.id}`).send({ status: 'planned' }).expect(200);

    // 4. Quote, book (idempotent), pay and confirm.
    const item = { itemType: 'experience_session', resourceId: session.id, participants: 2 };
    const quote = (await me.post('/bookings/quote').send(item).expect(200)).body.data;
    assert.equal(quote.totalAmount, '1000.00');
    const key = 'journey-booking-0001';
    const booking = (await me.post('/bookings').set('Idempotency-Key', key).send({ ...item, travelers: [{ fullName: 'Birsa Oraon', isPrimary: true }, { fullName: 'Sita Oraon' }] }).expect(201)).body.data;
    assert.equal(booking.status, 'pending_payment');
    assert.equal((await h.api(app).get(`/experiences/${experience.id}/sessions`).expect(200)).body.data[0].seatsAvailable, 2, 'held seats');

    const checkout = (await me.post(`/bookings/${booking.id}/payment-order`).set('Idempotency-Key', 'journey-pay-0001').expect(201)).body.data;
    const paid = (await me.post('/payments/verify').send(fake.pay(checkout.checkout.orderId)).expect(200)).body.data;
    assert.deepEqual([paid.outcome, paid.bookingStatus, paid.paymentStatus], ['confirmed', 'confirmed', 'paid']);
    assert.ok(await h.latestOutboxEvent(booking.id, 'booking.confirmed'), 'confirmation event queued for vouchers/notifications');

    // 5. Partner sees it; the stay happens; maintenance completes it.
    const partnerView = (await operator.as.get(`/partners/me/bookings/${booking.id}`).expect(200)).body.data;
    assert.equal(partnerView.status, 'confirmed');
    await pool.query("UPDATE bookings SET service_start_at = now() - interval '3 hours', service_end_at = now() - interval '1 hour' WHERE id = $1", [booking.id]);
    await bookingsService.runMaintenance();
    assert.equal((await me.get(`/bookings/${booking.id}/status`).expect(200)).body.data.status, 'completed');

    // 6. Verified review → moderation → public.
    const review = (await me.post('/reviews').send({ subjectType: 'experience', subjectId: experience.id, bookingId: booking.id, rating: 5, comment: 'Wonderful tribal art walk' }).expect(201)).body.data;
    assert.equal((await me.get('/users/me/reviews').expect(200)).body.data[0].status, 'pending');
    await admin.as.patch(`/admin/reviews/${review.id}/status`).send({ status: 'approved' }).expect(200);
    const publicReviews = (await h.api(app).get(`/reviews?subjectType=experience&subjectId=${experience.id}`).expect(200)).body;
    assert.deepEqual([publicReviews.data[0].author.displayName, publicReviews.data[0].verified, publicReviews.meta.rating.average], ['Birsa O.', true, 5]);
    await h.api(app).get(`/destinations/${slug}/reviews`).expect(200);

    // 7. Dashboards and reports reflect the journey.
    const partnerDash = (await operator.as.get('/partners/me/dashboard').expect(200)).body.data;
    assert.deepEqual([partnerDash.last30Days.revenue.captured, partnerDash.rating.count, partnerDash.rating.average], ['1000.00', 1, 5]);
    const adminDash = (await admin.as.get('/admin/dashboard').expect(200)).body.data;
    assert.equal(adminDash.last30Days.revenue.net, '1000.00');
    const top = (await admin.as.get('/admin/reports/destinations').expect(200)).body.data[0];
    assert.deepEqual([top.destination.id, top.bookings, top.tripStops], [destinationId, 1, 1]);
    const audit = (await admin.as.get(`/admin/audit-logs?entityType=review&entityId=${review.id}`).expect(200)).body.data;
    assert.equal(audit[0].action, 'reviews.moderated');

    // 8. Session hygiene: logout revokes the refresh token.
    await h.api(app).post('/auth/logout').send({ refreshToken: session1.refreshToken }).expect(204);
    await h.api(app).post('/auth/refresh').send({ refreshToken: session1.refreshToken }).expect(401);
  });
});
