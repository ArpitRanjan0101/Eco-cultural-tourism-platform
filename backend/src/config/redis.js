'use strict';

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../core/logging/logger');

/**
 * Creates a Redis connection. BullMQ workers require maxRetriesPerRequest=null,
 * so callers can override options per use.
 */
function createRedisConnection(options = {}) {
  const client = new Redis(config.redis.url, {
    connectionName: config.app.name,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    ...options,
  });
  client.on('error', (err) => logger.error({ err: { message: err.message, code: err.code } }, 'Redis connection error'));
  return client;
}

let shared;

function getRedis() {
  if (!shared) shared = createRedisConnection();
  return shared;
}

async function closeRedis() {
  if (shared) {
    const client = shared;
    shared = undefined;
    await client.quit().catch(() => client.disconnect());
  }
}

module.exports = { createRedisConnection, getRedis, closeRedis };
