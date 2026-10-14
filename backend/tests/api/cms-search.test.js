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

async function destination(admin, name, district, { publish = true, location, summary } = {}) {
  const id = (
    await admin.as
      .post('/admin/destinations')
      .send({
        districtId: await idOf('districts', district),
        name,
        summary: summary ?? `${name} is a scenic place`,
        description: `${name} has forests, rivers and tribal villages`,
        location: location ?? { latitude: 23.4, longitude: 85.4 },
      })
      .expect(201)
  ).body.data.id;
  await admin.as.put(`/admin/destinations/${id}/categories`).send({ categoryIds: [await idOf('destination_categories', 'waterfalls')] }).expect(200);
  if (publish) await admin.as.patch(`/admin/destinations/${id}/status`).send({ status: 'published' }).expect(200);
  return id;
}

describe('CMS pages', () => {
  it('validates sections against the allowlist and rejects executable content', async () => {
    const admin = await actor(['admin']);
    const page = (await admin.as.post('/admin/cms/pages').send({ title: 'About Jharkhand', pageType: 'static' }).expect(201)).body.data;
    assert.equal(page.slug, 'about-jharkhand');
    const put = (sections) => admin.as.put(`/admin/cms/pages/${page.id}/sections`).send({ sections });

    await put([{ sectionType: 'marquee', data: {} }]).expect(422);
    await put([{ sectionType: 'rich_text', data: { markdown: 'Hello <script>alert(1)</script>' } }]).expect(422);
    await put([{ sectionType: 'rich_text', data: { markdown: '[x](javascript:alert(1))' } }]).expect(422);
    await put([{ sectionType: 'rich_text', data: { markdown: 'ok', onclick: 'x' } }]).expect(422);
    await put([{ sectionType: 'cta_banner', data: { heading: 'Go', text: 'Now', cta: { label: 'Go', href: '//evil.example' } } }]).expect(422);
    await put([{ sectionType: 'hero', data: { heading: 'Hi', mediaId: '00000000-0000-4000-8000-000000000000' } }]).expect(422);
    await put([{ sectionType: 'featured_destinations', data: { heading: 'Top', source: 'manual' } }]).expect(422);

    const ok = await put([{ sectionType: 'rich_text', data: { heading: 'Intro', markdown: '**Land of forests**' } }]).expect(200);
    assert.equal(ok.body.data.sections[0].sectionType, 'rich_text');
  });

  it('keeps drafts private and serialises published pages with resolved references', async () => {
    const admin = await actor(['admin']);
    const published = await destination(admin, 'Hundru Falls', 'ranchi');
    const draft = await destination(admin, 'Secret Falls', 'ranchi', { publish: false });
    const hero = await h.uploadMedia(app, admin.token);

    const page = (await admin.as.post('/admin/cms/pages').send({ title: 'Home', pageType: 'homepage', seoDescription: 'Explore Jharkhand' }).expect(201)).body.data;
    await admin.as.post('/admin/cms/pages').send({ title: 'Home 2', pageType: 'homepage' }).expect(409);
    await admin.as
      .put(`/admin/cms/pages/${page.id}/sections`)
      .send({
        sections: [
          { sectionType: 'hero', data: { heading: 'Discover Jharkhand', mediaId: hero.media.id, cta: { label: 'Explore', href: '/destinations' } } },
          { sectionType: 'featured_destinations', data: { heading: 'Must see', source: 'manual', destinationIds: [draft, published] } },
          { sectionType: 'district_grid', data: { heading: 'Kolhan', regionSlug: 'kolhan' } },
          { sectionType: 'faq', data: { items: [{ question: 'When?', answer: 'Oct-Mar' }] }, isEnabled: false },
        ],
      })
      .expect(200);

    await publicApi.get('/content/homepage').expect(404);
    await publicApi.get(`/content/pages/${page.slug}`).expect(404);

    await admin.as.patch(`/admin/cms/pages/${page.id}/status`).send({ status: 'published' }).expect(200);
    const home = (await publicApi.get('/content/homepage').expect(200)).body.data;
    assert.equal(home.seo.title, 'Home');
    assert.deepEqual(home.sections.map((s) => s.type), ['hero', 'featured_destinations', 'district_grid']);
    assert.equal(home.sections[0].data.image.url, hero.media.url);
    assert.deepEqual(home.sections[1].data.destinations.map((d) => d.name), ['Hundru Falls'], 'drafts never leak into CMS');
    assert.equal(home.sections[2].data.districts.length, 3);

    const inUse = await admin.as.delete(`/media/${hero.media.id}`).expect(409);
    assert.equal(inUse.body.error.code, 'MEDIA_IN_USE');

    await admin.as.delete(`/admin/cms/pages/${page.id}`).expect(204);
    await publicApi.get('/content/homepage').expect(404);
  });

  it('requires cms.publish to publish', async () => {
    const root = await actor(['super_admin']);
    const roles = (await root.as.get('/admin/roles').expect(200)).body.data;
    const admin = roles.find((r) => r.code === 'admin');
    await root.as.put(`/admin/roles/${admin.id}/permissions`).send({ permissions: admin.permissions.filter((p) => p !== 'cms.publish') }).expect(200);
    const editor = await actor(['admin']);
    const page = (await editor.as.post('/admin/cms/pages').send({ title: 'Draft', pageType: 'landing' }).expect(201)).body.data;
    await editor.as.patch(`/admin/cms/pages/${page.id}/status`).send({ status: 'published' }).expect(403);
    const tourist = await actor(['tourist']);
    await tourist.as.get('/admin/cms/pages').expect(403);
  });
});

