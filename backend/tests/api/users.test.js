'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { migrateTestDatabase, resetData, closeConnections, createUser, api, login } = require('../helpers');

const app = createApp();

before(migrateTestDatabase);
beforeEach(resetData);
after(closeConnections);

async function actor(roles) {
  const user = await createUser({ roles });
  const session = await login(app, user);
  return { ...user, as: api(app, { token: session.accessToken, ip: '198.51.100.20' }) };
}

const auditRows = async (entityId) =>
  (await pool.query('SELECT action, actor_user_id, old_values, new_values, host(ip_address) AS ip FROM audit_logs WHERE entity_id = $1 ORDER BY created_at', [entityId])).rows;

describe('self-service profile', () => {
  it('reads and updates the profile; a changed phone loses verification', async () => {
    const me = await actor(['tourist']);
    await pool.query("UPDATE users SET phone = '+919800000001', phone_verified_at = now() WHERE id = $1", [me.id]);

    let res = await me.as.get('/users/me').expect(200);
    assert.equal(res.body.data.phoneVerified, true);
    assert.equal(res.body.data.profile.city, null);

    res = await me.as
      .patch('/users/me')
      .send({ fullName: 'Birsa Oraon', phone: '+919800000002', preferredLanguage: 'hi-IN', country: 'IN', state: 'Jharkhand', city: 'Ranchi' })
      .expect(200);
    assert.equal(res.body.data.fullName, 'Birsa Oraon');
    assert.equal(res.body.data.phoneVerified, false);
    assert.deepEqual(res.body.data.profile, {
      avatarMediaId: null,
      avatarUrl: null,
      preferredLanguage: 'hi-IN',
      country: 'IN',
      state: 'Jharkhand',
      city: 'Ranchi',
    });

    res = await me.as.patch('/users/me').send({ city: null }).expect(200);
    assert.equal(res.body.data.profile.city, null);
    assert.equal(res.body.data.profile.state, 'Jharkhand');
  });

  it('rejects protected or invalid fields and duplicate phones', async () => {
    const me = await actor(['tourist']);
    await me.as.patch('/users/me').send({ email: 'x@example.com' }).expect(422);
    await me.as.patch('/users/me').send({ status: 'active' }).expect(422);
    await me.as.patch('/users/me').send({}).expect(422);
    await me.as.patch('/users/me').send({ phone: '98000' }).expect(422);

    const other = await createUser();
    await pool.query("UPDATE users SET phone = '+919811111111' WHERE id = $1", [other.id]);
    const dup = await me.as.patch('/users/me').send({ phone: '+919811111111' }).expect(409);
    assert.equal(dup.body.error.code, 'PHONE_IN_USE');
  });

  it('lists own roles', async () => {
    const me = await actor(['tourist', 'guide']);
    const res = await me.as.get('/users/me/roles').expect(200);
    assert.deepEqual(res.body.data.map((r) => r.code), ['guide', 'tourist']);
  });
});

