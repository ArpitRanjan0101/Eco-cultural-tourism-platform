'use strict';

const { pool } = require('../config/database');
const { withTransaction } = require('../core/database/transaction');
const outbox = require('../core/events/outbox');
const logger = require('../core/logging/logger');
const { QUEUES } = require('./queues');

const BATCH_SIZE = 100;
const NOTIFYING_EVENTS = /^(auth|booking|refund)\.|^partner\.status_changed$/;

/**
 * Routes one outbox event to queue jobs. Job ids derive from the event id, so a
 * re-dispatch after a crash is de-duplicated by BullMQ, and every handler is
 * idempotent for the rare re-run beyond BullMQ's retention.
 */
function jobsFor(event) {
  const jobs = [];
  const jobId = (name) => `${event.id}-${name}`;
  const { payload } = event;
  if (NOTIFYING_EVENTS.test(event.event_type)) {
    // Carries the original payload (incl. one-time tokens) to the notifier; the stored row is scrubbed.
    jobs.push({ queue: QUEUES.notificationDelivery, name: 'notify', data: { event: { id: event.id, event_type: event.event_type, payload } }, jobId: jobId('notify') });
  }
  if (event.event_type === 'booking.confirmed') {
    jobs.push({ queue: QUEUES.bookingConfirmation, name: 'voucher', data: { bookingId: payload.bookingId }, jobId: jobId('voucher') });
  }
  if (event.event_type === 'booking.cancelled' && payload.refundPending) {
    jobs.push({ queue: QUEUES.refundProcessing, name: 'cancellation-refund', data: { bookingId: payload.bookingId }, jobId: jobId('refund') });
  }
  if (event.event_type === 'media.uploaded') {
    jobs.push({ queue: QUEUES.mediaProcessing, name: 'process', data: { mediaId: payload.mediaId }, jobId: jobId('media') });
  }
  return jobs;
}

/**
 * outbox-dispatch: claims committed events (SKIP LOCKED, so several workers can run),
 * enqueues their jobs and marks them dispatched in the same transaction. A Redis
 * failure leaves the event pending with backoff; nothing is lost on restart.
 */
async function dispatchBatch(queues) {
  return withTransaction(async (client) => {
    const events = await outbox.claimPending(client, BATCH_SIZE);
    let dispatched = 0;
    for (const event of events) {
      try {
        for (const job of jobsFor(event)) await queues[job.queue].add(job.name, job.data, { jobId: job.jobId });
        await outbox.markDispatched(client, event);
        dispatched += 1;
      } catch (err) {
        logger.error({ err: { message: err.message }, eventId: event.id }, 'Outbox dispatch failed; will retry');
        await outbox.markDispatchFailed(client, event, err);
      }
    }
    return { claimed: events.length, dispatched };
  });
}

const pendingCount = async () => (await pool.query("SELECT count(*)::int AS n FROM outbox_events WHERE status = 'pending'")).rows[0].n;

module.exports = { jobsFor, dispatchBatch, pendingCount };
