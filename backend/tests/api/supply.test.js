'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { todayLocal, addDays } = require('../../src/core/utils/dates');
const h = require('../helpers');

const app = createApp();
const publicApi = h.api(app);
const day = (offset) => addDays(todayLocal(), offset);

before(async () => {
  await h.migrateTestDatabase();
  await h.ensureTestBuckets();
});
beforeEach(async () => {
  await h.resetData();
  await h.seedReference();
});
after(h.closeConnections);

async function actor(roles) {
  const user = await h.createUser({ roles });
  const session = await h.login(app, user);
  return { ...user, token: session.accessToken, as: h.api(app, { token: session.accessToken }) };
}

/** An approved partner organisation of the given type with its owner. */
async function partner(partnerType, admin) {
  const owner = await actor(['tourist']);
  const id = (
    await owner.as
      .post('/partners/apply')
      .send({ partnerType, businessName: `${partnerType} co ${owner.id.slice(0, 6)}`, legalName: 'Legal Name', email: `${owner.id.slice(0, 8)}@example.com` })
      .expect(201)
  ).body.data.id;
  await admin.as.patch(`/admin/partners/${id}/status`).send({ status: 'approved' }).expect(200);
  return { ...owner, partnerId: id };
}

const idOf = async (table, column, value) => (await pool.query(`SELECT id FROM ${table} WHERE ${column} = $1`, [value])).rows[0].id;

async function publishedDestination(admin, name, district, location) {
  const id = (
    await admin.as
      .post('/admin/destinations')
      .send({ districtId: await idOf('districts', 'slug', district), name, summary: 'S', description: 'D', location })
      .expect(201)
  ).body.data.id;
  await admin.as.put(`/admin/destinations/${id}/categories`).send({ categoryIds: [await idOf('destination_categories', 'slug', 'waterfalls')] }).expect(200);
  await admin.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(200);
  return id;
}