describe('menus, redirects and announcements', () => {
  it('stores a menu tree and hides disabled branches publicly', async () => {
    const admin = await actor(['admin']);
    const menu = (await admin.as.post('/admin/cms/menus').send({ code: 'main', name: 'Main navigation' }).expect(201)).body.data;
    await admin.as.post('/admin/cms/menus').send({ code: 'main', name: 'Dup' }).expect(409);
    await admin.as
      .put(`/admin/cms/menus/${menu.id}/items`)
      .send({ items: [{ label: 'Bad', linkType: 'external', linkValue: 'http://insecure.example' }] })
      .expect(422);
    const saved = await admin.as
      .put(`/admin/cms/menus/${menu.id}/items`)
      .send({
        items: [
          {
            label: 'Explore',
            linkType: 'internal',
            linkValue: '/destinations',
            children: [
              { label: 'Waterfalls', linkType: 'category', linkValue: 'waterfalls' },
              { label: 'Hidden', linkType: 'district', linkValue: 'ranchi', isEnabled: false, children: [{ label: 'Deep', linkType: 'page', linkValue: 'x' }] },
            ],
          },
          { label: 'Tourism Board', linkType: 'external', linkValue: 'https://tourism.jharkhand.gov.in' },
        ],
      })
      .expect(200);
    assert.equal(saved.body.data.items[0].children.length, 2);

    const pub = (await publicApi.get('/content/menus/main').expect(200)).body.data;
    assert.deepEqual(pub.items.map((i) => i.label), ['Explore', 'Tourism Board']);
    assert.deepEqual(pub.items[0].children.map((c) => c.label), ['Waterfalls']);
    await publicApi.get('/content/menus/footer').expect(404);
  });

  it('manages redirects and time-boxed announcements', async () => {
    const admin = await actor(['admin']);
    const redirect = (await admin.as.post('/admin/cms/redirects').send({ sourcePath: '/old-falls', targetPath: '/destinations/hundru-falls' }).expect(201)).body.data;
    assert.equal(redirect.statusCode, 301);
    await admin.as.post('/admin/cms/redirects').send({ sourcePath: '/old-falls', targetPath: '/x' }).expect(409);
    await admin.as.post('/admin/cms/redirects').send({ sourcePath: '/a', targetPath: 'javascript:alert(1)' }).expect(422);
    assert.equal((await admin.as.get('/admin/cms/redirects').expect(200)).body.data.length, 1);
    await admin.as.delete(`/admin/cms/redirects/${redirect.id}`).expect(204);
    await admin.as.delete(`/admin/cms/redirects/${redirect.id}`).expect(404);

    const now = Date.now();
    const at = (hours) => new Date(now + hours * 3_600_000).toISOString();
    const live = (await admin.as.post('/admin/cms/announcements').send({ title: 'Sarhul festival', message: 'Celebrations this week', startsAt: at(-1), endsAt: at(24), status: 'published' }).expect(201)).body.data;
    await admin.as.post('/admin/cms/announcements').send({ title: 'Future', message: 'Soon', startsAt: at(48), endsAt: at(72), status: 'published' }).expect(201);
    await admin.as.post('/admin/cms/announcements').send({ title: 'Draft', message: 'Draft', startsAt: at(-1), endsAt: at(24) }).expect(201);
    await admin.as.post('/admin/cms/announcements').send({ title: 'Bad', message: 'Bad', startsAt: at(5), endsAt: at(1) }).expect(422);

    assert.deepEqual((await publicApi.get('/content/announcements').expect(200)).body.data.map((a) => a.title), ['Sarhul festival']);
    await admin.as.patch(`/admin/cms/announcements/${live.id}`).send({ endsAt: at(-2) }).expect(422);
    await admin.as.patch(`/admin/cms/announcements/${live.id}`).send({ status: 'archived' }).expect(200);
    assert.equal((await publicApi.get('/content/announcements').expect(200)).body.data.length, 0);
    await admin.as.delete(`/admin/cms/announcements/${live.id}`).expect(204);
  });
});

