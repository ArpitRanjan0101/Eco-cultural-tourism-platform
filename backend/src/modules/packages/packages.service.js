'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const mediaLinks = require('../../core/database/mediaLinks');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { slugify } = require('../../core/utils/slug');
const { todayLocal, addDays } = require('../../core/utils/dates');
const { assertAdminTransition, statusAfterPartnerEdit } = require('../../core/utils/moderation');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const destinationsService = require('../destinations/destinations.service');
const partnersService = require('../partners/partners.service');
const repository = require('./packages.repository');

const CURRENCY = 'INR';

const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Package not found', 'PACKAGE_NOT_FOUND');
const departureNotFound = () => ApiError.notFound('Departure not found', 'DEPARTURE_NOT_FOUND');
const invalid = (path, message) => ApiError.validation([{ location: 'body', path, message }]);

const toDeparture = (row) => ({
  id: row.id,
  packageId: row.package_id,
  startDate: row.start_date,
  endDate: row.end_date,
  totalSeats: row.total_seats,
  pricePerPerson: row.price_per_person,
  currency: CURRENCY,
  status: row.status,
});

async function toCards(rows, { admin = false } = {}) {
  const [covers, partners] = await Promise.all([
    mediaService.getPublicMediaMap(rows.map((row) => row.cover_media_id)),
    partnersService.getPartnerRefMap(rows.map((row) => row.partner_id)),
  ]);
  return rows.map((row) => {
    const cover = covers.get(row.cover_media_id);
    const card = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      summary: row.summary,
      durationDays: row.duration_days,
      durationNights: row.duration_nights,
      minTravelers: row.min_travelers,
      maxTravelers: row.max_travelers,
      bookingMode: row.booking_mode,
      startingPrice: row.starting_price,
      currency: CURRENCY,
      nextDeparture: row.next_departure,
      coverImage: cover ? { id: cover.id, url: cover.url, altText: cover.altText, width: cover.width, height: cover.height } : null,
      partner: partners.has(row.partner_id) ? { id: row.partner_id, businessName: partners.get(row.partner_id).businessName } : null,
    };
    if (admin) Object.assign(card, { status: row.status, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
    return card;
  });
}

async function toDetail(row, { admin = false } = {}) {
  const [[card], destinationIds, days, inclusions, galleries, departures] = await Promise.all([
    toCards([row], { admin }),
    repository.destinationIds(pool, row.id),
    repository.itinerary(pool, row.id),
    repository.inclusions(pool, row.id),
    mediaService.buildGalleries(await mediaLinks.listLinks(pool, 'package_media', [row.id])),
    repository.listDepartures(pool, row.id, { from: todayLocal(), scheduledOnly: !admin }),
  ]);
  const itemDestinationIds = days.flatMap((day) => day.items.map((item) => item.destinationId));
  const refs = await destinationsService.getDestinationRefMap([...destinationIds, ...itemDestinationIds]);
  return {
    ...card,
    description: row.description,
    destinations: destinationIds.map((id) => refs.get(id)).filter(Boolean),
    itinerary: days.map((day) => ({
      dayNumber: day.day_number,
      title: day.title,
      description: day.description,
      items: day.items.map((item) => ({ activityTitle: item.activityTitle, description: item.description, destination: refs.get(item.destinationId) ?? null })),
    })),
    inclusions: inclusions.filter((i) => i.inclusion_type === 'included').map((i) => i.description),
    exclusions: inclusions.filter((i) => i.inclusion_type === 'excluded').map((i) => i.description),
    gallery: galleries.get(row.id) ?? [],
    upcomingDepartures: departures.map(toDeparture),
  };
}

async function requireOwned(db, ctx, id, options) {
  const row = await repository.find(db, { id }, options);
  if (!row || row.partner_id !== ctx.partner.partnerId) throw notFound();
  return row;
}

async function requirePublic(selector) {
  const row = await repository.find(pool, selector, { publicOnly: true });
  if (!row) throw notFound();
  return row;
}

async function getMine(ctx, id) {
  return toDetail(await requireOwned(pool, ctx, id), { admin: true });
}

/** Wraps a partner content edit: ownership lock, audit and rejected -> pending_review resubmission. */
async function partnerEdit(ctx, id, action, mutate) {
  await auditService.auditedTransaction(ctx, 'package', async (client) => {
    const before = await requireOwned(client, ctx, id, { forUpdate: true });
    const values = await mutate(client, before);
    const status = statusAfterPartnerEdit(before.status);
    if (status !== before.status) await repository.update(client, id, { status });
    return { entityId: id, action, newValues: values };
  });
  return getMine(ctx, id);
}

// ---- Public ----

async function listPublic({ destination, q, sort, page, limit }) {
  const destinationId = destination ? (await destinationsService.resolvePublished(destination)).id : undefined;
  const { rows, total } = await repository.list(pool, { publicOnly: true, destinationId, q, sort, page, limit });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function getPublic(slug) {
  return toDetail(await requirePublic({ slug }));
}

async function listPublicDepartures(id) {
  await requirePublic({ id });
  return (await repository.listDepartures(pool, id, { from: todayLocal(), scheduledOnly: true })).map(toDeparture);
}

/** Seats per upcoming departure; the booking engine (Phase 5) subtracts held/booked seats under row locks. */
async function availability(id, { travelers }) {
  const pkg = await requirePublic({ id });
  const withinGroupLimits = travelers >= pkg.min_travelers && travelers <= pkg.max_travelers;
  const departures = await repository.listDepartures(pool, id, { from: todayLocal(), scheduledOnly: true });
  return {
    packageId: id,
    travelers,
    withinGroupLimits,
    departures: departures.map((row) => ({ ...toDeparture(row), seatsAvailable: row.total_seats, available: withinGroupLimits && row.total_seats >= travelers })),
  };
}

// ---- Partner ----

async function listMine(ctx, { status, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { partnerId: ctx.partner.partnerId, statuses: status ? [status] : undefined, sort, page, limit });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function create(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'package', async (client) => {
    const values = { ...input, slug: input.slug ?? slugify(input.name), partnerId: ctx.partner.partnerId };
    return { entityId: await repository.insert(client, values), action: 'packages.created', newValues: values };
  });
  return getMine(ctx, id);
}

async function update(ctx, id, changes) {
  return partnerEdit(ctx, id, 'packages.updated', async (client, before) => {
    const next = {
      durationDays: changes.durationDays ?? before.duration_days,
      durationNights: changes.durationNights ?? before.duration_nights,
      minTravelers: changes.minTravelers ?? before.min_travelers,
      maxTravelers: changes.maxTravelers ?? before.max_travelers,
    };
    if (next.durationNights < next.durationDays - 1 || next.durationNights > next.durationDays) {
      throw invalid('durationNights', 'durationNights must equal durationDays or durationDays - 1');
    }
    if (next.maxTravelers < next.minTravelers) throw invalid('maxTravelers', 'maxTravelers must be >= minTravelers');
    if (before.status === 'published' && (changes.summary === null || changes.description === null)) {
      throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'A published package needs a summary and description');
    }
    await repository.update(client, id, changes);
    return diff({ name: before.name, durationDays: before.duration_days }, changes).newValues;
  });
}

async function setDestinations(ctx, id, { destinationIds }) {
  return partnerEdit(ctx, id, 'packages.destinations_changed', async (client) => {
    await destinationsService.assertDestinationsExist(client, destinationIds, 'destinationIds');
    await repository.replaceDestinations(client, id, destinationIds);
    return { destinationIds };
  });
}

async function setItinerary(ctx, id, { days }) {
  return partnerEdit(ctx, id, 'packages.itinerary_changed', async (client, before) => {
    days.forEach((day, index) => {
      if (day.dayNumber > before.duration_days) throw invalid(`days.${index}.dayNumber`, `package lasts ${before.duration_days} day(s)`);
    });
    const ids = days.flatMap((day) => day.items.map((item) => item.destinationId)).filter(Boolean);
    await destinationsService.assertDestinationsExist(client, [...new Set(ids)], 'days');
    await repository.replaceItinerary(client, id, days);
    return { days: days.length };
  });
}

async function setInclusions(ctx, id, { items }) {
  return partnerEdit(ctx, id, 'packages.inclusions_changed', async (client) => {
    await repository.replaceInclusions(client, id, items);
    return { items: items.length };
  });
}

async function attachMedia(ctx, id, link) {
  return partnerEdit(ctx, id, 'packages.media_attached', async (client) => {
    await mediaService.assertAttachable(client, ctx, link.mediaId, { purposes: ['supply_image'] });
    await mediaLinks.attach(client, 'package_media', id, link);
    return link;
  });
}

async function detachMedia(ctx, id, mediaId) {
  await partnerEdit(ctx, id, 'packages.media_detached', async (client) => {
    if (!(await mediaLinks.detach(client, 'package_media', id, mediaId))) throw ApiError.notFound('Media is not attached', 'MEDIA_NOT_ATTACHED');
    return { mediaId: null };
  });
}

/** end_date is derived from the package duration, so departures always match the itinerary length. */
async function createDeparture(ctx, id, input) {
  if (input.startDate <= todayLocal()) throw invalid('startDate', 'departures must start after today');
  let departureId;
  await auditService.auditedTransaction(ctx, 'package', async (client) => {
    const pkg = await requireOwned(client, ctx, id, { forUpdate: true });
    if (input.totalSeats < pkg.min_travelers) throw invalid('totalSeats', 'seats cannot be below the minimum group size');
    try {
      departureId = await repository.insertDeparture(client, id, { ...input, endDate: addDays(input.startDate, pkg.duration_days - 1) });
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('A departure already starts on this date', 'DEPARTURE_EXISTS');
      throw err;
    }
    await repository.refreshStartingPrice(client, id);
    return { entityId: id, action: 'packages.departure_created', newValues: { departureId, ...input } };
  });
  return toDeparture(await repository.findDeparture(pool, departureId));
}

async function updateDeparture(ctx, id, departureId, changes) {
  await auditService.auditedTransaction(ctx, 'package', async (client) => {
    const departure = await repository.findDeparture(client, departureId, { forUpdate: true });
    if (!departure || departure.partner_id !== ctx.partner.partnerId || departure.package_id !== id) throw departureNotFound();
    if (departure.start_date <= todayLocal()) throw ApiError.conflict('Departed or same-day departures cannot be changed', 'DEPARTURE_STARTED');
    const updates = { ...changes };
    if (changes.startDate) {
      if (changes.startDate <= todayLocal()) throw invalid('startDate', 'departures must start after today');
      updates.endDate = addDays(changes.startDate, departure.duration_days - 1);
    }
    try {
      await repository.updateDeparture(client, departureId, updates);
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('A departure already starts on this date', 'DEPARTURE_EXISTS');
      throw err;
    }
    await repository.refreshStartingPrice(client, id);
    return { entityId: id, action: 'packages.departure_updated', oldValues: toDeparture(departure), newValues: { departureId, ...updates } };
  });
  return toDeparture(await repository.findDeparture(pool, departureId));
}

// ---- Admin ----

async function adminList({ status, partnerId, q, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { statuses: status ? [status] : undefined, partnerId, q, sort, page, limit });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function setStatus(ctx, id, { status, reason }) {
  await auditService.auditedTransaction(ctx, 'package', async (client) => {
    const before = await repository.find(client, { id }, { forUpdate: true });
    if (!before) throw notFound();
    assertAdminTransition(before.status, status);
    if (status === 'published') {
      const missing = ['summary', 'description'].filter((field) => !before[field]);
      if ((await repository.destinationIds(client, id)).length === 0) missing.push('destinations');
      if ((await repository.itinerary(client, id)).length === 0) missing.push('itinerary');
      if (missing.length) throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'Package is incomplete for publishing', { missing });
    }
    await repository.update(client, id, { status });
    return { entityId: id, action: 'packages.status_changed', oldValues: { status: before.status }, newValues: { status, reason: reason ?? null } };
  });
  return toDetail(await repository.find(pool, { id }), { admin: true });
}

async function search({ q, limit }) {
  const rows = await repository.search(pool, { q, limit });
  const cards = await toCards(rows);
  return cards.map((card, index) => ({ ...card, rank: Number(rows[index].rank) }));
}

module.exports = {
  listPublic,
  getPublic,
  listPublicDepartures,
  availability,
  listMine,
  create,
  update,
  setDestinations,
  setItinerary,
  setInclusions,
  attachMedia,
  detachMedia,
  createDeparture,
  updateDeparture,
  adminList,
  setStatus,
  search,
};