describe('accommodation', () => {
  it('runs the property lifecycle with rooms, calendars, availability and ownership isolation', async () => {
    const admin = await actor(['admin']);
    const hotel = await partner('accommodation', admin);
    const rival = await partner('accommodation', admin);
    const destinationId = await publishedDestination(admin, 'Netarhat', 'latehar', { latitude: 23.4836, longitude: 84.2675 });

    const created = await hotel.as
      .post('/partners/me/properties')
      .send({
        districtId: await idOf('districts', 'slug', 'latehar'),
        destinationId,
        name: 'Sunset Point Resort',
        propertyType: 'resort',
        description: 'Hilltop resort',
        address: 'Netarhat, Latehar',
        location: { latitude: 23.48, longitude: 84.27 },
        checkInTime: '13:00',
      })
      .expect(201);
    const property = created.body.data;
    assert.equal(property.status, 'pending_review');
    assert.equal(property.checkInTime, '13:00');
    assert.equal(property.policies.isDefault, true);
    await publicApi.get('/properties/sunset-point-resort').expect(404);
    await rival.as.patch(`/partners/me/properties/${property.id}`).send({ name: 'Hijack' }).expect(404);

    const noRooms = await admin.as.patch(`/admin/properties/${property.id}/status`).send({ status: 'published' }).expect(422);
    assert.deepEqual(noRooms.body.error.details.missing, ['activeRoomType']);

    const wifi = await idOf('amenities', 'code', 'wifi');
    const room = (
      await hotel.as
        .post(`/partners/me/properties/${property.id}/rooms`)
        .send({ name: 'Deluxe', maxAdults: 2, maxChildren: 1, totalUnits: 5, basePrice: '2500.00', amenityIds: [wifi] })
        .expect(201)
    ).body.data;
    await hotel.as.post(`/partners/me/properties/${property.id}/rooms`).send({ name: 'deluxe', maxAdults: 2, totalUnits: 1, basePrice: '1.00' }).expect(409);
    await rival.as.get(`/partners/me/rooms/${room.id}/calendar?from=${day(1)}&to=${day(2)}`).expect(404);

    await hotel.as.put(`/partners/me/properties/${property.id}/amenities`).send({ amenityIds: [wifi] }).expect(200);
    await hotel.as
      .put(`/partners/me/properties/${property.id}/policies`)
      .send({ cancellationPolicy: { tiers: [{ hoursBeforeCheckIn: 48, refundPercent: 100 }, { hoursBeforeCheckIn: 0, refundPercent: 0 }] }, houseRules: 'No loud music after 10pm' })
      .expect(200);

    const inventory = await hotel.as
      .put(`/partners/me/rooms/${room.id}/inventory`)
      .send({ ranges: [{ from: day(10), to: day(11), blockedUnits: 2 }, { from: day(12), to: day(12), totalUnits: 1 }] })
      .expect(200);
    assert.deepEqual(inventory.body.data.days.map((d) => [d.totalUnits, d.blockedUnits]), [[5, 2], [5, 2], [1, 0]]);
    await hotel.as.put(`/partners/me/rooms/${room.id}/inventory`).send({ ranges: [{ from: day(10), to: day(10), totalUnits: 9 }] }).expect(422);
    await hotel.as.put(`/partners/me/rooms/${room.id}/inventory`).send({ ranges: [{ from: day(10), to: day(10), blockedUnits: 6 }] }).expect(422);
    await hotel.as.put(`/partners/me/rooms/${room.id}/inventory`).send({ ranges: [{ from: day(-1), to: day(1), blockedUnits: 1 }] }).expect(422);
    await hotel.as.put(`/partners/me/rooms/${room.id}/rates`).send({ ranges: [{ from: day(11), to: day(11), nightlyPrice: '3200.50' }] }).expect(200);

    await admin.as.patch(`/admin/properties/${property.id}/status`).send({ status: 'published' }).expect(200);
    const detail = (await publicApi.get('/properties/sunset-point-resort').expect(200)).body.data;
    assert.equal(detail.startingPrice, '2500.00');
    assert.deepEqual(detail.amenities.map((a) => a.code), ['wifi']);
    assert.equal(detail.policies.houseRules, 'No loud music after 10pm');
    assert.equal(detail.rooms[0].amenities[0].code, 'wifi');

    const availability = (
      await publicApi.get(`/properties/${property.id}/availability?checkIn=${day(10)}&checkOut=${day(13)}&adults=2&rooms=1`).expect(200)
    ).body.data;
    assert.equal(availability.nights, 3);
    const deluxe = availability.rooms[0];
    assert.equal(deluxe.availableUnits, 1, 'the tightest night limits availability');
    assert.equal(deluxe.totalPrice, '8200.50');
    assert.equal(deluxe.available, true);
    const tooMany = (await publicApi.get(`/properties/${property.id}/availability?checkIn=${day(10)}&checkOut=${day(12)}&adults=5&rooms=2`).expect(200)).body.data;
    assert.equal(tooMany.rooms[0].fitsOccupancy, false);
    await publicApi.get(`/properties/${property.id}/availability?checkIn=${day(-2)}&checkOut=${day(1)}`).expect(422);

    const near = (await publicApi.get('/destinations/netarhat/properties').expect(200)).body.data;
    assert.deepEqual(near.map((p) => p.slug), ['sunset-point-resort']);

    await admin.as.patch(`/admin/properties/${property.id}/status`).send({ status: 'rejected', reason: 'Photos missing' }).expect(200);
    await publicApi.get('/properties/sunset-point-resort').expect(404);
    const resubmitted = await hotel.as.patch(`/partners/me/properties/${property.id}`).send({ description: 'Hilltop resort with sunset views' }).expect(200);
    assert.equal(resubmitted.body.data.status, 'pending_review');
  });

  it('hides published supply when the partner is suspended and blocks management', async () => {
    const admin = await actor(['admin']);
    const hotel = await partner('accommodation', admin);
    const id = (
      await hotel.as
        .post('/partners/me/properties')
        .send({ districtId: await idOf('districts', 'slug', 'ranchi'), name: 'City Inn', propertyType: 'hotel', description: 'D', address: 'A', location: { latitude: 23.3, longitude: 85.3 } })
        .expect(201)
    ).body.data.id;
    await hotel.as.post(`/partners/me/properties/${id}/rooms`).send({ name: 'Std', maxAdults: 2, totalUnits: 3, basePrice: '1000' }).expect(201);
    await admin.as.patch(`/admin/properties/${id}/status`).send({ status: 'published' }).expect(200);
    await publicApi.get('/properties/city-inn').expect(200);

    await admin.as.patch(`/admin/partners/${hotel.partnerId}/status`).send({ status: 'suspended', notes: 'Investigation' }).expect(200);
    await publicApi.get('/properties/city-inn').expect(404);
    await hotel.as.get('/partners/me/properties').expect(403);
  });

  it('only partner types that offer accommodation can manage properties', async () => {
    const admin = await actor(['admin']);
    const operator = await partner('operator', admin);
    await operator.as.get('/partners/me/properties').expect(403);
    const multi = await partner('multi', admin);
    await multi.as.get('/partners/me/properties').expect(200);
    await multi.as.get('/partners/me/guides').expect(200);
  });
});

