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

/** Clears mutable data; the RBAC catalog (migration data) is kept. Tests that edit role grants restore them. */
async function resetData() {
  await pool.query(`TRUNCATE users, auth_login_attempts, outbox_events, regions, destination_categories,
                    cms_pages, cms_menus, cms_redirects, cms_announcements, partners, amenities, guide_languages CASCADE`);
  await getRedis().flushdb(); // test Redis database only (REDIS_URL=…/1)
}

/** Loads the real Jharkhand regions/districts/categories seeds. */
async function seedReference() {
  await withTransaction(async (client) => {
    await require('../src/database/seeds/002_jharkhand_geography').run(client);
    await require('../src/database/seeds/003_destination_categories').run(client);
    await require('../src/database/seeds/004_amenities_languages').run(client);
  });
}

async function ensureTestBuckets() {
  await require('../src/config/storage').ensureBuckets();
}

// Minimal valid file bodies for signature sniffing.
const FILES = {
  'image/png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, 1)]),
  'image/jpeg': Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 2)]),
  'application/pdf': Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(55, 3)]),
};

/** Full upload flow as a browser + BFF would do it. Returns the completed media DTO. */
async function uploadMedia(app, token, { purpose = 'content_image', mimeType = 'image/png', body } = {}) {
  const content = body ?? FILES[mimeType];
  const as = api(app, { token });
  const init = await as.post('/media/upload-init').send({ purpose, mimeType, fileSize: content.length });
  if (init.status !== 201) throw new Error(`upload-init failed: ${init.status} ${JSON.stringify(init.body)}`);
  const { url, headers } = init.body.data.upload;
  const put = await fetch(url, { method: 'PUT', headers, body: content });
  if (!put.ok) throw new Error(`object PUT failed: ${put.status} ${await put.text()}`);
  const done = await as.post('/media/upload-complete').send({ mediaId: init.body.data.media.id });
  return { status: done.status, body: done.body, media: done.body.data, mediaId: init.body.data.media.id };
}

/**
 * Temporarily revokes permissions from a role for the duration of `fn`, then restores
 * the original grants even if the test fails (the RBAC catalog persists across test files).
 */
async function withoutPermissions(roleCode, codes, fn) {
  const { rows } = await pool.query(
    `DELETE FROM role_permissions rp USING roles r, permissions p
     WHERE rp.role_id = r.id AND rp.permission_id = p.id AND r.code = $1 AND p.code = ANY($2::text[])
     RETURNING rp.role_id, rp.permission_id`,
    [roleCode, codes],
  );
  try {
    return await fn();
  } finally {
    for (const row of rows) {
      await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.role_id, row.permission_id]);
    }
  }
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
  seedReference,
  ensureTestBuckets,
  uploadMedia,
  FILES,
  withoutPermissions,
  closeConnections,
  createUser,
  api,
  login,
  latestOutboxEvent,
};
