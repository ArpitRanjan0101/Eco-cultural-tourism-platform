'use strict';

const os = require('node:os');
const config = require('../config');
const logger = require('../core/logging/logger');
const { pool } = require('../config/database');
const { createRedisConnection } = require('../config/redis');
const { recordHeartbeat, removeHeartbeat, HEARTBEAT_INTERVAL_MS } = require('./heartbeat');

/**
 * Background worker process (separate container, same image as the API).
 * Queue processors are registered here as their modules are delivered
 * (booking expiry: Phase 5, payments: Phase 6, outbox/notifications/media: Phase 7).
 */
async function main() {
  const workerId = `${os.hostname()}:${process.pid}`;
  const redis = createRedisConnection();

  await pool.query('SELECT 1');
  await redis.ping();

  const beat = () =>
    recordHeartbeat(redis, workerId).catch((err) => logger.warn({ err: { message: err.message } }, 'Heartbeat failed'));
  await beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

  logger.info({ workerId, env: config.env }, 'Worker started');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Worker shutting down');
    clearInterval(timer);
    await removeHeartbeat(redis, workerId).catch(() => {});
    await Promise.allSettled([redis.quit(), pool.end()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
