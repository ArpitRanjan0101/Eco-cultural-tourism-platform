'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const h = require('../helpers');

const app = createApp();
const publicApi = h.api(app);

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

const idOf = async (table, slug) => (await pool.query(`SELECT id FROM ${table} WHERE slug = $1`, [slug])).rows[0].id;

/** Creates and publishes a destination through the admin API. */
async function publishDestination(admin, { name, district, categories = ['waterfalls'], location, featured = false }) {
  const created = await admin.as
    .post('/admin/destinations')
    .send({
      districtId: await idOf('districts', district),
      name,
      summary: `${name} summary`,
      description: `${name} description with forest and waterfall`,
      location,
      featured,
      entryFee: '30.00',
      openingHours: { monday: [{ open: '06:00', close: '18:00' }], notes: 'Closed on Holi' },
    })
    .expect(201);
  const id = created.body.data.id;
  const categoryIds = await Promise.all(categories.map((slug) => idOf('destination_categories', slug)));
  await admin.as.put(`/admin/destinations/${id}/categories`).send({ categoryIds }).expect(200);
  await admin.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(200);
  return id;
}

describe('public geography', () => {
  it('lists the seeded Jharkhand regions and 24 districts with coordinates', async () => {
    const regions = (await publicApi.get('/regions').expect(200)).body.data;
    assert.equal(regions.length, 5);
    assert.equal(regions.reduce((sum, r) => sum + r.districtCount, 0), 24);

    const districts = (await publicApi.get('/districts').expect(200)).body.data;
    assert.equal(districts.length, 24);
    const kolhan = (await publicApi.get('/districts?region=kolhan').expect(200)).body.data;
    assert.deepEqual(kolhan.map((d) => d.slug), ['east-singhbhum', 'seraikela-kharsawan', 'west-singhbhum']);

    const ranchi = (await publicApi.get('/districts/ranchi').expect(200)).body.data;
    assert.equal(ranchi.region.slug, 'south-chotanagpur');
    assert.ok(Math.abs(ranchi.location.latitude - 23.34) < 0.1);
    await publicApi.get('/districts/atlantis').expect(404);
  });

  it('hides inactive districts publicly; admin changes are audited', async () => {
    const admin = await actor(['admin']);
    const pakur = await idOf('districts', 'pakur');
    await admin.as.patch(`/admin/districts/${pakur}/status`).send({ status: 'inactive' }).expect(200);
    await publicApi.get('/districts/pakur').expect(404);
    assert.equal((await publicApi.get('/districts').expect(200)).body.data.length, 23);
    const audit = await pool.query("SELECT action, old_values, new_values FROM audit_logs WHERE entity_id = $1", [pakur]);
    assert.deepEqual(audit.rows[0], { action: 'districts.status_changed', old_values: { status: 'active' }, new_values: { status: 'inactive' } });
  });

  it('admin creates/updates regions, districts and categories with slug conflicts as 409', async () => {
    const admin = await actor(['admin']);
    const region = (await admin.as.post('/admin/regions').send({ name: 'Test Region' }).expect(201)).body.data;
    assert.equal(region.slug, 'test-region');
    const dup = await admin.as.post('/admin/regions').send({ name: 'Other', slug: 'test-region' }).expect(409);
    assert.equal(dup.body.error.code, 'SLUG_TAKEN');

    const district = (
      await admin.as
        .post('/admin/districts')
        .send({ regionId: region.id, name: 'New District', location: { latitude: 23.5, longitude: 85.5 } })
        .expect(201)
    ).body.data;
    assert.deepEqual(district.location, { latitude: 23.5, longitude: 85.5 });
    const moved = await admin.as.patch(`/admin/districts/${district.id}`).send({ location: { latitude: 24, longitude: 86 }, description: 'Hills' }).expect(200);
    assert.equal(moved.body.data.description, 'Hills');
    await admin.as.post('/admin/districts').send({ regionId: region.id, name: 'Bad', location: { latitude: 120, longitude: 0 } }).expect(422);

    const category = (await admin.as.post('/admin/destination-categories').send({ name: 'Caves', icon: 'cave' }).expect(201)).body.data;
    await admin.as.patch(`/admin/destination-categories/${category.id}/status`).send({ status: 'inactive' }).expect(200);
    const publicCategories = (await publicApi.get('/destination-categories').expect(200)).body.data.map((c) => c.slug);
    assert.ok(!publicCategories.includes('caves'));
  });

  it('requires geography.manage for admin geography routes', async () => {
    const tourist = await actor(['tourist']);
    await tourist.as.get('/admin/regions').expect(403);
    await tourist.as.post('/admin/districts').send({}).expect(403);
    await publicApi.get('/admin/regions').expect(401);
  });
});

