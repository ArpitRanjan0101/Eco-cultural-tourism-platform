'use strict';

// Owns auth_refresh_tokens, auth_verification_tokens and auth_login_attempts.

async function insertRefreshToken(db, { userId, tokenHash, familyId, expiresAt }) {
  const { rows } = await db.query(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, token_family_id, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id, expires_at`,
    [userId, tokenHash, familyId, expiresAt],
  );
  return rows[0];
}

async function findRefreshTokenForUpdate(db, tokenHash) {
  const { rows } = await db.query(
    `SELECT id, user_id, token_family_id, expires_at, revoked_at, replaced_by_id, expires_at <= now() AS expired
     FROM auth_refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

async function markReplaced(db, id, replacedById) {
  await db.query('UPDATE auth_refresh_tokens SET revoked_at = now(), replaced_by_id = $2 WHERE id = $1', [id, replacedById]);
}

async function revokeFamily(db, familyId) {
  await db.query(
    'UPDATE auth_refresh_tokens SET revoked_at = now() WHERE token_family_id = $1 AND revoked_at IS NULL',
    [familyId],
  );
}

async function revokeAllForUser(db, userId, exceptFamilyId = null) {
  await db.query(
    `UPDATE auth_refresh_tokens SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR token_family_id <> $2)`,
    [userId, exceptFamilyId],
  );
}

/** A session is active while its family still has an unrevoked, unexpired token. */
async function isSessionActive(db, familyId, userId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM auth_refresh_tokens
       WHERE token_family_id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
     ) AS active`,
    [familyId, userId],
  );
  return rows[0].active;
}

async function consumeOpenVerificationTokens(db, userId, purpose) {
  await db.query(
    `UPDATE auth_verification_tokens SET consumed_at = now()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  );
}

async function insertVerificationToken(db, { userId, tokenHash, purpose, expiresAt }) {
  await db.query(
    `INSERT INTO auth_verification_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, purpose, expiresAt],
  );
}

/** Locks a usable (unconsumed, unexpired) token so it can be consumed exactly once. */
async function findUsableVerificationTokenForUpdate(db, tokenHash, purpose) {
  const { rows } = await db.query(
    `SELECT id, user_id FROM auth_verification_tokens
     WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
     FOR UPDATE`,
    [tokenHash, purpose],
  );
  return rows[0] ?? null;
}

async function recordLoginAttempt(db, { identifierHash, ip, succeeded }) {
  await db.query('INSERT INTO auth_login_attempts (identifier_hash, ip_address, succeeded) VALUES ($1, $2, $3)', [
    identifierHash,
    ip ?? null,
    succeeded,
  ]);
}

/** Failed attempts within the window since the last successful login for this identifier. */
async function countRecentFailures(db, { identifierHash, ip, windowMinutes }) {
  const { rows } = await db.query(
    `WITH last_success AS (
       SELECT max(attempted_at) AS at FROM auth_login_attempts WHERE identifier_hash = $1 AND succeeded
     )
     SELECT count(*)::int AS by_identifier,
            count(*) FILTER (WHERE ip_address = $2::inet)::int AS by_identifier_and_ip
     FROM auth_login_attempts, last_success
     WHERE identifier_hash = $1 AND NOT succeeded
       AND attempted_at > GREATEST(now() - make_interval(mins => $3), COALESCE(last_success.at, '-infinity'))`,
    [identifierHash, ip ?? null, windowMinutes],
  );
  return { byIdentifier: rows[0].by_identifier, byIdentifierAndIp: rows[0].by_identifier_and_ip };
}

module.exports = {
  insertRefreshToken,
  findRefreshTokenForUpdate,
  markReplaced,
  revokeFamily,
  revokeAllForUser,
  isSessionActive,
  consumeOpenVerificationTokens,
  insertVerificationToken,
  findUsableVerificationTokenForUpdate,
  recordLoginAttempt,
  countRecentFailures,
};
