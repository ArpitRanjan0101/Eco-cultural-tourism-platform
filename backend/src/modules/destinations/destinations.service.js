'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { slugify } = require('../../core/utils/slug');
const auditService = require('../audit/audit.service');
const geographyService = require('../geography/geography.service');
const mediaService = require('../media/media.service');
const repository = require('./destinations.repository');

const PUBLISHED = ['published'];
const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Destination not found', 'DESTINATION_NOT_FOUND');

const toImage = (media) => media && { id: media.id, url: media.url, altText: media.altText, width: media.width, height: media.height };

function toCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Resolves district refs and cover images for a batch of rows, then maps them to cards. */
async function toCards(rows, { admin = false } = {}) {
  const [districts, media] = await Promise.all([
    geographyService.getDistrictRefMap(rows.map((row) => row.district_id)),
    mediaService.getPublicMediaMap(rows.map((row) => row.cover_media_id)),
  ]);
  return rows.map((row) => {
    const card = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      summary: row.summary,
      featured: row.featured,
      entryFee: row.entry_fee,
      location: row.latitude === null ? null : { latitude: row.latitude, longitude: row.longitude },
      district: districts.get(row.district_id) ?? null,
      coverImage: toImage(media.get(row.cover_media_id)) ?? null,
      categories: row.categories
        .filter((category) => admin || category.status === 'active')
        .map(({ id, name, slug }) => ({ id, name, slug })),
    };
    if (row.distance_m !== undefined) card.distanceKm = Math.round(Number(row.distance_m) / 10) / 100;
    if (admin) Object.assign(card, { status: row.status, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
    return card;
  });
}

async function toDetail(row, { admin = false } = {}) {
  const [[card], mediaLinks, faqs, relatedIds] = await Promise.all([
    toCards([row], { admin }),
    repository.listMedia(pool, row.id),
    repository.listFaqs(pool, row.id),
    repository.listRelatedIds(pool, row.id),
  ]);
  const [mediaMap, relatedRows] = await Promise.all([
    mediaService.getPublicMediaMap(mediaLinks.map((link) => link.media_id)),
    relatedIds.length ? repository.findCardsByIds(pool, relatedIds, { publishedOnly: !admin }) : [],
  ]);
  const relatedCards = await toCards(relatedRows, { admin });
  const relatedOrder = new Map(relatedIds.map((id, index) => [id, index]));

  return {
    ...card,
    description: row.description,
    address: row.address,
    openingHours: row.opening_hours,
    bestTimeToVisit: row.best_time_to_visit,
    publishedAt: iso(row.published_at),
    gallery: mediaLinks
      .filter((link) => mediaMap.has(link.media_id))
      .map((link) => ({ ...toImage(mediaMap.get(link.media_id)), sortOrder: link.sort_order, isCover: link.is_cover })),
    faqs: faqs.map(({ question, answer }) => ({ question, answer })),
    related: relatedCards.sort((a, b) => relatedOrder.get(a.id) - relatedOrder.get(b.id)),
  };
}

async function requireDestination(db, id, options) {
  const row = await repository.findDestination(db, { id }, options);
  if (!row) throw notFound();
  return row;
}

async function requirePublished(slug) {
  const row = await repository.findDestination(pool, { slug });
  if (!row || row.status !== 'published') throw notFound();
  return row;
}

// ---- Public ----

async function listPublic({ district, region, category, featured, q, sort, page, limit }) {
  let districtIds;
  if (district) districtIds = [await geographyService.resolvePublicDistrictId(district)];
  else if (region) districtIds = await geographyService.districtIdsInRegion(region);
  const { rows, total } = await repository.listDestinations(pool, {
    statuses: PUBLISHED,
    districtIds,
    categorySlug: category,
    featured,
    q,
    sort,
    page,
    limit,
  });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function listFeatured({ limit }) {
  return (await listPublic({ featured: true, sort: '-publishedAt', page: 1, limit })).items;
}

async function listByDistrict(districtSlug, query) {
  return listPublic({ ...query, district: districtSlug });
}

async function getPublic(slug) {
  return toDetail(await requirePublished(slug));
}

async function nearby(slug, { radiusKm, page, limit }) {
  const origin = await requirePublished(slug);
  if (origin.latitude === null) return { items: [], meta: pageMeta({ page, limit }, 0) };
  return nearPoint({ latitude: origin.latitude, longitude: origin.longitude, radiusKm, page, limit, excludeId: origin.id });
}

async function listPublicCategories() {
  return (await repository.listCategories(pool, { status: 'active' })).map(toCategory);
}

// ---- Admin: destinations ----

async function adminList({ status, districtId, featured, q, sort, page, limit }) {
  const { rows, total } = await repository.listDestinations(pool, {
    statuses: status ? [status] : undefined,
    districtIds: districtId ? [districtId] : undefined,
    featured,
    q,
    sort,
    page,
    limit,
  });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function adminGet(id) {
  return toDetail(await requireDestination(pool, id), { admin: true });
}

function snapshot(row) {
  return {
    districtId: row.district_id,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    description: row.description,
    location: row.latitude === null ? null : { latitude: row.latitude, longitude: row.longitude },
    address: row.address,
    openingHours: row.opening_hours,
    bestTimeToVisit: row.best_time_to_visit,
    entryFee: row.entry_fee,
    featured: row.featured,
    status: row.status,
  };
}

async function create(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    await geographyService.assertDistrictExists(client, input.districtId);
    const values = { ...input, slug: input.slug ?? slugify(input.name) };
    const entityId = await repository.insertDestination(client, values);
    return { entityId, action: 'destinations.created', newValues: values };
  });
  return adminGet(id);
}

async function update(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    const before = await requireDestination(client, id, { forUpdate: true });
    if (changes.districtId) await geographyService.assertDistrictExists(client, changes.districtId);
    if (before.status === 'published') assertPublishable({ ...snapshot(before), ...changes }, null);
    await repository.updateDestination(client, id, changes);
    return { entityId: id, action: 'destinations.updated', ...diff(snapshot(before), changes) };
  });
  return adminGet(id);
}