describe('search and discovery', () => {
  it('ranks unified results, supports type filters, suggestions, nearby and filter facets', async () => {
    const admin = await actor(['admin']);
    await destination(admin, 'Hundru Falls', 'ranchi', { location: { latitude: 23.4507, longitude: 85.6514 } });
    await destination(admin, 'Dassam Falls', 'ranchi', { location: { latitude: 23.1436, longitude: 85.4669 } });
    await destination(admin, 'Ranchi Lake', 'ranchi', { location: { latitude: 23.37, longitude: 85.33 }, summary: 'Lake in the city' });
    await destination(admin, 'Draft Falls', 'ranchi', { publish: false });

    const unified = (await publicApi.get('/search?q=ranchi').expect(200)).body;
    const types = unified.data.map((r) => `${r.type}:${r.name}`);
    assert.ok(types.includes('district:Ranchi'));
    assert.ok(types.includes('destination:Ranchi Lake'));

    const falls = (await publicApi.get('/search?q=falls&type=destination').expect(200)).body;
    assert.deepEqual(falls.data.map((r) => r.name).sort(), ['Dassam Falls', 'Hundru Falls']);
    assert.equal(falls.meta.total, 2);
    const fuzzy = (await publicApi.get('/search?q=hundro&type=destination').expect(200)).body.data;
    assert.equal(fuzzy[0].name, 'Hundru Falls', 'trigram matching tolerates typos');
    assert.equal((await publicApi.get('/search?q=falls&type=district').expect(200)).body.data.length, 0);
    await publicApi.get('/search?q=x').expect(422);
    await publicApi.get('/search?q=falls&page=50&limit=20').expect(422);

    const suggestions = (await publicApi.get('/search/suggestions?q=wat').expect(200)).body.data;
    assert.deepEqual(suggestions.map((s) => `${s.type}:${s.slug}`), ['category:waterfalls']);
    const ran = (await publicApi.get('/search/suggestions?q=ran').expect(200)).body.data;
    assert.ok(ran.some((s) => s.type === 'district' && s.slug === 'ranchi'));
    assert.ok(ran.some((s) => s.type === 'destination' && s.slug === 'ranchi-lake' && s.subtitle === 'Ranchi'));

    const nearby = (await publicApi.get('/search/nearby?lat=23.36&lng=85.33&radiusKm=20').expect(200)).body.data;
    assert.deepEqual(nearby.map((d) => d.name), ['Ranchi Lake']);
    await publicApi.get('/search/nearby?lat=200&lng=85').expect(422);

    const filters = (await publicApi.get('/search/filters').expect(200)).body.data;
    assert.equal(filters.regions.length, 5);
    const ranchi = filters.regions.flatMap((r) => r.districts).find((d) => d.slug === 'ranchi');
    assert.equal(ranchi.destinationCount, 3, 'drafts are not counted');
    assert.equal(filters.categories.find((c) => c.slug === 'waterfalls').count, 3);
  });
});
