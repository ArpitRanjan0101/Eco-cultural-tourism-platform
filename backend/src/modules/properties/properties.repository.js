'use strict';

const { buildUpdate, geoPointExpression } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

// Public visibility: published property of an approved partner organisation.
const PUBLIC = `p.status = 'published' AND EXISTS (SELECT 1 FROM partners pa WHERE pa.id = p.partner_id AND pa.status = 'approved')`;

const COLUMNS = `p.id, p.partner_id, p.district_id, p.destination_id, p.name, p.slug, p.property_type, p.description,
  p.address, p.contact_phone, to_char(p.check_in_time, 'HH24:MI') AS check_in_time,
  to_char(p.check_out_time, 'HH24:MI') AS check_out_time, p.booking_mode, p.status, p.created_at, p.updated_at,
  ST_Y(p.geo_location::geometry) AS latitude, ST_X(p.geo_location::geometry) AS longitude,
  (SELECT pm.media_id FROM property_media pm WHERE pm.property_id = p.id ORDER BY pm.is_cover DESC, pm.sort_order, pm.media_id LIMIT 1) AS cover_media_id,
  (SELECT min(rt.base_price) FROM room_types rt WHERE rt.property_id = p.id AND rt.status = 'active') AS starting_price`;

const SORT_COLUMNS = { name: 'p.name', startingPrice: 'starting_price', createdAt: 'p.created_at' };

function filters({ publicOnly, partnerId, statuses, districtIds, destinationId, near, propertyType, q }) {
  const conditions = [];
  const values = [];
  const add = (sql, ...params) => {
    let text = sql;
    for (const param of params) {
      values.push(param);
      text = text.replace('?', `$${values.length}`);
    }
    conditions.push(text);
  };
  if (publicOnly) conditions.push(PUBLIC);
  if (partnerId) add('p.partner_id = ?', partnerId);
  if (statuses) add('p.status = ANY(?::text[])', statuses);
  if (districtIds) add('p.district_id = ANY(?::uuid[])', districtIds);
  if (propertyType) add('p.property_type = ?', propertyType);
  if (q) add('(p.name ILIKE ? OR p.name % ?)', likePattern(q), q);
  if (destinationId && near) {
    add('(p.destination_id = ? OR ST_DWithin(p.geo_location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?))', destinationId, near.longitude, near.latitude, near.radiusMeters);
  } else if (destinationId) {
    add('p.destination_id = ?', destinationId);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function list(db, query) {
  const { where, values } = filters(query);
  const { limit, offset } = pageWindow(query);
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS} FROM properties p ${where}
       ORDER BY ${orderBy(query.sort, SORT_COLUMNS, 'p.id')} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM properties p ${where}`, values),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function find(db, { id, slug }, { forUpdate = false, publicOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM properties p WHERE ${id ? 'p.id = $1' : 'p.slug = $1'} ${publicOnly ? `AND ${PUBLIC}` : ''}
     ${forUpdate ? 'FOR UPDATE OF p' : ''}`,
    [id ?? slug],
  );
  return rows[0] ?? null;
}

async function insert(db, input) {
  const { rows } = await db.query(
    `INSERT INTO properties (partner_id, district_id, destination_id, name, slug, property_type, description, address,
                             geo_location, contact_phone, check_in_time, check_out_time, booking_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             CASE WHEN $9::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography END,
             $11, COALESCE($12::time, '12:00'), COALESCE($13::time, '11:00'), $14)
     RETURNING id`,
    [
      input.partnerId,
      input.districtId,
      input.destinationId ?? null,
      input.name,
      input.slug,
      input.propertyType,
      input.description ?? null,
      input.address ?? null,
      input.location?.longitude ?? null,
      input.location?.latitude ?? null,
      input.contactPhone ?? null,
      input.checkInTime ?? null,
      input.checkOutTime ?? null,
      input.bookingMode ?? 'instant',
    ],
  );
  return rows[0].id;
}

async function update(db, id, fields) {
  const query = buildUpdate(
    'properties',
    id,
    fields,
    {
      districtId: 'district_id',
      destinationId: 'destination_id',
      name: 'name',
      slug: 'slug',
      propertyType: 'property_type',
      description: 'description',
      address: 'address',
      location: 'geo_location',
      contactPhone: 'contact_phone',
      checkInTime: 'check_in_time',
      checkOutTime: 'check_out_time',
      bookingMode: 'booking_mode',
      status: 'status',
    },
    { location: geoPointExpression },
  );
  if (query) await db.query(query.text, query.values);
}