describe('guides', () => {
  it('verifies guides before listing them and rejects overlapping availability', async () => {
    const admin = await actor(['admin']);
    const agency = await partner('guide', admin);
    const destinationId = await publishedDestination(admin, 'Betla', 'latehar', { latitude: 23.88, longitude: 84.19 });

    const guide = (await agency.as.post('/partners/me/guides').send({ displayName: 'Ravi Oraon', yearsExperience: 8, bio: 'Forest guide' }).expect(201)).body.data;
    const stranger = await actor(['tourist']);
    await agency.as.post('/partners/me/guides').send({ displayName: 'X', userId: stranger.id }).expect(422);

    const hindi = await idOf('guide_languages', 'code', 'hi');
    const kurukh = await idOf('guide_languages', 'code', 'kru');
    await agency.as.put(`/partners/me/guides/${guide.id}/languages`).send({ languageIds: [hindi, kurukh] }).expect(200);
    await agency.as.put(`/partners/me/guides/${guide.id}/destinations`).send({ destinationIds: [destinationId] }).expect(200);
    const service = (
      await agency.as.post(`/partners/me/guides/${guide.id}/services`).send({ title: 'Jungle walk', durationMinutes: 180, price: '1500.00', maxGroupSize: 8 }).expect(201)
    ).body.data;
    await agency.as.patch(`/partners/me/guides/${guide.id}/services/${service.id}/status`).send({ status: 'inactive' }).expect(200);
    await agency.as.patch(`/partners/me/guides/${guide.id}/services/${service.id}`).send({ status: 'active' }).expect(422);
    await agency.as.patch(`/partners/me/guides/${guide.id}/services/${service.id}`).send({ price: '1400.00' }).expect(200);
    await agency.as.patch(`/partners/me/guides/${guide.id}/services/${service.id}/status`).send({ status: 'active' }).expect(200);

    const overlap = await agency.as
      .put(`/partners/me/guides/${guide.id}/availability`)
      .send({ from: day(1), to: day(3), slots: [{ date: day(2), startTime: '08:00', endTime: '12:00' }, { date: day(2), startTime: '11:00', endTime: '14:00' }] })
      .expect(422);
    assert.match(overlap.body.error.details[0].message, /overlap/);
    await agency.as
      .put(`/partners/me/guides/${guide.id}/availability`)
      .send({ from: day(1), to: day(3), slots: [{ date: day(2), startTime: '08:00', endTime: '12:00' }, { date: day(2), startTime: '13:00', endTime: '17:00', status: 'blocked' }] })
      .expect(200);

    await publicApi.get(`/guides/${guide.id}`).expect(404);
    const doc = await h.uploadMedia(app, agency.token, { purpose: 'verification_document', mimeType: 'application/pdf' });
    await agency.as.post(`/partners/me/guides/${guide.id}/documents`).send({ mediaId: doc.media.id, documentType: 'guide_license' }).expect(201);
    const review = (await admin.as.get(`/admin/guides/${guide.id}`).expect(200)).body.data;
    assert.equal(review.verificationStatus, 'pending');
    assert.match(review.documents[0].media.url, /X-Amz-Signature=/);
    await admin.as.patch(`/admin/guides/${guide.id}/verification`).send({ verificationStatus: 'verified' }).expect(200);

    const pub = (await publicApi.get(`/guides/${guide.id}`).expect(200)).body.data;
    assert.equal(pub.startingPrice, '1400.00');
    assert.deepEqual(pub.languages.map((l) => l.code).sort(), ['hi', 'kru']);
    assert.equal(pub.verificationStatus, undefined);
    assert.deepEqual((await publicApi.get('/destinations/betla/guides').expect(200)).body.data.map((g) => g.id), [guide.id]);
    assert.equal((await publicApi.get('/guides?language=kru').expect(200)).body.meta.total, 1);
    const slots = (await publicApi.get(`/guides/${guide.id}/availability?from=${day(1)}&to=${day(5)}`).expect(200)).body.data.slots;
    assert.deepEqual(slots, [{ date: day(2), startTime: '08:00', endTime: '12:00' }], 'blocked windows are not offered');

    await admin.as.patch(`/admin/guides/${guide.id}/status`).send({ status: 'suspended', reason: 'Complaint' }).expect(200);
    await publicApi.get(`/guides/${guide.id}`).expect(404);
    await agency.as.patch(`/partners/me/guides/${guide.id}`).send({ status: 'active' }).expect(409);
  });
});