describe('admin user management', () => {
  it('denies admin endpoints to tourists and partners (403)', async () => {
    for (const roles of [['tourist'], ['hotel_partner']]) {
      const user = await actor(roles);
      for (const path of ['/admin/users', '/admin/roles', '/admin/permissions']) {
        const res = await user.as.get(path).expect(403);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      }
    }
  });

  it('searches users with filters, sorting and pagination', async () => {
    const admin = await actor(['admin']);
    await createUser({ email: 'kiran@example.com', fullName: 'Kiran Soren' });
    await createUser({ email: 'meera@example.com', fullName: 'Meera Toppo', status: 'suspended' });
    await createUser({ email: 'guide@example.com', fullName: 'Ravi Guide', roles: ['guide'] });

    let res = await admin.as.get('/admin/users?q=soren').expect(200);
    assert.deepEqual(res.body.data.map((u) => u.email), ['kiran@example.com']);
    res = await admin.as.get('/admin/users?status=suspended').expect(200);
    assert.deepEqual(res.body.data.map((u) => u.email), ['meera@example.com']);
    res = await admin.as.get('/admin/users?role=guide').expect(200);
    assert.deepEqual(res.body.data.map((u) => u.email), ['guide@example.com']);

    res = await admin.as.get('/admin/users?sort=email&limit=2&page=2').expect(200);
    assert.deepEqual(res.body.meta, { page: 2, limit: 2, total: 4 });
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.data[0].email <= res.body.data[1].email);

    await admin.as.get('/admin/users?q=%25').expect(200);
    await admin.as.get('/admin/users?sort=password_hash').expect(422);
    await admin.as.get('/admin/users?limit=1000').expect(422);
  });

  it('reads one user and 404s unknown ids', async () => {
    const admin = await actor(['admin']);
    const target = await createUser();
    const res = await admin.as.get(`/admin/users/${target.id}`).expect(200);
    assert.equal(res.body.data.email, target.email);
    assert.equal(res.body.data.passwordHash, undefined);
    await admin.as.get('/admin/users/00000000-0000-4000-8000-000000000000').expect(404);
    await admin.as.get('/admin/users/not-a-uuid').expect(422);
  });

  it('suspends a user (revoking sessions, audited) and reactivates them', async () => {
    const admin = await actor(['admin']);
    const target = await createUser();
    const targetSession = await login(app, target);

    await admin.as.patch(`/admin/users/${target.id}/status`).send({ status: 'suspended' }).expect(422);
    const res = await admin.as.patch(`/admin/users/${target.id}/status`).send({ status: 'suspended', reason: 'Fraud review' }).expect(200);
    assert.equal(res.body.data.status, 'suspended');
    await api(app, { token: targetSession.accessToken }).get('/auth/me').expect(401);
    await api(app).post('/auth/refresh').send({ refreshToken: targetSession.refreshToken }).expect(401);

    await admin.as.patch(`/admin/users/${target.id}/status`).send({ status: 'active' }).expect(200);
    await login(app, target);

    const audit = await auditRows(target.id);
    assert.deepEqual(audit.map((a) => a.action), ['users.status_changed', 'users.status_changed']);
    assert.equal(audit[0].actor_user_id, admin.id);
    assert.equal(audit[0].ip, '198.51.100.20');
    assert.deepEqual(audit[0].new_values, { status: 'suspended', reason: 'Fraud review' });
  });

  it('protects privileged accounts and self-modification', async () => {
    const admin = await actor(['admin']);
    const otherAdmin = await createUser({ roles: ['admin'] });
    const superAdmin = await createUser({ roles: ['super_admin'] });

    let res = await admin.as.patch(`/admin/users/${admin.id}/status`).send({ status: 'suspended', reason: 'self' }).expect(403);
    assert.equal(res.body.error.code, 'SELF_MODIFICATION_FORBIDDEN');
    res = await admin.as.patch(`/admin/users/${otherAdmin.id}/status`).send({ status: 'suspended', reason: 'x x x' }).expect(403);
    assert.equal(res.body.error.code, 'PRIVILEGED_TARGET');
    await admin.as.patch(`/admin/users/${superAdmin.id}/status`).send({ status: 'suspended', reason: 'x x x' }).expect(403);
  });
});

