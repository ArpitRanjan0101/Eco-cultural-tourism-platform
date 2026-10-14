'use strict';

const HEARTBEAT_KEY = 'workers:heartbeats';
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TTL_MS = 60_000;

/** Records that worker `id` is alive (sorted set scored by timestamp). */
async function recordHeartbeat(redis, id, now = Date.now()) {
  await redis
    .multi()
    .zadd(HEARTBEAT_KEY, now, id)
    .zremrangebyscore(HEARTBEAT_KEY, 0, now - HEARTBEAT_TTL_MS)
    .exec();
}

async function removeHeartbeat(redis, id) {
  await redis.zrem(HEARTBEAT_KEY, id);
}

async function countLiveWorkers(redis, now = Date.now()) {
  return redis.zcount(HEARTBEAT_KEY, now - HEARTBEAT_TTL_MS, '+inf');
}

module.exports = { recordHeartbeat, removeHeartbeat, countLiveWorkers, HEARTBEAT_INTERVAL_MS };
