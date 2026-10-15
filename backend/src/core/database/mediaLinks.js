'use strict';

/**
 * Gallery link tables of partner supply share one shape: (owner_id, media_id, sort_order[, is_cover]).
 * Table and column names come only from this allowlist, never from input.
 */
const LINK_TABLES = {
  property_media: { owner: 'property_id', cover: true },
  room_type_media: { owner: 'room_type_id', cover: false },
  experience_media: { owner: 'experience_id', cover: false },
  package_media: { owner: 'package_id', cover: false },
};

function spec(table) {
  const definition = LINK_TABLES[table];
  if (!definition) throw new Error(`Unknown media link table ${table}`);
  return definition;
}

/** Rows ordered cover-first, then by sort order. */
async function listLinks(db, table, ownerIds) {
  const { owner, cover } = spec(table);
  const { rows } = await db.query(
    `SELECT ${owner} AS owner_id, media_id, sort_order, ${cover ? 'is_cover' : 'false AS is_cover'}
     FROM ${table} WHERE ${owner} = ANY($1::uuid[])
     ORDER BY ${owner}, ${cover ? 'is_cover DESC,' : ''} sort_order, media_id`,
    [ownerIds],
  );
  return rows;
}

async function attach(db, table, ownerId, { mediaId, sortOrder = 0, isCover = false }) {
  const { owner, cover } = spec(table);
  if (cover && isCover) await db.query(`UPDATE ${table} SET is_cover = false WHERE ${owner} = $1 AND is_cover`, [ownerId]);
  const columns = cover ? `${owner}, media_id, sort_order, is_cover` : `${owner}, media_id, sort_order`;
  const values = cover ? [ownerId, mediaId, sortOrder, isCover] : [ownerId, mediaId, sortOrder];
  const updates = cover ? 'sort_order = EXCLUDED.sort_order, is_cover = EXCLUDED.is_cover' : 'sort_order = EXCLUDED.sort_order';
  await db.query(
    `INSERT INTO ${table} (${columns}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (${owner}, media_id) DO UPDATE SET ${updates}`,
    values,
  );
}

async function detach(db, table, ownerId, mediaId) {
  const { owner } = spec(table);
  const { rowCount } = await db.query(`DELETE FROM ${table} WHERE ${owner} = $1 AND media_id = $2`, [ownerId, mediaId]);
  return rowCount > 0;
}

module.exports = { listLinks, attach, detach };
