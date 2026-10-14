'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const h = require('../helpers');

const app = createApp();

before(async () => {
  await h.migrateTestDatabase();
  await h.ensureTestBuckets();
});
beforeEach(h.resetData);
after(h.closeConnections);

async function actor(roles) {
  const user = await h.createUser({ roles });
  const session = await h.login(app, user);
  return { ...user, token: session.accessToken, as: h.api(app, { token: session.accessToken }) };
}

describe('upload authorisation and validation', () => {
  it('enforces purpose permissions, types and sizes', async () => {
    const tourist = await actor(['tourist']);
    let res = await tourist.as.post('/media/upload-init').send({ purpose: 'content_image', mimeType: 'image/png', fileSize: 100 }).expect(403);
    res = await tourist.as.post('/media/upload-init').send({ purpose: 'avatar', mimeType: 'application/pdf', fileSize: 100 }).expect(422);
    assert.match(res.body.error.details[0].message, /avatar accepts/);
    res = await tourist.as.post('/media/upload-init').send({ purpose: 'avatar', mimeType: 'image/png', fileSize: 6 * 1024 * 1024 }).expect(422);
    assert.match(res.body.error.details[0].message, /limited to 5 MB/);
    await tourist.as.post('/media/upload-init').send({ purpose: 'avatar', mimeType: 'image/gif', fileSize: 100 }).expect(422);
    await h.api(app).post('/media/upload-init').send({ purpose: 'avatar', mimeType: 'image/png', fileSize: 100 }).expect(401);
  });
});

describe('upload flow', () => {
  it('verifies a public image and serves it anonymously by URL', async () => {
    const admin = await actor(['admin']);
    const { status, media } = await h.uploadMedia(app, admin.token);
    assert.equal(status, 200);
    assert.equal(media.status, 'ready');
    assert.equal(media.visibility, 'public');
    assert.match(media.url, /\/content_image\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);

    const object = await fetch(media.url);
    assert.equal(object.status, 200, `${media.url} -> ${object.status}`);
    assert.deepEqual(Buffer.from(await object.arrayBuffer()), h.FILES['image/png']);

    const events = await pool.query("SELECT payload FROM outbox_events WHERE event_type = 'media.uploaded'");
    assert.equal(events.rows[0].payload.mediaId, media.id);
  });

  it('rejects content that does not match the declared type and removes it', async () => {
    const admin = await actor(['admin']);
    const result = await h.uploadMedia(app, admin.token, { mimeType: 'image/png', body: Buffer.concat([h.FILES['image/jpeg'], Buffer.alloc(8)]) });
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, 'UPLOAD_INVALID');
    const row = await pool.query('SELECT status FROM media_assets WHERE id = $1', [result.mediaId]);
    assert.equal(row.rows[0].status, 'rejected');
    const again = await admin.as.post('/media/upload-complete').send({ mediaId: result.mediaId }).expect(409);
    assert.equal(again.body.error.code, 'UPLOAD_REJECTED');
  });

  it('refuses to complete before the object is uploaded, and only for the uploader', async () => {
    const admin = await actor(['admin']);
    const other = await actor(['admin']);
    const init = await admin.as.post('/media/upload-init').send({ purpose: 'content_image', mimeType: 'image/png', fileSize: 64 }).expect(201);
    const mediaId = init.body.data.media.id;
    const early = await admin.as.post('/media/upload-complete').send({ mediaId }).expect(409);
    assert.equal(early.body.error.code, 'UPLOAD_NOT_FOUND');
    await other.as.post('/media/upload-complete').send({ mediaId }).expect(404);
  });

  it('the signed upload URL cannot be reused with a different size', async () => {
    const admin = await actor(['admin']);
    const init = await admin.as.post('/media/upload-init').send({ purpose: 'content_image', mimeType: 'image/png', fileSize: 64 }).expect(201);
    const { url, headers } = init.body.data.upload;
    const tooBig = Buffer.concat([h.FILES['image/png'], Buffer.alloc(1000)]);
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': headers['Content-Type'] }, body: tooBig });
    assert.ok(put.status >= 400, `expected rejection, got ${put.status}`);
  });
});

describe('private documents', () => {
  it('serves verification documents only via short-lived signed URLs to the owner', async () => {
    const owner = await actor(['tourist']);
    const stranger = await actor(['tourist']);
    const { media } = await h.uploadMedia(app, owner.token, { purpose: 'verification_document', mimeType: 'application/pdf' });
    assert.equal(media.visibility, 'private');
    assert.equal(media.url, null);

    const own = await owner.as.get(`/media/${media.id}`).expect(200);
    assert.match(own.body.data.url, /X-Amz-Signature=/);
    assert.equal((await fetch(own.body.data.url)).status, 200);
    assert.ok((await fetch(own.body.data.url.split('?')[0])).status >= 400, 'unsigned access must fail');

    await stranger.as.get(`/media/${media.id}`).expect(404);
    const admin = await actor(['admin']);
    await admin.as.get(`/media/${media.id}`).expect(200);
  });
});

describe('avatar and deletion', () => {
  it('sets an avatar, blocks deleting media in use, then deletes once unreferenced', async () => {
    const me = await actor(['tourist']);
    const { media } = await h.uploadMedia(app, me.token, { purpose: 'avatar' });
    const profile = await me.as.patch('/users/me').send({ avatarMediaId: media.id }).expect(200);
    assert.equal(profile.body.data.profile.avatarUrl, media.url);

    const other = await actor(['tourist']);
    const foreign = await other.as.patch('/users/me').send({ avatarMediaId: media.id }).expect(422);
    assert.match(foreign.body.error.details[0].message, /media not found/);

    const inUse = await me.as.delete(`/media/${media.id}`).expect(409);
    assert.equal(inUse.body.error.code, 'MEDIA_IN_USE');
    await me.as.patch('/users/me').send({ avatarMediaId: null }).expect(200);
    await other.as.delete(`/media/${media.id}`).expect(404);
    await me.as.delete(`/media/${media.id}`).expect(204);
    // S3 answers 403 (not 404) for missing objects when the caller lacks list permission.
    assert.notEqual((await fetch(media.url)).status, 200);
    assert.equal((await pool.query('SELECT 1 FROM media_assets WHERE id = $1', [media.id])).rowCount, 0);
  });
});
