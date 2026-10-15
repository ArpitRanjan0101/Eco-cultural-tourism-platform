'use strict';

const os = require('node:os');
const config = require('../config');
const logger = require('../core/logging/logger');
const { pool } = require('../config/database');
const { createRedisConnection } = require('../config/redis');
const { closeMailer } = require('../config/mailer');
const { recordHeartbeat, removeHeartbeat, HEARTBEAT_INTERVAL_MS } = require('./heartbeat');
const { startJobRuntime } = require('./runtime');

/**
 * Background worker process (separate container, same image as the API): BullMQ
 * workers for all Report §9 queues, repeatable schedules and a liveness heartbeat.
 * Several worker containers can run side by side.
 */
async function main() {
  const workerId = `${os.hostname()}:${process.pid}`;
  // BullMQ requires maxRetriesPerRequest: null for its blocking connections.
  const connection = createRedisConnection({ maxRetriesPerRequest: null });
  const heartbeatRedis = createRedisConnection();

  await pool.query('SELECT 1');
  await heartbeatRedis.ping();

  const beat = () =>
    recordHeartbeat(heartbeatRedis, workerId).catch((err) => logger.warn({ err: { message: err.message } }, 'Heartbeat failed'));
  await beat();
  const heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

  const runtime = await startJobRuntime({ connection });
  logger.info({ workerId, env: config.env, queues: Object.keys(runtime.queues) }, 'Worker started');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Worker shutting down');
    clearInterval(heartbeatTimer);
    // Let in-flight jobs finish; unfinished ones are retried by BullMQ after restart.
    await runtime.close();
    await removeHeartbeat(heartbeatRedis, workerId).catch(() => {});
    closeMailer();
    await Promise.allSettled([connection.quit(), heartbeatRedis.quit(), pool.end()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
