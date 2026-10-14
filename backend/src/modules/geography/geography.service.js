'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const ApiError = require('../../core/errors/ApiError');
const { slugify } = require('../../core/utils/slug');
const auditService = require('../audit/audit.service');
const repository = require('./geography.repository');

const iso = (value) => (value ? value.toISOString() : null);

function toRegion(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    districtCount: row.district_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const toLocation = (row) => (row.latitude === null ? null : { latitude: row.latitude, longitude: row.longitude });

function toDistrict(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    location: toLocation(row),
    region: { id: row.region_id, name: row.region_name, slug: row.region_slug },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Compact reference embedded in other resources (destinations, search results). */
const toDistrictRef = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  region: { id: row.region_id, name: row.region_name, slug: row.region_slug },
});

async function requireRegion(db, id, options) {
  const row = await repository.findRegion(db, { id }, options);
  if (!row) throw ApiError.notFound('Region not found', 'REGION_NOT_FOUND');
  return row;
}

async function requireDistrict(db, id, options) {
  const row = await repository.findDistrict(db, { id }, options);
  if (!row) throw ApiError.notFound('District not found', 'DISTRICT_NOT_FOUND');
  return row;
}

// ---- Public ----

async function listPublicRegions() {
  return (await repository.listRegions(pool, { status: 'active' })).map(toRegion);
}

async function listPublicDistricts({ region }) {
  return (await repository.listDistricts(pool, { regionSlug: region, publicOnly: true })).map(toDistrict);
}

async function getPublicDistrict(slug) {
  const row = await repository.findDistrict(pool, { slug }, { publicOnly: true });
  if (!row) throw ApiError.notFound('District not found', 'DISTRICT_NOT_FOUND');
  return toDistrict(row);
}

// ---- Admin: regions ----

async function listRegions({ status }) {
  return (await repository.listRegions(pool, { status })).map(toRegion);
}

async function createRegion(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'region', async (client) => {
    const values = { ...input, slug: input.slug ?? slugify(input.name) };
    const entityId = await repository.insertRegion(client, values);
    return { entityId, action: 'regions.created', oldValues: null, newValues: values };
  });
  return toRegion(await requireRegion(pool, id));
}

async function updateRegion(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'region', async (client) => {
    const before = await requireRegion(client, id, { forUpdate: true });
    await repository.updateRegion(client, id, changes);
    return { entityId: id, action: 'regions.updated', ...diff(before, changes) };
  });
  return toRegion(await requireRegion(pool, id));
}

async function setRegionStatus(ctx, id, { status }) {
  await auditService.auditedTransaction(ctx, 'region', async (client) => {
    const before = await requireRegion(client, id, { forUpdate: true });
    await repository.updateRegion(client, id, { status });
    return { entityId: id, action: 'regions.status_changed', ...diff(before, { status }) };
  });
  return toRegion(await requireRegion(pool, id));
}

// ---- Admin: districts ----

async function listDistricts({ status, region }) {
  return (await repository.listDistricts(pool, { status, regionSlug: region })).map(toDistrict);
}

async function createDistrict(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'district', async (client) => {
    await requireRegion(client, input.regionId);
    const values = { ...input, slug: input.slug ?? slugify(input.name) };
    const entityId = await repository.insertDistrict(client, values);
    return { entityId, action: 'districts.created', oldValues: null, newValues: values };
  });
  return toDistrict(await requireDistrict(pool, id));
}

async function updateDistrict(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'district', async (client) => {
    const before = await requireDistrict(client, id, { forUpdate: true });
    if (changes.regionId) await requireRegion(client, changes.regionId);
    await repository.updateDistrict(client, id, changes);
    const current = { ...before, regionId: before.region_id, location: toLocation(before) };
    return { entityId: id, action: 'districts.updated', ...diff(current, changes) };
  });
  return toDistrict(await requireDistrict(pool, id));
}

async function setDistrictStatus(ctx, id, { status }) {
  await auditService.auditedTransaction(ctx, 'district', async (client) => {
    const before = await requireDistrict(client, id, { forUpdate: true });
    await repository.updateDistrict(client, id, { status });
    return { entityId: id, action: 'districts.status_changed', ...diff(before, { status }) };
  });
  return toDistrict(await requireDistrict(pool, id));
}

// ---- Interfaces for other modules ----

/** Resolves a public district slug to its id (404 when unknown/inactive). */
async function resolvePublicDistrictId(slug, db = pool) {
  const row = await repository.findDistrict(db, { slug }, { publicOnly: true });
  if (!row) throw ApiError.notFound('District not found', 'DISTRICT_NOT_FOUND');
  return row.id;
}

/** Ids of active districts in a region (empty when the region is unknown). */
async function districtIdsInRegion(regionSlug, db = pool) {
  return (await repository.listDistricts(db, { regionSlug, publicOnly: true })).map((row) => row.id);
}

/** Validates a district id for writes (any status). */
async function assertDistrictExists(db, id) {
  const row = await repository.findDistrict(db, { id });
  if (!row) throw ApiError.validation([{ location: 'body', path: 'districtId', message: 'district not found' }]);
}

async function getDistrictRefMap(ids, db = pool) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  return new Map((await repository.findDistrictsByIds(db, unique)).map((row) => [row.id, toDistrictRef(row)]));
}

async function searchDistricts({ q, limit }) {
  return (await repository.searchDistricts(pool, { q, limit })).map((row) => ({ ...toDistrict(row), rank: Number(row.rank) }));
}

module.exports = {
  listPublicRegions,
  listPublicDistricts,
  getPublicDistrict,
  listRegions,
  createRegion,
  updateRegion,
  setRegionStatus,
  listDistricts,
  createDistrict,
  updateDistrict,
  setDistrictStatus,
  resolvePublicDistrictId,
  districtIdsInRegion,
  assertDistrictExists,
  getDistrictRefMap,
  searchDistricts,
};
