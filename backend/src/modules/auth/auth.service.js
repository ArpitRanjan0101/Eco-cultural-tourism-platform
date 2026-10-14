'use strict';

const { randomUUID } = require('node:crypto');
const config = require('../../config');
const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const { appendOutboxEvent } = require('../../core/events/outbox');
const ApiError = require('../../core/errors/ApiError');
const usersService = require('../users/users.service');
const authRepository = require('./auth.repository');
const { hashPassword, verifyPassword, needsRehash, verifyAgainstDummy } = require('./password');
const { signAccessToken, generateOpaqueToken, hashToken } = require('./tokens');

const LOGIN_LOCKOUT = { windowMinutes: 15, maxPerAccountAndIp: 5, maxPerAccount: 20 };

const PURPOSE = {
  emailVerification: { purpose: 'email_verification', event: 'auth.email_verification_requested' },
  passwordReset: { purpose: 'password_reset', event: 'auth.password_reset_requested' },
};

const invalidCredentials = () => ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
const invalidLinkToken = () => ApiError.badRequest('The link is invalid or has expired', undefined, 'INVALID_OR_EXPIRED_TOKEN');

function tokenLifetimeMs(purpose) {
  return purpose === PURPOSE.passwordReset.purpose
    ? config.auth.passwordResetTtlMinutes * 60_000
    : config.auth.emailVerificationTtlHours * 3_600_000;
}

/**
 * Creates a single-use link token (previous open tokens of the same purpose are
 * consumed) and queues the email via the outbox. The raw token travels only in the
 * outbox payload for the notification worker; the database keeps its hash.
 */
async function issueLinkToken(client, user, { purpose, event }) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + tokenLifetimeMs(purpose));
  await authRepository.consumeOpenVerificationTokens(client, user.id, purpose);
  await authRepository.insertVerificationToken(client, { userId: user.id, tokenHash: hashToken(token), purpose, expiresAt });
  await appendOutboxEvent(client, {
    eventType: event,
    aggregateType: 'user',
    aggregateId: user.id,
    payload: { userId: user.id, email: user.email, fullName: user.fullName, token, expiresAt: expiresAt.toISOString() },
  });
}

/** Creates a login session (refresh-token family) and returns the token pair. */
async function startSession(client, userId, { familyId = randomUUID(), expiresAt } = {}) {
  const refreshToken = generateOpaqueToken();
  const refreshExpiresAt = expiresAt ?? new Date(Date.now() + config.auth.refreshTtlDays * 86_400_000);
  const row = await authRepository.insertRefreshToken(client, {
    userId,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: refreshExpiresAt,
  });
  const access = signAccessToken({ userId, sessionId: familyId });
  return { row, refreshToken, refreshExpiresAt, access };
}

function sessionResponse(session, user) {
  return {
    tokenType: 'Bearer',
    accessToken: session.access.token,
    accessTokenExpiresAt: session.access.expiresAt.toISOString(),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshExpiresAt.toISOString(),
    user,
  };
}

/**
 * Registration never reveals whether the email exists: both paths return the same
 * response after the same hashing work. An existing owner is notified instead.
 */
async function register({ fullName, email, password }) {
  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    const created = await usersService.createTouristAccount(client, { fullName, email, passwordHash });
    if (created) {
      await issueLinkToken(client, created, PURPOSE.emailVerification);
      return;
    }
    const existing = await usersService.findCredentialsByEmail(client, email);
    await appendOutboxEvent(client, {
      eventType: 'auth.registration_attempted_for_existing_account',
      aggregateType: 'user',
      aggregateId: existing.id,
      payload: { userId: existing.id, email: existing.email, fullName: existing.fullName },
    });
  });
}

async function login({ email, password }, ctx) {
  const identifierHash = hashToken(email);
  const failures = await authRepository.countRecentFailures(pool, {
    identifierHash,
    ip: ctx.ip,
    windowMinutes: LOGIN_LOCKOUT.windowMinutes,
  });
  if (failures.byIdentifierAndIp >= LOGIN_LOCKOUT.maxPerAccountAndIp || failures.byIdentifier >= LOGIN_LOCKOUT.maxPerAccount) {
    throw ApiError.tooManyRequests('Too many failed login attempts. Try again later.', 'LOGIN_LOCKED');
  }

  const user = await usersService.findCredentialsByEmail(pool, email);
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!valid) {
    await authRepository.recordLoginAttempt(pool, { identifierHash, ip: ctx.ip, succeeded: false });
    throw invalidCredentials();
  }
  if (user.status !== 'active') {
    await authRepository.recordLoginAttempt(pool, { identifierHash, ip: ctx.ip, succeeded: false });
    throw ApiError.forbidden('This account is suspended', 'ACCOUNT_SUSPENDED');
  }

  const upgradedHash = needsRehash(user.passwordHash) ? await hashPassword(password) : null;
  const session = await withTransaction(async (client) => {
    await authRepository.recordLoginAttempt(client, { identifierHash, ip: ctx.ip, succeeded: true });
    await usersService.recordLogin(client, user.id);
    if (upgradedHash) await usersService.setPasswordHash(client, user.id, upgradedHash);
    return startSession(client, user.id);
  });
  return sessionResponse(session, await usersService.getAccountSummary(user.id));
}

