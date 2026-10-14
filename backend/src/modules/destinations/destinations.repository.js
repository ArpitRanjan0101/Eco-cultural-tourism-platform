'use strict';

const { buildUpdate, geoPointExpression } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

// ---- categories ----

const CATEGORY_COLUMNS = 'c.id, c.name, c.slug, c.description, c.icon, c.status, c.created_at, c.updated_at';

async function listCategories(db, { status } = {}) {
  const { rows } = await db.query(
    `SELECT ${CATEGORY_COLUMNS} FROM destination_categories c WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.name`,
    [status ?? null],
  );
  return rows;
}

async function findCategory(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${CATEGORY_COLUMNS} FROM destination_categories c WHERE c.id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function findCategoriesByIds(db, ids) {
  const { rows } = await db.query(`SELECT ${CATEGORY_COLUMNS} FROM destination_categories c WHERE c.id = ANY($1::uuid[])`, [ids]);
  return rows;
}

async function insertCategory(db, { name, slug, description, icon }) {
  const { rows } = await db.query(
    'INSERT INTO destination_categories (name, slug, description, icon) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, slug, description ?? null, icon ?? null],
  );
  return rows[0].id;
}

async function updateCategory(db, id, fields) {
  const query = buildUpdate('destination_categories', id, fields, {
    name: 'name',
    slug: 'slug',
    description: 'description',
    icon: 'icon',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

/** Active categories with their published-destination counts (search filters). */
async function categoryFacets(db) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.slug, c.icon, count(d.id)::int AS destination_count
     FROM destination_categories c
     LEFT JOIN destination_category_links l ON l.category_id = c.id
     LEFT JOIN destinations d ON d.id = l.destination_id AND d.status = 'published'
     WHERE c.status = 'active'
     GROUP BY c.id ORDER BY c.name`,
  );
  return rows;
}

async function districtFacets(db) {
  const { rows } = await db.query(
    "SELECT district_id, count(*)::int AS destination_count FROM destinations WHERE status = 'published' GROUP BY district_id",
  );
  return rows;
}

// ---- destinations ----

const CARD_COLUMNS = `d.id, d.name, d.slug, d.summary, d.featured, d.status, d.district_id, d.entry_fee,
  d.published_at, d.created_at, d.updated_at,
  ST_Y(d.geo_location::geometry) AS latitude, ST_X(d.geo_location::geometry) AS longitude,
  (SELECT dm.media_id FROM destination_media dm WHERE dm.destination_id = d.id
     ORDER BY dm.is_cover DESC, dm.sort_order, dm.media_id LIMIT 1) AS cover_media_id,
  COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'status', c.status) ORDER BY c.name)
     FROM destination_category_links l JOIN destination_categories c ON c.id = l.category_id
     WHERE l.destination_id = d.id), '[]'::json) AS categories`;

const DETAIL_COLUMNS = `${CARD_COLUMNS}, d.description, d.address, d.opening_hours, d.best_time_to_visit`;

const SORT_COLUMNS = { name: 'd.name', createdAt: 'd.created_at', publishedAt: 'd.published_at' };

function listFilters({ statuses, districtIds, categorySlug, featured, q }) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace(/\?/g, `$${values.length}`));
  };
  if (statuses) add('d.status = ANY(?::text[])', statuses);
  if (districtIds) add('d.district_id = ANY(?::uuid[])', districtIds);
  if (categorySlug) {
    add(
      `EXISTS (SELECT 1 FROM destination_category_links l JOIN destination_categories c ON c.id = l.category_id
               WHERE l.destination_id = d.id AND c.slug = ? AND c.status = 'active')`,
      categorySlug,
    );
  }
  if (featured !== undefined) add('d.featured = ?', featured);
  if (q) {
    values.push(q, likePattern(q));
    conditions.push(`(d.search_vector @@ websearch_to_tsquery('english', $${values.length - 1}) OR d.name ILIKE $${values.length})`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function listDestinations(db, query) {
  const { where, values } = listFilters(query);
  const { limit, offset } = pageWindow(query);
  const [list, count] = await Promise.all([
    db.query(
      `SELECT ${CARD_COLUMNS} FROM destinations d ${where}
       ORDER BY ${orderBy(query.sort, SORT_COLUMNS, 'd.id')} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM destinations d ${where}`, values),
  ]);
  return { rows: list.rows, total: count.rows[0].total };
}

async function findDestination(db, { id, slug }, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${DETAIL_COLUMNS} FROM destinations d WHERE ${id ? 'd.id = $1' : 'd.slug = $1'} ${forUpdate ? 'FOR UPDATE OF d' : ''}`,
    [id ?? slug],
  );
  return rows[0] ?? null;
}