describe('experiences and packages', () => {
  it('publishes experiences with sessions and seat availability', async () => {
    const admin = await actor(['admin']);
    const operator = await partner('operator', admin);
    const destinationId = await publishedDestination(admin, 'Hundru', 'ranchi', { latitude: 23.45, longitude: 85.65 });

    const exp = (
      await operator.as
        .post('/partners/me/experiences')
        .send({ name: 'Sohrai Painting Workshop', durationMinutes: 180, minParticipants: 2, maxParticipants: 12 })
        .expect(201)
    ).body.data;
    const blocked = await admin.as.patch(`/admin/experiences/${exp.id}/status`).send({ status: 'published' }).expect(422);
    assert.deepEqual(blocked.body.error.details.missing, ['description', 'destination']);
    await operator.as.patch(`/partners/me/experiences/${exp.id}`).send({ description: 'Tribal wall art', destinationId }).expect(200);

    const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const endsAt = new Date(Date.now() + 3 * 86_400_000 + 3 * 3_600_000).toISOString();
    await operator.as.post(`/partners/me/experiences/${exp.id}/sessions`).send({ startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt, capacity: 10, pricePerPerson: '800' }).expect(422);
    await operator.as.post(`/partners/me/experiences/${exp.id}/sessions`).send({ startsAt, endsAt, capacity: 1, pricePerPerson: '800' }).expect(422);
    const session = (await operator.as.post(`/partners/me/experiences/${exp.id}/sessions`).send({ startsAt, endsAt, capacity: 10, pricePerPerson: '800.00' }).expect(201)).body.data;

    await admin.as.patch(`/admin/experiences/${exp.id}/status`).send({ status: 'published' }).expect(200);
    const pub = (await publicApi.get('/experiences/sohrai-painting-workshop').expect(200)).body.data;
    assert.equal(pub.startingPrice, '800.00');
    assert.equal(pub.upcomingSessions.length, 1);
    const seats = (await publicApi.get(`/experiences/${exp.id}/availability?participants=11`).expect(200)).body.data;
    assert.equal(seats.sessions[0].available, false);
    assert.deepEqual((await publicApi.get('/destinations/hundru/experiences').expect(200)).body.data.map((e) => e.id), [exp.id]);

    await operator.as.patch(`/partners/me/experiences/${exp.id}/sessions/${session.id}`).send({ capacity: 6 }).expect(200);
    await operator.as.delete(`/partners/me/experiences/${exp.id}/sessions/${session.id}`).expect(204);
    assert.equal((await publicApi.get(`/experiences/${exp.id}/sessions`).expect(200)).body.data.length, 0);
  });

  it('builds packages with itinerary, inclusions and derived departures', async () => {
    const admin = await actor(['admin']);
    const operator = await partner('operator', admin);
    const destinationId = await publishedDestination(admin, 'Baidyanath', 'deoghar', { latitude: 24.49, longitude: 86.7 });

    await operator.as.post('/partners/me/packages').send({ name: 'Bad', durationDays: 3, durationNights: 5, maxTravelers: 10 }).expect(422);
    const pkg = (
      await operator.as
        .post('/partners/me/packages')
        .send({ name: 'Santhal Pargana Heritage Trail', summary: 'Temples and villages', description: 'Five-day trail', durationDays: 3, durationNights: 2, minTravelers: 2, maxTravelers: 15 })
        .expect(201)
    ).body.data;
    await operator.as.put(`/partners/me/packages/${pkg.id}/destinations`).send({ destinationIds: [destinationId] }).expect(200);
    await operator.as
      .put(`/partners/me/packages/${pkg.id}/itinerary`)
      .send({ days: [{ dayNumber: 4, title: 'Too long', items: [] }] })
      .expect(422);
    await operator.as
      .put(`/partners/me/packages/${pkg.id}/itinerary`)
      .send({
        days: [
          { dayNumber: 1, title: 'Arrive in Deoghar', items: [{ activityTitle: 'Temple darshan', destinationId }] },
          { dayNumber: 2, title: 'Village visit', items: [{ activityTitle: 'Santhal village walk' }] },
        ],
      })
      .expect(200);
    await operator.as
      .put(`/partners/me/packages/${pkg.id}/inclusions`)
      .send({ items: [{ description: 'Breakfast', inclusionType: 'included' }, { description: 'Flights', inclusionType: 'excluded' }] })
      .expect(200);

    await operator.as.post(`/partners/me/packages/${pkg.id}/departures`).send({ startDate: day(0), totalSeats: 10, pricePerPerson: '9000' }).expect(422);
    const dep = (await operator.as.post(`/partners/me/packages/${pkg.id}/departures`).send({ startDate: day(20), totalSeats: 12, pricePerPerson: '9500.00' }).expect(201)).body.data;
    assert.equal(dep.endDate, day(22));
    await operator.as.post(`/partners/me/packages/${pkg.id}/departures`).send({ startDate: day(20), totalSeats: 12, pricePerPerson: '1' }).expect(409);
    await operator.as.post(`/partners/me/packages/${pkg.id}/departures`).send({ startDate: day(30), totalSeats: 12, pricePerPerson: '8999.00' }).expect(201);

    await admin.as.patch(`/admin/packages/${pkg.id}/status`).send({ status: 'published' }).expect(200);
    const pub = (await publicApi.get('/packages/santhal-pargana-heritage-trail').expect(200)).body.data;
    assert.equal(pub.startingPrice, '8999.00');
    assert.equal(pub.nextDeparture, day(20));
    assert.deepEqual(pub.inclusions, ['Breakfast']);
    assert.deepEqual(pub.exclusions, ['Flights']);
    assert.equal(pub.itinerary[0].items[0].destination.slug, 'baidyanath');
    const seats = (await publicApi.get(`/packages/${pkg.id}/availability?travelers=1`).expect(200)).body.data;
    assert.equal(seats.withinGroupLimits, false, 'below the minimum group size');

    await operator.as.patch(`/partners/me/packages/${pkg.id}/departures/${dep.id}`).send({ startDate: day(25) }).expect(200);
    const moved = (await publicApi.get(`/packages/${pkg.id}/departures`).expect(200)).body.data.find((d) => d.id === dep.id);
    assert.equal(moved.endDate, day(27));

    const results = (await publicApi.get('/search?q=heritage').expect(200)).body.data;
    assert.ok(results.some((r) => r.type === 'package' && r.slug === 'santhal-pargana-heritage-trail'));
  });
});