/** A published destination needs complete public content and at least one category. */
function assertPublishable(values, categoryCount) {
  const missing = ['summary', 'description', 'location'].filter((field) => !values[field]);
  if (categoryCount === 0) missing.push('categories');
  if (missing.length > 0) {
    throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'Destination is incomplete for publishing', { missing });
  }
}

async function setStatus(ctx, id, { status }) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    const before = await requireDestination(client, id, { forUpdate: true });
    if (status === 'published') assertPublishable(snapshot(before), before.categories.length);
    await repository.setStatus(client, id, status);
    return { entityId: id, action: 'destinations.status_changed', ...diff({ status: before.status }, { status }) };
  });
  return adminGet(id);
}

async function archive(ctx, id) {
  await setStatus(ctx, id, { status: 'archived' });
}

async function setCategories(ctx, id, { categoryIds }) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    const before = await requireDestination(client, id, { forUpdate: true });
    const found = await repository.findCategoriesByIds(client, categoryIds);
    if (found.length !== categoryIds.length) {
      throw ApiError.validation([{ location: 'body', path: 'categoryIds', message: 'one or more categories do not exist' }]);
    }
    if (before.status === 'published' && categoryIds.length === 0) assertPublishable(snapshot(before), 0);
    await repository.replaceCategories(client, id, categoryIds);
    return {
      entityId: id,
      action: 'destinations.categories_changed',
      oldValues: { categoryIds: before.categories.map((c) => c.id) },
      newValues: { categoryIds },
    };
  });
  return adminGet(id);
}

async function attachMedia(ctx, id, { mediaId, sortOrder, isCover }) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    await requireDestination(client, id, { forUpdate: true });
    await mediaService.assertAttachable(client, ctx, mediaId, { purposes: ['content_image'] });
    await repository.attachMedia(client, id, { mediaId, sortOrder, isCover });
    return { entityId: id, action: 'destinations.media_attached', newValues: { mediaId, sortOrder, isCover } };
  });
  return adminGet(id);
}

async function detachMedia(ctx, id, mediaId) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    await requireDestination(client, id, { forUpdate: true });
    if (!(await repository.detachMedia(client, id, mediaId))) {
      throw ApiError.notFound('Media is not attached to this destination', 'MEDIA_NOT_ATTACHED');
    }
    return { entityId: id, action: 'destinations.media_detached', oldValues: { mediaId }, newValues: { mediaId: null } };
  });
}

async function replaceFaqs(ctx, id, { faqs }) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    await requireDestination(client, id, { forUpdate: true });
    const before = await repository.listFaqs(client, id);
    await repository.replaceFaqs(client, id, faqs);
    return { entityId: id, action: 'destinations.faqs_changed', oldValues: { count: before.length }, newValues: { count: faqs.length } };
  });
  return adminGet(id);
}

async function setRelated(ctx, id, { destinationIds }) {
  await auditService.auditedTransaction(ctx, 'destination', async (client) => {
    await requireDestination(client, id, { forUpdate: true });
    if (destinationIds.includes(id)) {
      throw ApiError.validation([{ location: 'body', path: 'destinationIds', message: 'a destination cannot be related to itself' }]);
    }
    if ((await repository.countExisting(client, destinationIds)) !== destinationIds.length) {
      throw ApiError.validation([{ location: 'body', path: 'destinationIds', message: 'one or more destinations do not exist' }]);
    }
    const before = await repository.listRelatedIds(client, id);
    await repository.replaceRelated(client, id, destinationIds);
    return { entityId: id, action: 'destinations.related_changed', oldValues: { destinationIds: before }, newValues: { destinationIds } };
  });
  return adminGet(id);
}

