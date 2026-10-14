'use strict';

const config = require('../../config');
const usersService = require('../../modules/users/users.service');
const { hashPassword } = require('../../modules/auth/password');

/**
 * Creates the first super administrator from BOOTSTRAP_ADMIN_* when configured.
 * Idempotent: an existing account keeps its password; it only gains the role.
 */
async function run(client) {
  const admin = config.bootstrapAdmin;
  if (!admin) return;

  const existing = await usersService.findCredentialsByEmail(client, admin.email);
  const userId = existing
    ? existing.id
    : (
        await usersService.createTouristAccount(client, {
          fullName: admin.fullName,
          email: admin.email,
          passwordHash: await hashPassword(admin.password),
        })
      ).id;

  await usersService.markEmailVerified(client, userId);
  await usersService.grantRole(client, userId, 'super_admin');
}

module.exports = { run };
