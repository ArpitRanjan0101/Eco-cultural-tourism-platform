'use strict';

const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { pool } = require('../src/config/database');
const { closeRedis, getRedis } = require('../src/config/redis');
const { Migrator } = require('../src/database/migrator');
const { withTransaction } = require('../src/core/database/transaction');
const usersService = require('../src/modules/users/users.service');
const { hashPassword } = require('../src/modules/auth/password');

const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const DEFAULT_PASSWORD = 'correct horse battery';

async function migrateTestDatabase() {
  await new Migrator({ db: pool }).migrate();
}

/** Clears mutable identity/ops data; the RBAC catalog (migration data) is kept. */
async function resetData() {
  await pool.query('TRUNCATE users, auth_login_attempts, outbox_events CASCADE');
  await getRedis().flushdb(); // test Redis database only (REDIS_URL=…/1)
}

async function closeConnections() {
  await Promise.allSettled([pool.end(), closeRedis()]);
}

let passwordHashCache;

/** Creates a user directly (bypassing the API) with the given roles. */
async function createUser({ roles = ['tourist'], verified = true, status = 'active', email, fullName = 'Test User' } = {}) {
  passwordHashCache ??= hashPassword(DEFAULT_PASSWORD);
  const userEmail = email ?? `user-${randomUUID()}@example.test`;
  return withTransaction(async (client) => {
    const user = await usersService.createTouristAccount(client, {
      fullName,
      email: userEmail,
      passwordHash: await passwordHashCache,
    });
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [user.id]);
    for (const role of roles) await usersService.grantRole(client, user.id, role);
    if (verified) await usersService.markEmailVerified(client, user.id);
    if (status !== 'active') await client.query('UPDATE users SET status = $2 WHERE id = $1', [user.id, status]);
    return { id: user.id, email: userEmail, password: DEFAULT_PASSWORD };
  });
}

/** Request builder that behaves like the BFF: service token, optional user JWT and client IP. */
function api(app, { token, ip } = {}) {
  const wrap = (method) => (path) => {
    let req = request(app)[method](`/api/v1${path}`).set('X-Internal-Service-Token', SERVICE_TOKEN);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    if (ip) req = req.set('X-Client-Ip', ip);
    return req;
  };
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), delete: wrap('delete') };
}

async function login(app, user, ip) {
  const res = await api(app, { ip }).post('/auth/login').send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

async function latestOutboxEvent(userId, eventType) {
  const { rows } = await pool.query(
    `SELECT payload FROM outbox_events WHERE aggregate_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, eventType],
  );
  return rows[0]?.payload ?? null;
}

module.exports = {
  SERVICE_TOKEN,
  DEFAULT_PASSWORD,
  migrateTestDatabase,
  resetData,
  closeConnections,
  createUser,
  api,
  login,
  latestOutboxEvent,
};
