'use strict';

const ApiError = require('../../core/errors/ApiError');
const usersService = require('../users/users.service');
const sessionsService = require('./sessions.service');
const { verifyAccessToken } = require('./tokens');

/**
 * Authenticates the end user from the forwarded access JWT. Runs after the
 * service-token gate. The session, account status and permissions are re-read on
 * every request, so logout, suspension and role changes take effect immediately.
 */
async function authenticate(req, _res, next) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('User authentication required', 'AUTH_REQUIRED');
  }
  const { userId, sessionId } = verifyAccessToken(header.slice(7).trim());

  const [sessionActive, principal] = await Promise.all([
    sessionsService.isSessionActive(sessionId, userId),
    usersService.getPrincipal(userId),
  ]);
  if (!principal) throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  if (!sessionActive) throw ApiError.unauthorized('Session has been revoked', 'SESSION_REVOKED');
  if (principal.status !== 'active') throw ApiError.forbidden('This account is suspended', 'ACCOUNT_SUSPENDED');

  req.auth = { ...principal, sessionId };
  next();
}

/** Requires every listed permission code. Ownership checks remain the service's job. */
function requirePermissions(...codes) {
  return function permissionGuard(req, _res, next) {
    if (!req.auth) return next(ApiError.unauthorized('User authentication required', 'AUTH_REQUIRED'));
    const missing = codes.filter((code) => !req.auth.permissions.includes(code));
    if (missing.length > 0) return next(ApiError.forbidden());
    return next();
  };
}

module.exports = { authenticate, requirePermissions };
