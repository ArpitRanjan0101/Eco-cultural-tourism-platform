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

async function actor(roles, options = {}) {
  const user = await h.createUser({ roles, ...options });
  const session = await h.login(app, user);
  return { ...user, token: session.accessToken, as: h.api(app, { token: session.accessToken }) };
}

const application = (overrides = {}) => ({
  partnerType: 'accommodation',
  businessName: 'Netarhat Stays',
  legalName: 'Netarhat Stays Pvt Ltd',
  email: 'stays@example.com',
  taxIdentifier: '20ABCDE1234F1Z5',
  ...overrides,
});

const rolesOf = async (userId) =>
  (await pool.query('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.code', [userId])).rows.map((r) => r.code);

describe('partner application and approval', () => {
  it('applies, stays restricted until approved, then gains the supply role', async () => {
    const owner = await actor(['tourist']);
    const admin = await actor(['admin']);

    const applied = await owner.as.post('/partners/apply').send(application()).expect(201);
    assert.equal(applied.body.data.status, 'pending');
    assert.equal(applied.body.data.myRole, 'owner');
    const partnerId = applied.body.data.id;
    await owner.as.post('/partners/apply').send(application({ businessName: 'Second' })).expect(409);

    await owner.as.get('/partners/me').expect(200);
    await owner.as.post('/partners/me/properties').send({}).expect(403);

    const doc = await h.uploadMedia(app, owner.token, { purpose: 'verification_document', mimeType: 'application/pdf' });
    await owner.as.post('/partners/me/documents').send({ mediaId: doc.media.id, documentType: 'gst_certificate' }).expect(201);
    await owner.as.post('/partners/me/documents').send({ mediaId: doc.media.id, documentType: 'gst_certificate' }).expect(409);

    const invalid = await admin.as.patch(`/admin/partners/${partnerId}/status`).send({ status: 'suspended', notes: 'not yet' }).expect(409);
    assert.equal(invalid.body.error.code, 'INVALID_STATUS_TRANSITION');
    await admin.as.patch(`/admin/partners/${partnerId}/status`).send({ status: 'rejected' }).expect(422);

    const docs = (await admin.as.get(`/admin/partners/${partnerId}/documents`).expect(200)).body.data;
    assert.match(docs[0].media.url, /X-Amz-Signature=/);

    const approved = await admin.as.patch(`/admin/partners/${partnerId}/status`).send({ status: 'approved' }).expect(200);
    assert.deepEqual(approved.body.data.history.map((entry) => entry.newStatus), ['pending', 'approved']);
    assert.equal(approved.body.data.documents[0].reviewStatus, 'approved');
    assert.deepEqual(await rolesOf(owner.id), ['hotel_partner', 'tourist']);

    await owner.as.post('/partners/me/properties').send({ name: 'x' }).expect(422);
    const locked = await owner.as.patch('/partners/me').send({ legalName: 'Changed' }).expect(409);
    assert.equal(locked.body.error.code, 'FIELD_LOCKED');
    await owner.as.patch('/partners/me').send({ phone: '+919812345678' }).expect(200);

    await admin.as.patch(`/admin/partners/${partnerId}/status`).send({ status: 'suspended', notes: 'Complaints under review' }).expect(200);
    assert.deepEqual(await rolesOf(owner.id), ['tourist']);
    const audit = await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = 'partners.status_changed'", [partnerId]);
    assert.equal(audit.rows[0].n, 2);
  });

  it('a rejected application is resubmitted by editing it', async () => {
    const owner = await actor(['tourist']);
    const admin = await actor(['admin']);
    const partnerId = (await owner.as.post('/partners/apply').send(application()).expect(201)).body.data.id;
    await admin.as.patch(`/admin/partners/${partnerId}/status`).send({ status: 'rejected', notes: 'Missing GST' }).expect(200);
    const resubmitted = await owner.as.patch('/partners/me').send({ taxIdentifier: '20ABCDE1234F1Z6' }).expect(200);
    assert.equal(resubmitted.body.data.status, 'pending');
  });

  it('reviewers cannot review their own organisation; non-reviewers are refused', async () => {
    const adminOwner = await actor(['admin']);
    const partnerId = (await adminOwner.as.post('/partners/apply').send(application()).expect(403)).body;
    assert.ok(partnerId, 'admins lack partners.apply by default');
    const tourist = await actor(['tourist']);
    const created = (await tourist.as.post('/partners/apply').send(application()).expect(201)).body.data.id;
    await pool.query("INSERT INTO partner_users (partner_id, user_id, role) VALUES ($1, $2, 'staff')", [created, adminOwner.id]);
    const self = await adminOwner.as.patch(`/admin/partners/${created}/status`).send({ status: 'approved' }).expect(403);
    assert.equal(self.body.error.code, 'SELF_REVIEW_FORBIDDEN');
    await tourist.as.get('/admin/partners').expect(403);
  });
});

