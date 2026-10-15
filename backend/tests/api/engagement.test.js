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

const slugOf = async (id) => (await pool.query('SELECT slug FROM destinations WHERE id = $1', [id])).rows[0].slug;

/** A confirmed booking moved past its service end, then completed by the maintenance sweep. */
async function completedSessionBooking(admin, tourist) {
  const { operator, experience, session } = await fx.publishedSession(app, admin);
  const booking = (await book(tourist, { itemType: 'experience_session', resourceId: session.id, participants: 1 }).expect(201)).body.data;
  await withTransaction((client) => bookingsService.confirmAfterPayment(client, booking.id));
  await pool.query("UPDATE bookings SET service_start_at = now() - interval '3 hours', service_end_at = now() - interval '1 hour' WHERE id = $1", [booking.id]);
  await bookingsService.runMaintenance();
  return { operator, experience, booking };
}

describe('trip planner', () => {
  it('creates dated trips with days, manages stops and keeps trips private', async () => {
    const admin = await fx.actor(app, ['admin']);
    const destinationId = await fx.publishedDestination(app, admin);
    const tourist = await fx.actor(app);

    await tourist.as.post('/trips').send({ title: 'Ranchi', startDate: day(5) }).expect(422);
    await tourist.as.post('/trips').send({ title: 'Too long', startDate: day(1), endDate: day(61) }).expect(422);

    const trip = (await tourist.as.post('/trips').send({ title: 'Ranchi weekend', startDate: day(5), endDate: day(7), travelerCount: 2 }).expect(201)).body.data;
    assert.equal(trip.status, 'draft');
    assert.deepEqual(trip.days.map((d) => [d.dayNumber, d.date]), [[1, day(5)], [2, day(6)], [3, day(7)]]);
    const [day1, day2] = trip.days;

    const withStop = (await tourist.as.post(`/trips/${trip.id}/days/${day1.id}/stops`).send({ destinationId, startTime: '09:00', endTime: '11:00' }).expect(201)).body.data;
    const stopA = withStop.days[0].stops[0];
    assert.equal(stopA.title, 'Hundru Falls', 'title defaults to the destination name');
    assert.equal(stopA.destination.id, destinationId);
    await tourist.as.post(`/trips/${trip.id}/days/${day1.id}/stops`).send({ title: 'Lunch', notes: 'Local thali' }).expect(201);
    const three = (await tourist.as.post(`/trips/${trip.id}/days/${day1.id}/stops`).send({ title: 'Market' }).expect(201)).body.data;
    assert.deepEqual(three.days[0].stops.map((s) => [s.title, s.sortOrder]), [['Hundru Falls', 0], ['Lunch', 1], ['Market', 2]]);
    assert.equal(three.stopCount, 3);

    await tourist.as.post(`/trips/${trip.id}/days/${day1.id}/stops`).send({ notes: 'x' }).expect(422);
    await tourist.as.post(`/trips/${trip.id}/days/${day1.id}/stops`).send({ title: 'Bad', startTime: '10:00', endTime: '09:00' }).expect(422);
    const unknownDest = await tourist.as.post(`/trips/${trip.id}/days/${day1.id}/stops`).send({ destinationId: trip.id }).expect(422);
    assert.equal(unknownDest.body.error.details[0].path, 'destinationId');
    await tourist.as.patch(`/trips/${trip.id}/stops/${stopA.id}`).send({ endTime: '08:00' }).expect(422);

    // Reorder: move "Market" to day 2 and reverse the rest of day 1.
    const [, lunch, market] = three.days[0].stops;
    const partial = await tourist.as
      .patch(`/trips/${trip.id}/stops/reorder`)
      .send({ days: [{ dayId: day1.id, stopIds: [lunch.id] }] })
      .expect(422);
    assert.equal(partial.body.error.code, 'VALIDATION_ERROR');
    const reordered = (
      await tourist.as
        .patch(`/trips/${trip.id}/stops/reorder`)
        .send({ days: [{ dayId: day1.id, stopIds: [lunch.id, stopA.id] }, { dayId: day2.id, stopIds: [market.id] }] })
        .expect(200)
    ).body.data;
    assert.deepEqual(reordered.days[0].stops.map((s) => [s.title, s.sortOrder]), [['Lunch', 0], ['Hundru Falls', 1]]);
    assert.deepEqual(reordered.days[1].stops.map((s) => s.title), ['Market']);

    const afterDelete = (await tourist.as.delete(`/trips/${trip.id}/stops/${lunch.id}`).expect(200)).body.data;
    assert.deepEqual(afterDelete.days[0].stops.map((s) => [s.title, s.sortOrder]), [['Hundru Falls', 0]], 'remaining stops are renumbered');

    const edited = (await tourist.as.patch(`/trips/${trip.id}/stops/${stopA.id}`).send({ notes: 'Carry water', startTime: '08:30' }).expect(200)).body.data;
    assert.deepEqual([edited.days[0].stops[0].notes, edited.days[0].stops[0].startTime], ['Carry water', '08:30']);

    // Another user cannot see or touch the trip.
    const other = await fx.actor(app);
    await other.as.get(`/trips/${trip.id}`).expect(404);
    await other.as.patch(`/trips/${trip.id}`).send({ title: 'Mine' }).expect(404);
    await other.as.delete(`/trips/${trip.id}/stops/${stopA.id}`).expect(404);
    assert.equal((await other.as.get('/trips').expect(200)).body.meta.total, 0);

    const list = (await tourist.as.get('/trips').expect(200)).body;
    assert.equal(list.meta.total, 1);
    assert.deepEqual([list.data[0].dayCount, list.data[0].stopCount], [3, 2]);
  });

  it('keeps day dates in step with trip dates and guards ranges', async () => {
    const tourist = await fx.actor(app);
    const trip = (await tourist.as.post('/trips').send({ title: 'Netarhat', startDate: day(10), endDate: day(12) }).expect(201)).body.data;

    const shifted = (await tourist.as.patch(`/trips/${trip.id}`).send({ startDate: day(20), endDate: day(23) }).expect(200)).body.data;
    assert.deepEqual(shifted.days.map((d) => d.date), [day(20), day(21), day(22)]);
    const fourth = (await tourist.as.post(`/trips/${trip.id}/days`).send({ title: 'Return' }).expect(201)).body.data;
    assert.deepEqual(fourth.days.map((d) => [d.dayNumber, d.date]).at(-1), [4, day(23)]);
    await tourist.as.post(`/trips/${trip.id}/days`).send({}).expect(422);
    const dup = await tourist.as.post(`/trips/${trip.id}/days`).send({ dayNumber: 2 }).expect(409);
    assert.equal(dup.body.error.code, 'DAY_EXISTS');

    const shrink = await tourist.as.patch(`/trips/${trip.id}`).send({ startDate: day(20), endDate: day(21) }).expect(409);
    assert.equal(shrink.body.error.code, 'DAYS_OUTSIDE_RANGE');
    await tourist.as.patch(`/trips/${trip.id}`).send({ endDate: null }).expect(422);

    const lastDay = fourth.days.at(-1);
    const removed = (await tourist.as.delete(`/trips/${trip.id}/days/${lastDay.id}`).expect(200)).body.data;
    assert.equal(removed.days.length, 3);
    const renamed = (await tourist.as.patch(`/trips/${trip.id}/days/${removed.days[0].id}`).send({ title: 'Arrival' }).expect(200)).body.data;
    assert.equal(renamed.days[0].title, 'Arrival');

    const undated = (await tourist.as.patch(`/trips/${trip.id}`).send({ startDate: null, endDate: null }).expect(200)).body.data;
    assert.ok(undated.days.every((d) => d.date === null));
    await tourist.as.post(`/trips/${trip.id}/days`).send({ dayNumber: 10 }).expect(201);

    await tourist.as.patch(`/trips/${trip.id}`).send({ status: 'planned' }).expect(200);
    const blocked = await tourist.as.delete(`/trips/${trip.id}`).expect(409);
    assert.equal(blocked.body.error.code, 'TRIP_NOT_DRAFT');
    await tourist.as.patch(`/trips/${trip.id}`).send({ status: 'draft' }).expect(200);
    await tourist.as.delete(`/trips/${trip.id}`).expect(204);
    await tourist.as.get(`/trips/${trip.id}`).expect(404);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM trip_days')).rows[0].n, 0, 'days cascade');
  });

  it('requires the trip permission and authentication', async () => {
    await h.api(app).get('/trips').expect(401);
    const tourist = await fx.actor(app);
    await h.withoutPermissions('tourist', ['trips.manage.own'], async () => {
      await tourist.as.get('/trips').expect(403);
    });
  });
});

