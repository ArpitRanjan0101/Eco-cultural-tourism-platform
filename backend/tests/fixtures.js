'use strict';

const { pool } = require('../src/config/database');
const { todayLocal, addDays } = require('../src/core/utils/dates');
const h = require('./helpers');

/** Builders for published supply, used by booking tests (all through the public API). */

const day = (offset) => addDays(todayLocal(), offset);
const idOf = async (table, column, value) => (await pool.query(`SELECT id FROM ${table} WHERE ${column} = $1`, [value])).rows[0].id;

async function actor(app, roles = ['tourist'], options = {}) {
  const user = await h.createUser({ roles, ...options });
  const session = await h.login(app, user);
  return { ...user, token: session.accessToken, as: h.api(app, { token: session.accessToken }) };
}

async function approvedPartner(app, admin, partnerType) {
  const owner = await actor(app);
  const id = (
    await owner.as
      .post('/partners/apply')
      .send({ partnerType, businessName: `Org ${owner.id.slice(0, 8)}`, legalName: 'Legal', email: `${owner.id.slice(0, 8)}@example.com` })
      .expect(201)
  ).body.data.id;
  await admin.as.patch(`/admin/partners/${id}/status`).send({ status: 'approved' }).expect(200);
  return { ...owner, partnerId: id };
}

async function publishedDestination(app, admin, name = 'Hundru Falls') {
  const id = (
    await admin.as
      .post('/admin/destinations')
      .send({ districtId: await idOf('districts', 'slug', 'ranchi'), name, summary: 'S', description: 'D', location: { latitude: 23.45, longitude: 85.65 } })
      .expect(201)
  ).body.data.id;
  await admin.as.put(`/admin/destinations/${id}/categories`).send({ categoryIds: [await idOf('destination_categories', 'slug', 'waterfalls')] }).expect(200);
  await admin.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(200);
  return id;
}

async function publishedRoom(app, admin, { totalUnits = 1, basePrice = '2000.00', bookingMode = 'instant' } = {}) {
  const hotel = await approvedPartner(app, admin, 'accommodation');
  const property = (
    await hotel.as
      .post('/partners/me/properties')
      .send({
        districtId: await idOf('districts', 'slug', 'ranchi'),
        name: `Stay ${hotel.id.slice(0, 6)}`,
        propertyType: 'hotel',
        description: 'D',
        address: 'A',
        location: { latitude: 23.36, longitude: 85.33 },
        bookingMode,
      })
      .expect(201)
  ).body.data;
  const room = (
    await hotel.as.post(`/partners/me/properties/${property.id}/rooms`).send({ name: 'Standard', maxAdults: 2, maxChildren: 1, totalUnits, basePrice }).expect(201)
  ).body.data;
  await admin.as.patch(`/admin/properties/${property.id}/status`).send({ status: 'published' }).expect(200);
  return { hotel, property, room };
}

async function publishedGuideService(app, admin, { bookingMode = 'instant' } = {}) {
  const agency = await approvedPartner(app, admin, 'guide');
  const guide = (await agency.as.post('/partners/me/guides').send({ displayName: `Guide ${agency.id.slice(0, 6)}`, yearsExperience: 5 }).expect(201)).body.data;
  const service = (
    await agency.as.post(`/partners/me/guides/${guide.id}/services`).send({ title: 'Walk', durationMinutes: 120, price: '1500.00', maxGroupSize: 6, bookingMode }).expect(201)
  ).body.data;
  await agency.as
    .put(`/partners/me/guides/${guide.id}/availability`)
    .send({ from: day(5), to: day(5), slots: [{ date: day(5), startTime: '08:00', endTime: '14:00' }] })
    .expect(200);
  const doc = await h.uploadMedia(app, agency.token, { purpose: 'verification_document', mimeType: 'application/pdf' });
  await agency.as.post(`/partners/me/guides/${guide.id}/documents`).send({ mediaId: doc.media.id, documentType: 'guide_license' }).expect(201);
  await admin.as.patch(`/admin/guides/${guide.id}/verification`).send({ verificationStatus: 'verified' }).expect(200);
  return { agency, guide, service };
}

async function publishedSession(app, admin, { capacity = 3, bookingMode = 'instant', daysAhead = 6 } = {}) {
  const operator = await approvedPartner(app, admin, 'operator');
  const destinationId = await publishedDestination(app, admin, `Dest ${operator.id.slice(0, 6)}`);
  const experience = (
    await operator.as
      .post('/partners/me/experiences')
      .send({ name: `Exp ${operator.id.slice(0, 6)}`, description: 'D', destinationId, durationMinutes: 120, maxParticipants: 10, bookingMode })
      .expect(201)
  ).body.data;
  const startsAt = new Date(Date.now() + daysAhead * 86_400_000);
  const session = (
    await operator.as
      .post(`/partners/me/experiences/${experience.id}/sessions`)
      .send({ startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(), capacity, pricePerPerson: '500.00' })
      .expect(201)
  ).body.data;
  await admin.as.patch(`/admin/experiences/${experience.id}/status`).send({ status: 'published' }).expect(200);
  return { operator, experience, session };
}

async function publishedDeparture(app, admin, { totalSeats = 4, bookingMode = 'instant' } = {}) {
  const operator = await approvedPartner(app, admin, 'operator');
  const destinationId = await publishedDestination(app, admin, `Pkg dest ${operator.id.slice(0, 6)}`);
  const pkg = (
    await operator.as
      .post('/partners/me/packages')
      .send({ name: `Pkg ${operator.id.slice(0, 6)}`, summary: 'S', description: 'D', durationDays: 2, durationNights: 1, maxTravelers: 10, bookingMode })
      .expect(201)
  ).body.data;
  await operator.as.put(`/partners/me/packages/${pkg.id}/destinations`).send({ destinationIds: [destinationId] }).expect(200);
  await operator.as.put(`/partners/me/packages/${pkg.id}/itinerary`).send({ days: [{ dayNumber: 1, title: 'Day 1', items: [] }] }).expect(200);
  const departure = (
    await operator.as.post(`/partners/me/packages/${pkg.id}/departures`).send({ startDate: day(10), totalSeats, pricePerPerson: '7000.00' }).expect(201)
  ).body.data;
  await admin.as.patch(`/admin/packages/${pkg.id}/status`).send({ status: 'published' }).expect(200);
  return { operator, pkg, departure };
}

const traveler = (name = 'Asha Munda') => [{ fullName: name, isPrimary: true }];

/** POST /bookings with a fresh idempotency key. */
function book(tourist, body, key = `key-${Math.random().toString(36).slice(2)}-${Date.now()}`) {
  return tourist.as.post('/bookings').set('Idempotency-Key', key).send({ travelers: traveler(), ...body });
}

module.exports = {
  day,
  idOf,
  actor,
  approvedPartner,
  publishedDestination,
  publishedRoom,
  publishedGuideService,
  publishedSession,
  publishedDeparture,
  traveler,
  book,
};
