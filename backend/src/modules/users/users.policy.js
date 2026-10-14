'use strict';

const ApiError = require('../../core/errors/ApiError');

const SUPER_ADMIN = 'super_admin';
// Roles that confer platform-wide authority; only a super admin may grant or revoke them.
const PRIVILEGED_ROLES = new Set(['admin', SUPER_ADMIN]);

const isSuperAdmin = (roles) => roles.includes(SUPER_ADMIN);

/** Permission codes gate the route; these rules protect privileged accounts. */
function assertCanChangeStatus(actor, target) {
  if (actor.actorUserId === target.id) {
    throw ApiError.forbidden('You cannot change the status of your own account', 'SELF_MODIFICATION_FORBIDDEN');
  }
  if (target.roles.some((role) => PRIVILEGED_ROLES.has(role)) && !isSuperAdmin(actor.actorRoles)) {
    throw ApiError.forbidden('Only a super administrator can change the status of an administrator', 'PRIVILEGED_TARGET');
  }
}

function assertCanAssignRoles(actor, target, nextRoles) {
  if (actor.actorUserId === target.id) {
    throw ApiError.forbidden('You cannot change your own roles', 'SELF_MODIFICATION_FORBIDDEN');
  }
  const added = nextRoles.filter((role) => !target.roles.includes(role));
  const removed = target.roles.filter((role) => !nextRoles.includes(role));
  const touchesPrivileged = [...added, ...removed].some((role) => PRIVILEGED_ROLES.has(role));
  const targetPrivileged = target.roles.some((role) => PRIVILEGED_ROLES.has(role));
  if ((touchesPrivileged || targetPrivileged) && !isSuperAdmin(actor.actorRoles)) {
    throw ApiError.forbidden('Only a super administrator can manage administrator roles', 'PRIVILEGED_TARGET');
  }
}

function assertRoleEditable(role) {
  if (role.code === SUPER_ADMIN) {
    throw ApiError.conflict('The super_admin role always holds every permission and cannot be edited', 'ROLE_IMMUTABLE');
  }
}

module.exports = { assertCanChangeStatus, assertCanAssignRoles, assertRoleEditable, SUPER_ADMIN };