async function nearPoint(db, { latitude, longitude, radiusMeters, limit, offset }) {
  const point = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';
  const where = `${PUBLIC} AND p.geo_location IS NOT NULL AND ST_DWithin(p.geo_location, ${point}, $3)`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS}, ST_Distance(p.geo_location, ${point}) AS distance_m FROM properties p
       WHERE ${where} ORDER BY distance_m, p.id LIMIT $4 OFFSET $5`,
      [longitude, latitude, radiusMeters, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM properties p WHERE ${where}`, [longitude, latitude, radiusMeters]),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function search(db, { q, limit }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, similarity(p.name, $1) + CASE WHEN p.name ILIKE $2 THEN 0.5 ELSE 0 END AS rank
     FROM properties p WHERE ${PUBLIC} AND (p.name ILIKE $2 OR p.name % $1)
     ORDER BY rank DESC, p.name LIMIT $3`,
    [q, likePattern(q), limit],
  );
  return rows;
}

// ---- amenities ----

const AMENITY_COLUMNS = 'a.id, a.code, a.name, a.category, a.icon, a.created_at, a.updated_at';

async function listAmenities(db) {
  const { rows } = await db.query(`SELECT ${AMENITY_COLUMNS} FROM amenities a ORDER BY a.category, a.name`);
  return rows;
}

async function findAmenity(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${AMENITY_COLUMNS} FROM amenities a WHERE a.id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function countAmenities(db, ids) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM amenities WHERE id = ANY($1::uuid[])', [ids]);
  return rows[0].n;
}

async function insertAmenity(db, { code, name, category, icon }) {
  const { rows } = await db.query('INSERT INTO amenities (code, name, category, icon) VALUES ($1, $2, $3, $4) RETURNING id', [
    code,
    name,
    category,
    icon ?? null,
  ]);
  return rows[0].id;
}

async function updateAmenity(db, id, fields) {
  const query = buildUpdate('amenities', id, fields, { name: 'name', category: 'category', icon: 'icon' });
  if (query) await db.query(query.text, query.values);
}

/** Amenities linked to properties or room types: rows of { owner_id, ...amenity }. */
async function linkedAmenities(db, table, ownerIds) {
  const owner = table === 'property_amenities' ? 'property_id' : 'room_type_id';
  const { rows } = await db.query(
    `SELECT l.${owner} AS owner_id, ${AMENITY_COLUMNS} FROM ${table} l JOIN amenities a ON a.id = l.amenity_id
     WHERE l.${owner} = ANY($1::uuid[]) ORDER BY a.category, a.name`,
    [ownerIds],
  );
  return rows;
}

async function replaceAmenities(db, table, ownerId, amenityIds) {
  const owner = table === 'property_amenities' ? 'property_id' : 'room_type_id';
  await db.query(`DELETE FROM ${table} WHERE ${owner} = $1`, [ownerId]);
  await db.query(`INSERT INTO ${table} (${owner}, amenity_id) SELECT $1, unnest($2::uuid[])`, [ownerId, amenityIds]);
}

// ---- policies ----

async function findPolicy(db, propertyId) {
  const { rows } = await db.query(
    'SELECT cancellation_policy, child_policy, house_rules, identification_policy, updated_at FROM property_policies WHERE property_id = $1',
    [propertyId],
  );
  return rows[0] ?? null;
}

async function upsertPolicy(db, propertyId, policy) {
  await db.query(
    `INSERT INTO property_policies (property_id, cancellation_policy, child_policy, house_rules, identification_policy)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (property_id) DO UPDATE SET cancellation_policy = EXCLUDED.cancellation_policy, child_policy = EXCLUDED.child_policy,
       house_rules = EXCLUDED.house_rules, identification_policy = EXCLUDED.identification_policy`,
    [propertyId, policy.cancellationPolicy, policy.childPolicy ?? null, policy.houseRules ?? null, policy.identificationPolicy ?? null],
  );
}

// ---- room types ----

const ROOM_COLUMNS = `rt.id, rt.property_id, rt.name, rt.description, rt.max_adults, rt.max_children, rt.total_units,
  rt.base_price, rt.status, rt.created_at, rt.updated_at`;

async function listRooms(db, propertyIds, { activeOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${ROOM_COLUMNS} FROM room_types rt WHERE rt.property_id = ANY($1::uuid[]) ${activeOnly ? "AND rt.status = 'active'" : ''}
     ORDER BY rt.base_price, rt.name`,
    [propertyIds],
  );
  return rows;
}

