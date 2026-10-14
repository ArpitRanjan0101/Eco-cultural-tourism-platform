'use strict';

const { performance } = require('node:perf_hooks');
const config = require('../../config');
const { pool } = require('../../config/database');
const { getRedis } = require('../../config/redis');
const { Migrator } = require('../../database/migrator');
const { countLiveWorkers } = require('../../jobs/heartbeat');
const storage = require('../../config/storage');

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Runs one dependency check; failure details are reduced to a safe reason. */
async function runCheck(fn) {
  const started = performance.now();
  try {
    const detail = await withTimeout(fn());
    return { status: 'up', latencyMs: Math.round(performance.now() - started), ...detail };
  } catch (err) {
    return { status: 'down', reason: err.message === 'timeout' ? 'timeout' : err.reason || 'unavailable' };
  }
}

async function checkReadiness() {
  const redis = getRedis();
  const migrator = new Migrator({ db: pool });

  const [database, cache, migrations, worker, objectStorage] = await Promise.all([
    runCheck(async () => {
      await pool.query('SELECT 1');
    }),
    runCheck(async () => {
      await redis.ping();
    }),
    runCheck(async () => {
      const pending = await migrator.pendingCount();
      if (pending > 0) throw Object.assign(new Error('pending'), { reason: `${pending} pending migration(s)` });
      return { pending };
    }),
    runCheck(async () => {
      const live = await countLiveWorkers(redis);
      if (live === 0) throw Object.assign(new Error('no workers'), { reason: 'no live worker heartbeat' });
      return { live };
    }),
    runCheck(async () => {
      await storage.checkBuckets();
    }),
  ]);

  // Worker and object storage are reported but do not gate API readiness: browsing,
  // auth and bookings keep working while jobs queue up or uploads are unavailable.
  const ready = [database, cache, migrations].every((check) => check.status === 'up');
  return { ready, checks: { database, redis: cache, migrations, worker, storage: objectStorage } };
}

function getVersion() {
  return {
    name: config.app.name,
    version: config.app.version,
    commit: config.app.commit,
    node: process.version,
    environment: config.env,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

module.exports = { checkReadiness, getVersion };
