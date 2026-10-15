'use strict';

const config = require('./config');
const logger = require('./core/logging/logger');
const { createApp } = require('./app');
const { pool } = require('./config/database');
const { closeRedis } = require('./config/redis');
const { closeHealthMonitor } = require('./core/health/health.service');

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'API listening');
});

// Must exceed nginx upstream keepalive so idle sockets are closed by nginx first.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'API shutting down');
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(async (err) => {
    await Promise.allSettled([pool.end(), closeRedis(), closeHealthMonitor()]);
    process.exit(err ? 1 : exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
