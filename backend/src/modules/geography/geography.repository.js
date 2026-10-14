'use strict';

const { buildUpdate, geoPointExpression } = require('../../core/database/sql');
const { likePattern } = require('../../core/utils/pagination');

// ---- regions ----

const REGION_COLUMNS = `r.id, r.name, r.slug, r.description, r.status, r.created_at, r.updated_at,
  (SELECT count(*)::int FROM districts d WHERE d.region_id = r.id AND d.status = 'active') AS district_count`;

async function listRegions(db, { status } = {}) {
  const { rows } = await db.query(
    `SELECT ${REGION_COLUMNS} FROM regions r WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.name`,
    [status ?? null],
  );
  return rows;
}

async function findRegion(db, { id, slug }, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${REGION_COLUMNS} FROM regions r WHERE ${id ? 'r.id = $1' : 'r.slug = $1'} ${forUpdate ? 'FOR UPDATE OF r' : ''}`,
    [id ?? slug],
  );
  return rows[0] ?? null;
}

async function insertRegion(db, { name, slug, description }) {
  const { rows } = await db.query('INSERT INTO regions (name, slug, description) VALUES ($1, $2, $3) RETURNING id', [
    name,
    slug,
    description ?? null,
  ]);
  return rows[0].id;
}

async function updateRegion(db, id, fields) {
  const query = buildUpdate('regions', id, fields, { name: 'name', slug: 'slug', description: 'description', status: 'status' });
  if (query) await db.query(query.text, query.values);
}

// ---- districts ----

const DISTRICT_COLUMNS = `d.id, d.name, d.slug, d.description, d.status, d.region_id, d.created_at, d.updated_at,
  r.name AS region_name, r.slug AS region_slug,
  ST_Y(d.location::geometry) AS latitude, ST_X(d.location::geometry) AS longitude`;

/** publicOnly: active district inside an active region. */
async function listDistricts(db, { status, regionSlug, publicOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${DISTRICT_COLUMNS} FROM districts d JOIN regions r ON r.id = d.region_id
     WHERE ($1::text IS NULL OR d.status = $1)
       AND ($2::text IS NULL OR r.slug = $2)
       AND (NOT $3 OR (d.status = 'active' AND r.status = 'active'))
     ORDER BY d.name`,
    [status ?? null, regionSlug ?? null, publicOnly],
  );
  return rows;
}

async function findDistrict(db, { id, slug }, { forUpdate = false, publicOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${DISTRICT_COLUMNS} FROM districts d JOIN regions r ON r.id = d.region_id
     WHERE ${id ? 'd.id = $1' : 'd.slug = $1'}
       ${publicOnly ? "AND d.status = 'active' AND r.status = 'active'" : ''}
     ${forUpdate ? 'FOR UPDATE OF d' : ''}`,
    [id ?? slug],
  );
  return rows[0] ?? null;
}

async function findDistrictsByIds(db, ids) {
  const { rows } = await db.query(
    `SELECT ${DISTRICT_COLUMNS} FROM districts d JOIN regions r ON r.id = d.region_id WHERE d.id = ANY($1::uuid[])`,
    [ids],
  );
  return rows;
}

async function insertDistrict(db, { regionId, name, slug, description, location }) {
  const { rows } = await db.query(
    `INSERT INTO districts (region_id, name, slug, description, location)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography END)
     RETURNING id`,
    [regionId, name, slug, description ?? null, location?.longitude ?? null, location?.latitude ?? null],
  );
  return rows[0].id;
}

async function updateDistrict(db, id, fields) {
  const query = buildUpdate(
    'districts',
    id,
    fields,
    { regionId: 'region_id', name: 'name', slug: 'slug', description: 'description', location: 'location', status: 'status' },
    { location: geoPointExpression },
  );
  if (query) await db.query(query.text, query.values);
}

async function searchDistricts(db, { q, limit }) {
  const { rows } = await db.query(
    `SELECT ${DISTRICT_COLUMNS}, similarity(d.name, $1) AS rank
     FROM districts d JOIN regions r ON r.id = d.region_id
     WHERE d.status = 'active' AND r.status = 'active' AND (d.name ILIKE $3 OR d.name % $1)
     ORDER BY rank DESC, d.name
     LIMIT $2`,
    [q, limit, likePattern(q)],
  );
  return rows;
}

module.exports = {
  listRegions,
  findRegion,
  insertRegion,
  updateRegion,
  listDistricts,
  findDistrict,
  findDistrictsByIds,
  insertDistrict,
  updateDistrict,
  searchDistricts,
};
