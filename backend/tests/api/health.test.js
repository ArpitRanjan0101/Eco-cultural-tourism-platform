'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { getRedis } = require('../../src/config/redis');
const { recordHeartbeat, removeHeartbeat } = require('../../src/jobs/heartbeat');
const { SERVICE_TOKEN, migrateTestDatabase, closeConnections } = require('../helpers');

const app = createApp();
const withToken = (req) => req.set('X-Internal-Service-Token', SERVICE_TOKEN);

before(migrateTestDatabase);
after(closeConnections);

describe('health endpoints', () => {
  it('GET /health/live is public', async () => {
    const res = await request(app).get('/health/live').expect(200);
    assert.deepEqual(res.body, { success: true, data: { status: 'live' } });
  });

  it('GET /health/ready requires the service token', async () => {
    const res = await request(app).get('/health/ready').expect(401);
    assert.equal(res.body.error.code, 'SERVICE_TOKEN_MISSING');
  });

  it('GET /health/ready reports dependencies; worker is informational', async () => {
    const redis = getRedis();
    await removeHeartbeat(redis, 'test-worker');
    let res = await withToken(request(app).get('/health/ready')).expect(200);
    assert.equal(res.body.data.status, 'ready');
    assert.equal(res.body.data.checks.database.status, 'up');
    assert.equal(res.body.data.checks.redis.status, 'up');
    assert.equal(res.body.data.checks.migrations.pending, 0);
    assert.equal(res.body.data.checks.worker.status, 'down');

    await recordHeartbeat(redis, 'test-worker');
    res = await withToken(request(app).get('/health/ready')).expect(200);
    assert.equal(res.body.data.checks.worker.status, 'up');
    await removeHeartbeat(redis, 'test-worker');
  });

  it('GET /health/version returns build info with the service token', async () => {
    const res = await withToken(request(app).get('/health/version')).expect(200);
    assert.equal(res.body.data.name, 'jharkhand-tourism-api');
    assert.match(res.body.data.node, /^v22\./);
  });
});

describe('API envelope and security baseline', () => {
  it('rejects /api/v1 calls without a valid service token (no route enumeration)', async () => {
    let res = await request(app).get('/api/v1/does-not-exist').expect(401);
    assert.equal(res.body.success, false);
    res = await request(app).get('/api/v1/openapi.json').set('X-Internal-Service-Token', 'wrong').expect(401);
    assert.equal(res.body.error.code, 'SERVICE_TOKEN_INVALID');
  });

  it('returns the standard 404 envelope with the request id', async () => {
    const res = await withToken(request(app).get('/api/v1/does-not-exist').set('X-Request-Id', 'req-12345678')).expect(404);
    assert.deepEqual(res.body, {
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route GET /api/v1/does-not-exist not found', requestId: 'req-12345678' },
    });
    assert.equal(res.headers['x-request-id'], 'req-12345678');
  });

  it('replaces an unsafe incoming request id', async () => {
    const res = await request(app).get('/health/live').set('X-Request-Id', 'bad id<script>');
    assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  });

  it('maps malformed and oversized JSON bodies to 400/413', async () => {
    let res = await withToken(request(app).post('/api/v1/x').set('Content-Type', 'application/json').send('{"a":')).expect(400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
    res = await withToken(request(app).post('/api/v1/x').set('Content-Type', 'application/json'))
      .send(JSON.stringify({ blob: 'x'.repeat(1_100_000) }))
      .expect(413);
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('sets security headers, hides the framework and disables caching on API responses', async () => {
    const res = await withToken(request(app).get('/api/v1/openapi.json')).expect(200);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body.openapi, '3.0.3');
    assert.ok(res.body.paths['/health/ready']);
  });

  it('only allows configured CORS origins', async () => {
    const res = await request(app).get('/health/live').set('Origin', 'https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
