'use strict';

const { pool } = require('../../config/database');
const authRepository = require('./auth.repository');

/**
 * Session operations other modules may call (e.g. users revokes sessions on
 * suspension). Kept separate from auth.service to avoid a users <-> auth cycle.
 */
async function revokeAllSessions(db, userId, { exceptSessionId = null } = {}) {
  await authRepository.revokeAllForUser(db, userId, exceptSessionId);
}

async function isSessionActive(sessionId, userId, db = pool) {
  return authRepository.isSessionActive(db, sessionId, userId);
}

/** Retention: old login attempts (90 days) and long-dead refresh/verification tokens. */
async function purgeExpired(db = pool) {
  const attempts = await db.query("DELETE FROM auth_login_attempts WHERE attempted_at < now() - interval '90 days'");
  // replaced_by_id is ON DELETE SET NULL, so whole expired families can go.
  const refresh = await db.query("DELETE FROM auth_refresh_tokens WHERE expires_at < now() - interval '30 days'");
  const verification = await db.query(
    "DELETE FROM auth_verification_tokens WHERE (consumed_at IS NOT NULL OR expires_at < now()) AND created_at < now() - interval '7 days'",
  );
  return { loginAttempts: attempts.rowCount, refreshTokens: refresh.rowCount, verificationTokens: verification.rowCount };
}

module.exports = { revokeAllSessions, isSessionActive, purgeExpired };