async function findCardsByIds(db, ids, { publishedOnly = true } = {}) {
  const { rows } = await db.query(
    `SELECT ${CARD_COLUMNS} FROM destinations d WHERE d.id = ANY($1::uuid[]) ${publishedOnly ? "AND d.status = 'published'" : ''}`,
    [ids],
  );
  return rows;
}

async function insertDestination(db, input) {
  const { rows } = await db.query(
    `INSERT INTO destinations (district_id, name, slug, summary, description, geo_location, address, opening_hours,
                               best_time_to_visit, entry_fee, featured)
     VALUES ($1, $2, $3, $4, $5,
             CASE WHEN $6::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography END,
             $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.districtId,
      input.name,
      input.slug,
      input.summary ?? null,
      input.description ?? null,
      input.location?.longitude ?? null,
      input.location?.latitude ?? null,
      input.address ?? null,
      input.openingHours ?? null,
      input.bestTimeToVisit ?? null,
      input.entryFee ?? null,
      input.featured ?? false,
    ],
  );
  return rows[0].id;
}

const DESTINATION_UPDATE_COLUMNS = {
  districtId: 'district_id',
  name: 'name',
  slug: 'slug',
  summary: 'summary',
  description: 'description',
  location: 'geo_location',
  address: 'address',
  openingHours: 'opening_hours',
  bestTimeToVisit: 'best_time_to_visit',
  entryFee: 'entry_fee',
  featured: 'featured',
};

async function updateDestination(db, id, fields) {
  const query = buildUpdate('destinations', id, fields, DESTINATION_UPDATE_COLUMNS, { location: geoPointExpression });
  if (query) await db.query(query.text, query.values);
}

async function setStatus(db, id, status) {
  await db.query(
    `UPDATE destinations SET status = $2,
       published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END
     WHERE id = $1`,
    [id, status],
  );
}

async function replaceCategories(db, id, categoryIds) {
  await db.query('DELETE FROM destination_category_links WHERE destination_id = $1', [id]);
  await db.query(
    'INSERT INTO destination_category_links (destination_id, category_id) SELECT $1, unnest($2::uuid[])',
    [id, categoryIds],
  );
}

async function listMedia(db, id) {
  const { rows } = await db.query(
    'SELECT media_id, sort_order, is_cover FROM destination_media WHERE destination_id = $1 ORDER BY is_cover DESC, sort_order, media_id',
    [id],
  );
  return rows;
}

async function attachMedia(db, id, { mediaId, sortOrder, isCover }) {
  if (isCover) await db.query('UPDATE destination_media SET is_cover = false WHERE destination_id = $1 AND is_cover', [id]);
  await db.query(
    `INSERT INTO destination_media (destination_id, media_id, sort_order, is_cover) VALUES ($1, $2, $3, $4)
     ON CONFLICT (destination_id, media_id) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_cover = EXCLUDED.is_cover`,
    [id, mediaId, sortOrder, isCover],
  );
}

async function detachMedia(db, id, mediaId) {
  const { rowCount } = await db.query('DELETE FROM destination_media WHERE destination_id = $1 AND media_id = $2', [id, mediaId]);
  return rowCount > 0;
}

async function listFaqs(db, id) {
  const { rows } = await db.query('SELECT question, answer FROM destination_faqs WHERE destination_id = $1 ORDER BY sort_order', [id]);
  return rows;
}

async function replaceFaqs(db, id, faqs) {
  await db.query('DELETE FROM destination_faqs WHERE destination_id = $1', [id]);
  for (const [index, faq] of faqs.entries()) {
    await db.query('INSERT INTO destination_faqs (destination_id, question, answer, sort_order) VALUES ($1, $2, $3, $4)', [
      id,
      faq.question,
      faq.answer,
      index,
    ]);
  }
}

async function listRelatedIds(db, id) {
  const { rows } = await db.query(
    'SELECT related_destination_id FROM destination_related_places WHERE destination_id = $1 ORDER BY sort_order',
    [id],
  );
  return rows.map((row) => row.related_destination_id);
}

async function replaceRelated(db, id, relatedIds) {
  await db.query('DELETE FROM destination_related_places WHERE destination_id = $1', [id]);
  await db.query(
    `INSERT INTO destination_related_places (destination_id, related_destination_id, sort_order)
     SELECT $1, related.id, related.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS related (id, ord)`,
    [id, relatedIds],
  );
}

async function countExisting(db, ids) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM destinations WHERE id = ANY($1::uuid[])', [ids]);
  return rows[0].n;
}

/** Published destinations within `radiusMeters` of a point, nearest first. */
async function nearPoint(db, { latitude, longitude, radiusMeters, limit, offset = 0, excludeId = null }) {
  const point = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';
  const where = `d.status = 'published' AND d.geo_location IS NOT NULL
    AND ST_DWithin(d.geo_location, ${point}, $3) AND ($4::uuid IS NULL OR d.id <> $4)`;
  const [list, count] = await Promise.all([
    db.query(
      `SELECT ${CARD_COLUMNS}, ST_Distance(d.geo_location, ${point}) AS distance_m
       FROM destinations d WHERE ${where} ORDER BY distance_m, d.id LIMIT $5 OFFSET $6`,
      [longitude, latitude, radiusMeters, excludeId, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM destinations d WHERE ${where}`, [longitude, latitude, radiusMeters, excludeId]),
  ]);
  return { rows: list.rows, total: count.rows[0].total };
}

