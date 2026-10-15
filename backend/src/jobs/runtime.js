'use strict';

const { Worker } = require('bullmq');
const { pool } = require('../config/database');
const logger = require('../core/logging/logger');
const idempotency = require('../core/database/idempotency');
const outbox = require('../core/events/outbox');
const { QUEUES, createQueues } = require('./queues');
const { dispatchBatch } = require('./dispatcher');
const bookingsService = require('../modules/bookings/bookings.service');
const paymentsService = require('../modules/payments/payments.service');
const notificationsService = require('../modules/notifications/notifications.service');
const mediaService = require('../modules/media/media.service');
const sessionsService = require('../modules/auth/sessions.service');

/** Repeatable schedules (BullMQ job schedulers; one instance fires per interval across all workers). */
const SCHEDULES = [
  { queue: QUEUES.outboxDispatch, id: 'outbox-dispatch', name: 'dispatch', every: 2_000 },
  { queue: QUEUES.bookingExpiration, id: 'booking-sweep', name: 'sweep', every: 30_000 },
  { queue: QUEUES.paymentReconciliation, id: 'payment-reconcile', name: 'reconcile', every: 60_000 },
  { queue: QUEUES.refundProcessing, id: 'refund-sweep', name: 'sweep', every: 60_000 },
  { queue: QUEUES.housekeeping, id: 'housekeeping', name: 'cleanup', every: 3_600_000 },
];

/** Processors by queue and job name. Every processor is idempotent (jobs may be retried). */
function processors(queues) {
  return {
    [QUEUES.outboxDispatch]: { dispatch: () => dispatchBatch(queues) },
    [QUEUES.bookingExpiration]: { sweep: () => bookingsService.runMaintenance() },
    [QUEUES.bookingConfirmation]: { voucher: (job) => bookingsService.generateVoucher(job.data.bookingId) },
    [QUEUES.paymentReconciliation]: { reconcile: () => paymentsService.reconcile() },
    [QUEUES.refundProcessing]: {
      'cancellation-refund': (job) => paymentsService.refundCancellation(job.data.bookingId),
      sweep: () => paymentsService.sweepRefunds(),
    },
    [QUEUES.notificationDelivery]: {
      notify: async (job) => {
        const emails = await notificationsService.handleEvent(job.data.event);
        for (const message of emails) {
          await queues[QUEUES.notificationDelivery].add('send-email', message, { jobId: `email-${message.deliveryId}` });
        }
        return { emails: emails.length };
      },
      'send-email': (job) => notificationsService.sendEmail(job.data),
    },
    [QUEUES.mediaProcessing]: { process: (job) => mediaService.processUploaded(job.data.mediaId) },
    [QUEUES.housekeeping]: {
      cleanup: async () => ({
        staleUploads: await mediaService.purgeStaleUploads(),
        auth: await sessionsService.purgeExpired(),
        idempotencyRecords: await idempotency.purgeExpired(pool),
        outboxEvents: await outbox.purgeProcessed(pool),
      }),
    },
  };
}

/**
 * Starts queues, workers and (optionally) schedules on a BullMQ connection
 * (ioredis with maxRetriesPerRequest: null). Returns handles for graceful shutdown.
 */
async function startJobRuntime({ connection, schedule = true }) {
  const queues = createQueues(connection);
  const handlers = processors(queues);

  const workers = Object.entries(handlers).map(([queueName, byName]) => {
    const worker = new Worker(
      queueName,
      async (job) => {
        const handler = byName[job.name];
        if (!handler) throw new Error(`No processor for ${queueName}/${job.name}`);
        return handler(job);
      },
      { connection, concurrency: queueName === QUEUES.outboxDispatch ? 1 : 5 },
    );
    worker.on('failed', (job, err) => {
      const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
      logger[final ? 'error' : 'warn']({ queue: queueName, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, err: { message: err.message } }, final ? 'Job failed permanently' : 'Job failed; retrying');
      if (final && job.name === 'send-email') notificationsService.markDeliveryFailed(job.data.deliveryId, err.message).catch(() => {});
    });
    worker.on('error', (err) => logger.error({ queue: queueName, err: { message: err.message } }, 'Worker error'));
    return worker;
  });

  if (schedule) {
    for (const s of SCHEDULES) {
      await queues[s.queue].upsertJobScheduler(s.id, { every: s.every }, { name: s.name, opts: { removeOnComplete: true, removeOnFail: { age: 24 * 3600 } } });
    }
  }

  async function close() {
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await Promise.allSettled(Object.values(queues).map((queue) => queue.close()));
  }

  return { queues, workers, close };
}

module.exports = { startJobRuntime, SCHEDULES };
