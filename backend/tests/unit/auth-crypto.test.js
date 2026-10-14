'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const { hashPassword, verifyPassword, needsRehash } = require('../../src/modules/auth/password');
const { signAccessToken, verifyAccessToken, generateOpaqueToken, hashToken } = require('../../src/modules/auth/tokens');

const USER = '6f1c2c1e-3b0a-4f53-9a43-6b3f2d1b9c11';
const SESSION = '0b0e7a3c-8a6c-4c1e-9d6e-3f1e2a4b5c6d';

describe('password hashing (scrypt)', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const [a, b] = await Promise.all([hashPassword('s3cret-pass'), hashPassword('s3cret-pass')]);
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$32768\$8\$1\$/);
    assert.equal(await verifyPassword('s3cret-pass', a), true);
    assert.equal(await verifyPassword('s3cret-pasS', a), false);
    assert.equal(needsRehash(a), false);
  });

  it('rejects malformed or tampered hashes without throwing', async () => {
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
    assert.equal(await verifyPassword('x', 'scrypt$999999999$8$1$AAAA$BBBB'), false);
    assert.equal(needsRehash('scrypt$16384$8$1$AAAA$BBBB'), true);
  });
});

describe('access tokens', () => {
  it('round-trips subject and session id', () => {
    const { token, expiresAt } = signAccessToken({ userId: USER, sessionId: SESSION });
    assert.deepEqual(verifyAccessToken(token), { userId: USER, sessionId: SESSION });
    assert.ok(expiresAt > new Date());
  });

  it('rejects wrong audience, wrong secret, alg=none and expired tokens', () => {
    const options = { subject: USER, issuer: config.auth.issuer, expiresIn: 60 };
    const forged = [
      jwt.sign({ sid: SESSION }, config.auth.accessSecret, { ...options, audience: 'someone-else' }),
      jwt.sign({ sid: SESSION }, 'x'.repeat(64), { ...options, audience: config.auth.audience }),
      jwt.sign({ sid: SESSION }, null, { ...options, audience: config.auth.audience, algorithm: 'none' }),
    ];
    for (const token of forged) {
      assert.throws(() => verifyAccessToken(token), (err) => err.code === 'INVALID_TOKEN');
    }
    const expired = jwt.sign({ sid: SESSION, exp: Math.floor(Date.now() / 1000) - 60 }, config.auth.accessSecret, {
      subject: USER,
      issuer: config.auth.issuer,
      audience: config.auth.audience,
    });
    assert.throws(() => verifyAccessToken(expired), (err) => err.code === 'TOKEN_EXPIRED');
  });

  it('generates high-entropy opaque tokens and stable SHA-256 hashes', () => {
    const token = generateOpaqueToken();
    assert.equal(Buffer.from(token, 'base64url').length, 32);
    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
    assert.equal(hashToken(token), hashToken(token));
  });
});
