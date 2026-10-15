'use strict';

const { Queue } = require('bullmq');

/** Report §9 queues, plus housekeeping (retention clean-up). */
const QUEUES = Object.freeze({
  outboxDispatch: 'outbox-dispatch',
  bookingExpiration: 'booking-expiration',
  bookingConfirmation: 'booking-confirmation',
  paymentReconciliation: 'payment-reconciliation',
  refundProcessing: 'refund-processing',
  notificationDelivery: 'notification-delivery',
  mediaProcessing: 'media-processing',
  housekeeping: 'housekeeping',
});

/** Bounded retries with exponential backoff; failed jobs stay visible for a week. */
const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
});

function createQueues(connection) {
  return Object.fromEntries(
    Object.values(QUEUES).map((name) => [name, new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS })]),
  );
}

let monitorQueues;

/** Waiting/active/delayed/failed counts per queue (read-only; used by readiness reporting). */
async function queueCounts(connection) {
  monitorQueues ??= createQueues(connection);
  const entries = await Promise.all(
    Object.entries(monitorQueues).map(async ([name, queue]) => [name, await queue.getJobCounts('waiting', 'active', 'delayed', 'failed')]),
  );
  return Object.fromEntries(entries);
}

async function closeMonitorQueues() {
  if (monitorQueues) await Promise.allSettled(Object.values(monitorQueues).map((queue) => queue.close()));
  monitorQueues = undefined;
}

module.exports = { QUEUES, DEFAULT_JOB_OPTIONS, createQueues, queueCounts, closeMonitorQueues };