/** Room type joined with its property's partner, for ownership checks. */
async function findRoom(db, roomId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${ROOM_COLUMNS}, p.partner_id FROM room_types rt JOIN properties p ON p.id = rt.property_id
     WHERE rt.id = $1 ${forUpdate ? 'FOR UPDATE OF rt' : ''}`,
    [roomId],
  );
  return rows[0] ?? null;
}

async function insertRoom(db, propertyId, room) {
  const { rows } = await db.query(
    `INSERT INTO room_types (property_id, name, description, max_adults, max_children, total_units, base_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [propertyId, room.name, room.description ?? null, room.maxAdults, room.maxChildren ?? 0, room.totalUnits, room.basePrice],
  );
  return rows[0].id;
}

async function updateRoom(db, roomId, fields) {
  const query = buildUpdate('room_types', roomId, fields, {
    name: 'name',
    description: 'description',
    maxAdults: 'max_adults',
    maxChildren: 'max_children',
    totalUnits: 'total_units',
    basePrice: 'base_price',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

/** Keeps date overrides consistent when the physical unit count shrinks. */
async function clampInventory(db, roomId, totalUnits) {
  await db.query(
    `UPDATE room_inventory SET total_units = LEAST(total_units, $2), blocked_units = LEAST(blocked_units, LEAST(total_units, $2))
     WHERE room_type_id = $1 AND total_units > $2`,
    [roomId, totalUnits],
  );
}

// ---- inventory and rates ----

async function upsertInventory(db, roomId, { from, to, totalUnits, blockedUnits, defaultTotal }) {
  await db.query(
    `INSERT INTO room_inventory (room_type_id, stay_date, total_units, blocked_units)
     SELECT $1, d::date, COALESCE($4::int, $5::int), COALESCE($6::int, 0) FROM generate_series($2::date, $3::date, interval '1 day') AS d
     ON CONFLICT (room_type_id, stay_date) DO UPDATE SET
       total_units = COALESCE($4::int, room_inventory.total_units),
       blocked_units = COALESCE($6::int, room_inventory.blocked_units)`,
    [roomId, from, to, totalUnits ?? null, defaultTotal, blockedUnits ?? null],
  );
}

async function upsertRates(db, roomId, { from, to, nightlyPrice }) {
  await db.query(
    `INSERT INTO room_rates (room_type_id, stay_date, nightly_price)
     SELECT $1, d::date, $4 FROM generate_series($2::date, $3::date, interval '1 day') AS d
     ON CONFLICT (room_type_id, stay_date) DO UPDATE SET nightly_price = EXCLUDED.nightly_price`,
    [roomId, from, to, nightlyPrice],
  );
}

/**
 * Per room type and night in [from, to): physical units, blocked units and price,
 * falling back to the room type defaults where no date override exists.
 */
async function nightlyGrid(db, roomIds, from, to) {
  const { rows } = await db.query(
    `SELECT rt.id AS room_type_id, to_char(d, 'YYYY-MM-DD') AS stay_date,
            COALESCE(ri.total_units, rt.total_units) AS total_units,
            COALESCE(ri.blocked_units, 0) AS blocked_units,
            COALESCE(rr.nightly_price, rt.base_price) AS nightly_price,
            (ri.id IS NOT NULL) AS has_inventory_override, (rr.id IS NOT NULL) AS has_rate_override
     FROM room_types rt
     CROSS JOIN generate_series($2::date, $3::date - 1, interval '1 day') AS d
     LEFT JOIN room_inventory ri ON ri.room_type_id = rt.id AND ri.stay_date = d::date
     LEFT JOIN room_rates rr ON rr.room_type_id = rt.id AND rr.stay_date = d::date
     WHERE rt.id = ANY($1::uuid[])
     ORDER BY rt.id, d`,
    [roomIds, from, to],
  );
  return rows;
}

module.exports = {
  SORT_COLUMNS,
  list,
  find,
  insert,
  update,
  nearPoint,
  search,
  listAmenities,
  findAmenity,
  countAmenities,
  insertAmenity,
  updateAmenity,
  linkedAmenities,
  replaceAmenities,
  findPolicy,
  upsertPolicy,
  listRooms,
  findRoom,
  insertRoom,
  updateRoom,
  clampInventory,
  upsertInventory,
  upsertRates,
  nightlyGrid,
};
