'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { pool } = require('../../src/config/database');
const { syncRuntimeRole } = require('../../src/database/roles');
const { migrateTestDatabase, closeConnections } = require('../helpers');

const ROLE = 'tourism_app_role_test';
const password = randomBytes(24).toString('hex');
let runtime;

before(async () => {
  await migrateTestDatabase();
  await syncRuntimeRole(pool, { user: ROLE, password });
  const url = new URL(process.env.DATABASE_URL);
  url.username = ROLE;
  url.password = password;
  runtime = new Client({ connectionString: url.toString() });
  await runtime.connect();
});
after(async () => {
  await runtime?.end();
  // Privileges and default privileges live in this database only; the role itself is cluster-wide.
  await pool.query(`DROP OWNED BY ${ROLE}`);
  await pool.query(`DROP ROLE ${ROLE}`);
  await closeConnections();
});

const denied = async (sql, params) => {
  await assert.rejects(runtime.query(sql, params), (err) => err.code === '42501', `${sql} must be refused (insufficient privilege)`);
};

describe('least-privilege runtime role', () => {
  it('reads and writes rows but cannot change the schema or history', async () => {
    const { rows } = await runtime.query('SELECT current_user AS user, rolsuper FROM pg_roles WHERE rolname = current_user');
    assert.deepEqual(rows[0], { user: ROLE, rolsuper: false });

    await runtime.query('SELECT count(*) FROM users');
    const inserted = await runtime.query("INSERT INTO regions (name, slug) VALUES ('Role check', 'role-check') RETURNING id");
    await runtime.query("UPDATE regions SET name = 'Role check 2' WHERE id = $1", [inserted.rows[0].id]);
    await runtime.query('DELETE FROM regions WHERE id = $1', [inserted.rows[0].id]);
    await runtime.query("INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('roles.checked', 'test', '1')");
    await runtime.query('SELECT version FROM schema_migrations LIMIT 1');

    await denied('CREATE TABLE intruder (id int)');
    await denied('ALTER TABLE users ADD COLUMN intruder int');
    await denied('DROP TABLE favorites');
    await denied('TRUNCATE bookings');
    await denied("UPDATE audit_logs SET action = 'tampered.action'");
    await denied('DELETE FROM audit_logs');
    await denied("DELETE FROM schema_migrations WHERE version = '0001'");
    await denied("INSERT INTO schema_migrations (version, name, checksum) VALUES ('9999', 'x', 'x')");
    await denied(`CREATE ROLE intruder_${randomBytes(3).toString('hex')}`);
  });

  it('is idempotent, rotates the password and refuses unsafe input', async () => {
    const rotated = randomBytes(24).toString('hex');
    const result = await syncRuntimeRole(pool, { user: ROLE, password: rotated });
    assert.equal(result.created, false);
    const url = new URL(process.env.DATABASE_URL);
    url.username = ROLE;
    url.password = password;
    const stale = new Client({ connectionString: url.toString() });
    await assert.rejects(stale.connect(), (err) => err.code === '28P01', 'old password no longer works');
    await syncRuntimeRole(pool, { user: ROLE, password });

    await assert.rejects(syncRuntimeRole(pool, { user: 'Robert"); DROP TABLE users;--', password }), /lowercase identifier/);
    await assert.rejects(syncRuntimeRole(pool, { user: ROLE, password: 'short' }), /at least 16/);
    const owner = (await pool.query('SELECT current_user AS u')).rows[0].u;
    await assert.rejects(syncRuntimeRole(pool, { user: owner, password }), /must differ/);
  });

  it('new tables created by later migrations are covered by default privileges', async () => {
    await pool.query('CREATE TABLE role_default_check (id int)');
    try {
      await runtime.query('INSERT INTO role_default_check VALUES (1)');
      assert.equal((await runtime.query('SELECT count(*)::int AS n FROM role_default_check')).rows[0].n, 1);
    } finally {
      await pool.query('DROP TABLE role_default_check');
    }
  });
});