describe('favorites', () => {
  it('saves public items idempotently, lists cards and removes them', async () => {
    const admin = await fx.actor(app, ['admin']);
    const destinationId = await fx.publishedDestination(app, admin);
    const { property } = await fx.publishedRoom(app, admin);
    const tourist = await fx.actor(app);

    const first = await tourist.as.post('/favorites').send({ subjectType: 'destination', subjectId: destinationId }).expect(201);
    assert.equal(first.body.data.item.name, 'Hundru Falls');
    const again = await tourist.as.post('/favorites').send({ subjectType: 'destination', subjectId: destinationId }).expect(200);
    assert.equal(again.body.data.id, first.body.data.id);
    await tourist.as.post('/favorites').send({ subjectType: 'property', subjectId: property.id }).expect(201);

    const missing = await tourist.as.post('/favorites').send({ subjectType: 'guide', subjectId: property.id }).expect(404);
    assert.equal(missing.body.error.code, 'SUBJECT_NOT_FOUND');
    await tourist.as.post('/favorites').send({ subjectType: 'hotel', subjectId: property.id }).expect(422);

    const list = (await tourist.as.get('/favorites').expect(200)).body;
    assert.equal(list.meta.total, 2);
    assert.deepEqual(list.data.map((f) => f.subjectType), ['property', 'destination']);
    assert.equal((await tourist.as.get('/favorites?subjectType=property').expect(200)).body.meta.total, 1);

    // A suspended item stays saved but is shown as unavailable.
    await admin.as.patch(`/admin/properties/${property.id}/status`).send({ status: 'suspended', reason: 'Safety inspection' }).expect(200);
    const saved = (await tourist.as.get('/favorites?subjectType=property').expect(200)).body.data[0];
    assert.deepEqual([saved.available, saved.item], [false, null]);

    await tourist.as.delete(`/favorites/property/${property.id}`).expect(204);
    await tourist.as.delete(`/favorites/property/${property.id}`).expect(404);
    const other = await fx.actor(app);
    await other.as.delete(`/favorites/destination/${destinationId}`).expect(404);
    assert.equal((await tourist.as.get('/favorites').expect(200)).body.meta.total, 1);
  });
});

