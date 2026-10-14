'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pool } = require('../../src/config/database');
const { Migrator, loadMigrations } = require('../../src/database/migrator');
const { withTransaction } = require('../../src/core/database/transaction');
const { migrateTestDatabase, closeConnections } = require('../helpers');

before(migrateTestDatabase);
after(closeConnections);

describe('migrations', () => {
  it('every migration rolls back and re-applies cleanly on the real schema', async () => {
    const migrator = new Migrator({ db: pool });
    const total = loadMigrations().length;
    assert.equal((await migrator.rollback(Infinity)).length, total);
    assert.equal(await migrator.pendingCount(), total);
    assert.equal((await migrator.migrate()).length, total);
    assert.equal(await migrator.pendingCount(), 0);
    assert.deepEqual(await migrator.migrate(), [], 'second run is a no-op');
  });

  it('baseline installs PostGIS, citext and btree_gist', async () => {
    const { rows } = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('postgis','citext','btree_gist') ORDER BY extname",
    );
    assert.deepEqual(rows.map((r) => r.extname), ['btree_gist', 'citext', 'postgis']);
    const distance = await pool.query(
      "SELECT round(ST_Distance('SRID=4326;POINT(85.3096 23.3441)'::geography, 'SRID=4326;POINT(86.4304 23.7957)'::geography) / 1000) AS km",
    );
    assert.ok(Number(distance.rows[0].km) > 100, 'Ranchi to Dhanbad is over 100 km');
  });

  describe('with an isolated migrations directory', () => {
    const table = 'schema_migrations_selftest';
    let dir;

    before(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
      fs.writeFileSync(path.join(dir, '0001_create_probe.up.sql'), 'CREATE TABLE migrator_probe (id int);');
      fs.writeFileSync(path.join(dir, '0001_create_probe.down.sql'), 'DROP TABLE migrator_probe;');
      fs.writeFileSync(path.join(dir, '0002_broken.up.sql'), 'CREATE TABLE migrator_probe_2 (id int); SELECT * FROM missing_table;');
      fs.writeFileSync(path.join(dir, '0002_broken.down.sql'), 'DROP TABLE migrator_probe_2;');
    });

    after(async () => {
      await pool.query(`DROP TABLE IF EXISTS migrator_probe, migrator_probe_2, ${table}`);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('applies migrations atomically: a failing migration leaves no partial changes', async () => {
      const migrator = new Migrator({ db: pool, dir, table });
      await assert.rejects(migrator.migrate(), /0002_broken failed/);
      const status = await migrator.status();
      assert.deepEqual(status.map((s) => s.applied), [true, false]);
      const { rows } = await pool.query("SELECT to_regclass('migrator_probe_2') AS t");
      assert.equal(rows[0].t, null);
    });

    it('refuses to run when an applied migration file was edited', async () => {
      fs.writeFileSync(path.join(dir, '0001_create_probe.up.sql'), 'CREATE TABLE migrator_probe (id bigint);');
      await assert.rejects(new Migrator({ db: pool, dir, table }).migrate(), /modified after being applied/);
    });

    it('rejects a migration without a down script', () => {
      fs.writeFileSync(path.join(dir, '0003_no_down.up.sql'), 'SELECT 1;');
      assert.throws(() => loadMigrations(dir), /no matching \.down\.sql/);
      fs.rmSync(path.join(dir, '0003_no_down.up.sql'));
    });
  });
});

describe('withTransaction', () => {
  before(() => pool.query('CREATE TABLE IF NOT EXISTS tx_probe (id int PRIMARY KEY, n int NOT NULL)'));
  after(() => pool.query('DROP TABLE IF EXISTS tx_probe'));

  it('commits on success and rolls back on error', async () => {
    await withTransaction((client) => client.query('INSERT INTO tx_probe VALUES (1, 0)'));
    await assert.rejects(
      withTransaction(async (client) => {
        await client.query('INSERT INTO tx_probe VALUES (2, 0)');
        throw new Error('boom');
      }),
      /boom/,
    );
    const { rows } = await pool.query('SELECT id FROM tx_probe ORDER BY id');
    assert.deepEqual(rows.map((r) => r.id), [1]);
  });

  it('retries serialization failures so concurrent increments are not lost', async () => {
    const increment = () =>
      withTransaction(
        async (client) => {
          const { rows } = await client.query('SELECT n FROM tx_probe WHERE id = 1');
          await client.query('UPDATE tx_probe SET n = $1 WHERE id = 1', [rows[0].n + 1]);
        },
        { isolationLevel: 'serializable', retries: 10 },
      );
    await Promise.all(Array.from({ length: 5 }, increment));
    const { rows } = await pool.query('SELECT n FROM tx_probe WHERE id = 1');
    assert.equal(rows[0].n, 5);
  });

  it('returns DATE columns as plain YYYY-MM-DD strings', async () => {
    const { rows } = await pool.query("SELECT DATE '2026-12-10' AS d, 5600.00::numeric(12,2) AS amount");
    assert.equal(rows[0].d, '2026-12-10');
    assert.equal(rows[0].amount, '5600.00');
  });
});
