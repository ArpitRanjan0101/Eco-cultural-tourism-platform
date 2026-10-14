'use strict';

async function insert(db, entry) {
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.actorUserId ?? null,
      entry.action,
      entry.entityType,
      String(entry.entityId),
      entry.oldValues ?? null,
      entry.newValues ?? null,
      entry.ipAddress ?? null,
      entry.requestId ?? null,
    ],
  );
}

module.exports = { insert };