/**
 * Rotates a refresh token. Presenting an already-rotated token is treated as theft:
 * the whole session family is revoked (committed before the error is returned).
 */
async function refresh({ refreshToken }) {
  const outcome = await withTransaction(async (client) => {
    const current = await authRepository.findRefreshTokenForUpdate(client, hashToken(refreshToken));
    if (!current) return { error: ApiError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN') };
    if (current.replaced_by_id) {
      await authRepository.revokeFamily(client, current.token_family_id);
      return { error: ApiError.unauthorized('Refresh token reuse detected; session revoked', 'REFRESH_TOKEN_REUSED') };
    }
    if (current.revoked_at) return { error: ApiError.unauthorized('Session has been revoked', 'SESSION_REVOKED') };
    if (current.expired) return { error: ApiError.unauthorized('Session has expired', 'REFRESH_TOKEN_EXPIRED') };

    const user = await usersService.findCredentialsById(client, current.user_id);
    if (!user || user.status !== 'active') {
      await authRepository.revokeFamily(client, current.token_family_id);
      return { error: ApiError.forbidden('This account is suspended', 'ACCOUNT_SUSPENDED') };
    }
    // Absolute session lifetime: rotation keeps the original expiry.
    const session = await startSession(client, current.user_id, {
      familyId: current.token_family_id,
      expiresAt: current.expires_at,
    });
    await authRepository.markReplaced(client, current.id, session.row.id);
    return { session, userId: current.user_id };
  });
  if (outcome.error) throw outcome.error;
  return sessionResponse(outcome.session, await usersService.getAccountSummary(outcome.userId));
}

/** Ends the session that owns this refresh token. Idempotent; unknown tokens are ignored. */
async function logout({ refreshToken }) {
  await withTransaction(async (client) => {
    const current = await authRepository.findRefreshTokenForUpdate(client, hashToken(refreshToken));
    if (current) await authRepository.revokeFamily(client, current.token_family_id);
  });
}

async function logoutAll(userId) {
  await authRepository.revokeAllForUser(pool, userId);
}

async function forgotPassword({ email }) {
  await withTransaction(async (client) => {
    const user = await usersService.findCredentialsByEmail(client, email);
    if (user && user.status === 'active') await issueLinkToken(client, user, PURPOSE.passwordReset);
  });
}

async function resetPassword({ token, newPassword }) {
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    const row = await authRepository.findUsableVerificationTokenForUpdate(client, hashToken(token), PURPOSE.passwordReset.purpose);
    if (!row) throw invalidLinkToken();
    await authRepository.consumeOpenVerificationTokens(client, row.user_id, PURPOSE.passwordReset.purpose);
    await usersService.setPasswordHash(client, row.user_id, passwordHash);
    // Receiving the reset email proves mailbox ownership.
    await usersService.markEmailVerified(client, row.user_id);
    await authRepository.revokeAllForUser(client, row.user_id);
    await appendOutboxEvent(client, {
      eventType: 'auth.password_changed',
      aggregateType: 'user',
      aggregateId: row.user_id,
      payload: { userId: row.user_id, via: 'reset' },
    });
  });
}

/** Changes the password and signs out every other session. */
async function changePassword(principal, { currentPassword, newPassword }) {
  const user = await usersService.findCredentialsById(pool, principal.userId);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect', undefined, 'INVALID_CURRENT_PASSWORD');
  }
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    await usersService.setPasswordHash(client, principal.userId, passwordHash);
    await authRepository.revokeAllForUser(client, principal.userId, principal.sessionId);
    await appendOutboxEvent(client, {
      eventType: 'auth.password_changed',
      aggregateType: 'user',
      aggregateId: principal.userId,
      payload: { userId: principal.userId, via: 'change' },
    });
  });
}

async function verifyEmail({ token }) {
  await withTransaction(async (client) => {
    const purpose = PURPOSE.emailVerification.purpose;
    const row = await authRepository.findUsableVerificationTokenForUpdate(client, hashToken(token), purpose);
    if (!row) throw invalidLinkToken();
    await authRepository.consumeOpenVerificationTokens(client, row.user_id, purpose);
    await usersService.markEmailVerified(client, row.user_id);
  });
}

async function resendVerification({ email }) {
  await withTransaction(async (client) => {
    const user = await usersService.findCredentialsByEmail(client, email);
    if (user && user.status === 'active' && !user.emailVerified) {
      await issueLinkToken(client, user, PURPOSE.emailVerification);
    }
  });
}

async function getMe(principal) {
  const summary = await usersService.getAccountSummary(principal.userId);
  return { ...summary, permissions: principal.permissions, sessionId: principal.sessionId };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyEmail,
  resendVerification,
  getMe,
  LOGIN_LOCKOUT,
};
