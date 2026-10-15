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

/** Newest first. `action` matches exactly or as a prefix (e.g. "reviews." for every review action). */
async function search(db, { actorUserId, entityType, entityId, action, from, to, page, limit }) {
  const values = [actorUserId ?? null, entityType ?? null, entityId ?? null, action ?? null, from ?? null, to ?? null];
  const where = `WHERE ($1::uuid IS NULL OR actor_user_id = $1) AND ($2::text IS NULL OR entity_type = $2)
    AND ($3::text IS NULL OR entity_id = $3) AND ($4::text IS NULL OR left(action, length($4)) = $4)
    AND ($5::date IS NULL OR created_at >= ($5::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
    AND ($6::date IS NULL OR created_at < (($6::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, old_values, new_values, host(ip_address) AS ip_address, request_id, created_at
       FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT $7 OFFSET $8`,
      [...values, limit, (page - 1) * limit],
    ),
    db.query(`SELECT count(*)::int AS total FROM audit_logs ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

module.exports = { insert, search };
