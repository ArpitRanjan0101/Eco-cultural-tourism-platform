'use strict';

const MAX_DISPATCH_ATTEMPTS = 10;

/**
 * Appends a domain event to the transactional outbox. Must be called with the
 * same transaction client as the state change it describes, so the event exists
 * if and only if the change committed. The worker dispatches it to queues.
 */
async function appendOutboxEvent(client, { eventType, aggregateType, aggregateId, payload = {} }) {
  const { rows } = await client.query(
    `INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [eventType, aggregateType, aggregateId, payload],
  );
  return rows[0].id;
}

/** Claims due pending events in commit order; concurrent dispatchers skip each other's rows. */
async function claimPending(client, limit) {
  const { rows } = await client.query(
    `SELECT id, event_type, aggregate_type, aggregate_id, payload, attempts, created_at FROM outbox_events
     WHERE status = 'pending' AND available_at <= now()
     ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  return rows;
}

/**
 * Marks an event dispatched. One-time secrets (e.g. verification/reset tokens) only
 * needed to build messages are removed from the stored payload (DECISIONS A9).
 */
async function markDispatched(client, event) {
  const { token: _token, ...scrubbed } = event.payload;
  await client.query("UPDATE outbox_events SET status = 'processed', processed_at = now(), payload = $2, last_error = NULL WHERE id = $1", [
    event.id,
    scrubbed,
  ]);
}

/** Schedules a retry with exponential backoff; gives up (status failed) after MAX_DISPATCH_ATTEMPTS. */
async function markDispatchFailed(client, event, error) {
  const attempts = event.attempts + 1;
  await client.query(
    `UPDATE outbox_events SET attempts = $2::int, last_error = $3,
       status = CASE WHEN $2::int >= $4::int THEN 'failed' ELSE 'pending' END,
       available_at = now() + make_interval(secs => least(300, power(2, $2::int)::int))
     WHERE id = $1`,
    [event.id, attempts, String(error?.message ?? error).slice(0, 1000), MAX_DISPATCH_ATTEMPTS],
  );
}

async function purgeProcessed(db, olderThanDays = 30) {
  const { rowCount } = await db.query(
    "DELETE FROM outbox_events WHERE status = 'processed' AND processed_at < now() - make_interval(days => $1)",
    [olderThanDays],
  );
  return rowCount;
}

module.exports = { appendOutboxEvent, claimPending, markDispatched, markDispatchFailed, purgeProcessed, MAX_DISPATCH_ATTEMPTS };