describe('team management', () => {
  async function approvedOrg() {
    const owner = await actor(['tourist']);
    const admin = await actor(['admin']);
    const partnerId = (await owner.as.post('/partners/apply').send(application()).expect(201)).body.data.id;
    await admin.as.patch(`/admin/partners/${partnerId}/status`).send({ status: 'approved' }).expect(200);
    return { owner, admin, partnerId };
  }

  it('adds verified users, enforces owner/manager rules and keeps the last owner', async () => {
    const { owner } = await approvedOrg();
    const manager = await actor(['tourist']);
    const staff = await actor(['tourist']);
    const unverified = await h.createUser({ verified: false });

    await owner.as.post('/partners/me/users').send({ email: unverified.email }).expect(422);
    await owner.as.post('/partners/me/users').send({ email: manager.email, role: 'manager' }).expect(201);
    await owner.as.post('/partners/me/users').send({ email: manager.email }).expect(409);
    assert.deepEqual(await rolesOf(manager.id), ['hotel_partner', 'tourist'], 'approved org grants the supply role on join');

    const managerApi = h.api(app, { token: (await h.login(app, manager)).accessToken });
    await managerApi.post('/partners/me/users').send({ email: staff.email, role: 'owner' }).expect(403);
    await managerApi.post('/partners/me/users').send({ email: staff.email, role: 'staff' }).expect(201);
    await managerApi.patch(`/partners/me/users/${owner.id}`).send({ role: 'staff' }).expect(403);
    await owner.as.patch(`/partners/me/users/${owner.id}`).send({ role: 'staff' }).expect(403);
    const lastOwner = await owner.as.delete(`/partners/me/users/${owner.id}`).expect(409);
    assert.equal(lastOwner.body.error.code, 'LAST_OWNER');

    const staffApi = h.api(app, { token: (await h.login(app, staff)).accessToken });
    await staffApi.patch('/partners/me').send({ phone: '+919800000009' }).expect(403);
    await staffApi.delete(`/partners/me/users/${staff.id}`).expect(204);
    assert.deepEqual(await rolesOf(staff.id), ['tourist'], 'leaving revokes the supply role');
    assert.equal((await owner.as.get('/partners/me/users').expect(200)).body.data.length, 2);
  });

  it('requires X-Partner-Id for members of several organisations', async () => {
    const { owner } = await approvedOrg();
    const other = await actor(['tourist']);
    const admin = await actor(['admin']);
    const secondId = (await other.as.post('/partners/apply').send(application({ businessName: 'Second Org' })).expect(201)).body.data.id;
    await admin.as.patch(`/admin/partners/${secondId}/status`).send({ status: 'approved' }).expect(200);
    await other.as.post('/partners/me/users').send({ email: owner.email, role: 'manager' }).expect(201);

    const missing = await owner.as.get('/partners/me').expect(400);
    assert.equal(missing.body.error.code, 'PARTNER_CONTEXT_REQUIRED');
    const chosen = await owner.as.get('/partners/me').set('X-Partner-Id', secondId).expect(200);
    assert.equal(chosen.body.data.myRole, 'manager');
    const outsider = await actor(['tourist']);
    await outsider.as.get('/partners/me').expect(403);
    await owner.as.get('/partners/me').set('X-Partner-Id', '00000000-0000-4000-8000-000000000000').expect(403);
    await owner.as.get('/partners/me').set('X-Partner-Id', 'not-a-uuid').expect(400);
  });
});
