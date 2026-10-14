'use strict';

/**
 * Appends a domain event to the transactional outbox. Must be called with the
 * same transaction client as the state change it describes, so the event exists
 * if and only if the change committed. The worker dispatches it (Phase 7).
 */
async function appendOutboxEvent(client, { eventType, aggregateType, aggregateId, payload = {} }) {
  const { rows } = await client.query(
    `INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [eventType, aggregateType, aggregateId, payload],
  );
  return rows[0].id;
}

module.exports = { appendOutboxEvent };
