'use strict';

// Owns roles, permissions, role_permissions and user_roles.

async function findRolesByCodes(db, codes) {
  const { rows } = await db.query('SELECT id, code FROM roles WHERE code = ANY($1::text[])', [codes]);
  return rows;
}

async function findRoleById(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT id, code, name FROM roles WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function listRolesWithPermissions(db) {
  const { rows } = await db.query(
    `SELECT r.id, r.code, r.name, r.description,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions,
            (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     GROUP BY r.id
     ORDER BY r.code`,
  );
  return rows;
}

async function listPermissions(db) {
  const { rows } = await db.query('SELECT id, code, module, description FROM permissions ORDER BY module, code');
  return rows;
}

async function findPermissionsByCodes(db, codes) {
  const { rows } = await db.query('SELECT id, code FROM permissions WHERE code = ANY($1::text[])', [codes]);
  return rows;
}

async function permissionCodesForRole(db, roleId) {
  const { rows } = await db.query(
    `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1 ORDER BY p.code`,
    [roleId],
  );
  return rows.map((row) => row.code);
}

async function rolesForUser(db, userId) {
  const { rows } = await db.query(
    `SELECT r.id, r.code, r.name, r.description FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 ORDER BY r.code`,
    [userId],
  );
  return rows;
}

async function assignRole(db, userId, roleCode) {
  await db.query(
    `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2
     ON CONFLICT DO NOTHING`,
    [userId, roleCode],
  );
}

async function replaceUserRoles(db, userId, roleIds) {
  await db.query('DELETE FROM user_roles WHERE user_id = $1 AND NOT (role_id = ANY($2::uuid[]))', [userId, roleIds]);
  await db.query(
    `INSERT INTO user_roles (user_id, role_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
    [userId, roleIds],
  );
}

async function replaceRolePermissions(db, roleId, permissionIds) {
  await db.query('DELETE FROM role_permissions WHERE role_id = $1 AND NOT (permission_id = ANY($2::uuid[]))', [
    roleId,
    permissionIds,
  ]);
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
    [roleId, permissionIds],
  );
}

module.exports = {
  findRolesByCodes,
  findRoleById,
  listRolesWithPermissions,
  listPermissions,
  findPermissionsByCodes,
  permissionCodesForRole,
  rolesForUser,
  assignRole,
  replaceUserRoles,
  replaceRolePermissions,
};
