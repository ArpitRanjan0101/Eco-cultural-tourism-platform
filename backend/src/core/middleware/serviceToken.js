'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const config = require('../../config');
const ApiError = require('../errors/ApiError');

const SERVICE_TOKEN_HEADER = 'x-internal-service-token';

// Comparing fixed-length digests keeps the check constant-time regardless of input length.
const digest = (value) => createHash('sha256').update(value, 'utf8').digest();

/**
 * Authenticates the trusted BFF. Accepts the current token and, during rotation,
 * the previous one. This proves the caller is the BFF; it never identifies a user.
 */
function createServiceTokenGuard(tokens = config.serviceTokens) {
  const expected = tokens.map(digest);

  return function requireServiceToken(req, _res, next) {
    const provided = req.get(SERVICE_TOKEN_HEADER);
    if (!provided) {
      return next(ApiError.unauthorized('Service authentication required', 'SERVICE_TOKEN_MISSING'));
    }
    const providedDigest = digest(provided);
    let matched = false;
    for (const candidate of expected) {
      matched = timingSafeEqual(providedDigest, candidate) || matched;
    }
    if (!matched) {
      return next(ApiError.unauthorized('Invalid service credentials', 'SERVICE_TOKEN_INVALID'));
    }
    return next();
  };
}

module.exports = { createServiceTokenGuard, requireServiceToken: createServiceTokenGuard(), SERVICE_TOKEN_HEADER };
