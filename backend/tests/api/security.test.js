'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../src/app');
const routes = require('../../src/modules');
const h = require('../helpers');
const fx = require('../fixtures');

const app = createApp();

before(h.migrateTestDatabase);
beforeEach(async () => {
  await h.resetData();
  await h.seedReference();
});
after(h.closeConnections);

const key = (route) => `${route.method.toUpperCase()} ${route.path}`;

/** True when the body (through refinements/effects and every union branch) rejects unknown keys. */
function isStrictBody(schema) {
  let current = schema;
  while (current && current._def) {
    const { typeName } = current._def;
    if (typeName === 'ZodObject') return current._def.unknownKeys === 'strict';
    if (typeName === 'ZodDiscriminatedUnion' || typeName === 'ZodUnion') return [...current._def.options.values()].every(isStrictBody);
    current = current._def.schema ?? current._def.innerType;
  }
  return false;
}

// Routes that intentionally work without a user session (service token only, or provider signature).
const PUBLIC_MUTATIONS = new Set([
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  'POST /auth/verify-email',
  'POST /auth/resend-verification',
  'POST /webhooks/payments/:provider',
]);

describe('route registry audit', () => {
  it('registers the full route register exactly once', () => {
    const keys = routes.map(key);
    assert.equal(new Set(keys).size, keys.length, 'no duplicate method + path');
    // 241 register routes − 3 health routes (mounted separately) + 1 approved addition (I9).
    assert.equal(routes.length, 239);
  });

  it('protects every admin and partner route with authentication and permissions', () => {
    for (const route of routes.filter((r) => r.path.startsWith('/admin/'))) {
      assert.equal(route.auth, 'user', `${key(route)} requires a user`);
      assert.ok(route.permissions?.length || route.anyPermissions?.length, `${key(route)} requires a permission`);
    }
    for (const route of routes.filter((r) => r.path === '/partners/me' || r.path.startsWith('/partners/me/'))) {
      assert.equal(route.auth, 'user', `${key(route)} requires a user`);
      assert.ok(route.middleware?.length, `${key(route)} resolves the partner organisation`);
    }
    for (const route of routes.filter((r) => /^\/(users\/me|trips|favorites|bookings|notifications|refunds|payments)(\/|$)/.test(r.path))) {
      assert.equal(route.auth, 'user', `${key(route)} is per-user`);
    }
  });

  it('allows unauthenticated mutations only on the reviewed list', () => {
    const open = routes.filter((r) => r.method !== 'get' && r.auth !== 'user').map(key);
    assert.deepEqual(open.sort(), [...PUBLIC_MUTATIONS].sort());
    assert.deepEqual(routes.filter((r) => r.auth === 'webhook').map(key), ['POST /webhooks/payments/:provider']);
  });

  it('validates every path parameter and documents every route', () => {
    const lenient = [];
    for (const route of routes) {
      assert.ok(route.summary && route.tags?.length && route.response?.status, `${key(route)} is documented`);
      const params = [...route.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]);
      if (params.length) {
        const shape = route.request?.params?.shape ?? route.request?.params?._def?.schema?.shape;
        assert.ok(shape, `${key(route)} validates its path parameters`);
        for (const param of params) assert.ok(param in shape, `${key(route)} validates :${param}`);
      }
      if (route.request?.body && !isStrictBody(route.request.body)) lenient.push(key(route));
    }
    assert.deepEqual(lenient, [], 'request bodies reject unknown fields (mass assignment)');
  });
});

describe('HTTP hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await h.api(app).get('/regions').expect(200);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.match(res.headers['strict-transport-security'], /max-age=/);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.ok(res.headers['x-request-id']);
  });

  it('applies the CORS allow-list', async () => {
    const allowed = process.env.CORS_ORIGIN.split(',')[0].trim();
    const ok = await h.api(app).get('/regions').set('Origin', allowed).expect(200);
    assert.equal(ok.headers['access-control-allow-origin'], allowed);
    const denied = await h.api(app).get('/regions').set('Origin', 'https://evil.example').expect(200);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  });

  it('requires the service token everywhere except webhooks and liveness', async () => {
    const anonymous = await request(app).get('/api/v1/regions').expect(401);
    assert.deepEqual(Object.keys(anonymous.body.error).sort(), ['code', 'message', 'requestId']);
    await request(app).get('/api/v1/openapi.json').expect(401);
    await request(app).get('/api/v1/no-such-route').expect(401);
    await request(app).get('/health/live').expect(200);
    const unknown = await h.api(app).get('/no-such-route').expect(404);
    assert.equal(unknown.body.error.code, 'ROUTE_NOT_FOUND');
  });

  it('treats injection-shaped input as data', async () => {
    const admin = await fx.actor(app, ['admin']);
    await fx.publishedDestination(app, admin);
    for (const q of ["' OR 1=1 --", "Hundru'; DROP TABLE users; --", '%_%', '\\\\', '$1']) {
      const res = await h.api(app).get(`/search?q=${encodeURIComponent(q)}`).expect(200);
      assert.equal(res.body.success, true);
    }
    assert.equal((await h.api(app).get('/destinations').expect(200)).body.meta.total, 1, 'tables intact');
    await h.api(app).get('/destinations/..%2F..%2Fetc%2Fpasswd').expect(422);
    await admin.as.get('/admin/users/1%20OR%201=1').expect(422);
  });

  it('rejects mass assignment and prototype pollution', async () => {
    const tourist = await fx.actor(app);
    const roles = await tourist.as.patch('/users/me').send({ fullName: 'New Name', roles: ['super_admin'] }).expect(422);
    assert.equal(roles.body.error.code, 'VALIDATION_ERROR');
    await tourist.as.patch('/users/me').set('Content-Type', 'application/json').send('{"__proto__":{"polluted":true},"fullName":"X Y"}').expect(422);
    assert.equal({}.polluted, undefined);
    await h.api(app).post('/auth/register').send({ fullName: 'A B', email: 'mass@example.com', password: 'password-123', status: 'active', emailVerified: true }).expect(422);
    const me = (await tourist.as.get('/auth/me').expect(200)).body.data;
    assert.ok(!me.roles.includes('super_admin'));
  });

  it('never returns credential material', async () => {
    const admin = await fx.actor(app, ['admin']);
    const tourist = await fx.actor(app);
    for (const res of [await tourist.as.get('/auth/me'), await tourist.as.get('/users/me'), await admin.as.get(`/admin/users/${tourist.id}`), await admin.as.get('/admin/users')]) {
      assert.equal(res.status, 200);
      assert.doesNotMatch(JSON.stringify(res.body), /password|scrypt\$|token_hash|refresh/i);
    }
  });

  it('caps pagination and refuses malformed JSON without leaking parser details', async () => {
    await h.api(app).get('/destinations?limit=1000').expect(422);
    const bad = await h.api(app).post('/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
    assert.equal(bad.body.error.code, 'INVALID_JSON');
    assert.doesNotMatch(JSON.stringify(bad.body), /SyntaxError|at JSON\.parse|node_modules/);
  });
});
