'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DEFAULT_DIR = path.join(__dirname, 'migrations');
const DEFAULT_TABLE = 'schema_migrations';
const UP_FILE = /^(\d{4})_([a-z0-9_]+)\.up\.sql$/;
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

// Line endings are normalised so a Windows checkout does not change checksums.
const checksum = (sql) => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

function loadMigrations(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return [];
  const migrations = [];
  const seen = new Set();
  for (const file of fs.readdirSync(dir).sort()) {
    const match = UP_FILE.exec(file);
    if (!match) continue;
    const [, version, name] = match;
    if (seen.has(version)) throw new Error(`Duplicate migration version ${version}`);
    seen.add(version);
    const downPath = path.join(dir, `${version}_${name}.down.sql`);
    if (!fs.existsSync(downPath)) throw new Error(`Migration ${file} has no matching .down.sql`);
    const upSql = fs.readFileSync(path.join(dir, file), 'utf8');
    migrations.push({ version, name, upSql, downPath, checksum: checksum(upSql) });
  }
  return migrations;
}

class Migrator {
  constructor({ db, dir = DEFAULT_DIR, table = DEFAULT_TABLE, log = () => {} }) {
    if (!SAFE_IDENTIFIER.test(table)) throw new Error(`Unsafe migrations table name: ${table}`);
    this.db = db;
    this.dir = dir;
    this.table = table;
    this.log = log;
  }

  async #ensureTable(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        version    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
  }

  async #applied(client) {
    const { rows } = await client.query(`SELECT version, name, checksum, applied_at FROM ${this.table} ORDER BY version`);
    return rows;
  }

  /** Serialises concurrent migration runs (e.g. two deploy jobs) with an advisory lock. */
  async #locked(fn) {
    const client = await this.db.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [this.table]);
      try {
        await this.#ensureTable(client);
        return await fn(client);
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [this.table]);
      }
    } finally {
      client.release();
    }
  }

  #verify(available, applied) {
    const byVersion = new Map(available.map((m) => [m.version, m]));
    for (const row of applied) {
      const file = byVersion.get(row.version);
      if (!file) throw new Error(`Applied migration ${row.version}_${row.name} is missing from ${this.dir}`);
      if (file.checksum !== row.checksum) {
        throw new Error(`Migration ${row.version}_${row.name} was modified after being applied; add a new migration instead`);
      }
    }
  }

  async migrate() {
    const available = loadMigrations(this.dir);
    return this.#locked(async (client) => {
      const applied = await this.#applied(client);
      this.#verify(available, applied);
      const done = new Set(applied.map((row) => row.version));
      const executed = [];
      for (const migration of available) {
        if (done.has(migration.version)) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.upSql);
          await client.query(`INSERT INTO ${this.table} (version, name, checksum) VALUES ($1, $2, $3)`, [
            migration.version,
            migration.name,
            migration.checksum,
          ]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          err.message = `Migration ${migration.version}_${migration.name} failed: ${err.message}`;
          throw err;
        }
        this.log(`applied ${migration.version}_${migration.name}`);
        executed.push(`${migration.version}_${migration.name}`);
      }
      return executed;
    });
  }

  /** Rolls back the newest `steps` migrations (Infinity = all). */
  async rollback(steps = 1) {
    const available = loadMigrations(this.dir);
    return this.#locked(async (client) => {
      const applied = await this.#applied(client);
      this.#verify(available, applied);
      const targets = applied.reverse().slice(0, steps);
      const reverted = [];
      for (const row of targets) {
        const migration = available.find((m) => m.version === row.version);
        await client.query('BEGIN');
        try {
          await client.query(fs.readFileSync(migration.downPath, 'utf8'));
          await client.query(`DELETE FROM ${this.table} WHERE version = $1`, [row.version]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          err.message = `Rollback of ${row.version}_${row.name} failed: ${err.message}`;
          throw err;
        }
        this.log(`reverted ${row.version}_${row.name}`);
        reverted.push(`${row.version}_${row.name}`);
      }
      return reverted;
    });
  }

  async status() {
    const available = loadMigrations(this.dir);
    const client = await this.db.connect();
    try {
      await this.#ensureTable(client);
      const applied = new Map((await this.#applied(client)).map((row) => [row.version, row]));
      return available.map((m) => ({
        version: m.version,
        name: m.name,
        applied: applied.has(m.version),
        appliedAt: applied.get(m.version)?.applied_at ?? null,
        modified: applied.has(m.version) && applied.get(m.version).checksum !== m.checksum,
      }));
    } finally {
      client.release();
    }
  }

  /** Read-only pending count for readiness checks (does not create the table). */
  async pendingCount() {
    const available = loadMigrations(this.dir);
    const { rows } = await this.db.query('SELECT to_regclass($1) AS present', [this.table]);
    if (!rows[0].present) return available.length;
    const applied = await this.db.query(`SELECT version FROM ${this.table}`);
    const done = new Set(applied.rows.map((row) => row.version));
    return available.filter((m) => !done.has(m.version)).length;
  }
}

module.exports = { Migrator, loadMigrations };