describe('reviews', () => {
  it('accepts verified reviews only from the author’s completed booking', async () => {
    const admin = await fx.actor(app, ['admin']);
    const tourist = await fx.actor(app, ['tourist'], { fullName: 'Asha Munda' });
    const { experience, booking } = await completedSessionBooking(admin, tourist);
    const body = { subjectType: 'experience', subjectId: experience.id, bookingId: booking.id, rating: 5, title: 'Lovely', comment: 'Great guide' };

    await tourist.as.post('/reviews').send({ ...body, bookingId: undefined }).expect(422);
    const stranger = await fx.actor(app);
    const notTheirs = await stranger.as.post('/reviews').send(body).expect(422);
    assert.equal(notTheirs.body.error.code, 'BOOKING_NOT_REVIEWABLE');
    const wrongSubject = await tourist.as.post('/reviews').send({ ...body, subjectType: 'package' }).expect(422);
    assert.equal(wrongSubject.body.error.code, 'BOOKING_NOT_REVIEWABLE');

    const review = (await tourist.as.post('/reviews').send(body).expect(201)).body.data;
    assert.deepEqual([review.status, review.verified, review.bookingId, review.author.displayName], ['pending', true, booking.id, 'Asha M.']);
    const dup = await tourist.as.post('/reviews').send(body).expect(409);
    assert.equal(dup.body.error.code, 'REVIEW_EXISTS');

    // Not public until approved.
    const query = `/reviews?subjectType=experience&subjectId=${experience.id}`;
    assert.equal((await h.api(app).get(query).expect(200)).body.meta.total, 0);
    await admin.as.patch(`/admin/reviews/${review.id}/status`).send({ status: 'approved' }).expect(200);
    const pub = (await h.api(app).get(query).expect(200)).body;
    assert.equal(pub.data.length, 1);
    assert.equal(pub.data[0].status, undefined, 'public view omits moderation fields');
    assert.deepEqual(pub.meta.rating, { count: 1, average: 5, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } });

    // An edit returns the review to moderation.
    const edited = (await tourist.as.patch(`/reviews/${review.id}`).send({ rating: 4 }).expect(200)).body.data;
    assert.deepEqual([edited.status, edited.rating], ['pending', 4]);
    assert.equal((await h.api(app).get(query).expect(200)).body.meta.total, 0);
    await stranger.as.patch(`/reviews/${review.id}`).send({ rating: 1 }).expect(404);
    await stranger.as.delete(`/reviews/${review.id}`).expect(404);
    await tourist.as.delete(`/reviews/${review.id}`).expect(204);
    await tourist.as.post('/reviews').send(body).expect(201);
  });

  it('takes one destination review per user and moderates it with an audit trail', async () => {
    const admin = await fx.actor(app, ['admin']);
    const destinationId = await fx.publishedDestination(app, admin);
    const slug = await slugOf(destinationId);
    const [a, b] = [await fx.actor(app), await fx.actor(app)];

    await a.as.post('/reviews').send({ subjectType: 'destination', subjectId: destinationId, bookingId: destinationId, rating: 4 }).expect(422);
    const ra = (await a.as.post('/reviews').send({ subjectType: 'destination', subjectId: destinationId, rating: 4 }).expect(201)).body.data;
    assert.equal(ra.verified, false);
    await a.as.post('/reviews').send({ subjectType: 'destination', subjectId: destinationId, rating: 2 }).expect(409);
    const rb = (await b.as.post('/reviews').send({ subjectType: 'destination', subjectId: destinationId, rating: 1, comment: 'spam' }).expect(201)).body.data;

    const queue = (await admin.as.get('/admin/reviews?status=pending').expect(200)).body;
    assert.deepEqual(queue.data.map((r) => r.id), [ra.id, rb.id], 'oldest first');
    await admin.as.patch(`/admin/reviews/${rb.id}/status`).send({ status: 'rejected' }).expect(422);
    await admin.as.patch(`/admin/reviews/${ra.id}/status`).send({ status: 'approved' }).expect(200);
    const rejected = (await admin.as.patch(`/admin/reviews/${rb.id}/status`).send({ status: 'rejected', note: 'Off-topic' }).expect(200)).body.data;
    assert.deepEqual([rejected.status, rejected.moderationNote, rejected.moderatedBy], ['rejected', 'Off-topic', admin.id]);
    const audit = (await pool.query("SELECT action, new_values FROM audit_logs WHERE entity_type = 'review' AND entity_id = $1", [rb.id])).rows;
    assert.deepEqual([audit[0].action, audit[0].new_values.status], ['reviews.moderated', 'rejected']);

    const pub = (await h.api(app).get(`/destinations/${slug}/reviews`).expect(200)).body;
    assert.deepEqual(pub.data.map((r) => r.id), [ra.id]);
    assert.equal(pub.meta.rating.average, 4);
    await h.api(app).get('/destinations/no-such-place/reviews').expect(404);
    await h.api(app).get(`/reviews?subjectType=guide&subjectId=${destinationId}`).expect(404);
    await h.api(app).get('/reviews').expect(422);

    await a.as.get('/admin/reviews').expect(403);
    await a.as.patch(`/admin/reviews/${ra.id}/status`).send({ status: 'hidden', note: 'x' }).expect(403);
  });
});
