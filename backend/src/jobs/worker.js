'use strict';

const os = require('node:os');
const config = require('../config');
const logger = require('../core/logging/logger');
const { pool } = require('../config/database');
const { createRedisConnection } = require('../config/redis');
const { recordHeartbeat, removeHeartbeat, HEARTBEAT_INTERVAL_MS } = require('./heartbeat');
const bookingsService = require('../modules/bookings/bookings.service');
const paymentsService = require('../modules/payments/payments.service');

// Lapsed holds stop counting immediately (capacity checks compare expires_at); this sweep
// moves the bookings themselves to expired/completed and emits their outbox events.
const BOOKING_MAINTENANCE_INTERVAL_MS = 30_000;

/**
 * Background worker process (separate container, same image as the API).
 * Phase 5: booking expiry/completion sweep. Phase 7 moves scheduled work onto BullMQ
 * queues (booking-expiration, outbox-dispatch, notifications, media, payments).
 */
async function main() {
  const workerId = `${os.hostname()}:${process.pid}`;
  const redis = createRedisConnection();

  await pool.query('SELECT 1');
  await redis.ping();

  const beat = () =>
    recordHeartbeat(redis, workerId).catch((err) => logger.warn({ err: { message: err.message } }, 'Heartbeat failed'));
  await beat();
  const heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const result = await bookingsService.runMaintenance();
      if (result.expired || result.completed) logger.info(result, 'Booking maintenance');
      const payments = await paymentsService.runMaintenance();
      if (Object.values(payments).some(Boolean)) logger.info(payments, 'Payment maintenance');
    } catch (err) {
      logger.error({ err }, 'Booking maintenance failed');
    } finally {
      sweeping = false;
    }
  };
  await sweep();
  const sweepTimer = setInterval(sweep, BOOKING_MAINTENANCE_INTERVAL_MS);

  logger.info({ workerId, env: config.env }, 'Worker started');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Worker shutting down');
    clearInterval(heartbeatTimer);
    clearInterval(sweepTimer);
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
