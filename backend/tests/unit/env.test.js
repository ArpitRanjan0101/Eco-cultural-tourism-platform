'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv } = require('../../src/config/env');

const TOKEN = 'a'.repeat(64);
const base = {
  NODE_ENV: 'development',
  PUBLIC_BASE_URL: 'http://localhost:8080',
  CORS_ORIGIN: 'http://localhost:3000, http://localhost:3001',
  DATABASE_URL: 'postgres://u:p@postgres:5432/tourism',
  REDIS_URL: 'redis://:p@redis:6379/0',
  INTERNAL_SERVICE_TOKEN: TOKEN,
  JWT_ACCESS_SECRET: 'j'.repeat(64),
  STORAGE_ENDPOINT: 'http://storage:8333',
  STORAGE_PUBLIC_ENDPOINT: 'http://localhost:8333',
  STORAGE_ACCESS_KEY: 'accesskey123',
  STORAGE_SECRET_KEY: 's'.repeat(40),
  STORAGE_PUBLIC_BUCKET: 'tourism-public',
  STORAGE_PRIVATE_BUCKET: 'tourism-private',
  STORAGE_PUBLIC_BASE_URL: 'http://localhost:8333/tourism-public/',
  SMTP_HOST: 'mailpit',
};

describe('parseEnv', () => {
  it('parses a valid environment with defaults and CSV origins', () => {
    const config = parseEnv(base);
    assert.equal(config.port, 4000);
    assert.deepEqual(config.corsOrigins, ['http://localhost:3000', 'http://localhost:3001']);
    assert.deepEqual(config.serviceTokens, [TOKEN]);
    assert.equal(config.storage.publicBaseUrl, 'http://localhost:8333/tourism-public');
    assert.equal(config.storage.forcePathStyle, true);
    assert.ok(Object.isFrozen(config));
  });

  it('accepts a previous service token for rotation', () => {
    const config = parseEnv({ ...base, INTERNAL_SERVICE_TOKEN_PREVIOUS: 'b'.repeat(40) });
    assert.equal(config.serviceTokens.length, 2);
  });

  it('treats an empty previous token as absent', () => {
    assert.equal(parseEnv({ ...base, INTERNAL_SERVICE_TOKEN_PREVIOUS: '' }).serviceTokens.length, 1);
  });

  it('rejects missing required keys and names them without echoing values', () => {
    const { DATABASE_URL: _omit, ...missing } = base;
    assert.throws(() => parseEnv({ ...missing, INTERNAL_SERVICE_TOKEN: 'short-secret-value' }), (err) => {
      assert.match(err.message, /DATABASE_URL/);
      assert.match(err.message, /INTERNAL_SERVICE_TOKEN: .*at least 32/);
      assert.doesNotMatch(err.message, /short-secret-value/);
      return true;
    });
  });

  it('rejects invalid CORS origins', () => {
    assert.throws(() => parseEnv({ ...base, CORS_ORIGIN: 'not a url' }), /CORS_ORIGIN/);
  });

  it('refuses to run tests against a non-test database', () => {
    assert.throws(() => parseEnv({ ...base, NODE_ENV: 'test' }), /_test/);
    assert.ok(parseEnv({ ...base, NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@postgres:5432/tourism_test' }));
  });

  it('requires distinct JWT and service secrets and paired bootstrap admin settings', () => {
    assert.throws(() => parseEnv({ ...base, JWT_ACCESS_SECRET: TOKEN }), /must differ/);
    assert.throws(() => parseEnv({ ...base, BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com' }), /set together/);
    const config = parseEnv({ ...base, BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com', BOOTSTRAP_ADMIN_PASSWORD: 'long-enough-pass' });
    assert.equal(config.bootstrapAdmin.email, 'admin@example.com');
    assert.equal(parseEnv({ ...base, BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '' }).bootstrapAdmin, null);
  });

  it('rejects placeholder secrets and plain http in production', () => {
    assert.throws(
      () => parseEnv({ ...base, NODE_ENV: 'production', INTERNAL_SERVICE_TOKEN: 'replace-with-64-char-hex-secret-value!!' }),
      (err) => /placeholder/.test(err.message) && /https/.test(err.message),
    );
  });
});
