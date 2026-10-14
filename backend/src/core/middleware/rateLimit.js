'use strict';

const { getRedis } = require('../../config/redis');
const ApiError = require('../errors/ApiError');
const logger = require('../logging/logger');

const KEY_PREFIX = 'rl:';

/**
 * Redis fixed-window rate limiter keyed by client IP or authenticated user.
 * Fails open when Redis is unavailable: brute-force protection for login does not
 * rely on it alone (see the database-backed login lockout).
 */
function rateLimit({ name, windowSeconds, max, by = 'ip' }) {
  return async function rateLimiter(req, res, next) {
    const subject = by === 'user' ? req.auth?.userId : req.clientIp || req.ip;
    const key = `${KEY_PREFIX}${name}:${subject}`;

    let count;
    let ttlMs;
    try {
      const results = await getRedis().multi().incr(key).expire(key, windowSeconds, 'NX').pttl(key).exec();
      count = results[0][1];
      ttlMs = results[2][1];
    } catch (err) {
      logger.warn({ err: { message: err.message }, limiter: name }, 'Rate limiter unavailable; allowing request');
      return next();
    }

    const resetSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - count)));
    res.set('RateLimit-Reset', String(resetSeconds));
    if (count > max) {
      res.set('Retry-After', String(resetSeconds));
      return next(ApiError.tooManyRequests('Too many requests, please try again later'));
    }
    return next();
  };
}

module.exports = { rateLimit, RATE_LIMIT_KEY_PREFIX: KEY_PREFIX };