describe('destination lifecycle', () => {
  it('drafts are hidden; publishing requires complete content; archive hides again', async () => {
    const admin = await actor(['admin']);
    const created = await admin.as
      .post('/admin/destinations')
      .send({ districtId: await idOf('districts', 'ranchi'), name: 'Jonha Falls' })
      .expect(201);
    const id = created.body.data.id;
    assert.equal(created.body.data.status, 'draft');
    assert.equal(created.body.data.slug, 'jonha-falls');
    await publicApi.get('/destinations/jonha-falls').expect(404);

    const blocked = await admin.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(422);
    assert.deepEqual(blocked.body.error.details.missing, ['summary', 'description', 'location', 'categories']);

    await admin.as
      .patch(`/admin/destinations/${id}`)
      .send({ summary: 'Gautamdhara falls', description: 'A hanging valley waterfall', location: { latitude: 23.34, longitude: 85.6 } })
      .expect(200);
    await admin.as.put(`/admin/destinations/${id}/categories`).send({ categoryIds: [await idOf('destination_categories', 'waterfalls')] }).expect(200);
    const published = await admin.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(200);
    assert.ok(published.body.data.publishedAt);

    const cleared = await admin.as.patch(`/admin/destinations/${id}`).send({ summary: null }).expect(422);
    assert.equal(cleared.body.error.code, 'PUBLISH_REQUIREMENTS');

    const detail = (await publicApi.get('/destinations/jonha-falls').expect(200)).body.data;
    assert.equal(detail.district.slug, 'ranchi');
    assert.deepEqual(detail.categories.map((c) => c.slug), ['waterfalls']);
    assert.equal(detail.status, undefined, 'public view hides workflow status');

    await admin.as.delete(`/admin/destinations/${id}`).expect(204);
    await publicApi.get('/destinations/jonha-falls').expect(404);
    assert.equal((await admin.as.get(`/admin/destinations/${id}`).expect(200)).body.data.status, 'archived');
  });

  it('builds detail with gallery, cover, FAQs and related places', async () => {
    const admin = await actor(['admin']);
    const hundru = await publishDestination(admin, { name: 'Hundru', district: 'ranchi', location: { latitude: 23.45, longitude: 85.65 } });
    const dassam = await publishDestination(admin, { name: 'Dassam', district: 'ranchi', location: { latitude: 23.14, longitude: 85.47 } });
    const draft = (await admin.as.post('/admin/destinations').send({ districtId: await idOf('districts', 'ranchi'), name: 'Hidden Draft' }).expect(201)).body.data.id;

    const first = await h.uploadMedia(app, admin.token);
    const second = await h.uploadMedia(app, admin.token);
    await admin.as.post(`/admin/destinations/${hundru}/media`).send({ mediaId: first.media.id, sortOrder: 1 }).expect(200);
    await admin.as.post(`/admin/destinations/${hundru}/media`).send({ mediaId: second.media.id, sortOrder: 2, isCover: true }).expect(200);
    await admin.as
      .put(`/admin/destinations/${hundru}/faqs`)
      .send({ faqs: [{ question: 'Best season?', answer: 'Sep to Feb' }, { question: 'Steps?', answer: 'About 700' }] })
      .expect(200);
    await admin.as.put(`/admin/destinations/${hundru}/related`).send({ destinationIds: [draft, dassam] }).expect(200);
    await admin.as.put(`/admin/destinations/${hundru}/related`).send({ destinationIds: [hundru] }).expect(422);

    const detail = (await publicApi.get('/destinations/hundru').expect(200)).body.data;
    assert.equal(detail.coverImage.id, second.media.id);
    assert.deepEqual(detail.gallery.map((g) => [g.id, g.isCover]), [[second.media.id, true], [first.media.id, false]]);
    assert.deepEqual(detail.faqs.map((f) => f.question), ['Best season?', 'Steps?']);
    assert.deepEqual(detail.related.map((r) => r.slug), ['dassam'], 'unpublished related places are hidden');
    assert.equal(detail.entryFee, '30.00');
    assert.deepEqual(detail.openingHours.monday, [{ open: '06:00', close: '18:00' }]);

    const tourist = await actor(['tourist']);
    const avatar = await h.uploadMedia(app, tourist.token, { purpose: 'avatar' });
    const wrongPurpose = await admin.as.post(`/admin/destinations/${hundru}/media`).send({ mediaId: avatar.media.id }).expect(422);
    assert.match(wrongPurpose.body.error.details[0].message, /content_image/);

    await admin.as.delete(`/admin/destinations/${hundru}/media/${first.media.id}`).expect(204);
    await admin.as.delete(`/admin/destinations/${hundru}/media/${first.media.id}`).expect(404);
    const inUse = await admin.as.delete(`/media/${second.media.id}`).expect(409);
    assert.equal(inUse.body.error.code, 'MEDIA_IN_USE');
  });

  it('filters, sorts and paginates public listings', async () => {
    const admin = await actor(['admin']);
    await publishDestination(admin, { name: 'Netarhat', district: 'latehar', categories: ['hills-valleys'], location: { latitude: 23.48, longitude: 84.27 }, featured: true });
    await publishDestination(admin, { name: 'Betla', district: 'latehar', categories: ['wildlife-national-parks'], location: { latitude: 23.89, longitude: 84.19 } });
    await publishDestination(admin, { name: 'Baidyanath', district: 'deoghar', categories: ['temples-pilgrimage'], location: { latitude: 24.49, longitude: 86.7 } });

    const names = (res) => res.body.data.map((d) => d.name);
    assert.deepEqual(names(await publicApi.get('/destinations').expect(200)), ['Baidyanath', 'Betla', 'Netarhat']);
    assert.deepEqual(names(await publicApi.get('/destinations?district=latehar&sort=-name').expect(200)), ['Netarhat', 'Betla']);
    assert.deepEqual(names(await publicApi.get('/destinations?region=santhal-pargana').expect(200)), ['Baidyanath']);
    assert.deepEqual(names(await publicApi.get('/destinations?category=wildlife-national-parks').expect(200)), ['Betla']);
    assert.deepEqual(names(await publicApi.get('/destinations?featured=true').expect(200)), ['Netarhat']);
    assert.deepEqual(names(await publicApi.get('/destinations/featured').expect(200)), ['Netarhat']);
    assert.deepEqual(names(await publicApi.get('/destinations?q=forest').expect(200)).length, 3);
    assert.deepEqual(names(await publicApi.get('/districts/latehar/destinations?limit=1&page=2').expect(200)), ['Netarhat']);
    const page = await publicApi.get('/destinations?limit=2').expect(200);
    assert.deepEqual(page.body.meta, { page: 1, limit: 2, total: 3 });
    await publicApi.get('/destinations?district=atlantis').expect(404);
    await publicApi.get('/destinations?sort=status').expect(422);
  });

  it('returns nearby destinations ordered by PostGIS distance', async () => {
    const admin = await actor(['admin']);
    await publishDestination(admin, { name: 'Hundru', district: 'ranchi', location: { latitude: 23.4507, longitude: 85.6514 } });
    await publishDestination(admin, { name: 'Jonha', district: 'ranchi', location: { latitude: 23.3412, longitude: 85.6087 } });
    await publishDestination(admin, { name: 'Dassam', district: 'ranchi', location: { latitude: 23.1436, longitude: 85.4669 } });
    await publishDestination(admin, { name: 'Baidyanath', district: 'deoghar', location: { latitude: 24.4924, longitude: 86.7 } });

    const res = await publicApi.get('/destinations/hundru/nearby?radiusKm=60').expect(200);
    assert.deepEqual(res.body.data.map((d) => d.name), ['Jonha', 'Dassam']);
    assert.ok(res.body.data[0].distanceKm > 10 && res.body.data[0].distanceKm < 15);
    assert.ok(res.body.data[0].distanceKm < res.body.data[1].distanceKm);
  });

  it('enforces destination permissions (read/manage/publish)', async () => {
    const tourist = await actor(['tourist']);
    await tourist.as.get('/admin/destinations').expect(403);
    await h.withoutPermissions('admin', ['destinations.publish'], async () => {
      const editor = await actor(['admin']);
      const id = (await editor.as.post('/admin/destinations').send({ districtId: await idOf('districts', 'ranchi'), name: 'Editor Draft' }).expect(201)).body.data.id;
      await editor.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(403);
    });
  });
});