// ---- Admin: categories ----

async function listCategories({ status }) {
  return (await repository.listCategories(pool, { status })).map(toCategory);
}

async function requireCategory(db, id, options) {
  const row = await repository.findCategory(db, id, options);
  if (!row) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
  return row;
}

async function createCategory(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'destination_category', async (client) => {
    const values = { ...input, slug: input.slug ?? slugify(input.name) };
    return { entityId: await repository.insertCategory(client, values), action: 'destination_categories.created', newValues: values };
  });
  return toCategory(await requireCategory(pool, id));
}

async function updateCategory(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'destination_category', async (client) => {
    const before = await requireCategory(client, id, { forUpdate: true });
    await repository.updateCategory(client, id, changes);
    return { entityId: id, action: 'destination_categories.updated', ...diff(before, changes) };
  });
  return toCategory(await requireCategory(pool, id));
}

async function setCategoryStatus(ctx, id, { status }) {
  await auditService.auditedTransaction(ctx, 'destination_category', async (client) => {
    const before = await requireCategory(client, id, { forUpdate: true });
    await repository.updateCategory(client, id, { status });
    return { entityId: id, action: 'destination_categories.status_changed', ...diff(before, { status }) };
  });
  return toCategory(await requireCategory(pool, id));
}

// ---- Interfaces for search and CMS ----

async function nearPoint({ latitude, longitude, radiusKm, page, limit, excludeId = null }) {
  const { rows, total } = await repository.nearPoint(pool, {
    latitude,
    longitude,
    radiusMeters: radiusKm * 1000,
    limit,
    offset: (page - 1) * limit,
    excludeId,
  });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function search({ q, district, region, category, page, limit }) {
  let districtIds;
  if (district) districtIds = [await geographyService.resolvePublicDistrictId(district)];
  else if (region) districtIds = await geographyService.districtIdsInRegion(region);
  const { rows, total } = await repository.search(pool, { q, districtIds, categorySlug: category, limit, offset: (page - 1) * limit });
  const cards = await toCards(rows);
  return { items: cards.map((card, index) => ({ ...card, rank: Number(rows[index].rank) })), total };
}

async function suggest({ q, limit }) {
  return repository.suggest(pool, { q, limit });
}

async function facets() {
  const [categories, districts] = await Promise.all([repository.categoryFacets(pool), repository.districtFacets(pool)]);
  return {
    categories: categories.map((row) => ({ id: row.id, name: row.name, slug: row.slug, icon: row.icon, count: row.destination_count })),
    districtCounts: new Map(districts.map((row) => [row.district_id, row.destination_count])),
  };
}

/** Published destination cards in the given order (unpublished/unknown ids are skipped). */
async function getPublishedCards(ids) {
  if (ids.length === 0) return [];
  const cards = await toCards(await repository.findCardsByIds(pool, ids));
  const byId = new Map(cards.map((card) => [card.id, card]));
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

async function assertDestinationsExist(db, ids, path) {
  if (ids.length && (await repository.countExisting(db, ids)) !== new Set(ids).size) {
    throw ApiError.validation([{ location: 'body', path, message: 'one or more destinations do not exist' }]);
  }
}

async function assertCategoriesExist(db, ids, path) {
  if (ids.length && (await repository.findCategoriesByIds(db, ids)).length !== new Set(ids).size) {
    throw ApiError.validation([{ location: 'body', path, message: 'one or more categories do not exist' }]);
  }
}

async function getActiveCategoriesByIds(ids) {
  if (ids.length === 0) return [];
  const rows = (await repository.findCategoriesByIds(pool, ids)).filter((row) => row.status === 'active');
  const byId = new Map(rows.map((row) => [row.id, toCategory(row)]));
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

module.exports = {
  listPublic,
  listFeatured,
  listByDistrict,
  getPublic,
  nearby,
  listPublicCategories,
  adminList,
  adminGet,
  create,
  update,
  setStatus,
  archive,
  setCategories,
  attachMedia,
  detachMedia,
  replaceFaqs,
  setRelated,
  listCategories,
  createCategory,
  updateCategory,
  setCategoryStatus,
  nearPoint,
  search,
  suggest,
  facets,
  getPublishedCards,
  assertDestinationsExist,
  assertCategoriesExist,
  getActiveCategoriesByIds,
};
