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

module.exports = { revokeAllSessions, isSessionActive };
