'use strict';

const { escapeIdentifier: id, escapeLiteral: literal } = require('pg');

/**
 * Least-privilege runtime role (DECISIONS C17 → J1). Migrations run as the schema owner;
 * the API and worker connect as a role that can read and write rows but cannot change the
 * schema, truncate, alter the migration history or rewrite audit records. Idempotent: run
 * after every migration (the migrate command does it automatically when configured).
 */
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const APPEND_ONLY = ['audit_logs'];
const READ_ONLY = ['schema_migrations'];
const ROLE_OPTIONS = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';

async function syncRuntimeRole(db, { user, password }) {
  if (!ROLE_NAME.test(user)) throw new Error('DATABASE_APP_USER must be a lowercase identifier');
  if (!password || password.length < 16) throw new Error('DATABASE_APP_PASSWORD must be at least 16 characters');

  const { rows } = await db.query(
    'SELECT current_user AS owner, current_database() AS database, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
    [user],
  );
  const { owner, database, exists } = rows[0];
  if (owner === user) throw new Error('The runtime role must differ from the migration owner');
  const role = id(user);

  await db.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} WITH ${ROLE_OPTIONS} PASSWORD ${literal(password)}`);
  await db.query(`GRANT CONNECT ON DATABASE ${id(database)} TO ${role}`);
  await db.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
  await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await db.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${id(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
  await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${id(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);

  for (const table of APPEND_ONLY) {
    if (await tableExists(db, table)) await db.query(`REVOKE UPDATE, DELETE, TRUNCATE ON ${id(table)} FROM ${role}`);
  }
  for (const table of READ_ONLY) {
    if (await tableExists(db, table)) await db.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ${id(table)} FROM ${role}`);
  }
  return { user, owner, database, created: !exists };
}

async function tableExists(db, table) {
  const { rows } = await db.query("SELECT to_regclass('public.' || $1) IS NOT NULL AS ok", [table]);
  return rows[0].ok;
}

module.exports = { syncRuntimeRole };