describe('role and permission management', () => {
  it('requires roles.assign (super admin) to set user roles; changes apply immediately and are audited', async () => {
    const admin = await actor(['admin']);
    const root = await actor(['super_admin']);
    const target = await createUser();
    const targetSession = await login(app, target);
    const targetApi = api(app, { token: targetSession.accessToken });

    await admin.as.put(`/admin/users/${target.id}/roles`).send({ roles: ['tourist', 'hotel_partner'] }).expect(403);
    await targetApi.get('/admin/users').expect(403);

    const res = await root.as.put(`/admin/users/${target.id}/roles`).send({ roles: ['admin', 'tourist'] }).expect(200);
    assert.deepEqual(res.body.data.roles, ['admin', 'tourist']);
    await targetApi.get('/admin/users').expect(200);

    await root.as.put(`/admin/users/${target.id}/roles`).send({ roles: ['tourist'] }).expect(200);
    await targetApi.get('/admin/users').expect(403);

    const unknown = await root.as.put(`/admin/users/${target.id}/roles`).send({ roles: ['wizard'] }).expect(422);
    assert.match(unknown.body.error.details[0].message, /wizard/);
    await root.as.put(`/admin/users/${target.id}/roles`).send({ roles: [] }).expect(422);
    await root.as.put(`/admin/users/${root.id}/roles`).send({ roles: ['tourist'] }).expect(403);

    const audit = await auditRows(target.id);
    assert.deepEqual(audit.map((a) => a.action), ['users.roles_changed', 'users.roles_changed']);
    assert.deepEqual(audit[0].old_values, { roles: ['tourist'] });
  });

  it('a delegated roles.assign holder (non super admin) still cannot grant admin roles', async () => {
    const root = await actor(['super_admin']);
    const roles = (await root.as.get('/admin/roles').expect(200)).body.data;
    const adminRole = roles.find((r) => r.code === 'admin');
    await root.as.put(`/admin/roles/${adminRole.id}/permissions`).send({ permissions: [...adminRole.permissions, 'roles.assign'] }).expect(200);

    const admin = await actor(['admin']);
    const target = await createUser();
    await admin.as.put(`/admin/users/${target.id}/roles`).send({ roles: ['tourist', 'guide'] }).expect(200);
    const res = await admin.as.put(`/admin/users/${target.id}/roles`).send({ roles: ['tourist', 'admin'] }).expect(403);
    assert.equal(res.body.error.code, 'PRIVILEGED_TARGET');

    await root.as.put(`/admin/roles/${adminRole.id}/permissions`).send({ permissions: adminRole.permissions }).expect(200);
  });

  it('lists roles and permissions; edits role permissions with audit; super_admin is immutable', async () => {
    const root = await actor(['super_admin']);
    const roles = (await root.as.get('/admin/roles').expect(200)).body.data;
    assert.deepEqual(roles.map((r) => r.code), ['admin', 'guide', 'hotel_partner', 'package_provider', 'super_admin', 'tourist']);
    const permissions = (await root.as.get('/admin/permissions').expect(200)).body.data;
    assert.equal(roles.find((r) => r.code === 'super_admin').permissions.length, permissions.length);

    const guide = roles.find((r) => r.code === 'guide');
    const res = await root.as.put(`/admin/roles/${guide.id}/permissions`).send({ permissions: ['guides.manage.own'] }).expect(200);
    assert.deepEqual(res.body.data.permissions, ['guides.manage.own']);
    assert.equal((await auditRows(guide.id))[0].action, 'roles.permissions_changed');
    await root.as.put(`/admin/roles/${guide.id}/permissions`).send({ permissions: guide.permissions }).expect(200);

    const superRole = roles.find((r) => r.code === 'super_admin');
    const immutable = await root.as.put(`/admin/roles/${superRole.id}/permissions`).send({ permissions: [] }).expect(409);
    assert.equal(immutable.body.error.code, 'ROLE_IMMUTABLE');
    await root.as.put(`/admin/roles/${guide.id}/permissions`).send({ permissions: ['made.up'] }).expect(422);
    await root.as.put(`/admin/roles/${guide.id}/permissions`).send({ permissions: ['trips.manage.own', 'trips.manage.own'] }).expect(422);

    const admin = await actor(['admin']);
    await admin.as.get('/admin/roles').expect(200);
    await admin.as.put(`/admin/roles/${guide.id}/permissions`).send({ permissions: [] }).expect(403);
  });

  it('audit logs are append-only', async () => {
    const root = await actor(['super_admin']);
    const target = await createUser();
    await root.as.patch(`/admin/users/${target.id}/status`).send({ status: 'suspended', reason: 'check audit' }).expect(200);
    await assert.rejects(pool.query('DELETE FROM audit_logs'), /append-only/);
    await assert.rejects(pool.query("UPDATE audit_logs SET action = 'x.y'"), /append-only/);
  });
});
