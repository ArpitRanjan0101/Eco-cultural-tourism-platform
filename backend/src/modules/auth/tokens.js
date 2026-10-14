'use strict';

const { createHash, randomBytes, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const ApiError = require('../../core/errors/ApiError');

const ALGORITHM = 'HS256';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Short-lived access JWT. `sid` is the refresh-token family (login session) id. */
function signAccessToken({ userId, sessionId }) {
  const token = jwt.sign({ sid: sessionId }, config.auth.accessSecret, {
    algorithm: ALGORITHM,
    subject: userId,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    expiresIn: config.auth.accessTtlSeconds,
    jwtid: randomUUID(),
  });
  return { token, expiresAt: new Date(Date.now() + config.auth.accessTtlSeconds * 1000) };
}

function verifyAccessToken(token) {
  let claims;
  try {
    claims = jwt.verify(token, config.auth.accessSecret, {
      algorithms: [ALGORITHM],
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      clockTolerance: 5,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
  if (!UUID.test(claims.sub ?? '') || !UUID.test(claims.sid ?? '')) {
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
  return { userId: claims.sub, sessionId: claims.sid };
}

/** 256-bit random token for refresh/verification/reset links; only its hash is stored. */
function generateOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateOpaqueToken, hashToken };