/** Ranked full-text + fuzzy-name search over published destinations. */
async function search(db, { q, districtIds, categorySlug, limit, offset }) {
  const values = [q, likePattern(q), districtIds ?? null, categorySlug ?? null];
  const where = `d.status = 'published'
    AND (d.search_vector @@ websearch_to_tsquery('english', $1) OR d.name ILIKE $2 OR d.name % $1)
    AND ($3::uuid[] IS NULL OR d.district_id = ANY($3::uuid[]))
    AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM destination_category_links l JOIN destination_categories c ON c.id = l.category_id
                                      WHERE l.destination_id = d.id AND c.slug = $4 AND c.status = 'active'))`;
  const [list, count] = await Promise.all([
    db.query(
      `SELECT ${CARD_COLUMNS},
              ts_rank(d.search_vector, websearch_to_tsquery('english', $1)) + similarity(d.name, $1) AS rank
       FROM destinations d WHERE ${where}
       ORDER BY rank DESC, d.name, d.id LIMIT $5 OFFSET $6`,
      [...values, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM destinations d WHERE ${where}`, values),
  ]);
  return { rows: list.rows, total: count.rows[0].total };
}

async function suggest(db, { q, limit }) {
  const { rows } = await db.query(
    `SELECT d.id, d.name, d.slug, d.district_id, similarity(d.name, $1) AS rank
     FROM destinations d
     WHERE d.status = 'published' AND (d.name ILIKE $2 OR d.name % $1)
     ORDER BY (d.name ILIKE $3) DESC, rank DESC, d.name LIMIT $4`,
    [q, likePattern(q), `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit],
  );
  return rows;
}

module.exports = {
  SORT_COLUMNS,
  listCategories,
  findCategory,
  findCategoriesByIds,
  insertCategory,
  updateCategory,
  categoryFacets,
  districtFacets,
  listDestinations,
  findDestination,
  findCardsByIds,
  insertDestination,
  updateDestination,
  setStatus,
  replaceCategories,
  listMedia,
  attachMedia,
  detachMedia,
  listFaqs,
  replaceFaqs,
  listRelatedIds,
  replaceRelated,
  countExisting,
  nearPoint,
  search,
  suggest,
};