describe('search across supply', () => {
  it('finds properties by name and location', async () => {
    const admin = await actor(['admin']);
    const hotel = await partner('accommodation', admin);
    const id = (
      await hotel.as
        .post('/partners/me/properties')
        .send({ districtId: await idOf('districts', 'slug', 'ranchi'), name: 'Kanke Lake Homestay', propertyType: 'homestay', description: 'D', address: 'A', location: { latitude: 23.41, longitude: 85.32 } })
        .expect(201)
    ).body.data.id;
    await hotel.as.post(`/partners/me/properties/${id}/rooms`).send({ name: 'Room', maxAdults: 2, totalUnits: 2, basePrice: '1200' }).expect(201);
    await admin.as.patch(`/admin/properties/${id}/status`).send({ status: 'published' }).expect(200);

    const typed = (await publicApi.get('/search?q=kanke&type=property').expect(200)).body.data;
    assert.equal(typed[0].slug, 'kanke-lake-homestay');
    const near = (await publicApi.get('/search/nearby?lat=23.40&lng=85.32&radiusKm=5&type=property').expect(200)).body.data;
    assert.deepEqual(near.map((p) => `${p.type}:${p.slug}`), ['property:kanke-lake-homestay']);
    assert.ok((await publicApi.get('/search/filters').expect(200)).body.data.nearbyTypes.includes('property'));
  });
});
