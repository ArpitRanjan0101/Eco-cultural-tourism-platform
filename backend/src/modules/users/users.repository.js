'use strict';

const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

const USER_COLUMNS = `u.id, u.full_name, u.email::text AS email, u.phone, u.status, u.email_verified_at,
  u.phone_verified_at, u.last_login_at, u.created_at, u.updated_at`;

const ROLE_CODES = `COALESCE((
    SELECT array_agg(r.code ORDER BY r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id
  ), '{}') AS roles`;

const SORT_COLUMNS = { createdAt: 'u.created_at', fullName: 'u.full_name', email: 'u.email', lastLoginAt: 'u.last_login_at' };

/** Inserts a user unless the email exists (concurrency-safe). Returns the row or null. */
async function insertIfEmailAbsent(db, { fullName, email, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, full_name, email::text AS email`,
    [fullName, email, passwordHash],
  );
  return rows[0] ?? null;
}

async function insertProfile(db, userId) {
  await db.query('INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
}

async function findCredentialsByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT id, full_name, email::text AS email, password_hash, status, email_verified_at FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

async function findCredentialsById(db, id) {
  const { rows } = await db.query('SELECT id, password_hash, status FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function findById(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS}, ${ROLE_CODES},
            p.avatar_media_id, p.preferred_language, p.country, p.state, p.city
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1 ${forUpdate ? 'FOR UPDATE OF u' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

/** Everything authorisation needs, in one indexed query per request. */
async function findPrincipal(db, id) {
  const { rows } = await db.query(
    `SELECT u.id, u.status, u.email_verified_at,
            COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
            COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [id],
  );
  return rows[0] ?? null;
}

async function findNames(db, ids) {
  const { rows } = await db.query('SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return rows;
}

async function findRefs(db, ids) {
  const { rows } = await db.query('SELECT id, email, full_name FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return rows;
}

async function updatePasswordHash(db, id, passwordHash) {
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

async function markEmailVerified(db, id) {
  await db.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [id]);
}

async function touchLastLogin(db, id) {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

async function updateAccount(db, id, { fullName, phone }) {
  const sets = [];
  const values = [id];
  if (fullName !== undefined) {
    values.push(fullName);
    sets.push(`full_name = $${values.length}`);
  }
  if (phone !== undefined) {
    values.push(phone);
    // A changed phone number is no longer verified.
    sets.push(`phone = $${values.length}`, `phone_verified_at = CASE WHEN phone IS DISTINCT FROM $${values.length} THEN NULL ELSE phone_verified_at END`);
  }
  if (sets.length === 0) return;
  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, values);
}

const PROFILE_COLUMNS = {
  avatarMediaId: 'avatar_media_id',
  preferredLanguage: 'preferred_language',
  country: 'country',
  state: 'state',
  city: 'city',
};

async function updateProfile(db, userId, fields) {
  const entries = Object.entries(PROFILE_COLUMNS).filter(([key]) => fields[key] !== undefined);
  if (entries.length === 0) return;
  const values = [userId, ...entries.map(([key]) => fields[key])];
  const sets = entries.map(([, column], index) => `${column} = $${index + 2}`);
  await db.query(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = $1`, values);
}

async function setStatus(db, id, status) {
  await db.query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
}

function searchFilters({ q, status, role }) {
  const conditions = [];
  const values = [];
  if (q) {
    values.push(likePattern(q));
    conditions.push(`(u.email ILIKE $${values.length} OR u.full_name ILIKE $${values.length})`);
  }
  if (status) {
    values.push(status);
    conditions.push(`u.status = $${values.length}`);
  }
  if (role) {
    values.push(role);
    conditions.push(
      `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = $${values.length})`,
    );
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function search(db, query) {
  const { where, values } = searchFilters(query);
  const { limit, offset } = pageWindow(query);
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${USER_COLUMNS}, ${ROLE_CODES} FROM users u ${where}
       ORDER BY ${orderBy(query.sort, SORT_COLUMNS, 'u.id')}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM users u ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

module.exports = {
  SORT_COLUMNS,
  insertIfEmailAbsent,
  insertProfile,
  findCredentialsByEmail,
  findCredentialsById,
  findById,
  findPrincipal,
  findNames,
  findRefs,
  updatePasswordHash,
  markEmailVerified,
  touchLastLogin,
  updateAccount,
  updateProfile,
  setStatus,
  search,
};
