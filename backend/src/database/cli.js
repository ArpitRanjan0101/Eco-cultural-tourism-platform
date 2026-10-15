'use strict';

const config = require('../config');
const { pool } = require('../config/database');
const { Migrator } = require('./migrator');
const { runSeeds } = require('./seeder');
const { syncRuntimeRole } = require('./roles');

const print = (line) => process.stdout.write(`${line}\n`);

const USAGE = 'Usage: node src/database/cli.js <migrate | rollback [steps|all] | status | seed | roles>';

async function syncRoles() {
  const result = await syncRuntimeRole(pool, config.database.appRole);
  print(`Runtime role ${result.user} ${result.created ? 'created' : 'updated'} with data-only privileges on ${result.database} (owner ${result.owner}).`);
}

async function main([command, arg]) {
  const migrator = new Migrator({ db: pool, log: print });

  switch (command) {
    case 'migrate': {
      const applied = await migrator.migrate();
      print(applied.length ? `Applied ${applied.length} migration(s).` : 'Database schema is up to date.');
      // New tables get grants through default privileges; re-syncing also re-applies the revokes.
      if (config.database.appRole) await syncRoles();
      break;
    }
    case 'roles': {
      if (!config.database.appRole) throw new Error('Set DATABASE_APP_USER and DATABASE_APP_PASSWORD to manage the runtime role');
      await syncRoles();
      break;
    }
    case 'rollback': {
      const steps = arg === 'all' ? Infinity : Number(arg ?? 1);
      if (!(steps >= 1)) throw new Error('rollback steps must be a positive number or "all"');
      const reverted = await migrator.rollback(steps);
      print(reverted.length ? `Reverted ${reverted.length} migration(s).` : 'Nothing to roll back.');
      break;
    }
    case 'status': {
      for (const row of await migrator.status()) {
        const state = row.modified ? 'MODIFIED' : row.applied ? 'applied ' : 'pending ';
        print(`${state}  ${row.version}_${row.name}${row.appliedAt ? `  (${row.appliedAt.toISOString()})` : ''}`);
      }
      break;
    }
    case 'seed': {
      if ((await migrator.pendingCount()) > 0) throw new Error('Pending migrations exist; run db:migrate first');
      const seeded = await runSeeds({ db: pool, log: print });
      print(seeded.length ? `Ran ${seeded.length} seed file(s).` : 'No seed files found.');
      break;
    }
    default:
      throw new Error(USAGE);
  }
}

main(process.argv.slice(2))
  .then(() => pool.end())
  .catch(async (err) => {
    process.stderr.write(`${err.message}\n`);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
