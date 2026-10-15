'use strict';

const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const usersRepository = require('./users.repository');
const rolesRepository = require('./roles.repository');
const policy = require('./users.policy');
const auditService = require('../audit/audit.service');
const sessionsService = require('../auth/sessions.service');
const mediaService = require('../media/media.service');

const DEFAULT_ROLE = 'tourist';

const iso = (value) => (value ? value.toISOString() : null);

function toUserSummary(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
    phoneVerified: Boolean(row.phone_verified_at),
    roles: row.roles,
    lastLoginAt: iso(row.last_login_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function toUser(row) {
  const avatar = row.avatar_media_id ? (await mediaService.getPublicMediaMap([row.avatar_media_id])).get(row.avatar_media_id) : null;
  return {
    ...toUserSummary(row),
    profile: {
      avatarMediaId: row.avatar_media_id,
      avatarUrl: avatar?.url ?? null,
      preferredLanguage: row.preferred_language,
      country: row.country,
      state: row.state,
      city: row.city,
    },
  };
}

const toRole = (row) => ({ id: row.id, code: row.code, name: row.name, description: row.description });

async function requireUser(db, id, options) {
  const row = await usersRepository.findById(db, id, options);
  if (!row) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  return row;
}

// ---- Interfaces used by the auth module (db = caller's transaction client) ----

/** Creates a tourist account; returns null when the email is already registered. */
async function createTouristAccount(db, { fullName, email, passwordHash }) {
  const user = await usersRepository.insertIfEmailAbsent(db, { fullName, email, passwordHash });
  if (!user) return null;
  await usersRepository.insertProfile(db, user.id);
  await rolesRepository.assignRole(db, user.id, DEFAULT_ROLE);
  return { id: user.id, fullName: user.full_name, email: user.email };
}

async function findCredentialsByEmail(db, email) {
  const row = await usersRepository.findCredentialsByEmail(db, email);
  return row && {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
  };
}

async function findCredentialsById(db, id) {
  const row = await usersRepository.findCredentialsById(db, id);
  return row && { id: row.id, passwordHash: row.password_hash, status: row.status };
}

/** Adds a role (idempotent). For trusted internal flows such as partner approval and seeding. */
const grantRole = (db, userId, roleCode) => rolesRepository.assignRole(db, userId, roleCode);
/**
 * Makes the user's roles within `managed` exactly `desired` (other roles untouched).
 * Used by partner approval/membership changes to keep supply roles in sync.
 */
async function syncManagedRoles(db, userId, { managed, desired }) {
  const current = (await rolesRepository.rolesForUser(db, userId)).map((role) => role.code);
  for (const code of managed) {
    if (desired.includes(code) && !current.includes(code)) await rolesRepository.assignRole(db, userId, code);
    if (!desired.includes(code) && current.includes(code)) await rolesRepository.removeRole(db, userId, code);
  }
}

/** Privacy-preserving public names ("Asha M.") for review attribution. */
async function getDisplayNames(ids, db = pool) {
  if (ids.length === 0) return new Map();
  const rows = await usersRepository.findNames(db, [...new Set(ids)]);
  return new Map(
    rows.map((row) => {
      const [first, ...rest] = row.full_name.trim().split(/\s+/);
      return [row.id, rest.length ? `${first} ${rest.at(-1)[0].toUpperCase()}.` : first];
    }),
  );
}

/** Map id -> { id, email, fullName } for administrative views (audit search). */
async function getUserRefMap(ids, db = pool) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await usersRepository.findRefs(db, unique);
  return new Map(rows.map((row) => [row.id, { id: row.id, email: row.email, fullName: row.full_name }]));
}

/** Minimal account lookup for invitations (partner team management). */
async function findAccountByEmail(db, email) {
  const row = await usersRepository.findCredentialsByEmail(db, email);
  return row && { id: row.id, fullName: row.full_name, email: row.email, status: row.status, emailVerified: Boolean(row.email_verified_at) };
}

const setPasswordHash = (db, userId, passwordHash) => usersRepository.updatePasswordHash(db, userId, passwordHash);
const markEmailVerified = (db, userId) => usersRepository.markEmailVerified(db, userId);
const recordLogin = (db, userId) => usersRepository.touchLastLogin(db, userId);

/** Current status, roles and permissions; loaded per request so changes apply immediately. */
async function getPrincipal(userId, db = pool) {
  const row = await usersRepository.findPrincipal(db, userId);
  return row && {
    userId: row.id,
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
    roles: row.roles,
    permissions: row.permissions,
  };
}

async function getAccountSummary(userId, db = pool) {
  return toUserSummary(await requireUser(db, userId));
}

// ---- Self-service ----

async function getMe(userId) {
  return toUser(await requireUser(pool, userId));
}

async function updateMe(userId, changes) {
  try {
    await withTransaction(async (client) => {
      await requireUser(client, userId, { forUpdate: true });
      if (changes.avatarMediaId) {
        await mediaService.assertAttachable(client, { actorUserId: userId, actorPermissions: [] }, changes.avatarMediaId, {
          purposes: ['avatar'],
        });
      }
      await usersRepository.updateAccount(client, userId, { fullName: changes.fullName, phone: changes.phone });
      await usersRepository.updateProfile(client, userId, changes);
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_phone_key') {
      throw ApiError.conflict('This phone number is already registered to another account', 'PHONE_IN_USE');
    }
    throw err;
  }
  return getMe(userId);
}

async function getMyRoles(userId) {
  return (await rolesRepository.rolesForUser(pool, userId)).map(toRole);
}

// ---- Administration ----

async function searchUsers(query) {
  const { rows, total } = await usersRepository.search(pool, query);
  return { items: rows.map(toUserSummary), meta: pageMeta(query, total) };
}

async function getUser(id) {
  return toUser(await requireUser(pool, id));
}

async function setUserStatus(ctx, id, { status, reason }) {
  await withTransaction(async (client) => {
    const target = await requireUser(client, id, { forUpdate: true });
    policy.assertCanChangeStatus(ctx, target);
    if (target.status === status) return;
    await usersRepository.setStatus(client, id, status);
    if (status === 'suspended') await sessionsService.revokeAllSessions(client, id);
    await auditService.record(client, ctx, {
      action: 'users.status_changed',
      entityType: 'user',
      entityId: id,
      oldValues: { status: target.status },
      newValues: { status, reason: reason ?? null },
    });
  });
  return getUser(id);
}

async function setUserRoles(ctx, id, { roles }) {
  await withTransaction(async (client) => {
    const target = await requireUser(client, id, { forUpdate: true });
    const found = await rolesRepository.findRolesByCodes(client, roles);
    const unknown = roles.filter((code) => !found.some((role) => role.code === code));
    if (unknown.length > 0) throw ApiError.validation([{ location: 'body', path: 'roles', message: `unknown role(s): ${unknown.join(', ')}` }]);
    policy.assertCanAssignRoles(ctx, target, roles);
    await rolesRepository.replaceUserRoles(client, id, found.map((role) => role.id));
    await auditService.record(client, ctx, {
      action: 'users.roles_changed',
      entityType: 'user',
      entityId: id,
      oldValues: { roles: target.roles },
      newValues: { roles: [...roles].sort() },
    });
  });
  return getUser(id);
}

async function listRoles() {
  return (await rolesRepository.listRolesWithPermissions(pool)).map((row) => ({
    ...toRole(row),
    permissions: row.permissions,
    userCount: row.user_count,
  }));
}

async function listPermissions() {
  return rolesRepository.listPermissions(pool);
}

async function setRolePermissions(ctx, roleId, { permissions }) {
  await withTransaction(async (client) => {
    const role = await rolesRepository.findRoleById(client, roleId, { forUpdate: true });
    if (!role) throw ApiError.notFound('Role not found', 'ROLE_NOT_FOUND');
    policy.assertRoleEditable(role);
    const found = await rolesRepository.findPermissionsByCodes(client, permissions);
    const unknown = permissions.filter((code) => !found.some((permission) => permission.code === code));
    if (unknown.length > 0) {
      throw ApiError.validation([{ location: 'body', path: 'permissions', message: `unknown permission(s): ${unknown.join(', ')}` }]);
    }
    const before = await rolesRepository.permissionCodesForRole(client, roleId);
    await rolesRepository.replaceRolePermissions(client, roleId, found.map((permission) => permission.id));
    await auditService.record(client, ctx, {
      action: 'roles.permissions_changed',
      entityType: 'role',
      entityId: roleId,
      oldValues: { permissions: before },
      newValues: { permissions: [...permissions].sort() },
    });
  });
  return (await listRoles()).find((role) => role.id === roleId);
}

module.exports = {
  createTouristAccount,
  findCredentialsByEmail,
  findCredentialsById,
  grantRole,
  syncManagedRoles,
  findAccountByEmail,
  getDisplayNames,
  getUserRefMap,
  setPasswordHash,
  markEmailVerified,
  recordLogin,
  getPrincipal,
  getAccountSummary,
  getMe,
  updateMe,
  getMyRoles,
  searchUsers,
  getUser,
  setUserStatus,
  setUserRoles,
  listRoles,
  listPermissions,
  setRolePermissions,
};
