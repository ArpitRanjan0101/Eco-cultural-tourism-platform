'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { migrateTestDatabase, resetData, closeConnections, createUser, api, login, latestOutboxEvent } = require('../helpers');

const app = createApp();

before(migrateTestDatabase);
beforeEach(resetData);
after(closeConnections);

const userIdByEmail = async (email) => (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;

describe('registration and email verification', () => {
  it('registers a tourist, queues a verification email and verifies with the emailed token', async () => {
    const res = await api(app).post('/auth/register').send({ fullName: ' Asha Munda ', email: 'Asha@Example.com', password: 'jharkhand-2026' });
    assert.equal(res.status, 202);

    const userId = await userIdByEmail('asha@example.com');
    const roles = await pool.query('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1', [userId]);
    assert.deepEqual(roles.rows.map((r) => r.code), ['tourist']);
    const stored = await pool.query('SELECT full_name, password_hash FROM users WHERE id = $1', [userId]);
    assert.equal(stored.rows[0].full_name, 'Asha Munda');
    assert.match(stored.rows[0].password_hash, /^scrypt\$/);

    const event = await latestOutboxEvent(userId, 'auth.email_verification_requested');
    assert.equal(event.email, 'asha@example.com');
    const tokenRow = await pool.query('SELECT token_hash FROM auth_verification_tokens WHERE user_id = $1', [userId]);
    assert.notEqual(tokenRow.rows[0].token_hash, event.token, 'only the hash is stored');

    const session = await login(app, { email: 'asha@example.com', password: 'jharkhand-2026' });
    assert.equal(session.user.emailVerified, false);

    await api(app).post('/auth/verify-email').send({ token: event.token }).expect(200);
    const replay = await api(app).post('/auth/verify-email').send({ token: event.token }).expect(400);
    assert.equal(replay.body.error.code, 'INVALID_OR_EXPIRED_TOKEN');
    const me = await api(app, { token: session.accessToken }).get('/auth/me').expect(200);
    assert.equal(me.body.data.emailVerified, true);
  });

  it('does not reveal whether an email is already registered', async () => {
    const existing = await createUser({ email: 'taken@example.com' });
    const fresh = await api(app).post('/auth/register').send({ fullName: 'A', email: 'new@example.com', password: 'password-123' });
    const dup = await api(app).post('/auth/register').send({ fullName: 'B', email: 'TAKEN@example.com', password: 'password-123' });
    assert.equal(dup.status, fresh.status);
    assert.deepEqual(dup.body, fresh.body);
    assert.ok(await latestOutboxEvent(existing.id, 'auth.registration_attempted_for_existing_account'));
    const count = await pool.query("SELECT count(*)::int AS n FROM users WHERE email = 'taken@example.com'");
    assert.equal(count.rows[0].n, 1);
  });

  it('validates registration input', async () => {
    const res = await api(app).post('/auth/register').send({ fullName: '', email: 'bad', password: 'short', admin: true }).expect(422);
    const paths = res.body.error.details.map((d) => d.path);
    for (const field of ['fullName', 'email', 'password', '']) assert.ok(paths.includes(field), `missing issue for ${field}`);
  });

  it('resend-verification issues a new token and invalidates the old one', async () => {
    await api(app).post('/auth/register').send({ fullName: 'R', email: 'resend@example.com', password: 'password-123' });
    const userId = await userIdByEmail('resend@example.com');
    const first = await latestOutboxEvent(userId, 'auth.email_verification_requested');
    await api(app).post('/auth/resend-verification').send({ email: 'resend@example.com' }).expect(202);
    const second = await latestOutboxEvent(userId, 'auth.email_verification_requested');
    assert.notEqual(first.token, second.token);
    await api(app).post('/auth/verify-email').send({ token: first.token }).expect(400);
    await api(app).post('/auth/verify-email').send({ token: second.token }).expect(200);
    await api(app).post('/auth/resend-verification').send({ email: 'nobody@example.com' }).expect(202);
  });
});

describe('login, refresh rotation and logout', () => {
  it('logs in, rotates refresh tokens and keeps the absolute session expiry', async () => {
    const user = await createUser();
    const first = await login(app, user);
    assert.equal(first.tokenType, 'Bearer');
    assert.deepEqual(first.user.roles, ['tourist']);

    const rotated = await api(app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
    assert.notEqual(rotated.body.data.refreshToken, first.refreshToken);
    assert.equal(rotated.body.data.refreshTokenExpiresAt, first.refreshTokenExpiresAt);
    await api(app, { token: rotated.body.data.accessToken }).get('/auth/me').expect(200);
  });

  it('detects refresh-token reuse and revokes the whole session family', async () => {
    const user = await createUser();
    const first = await login(app, user);
    const second = (await api(app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)).body.data;

    const reuse = await api(app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    assert.equal(reuse.body.error.code, 'REFRESH_TOKEN_REUSED');
    const afterTheft = await api(app).post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
    assert.equal(afterTheft.body.error.code, 'SESSION_REVOKED');
    const access = await api(app, { token: second.accessToken }).get('/auth/me').expect(401);
    assert.equal(access.body.error.code, 'SESSION_REVOKED');
  });

  it('rejects wrong passwords and unknown emails identically', async () => {
    const user = await createUser();
    const wrong = await api(app).post('/auth/login').send({ email: user.email, password: 'nope-nope' }).expect(401);
    const unknown = await api(app).post('/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' }).expect(401);
    assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  it('locks an account after 5 failures from one IP, without blocking other IPs', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i += 1) {
      await api(app, { ip: '203.0.113.7' }).post('/auth/login').send({ email: user.email, password: 'wrong-pass' }).expect(401);
    }
    const locked = await api(app, { ip: '203.0.113.7' }).post('/auth/login').send({ email: user.email, password: user.password }).expect(429);
    assert.equal(locked.body.error.code, 'LOGIN_LOCKED');
    await login(app, user, '198.51.100.9');
  });

  it('refuses suspended accounts', async () => {
    const user = await createUser({ status: 'suspended' });
    const res = await api(app).post('/auth/login').send({ email: user.email, password: user.password }).expect(403);
    assert.equal(res.body.error.code, 'ACCOUNT_SUSPENDED');
  });

  it('logout revokes only the current session; logout-all revokes every session', async () => {
    const user = await createUser();
    const a = await login(app, user);
    const b = await login(app, user);

    await api(app).post('/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
    await api(app).post('/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
    await api(app, { token: a.accessToken }).get('/auth/me').expect(401);
    await api(app, { token: b.accessToken }).get('/auth/me').expect(200);

    await api(app, { token: b.accessToken }).post('/auth/logout-all').expect(204);
    await api(app, { token: b.accessToken }).get('/auth/me').expect(401);
    await api(app).post('/auth/refresh').send({ refreshToken: b.refreshToken }).expect(401);
  });

  it('requires both the service token and a valid bearer token on protected routes', async () => {
    const user = await createUser();
    const session = await login(app, user);
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
    const missing = await api(app).get('/auth/me').expect(401);
    assert.equal(missing.body.error.code, 'AUTH_REQUIRED');
    const garbage = await api(app, { token: 'not.a.jwt' }).get('/auth/me').expect(401);
    assert.equal(garbage.body.error.code, 'INVALID_TOKEN');
  });

  it('returns roles and permissions from /auth/me', async () => {
    const user = await createUser({ roles: ['admin'] });
    const session = await login(app, user);
    const me = await api(app, { token: session.accessToken }).get('/auth/me').expect(200);
    assert.deepEqual(me.body.data.roles, ['admin']);
    assert.ok(me.body.data.permissions.includes('users.read'));
    assert.ok(!me.body.data.permissions.includes('roles.assign'));
  });
});

describe('password reset and change', () => {
  it('resets the password with the emailed token and revokes all sessions', async () => {
    const user = await createUser({ verified: false });
    const session = await login(app, user);
    await api(app).post('/auth/forgot-password').send({ email: user.email }).expect(202);
    const event = await latestOutboxEvent(user.id, 'auth.password_reset_requested');

    await api(app).post('/auth/reset-password').send({ token: event.token, newPassword: 'brand-new-pass' }).expect(204);
    await api(app).post('/auth/reset-password').send({ token: event.token, newPassword: 'another-pass-1' }).expect(400);
    await api(app, { token: session.accessToken }).get('/auth/me').expect(401);
    await api(app).post('/auth/login').send({ email: user.email, password: user.password }).expect(401);
    const fresh = await login(app, { email: user.email, password: 'brand-new-pass' });
    assert.equal(fresh.user.emailVerified, true);
  });

  it('forgot-password does not reveal unknown emails', async () => {
    const res = await api(app).post('/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(202);
    assert.match(res.body.data.message, /If an account exists/);
  });

  it('changes the password, keeps the current session and revokes the others', async () => {
    const user = await createUser();
    const current = await login(app, user);
    const other = await login(app, user);
    const as = api(app, { token: current.accessToken });

    const bad = await as.post('/auth/change-password').send({ currentPassword: 'wrong-one', newPassword: 'changed-pass-1' }).expect(400);
    assert.equal(bad.body.error.code, 'INVALID_CURRENT_PASSWORD');
    await as.post('/auth/change-password').send({ currentPassword: user.password, newPassword: 'changed-pass-1' }).expect(204);
    await as.get('/auth/me').expect(200);
    await api(app, { token: other.accessToken }).get('/auth/me').expect(401);
    await login(app, { email: user.email, password: 'changed-pass-1' });
  });
});

describe('rate limiting', () => {
  it('limits registration per client IP and reports Retry-After', async () => {
    const ip = '192.0.2.44';
    for (let i = 0; i < 10; i += 1) {
      await api(app, { ip }).post('/auth/register').send({ fullName: 'X', email: `rl${i}@example.com`, password: 'password-123' }).expect(202);
    }
    const limited = await api(app, { ip }).post('/auth/register').send({ fullName: 'X', email: 'rl-x@example.com', password: 'password-123' });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers['retry-after']) > 0);
    await api(app, { ip: '192.0.2.45' }).post('/auth/register').send({ fullName: 'X', email: 'rl-y@example.com', password: 'password-123' }).expect(202);
  });
});
