'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { todayLocal, daysBetween, addDays } = require('../../core/utils/dates');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const destinationsService = require('../destinations/destinations.service');
const partnersService = require('../partners/partners.service');
const allocationsService = require('../bookings/allocations.service');
const { localDateTime } = require('../../core/utils/dates');
const repository = require('./guides.repository');

const CURRENCY = 'INR';
const MAX_AVAILABILITY_WINDOW_DAYS = 92;
const PUBLIC_AVAILABILITY_DEFAULT_DAYS = 14;

const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Guide not found', 'GUIDE_NOT_FOUND');
const invalid = (path, message, location = 'body') => ApiError.validation([{ location, path, message }]);

function toService(row) {
  return {
    id: row.id,
    guideId: row.guide_id,
    title: row.title,
    durationMinutes: row.duration_minutes,
    price: row.price,
    currency: CURRENCY,
    maxGroupSize: row.max_group_size,
    description: row.description,
    bookingMode: row.booking_mode,
    status: row.status,
  };
}

async function toCards(rows, { admin = false } = {}) {
  const ids = rows.map((row) => row.id);
  const [languages, destinationLinks, photos, partners] = await Promise.all([
    ids.length ? repository.languagesFor(pool, ids) : [],
    ids.length ? repository.destinationIdsFor(pool, ids) : [],
    mediaService.getPublicMediaMap(rows.map((row) => row.photo_media_id)),
    partnersService.getPartnerRefMap(rows.map((row) => row.partner_id)),
  ]);
  const destinations = await destinationsService.getDestinationRefMap(destinationLinks.map((link) => link.destination_id));
  return rows.map((row) => {
    const photo = photos.get(row.photo_media_id);
    const card = {
      id: row.id,
      displayName: row.display_name,
      yearsExperience: row.years_experience,
      startingPrice: row.starting_price,
      currency: CURRENCY,
      photo: photo ? { id: photo.id, url: photo.url, altText: photo.altText, width: photo.width, height: photo.height } : null,
      languages: languages.filter((l) => l.owner_id === row.id).map(({ id, code, name }) => ({ id, code, name })),
      destinations: destinationLinks.filter((l) => l.owner_id === row.id).map((l) => destinations.get(l.destination_id)).filter(Boolean),
      partner: partners.has(row.partner_id) ? { id: row.partner_id, businessName: partners.get(row.partner_id).businessName } : null,
    };
    if (admin) Object.assign(card, { userId: row.user_id, verificationStatus: row.verification_status, status: row.status, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
    return card;
  });
}

async function toDetail(row, { admin = false } = {}) {
  const [[card], services] = await Promise.all([toCards([row], { admin }), repository.listServices(pool, [row.id], { activeOnly: !admin })]);
  return { ...card, bio: row.bio, services: services.map(toService) };
}

async function requireOwned(db, ctx, id, options) {
  const row = await repository.find(db, id, options);
  if (!row || row.partner_id !== ctx.partner.partnerId) throw notFound();
  return row;
}

async function requirePublic(id) {
  const row = await repository.find(pool, id, { publicOnly: true });
  if (!row) throw notFound();
  return row;
}

/** A linked guide account must belong to the organisation; photos must be the partner's supply images. */
async function validateGuideInput(db, ctx, input) {
  if (input.userId && !(await partnersService.isMember(ctx.partner.partnerId, input.userId, db))) {
    throw invalid('userId', 'the user must be a member of your partner organisation');
  }
  if (input.photoMediaId) await mediaService.assertAttachable(db, ctx, input.photoMediaId, { purposes: ['supply_image'] });
}

// ---- Public ----

async function listPublic({ destination, language, q, sort, page, limit }) {
  const destinationId = destination ? (await destinationsService.resolvePublished(destination)).id : undefined;
  const { rows, total } = await repository.list(pool, { publicOnly: true, destinationId, languageCode: language, q, sort, page, limit });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function listForDestination(slug, query) {
  return listPublic({ ...query, destination: slug });
}

async function getPublic(id) {
  return toDetail(await requirePublic(id));
}

async function listPublicServices(id) {
  await requirePublic(id);
  return (await repository.listServices(pool, [id], { activeOnly: true })).map(toService);
}

const toHHMM = (instant) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);

/** Splits each window around busy ranges, returning the free sub-windows (same-day, local times). */
function subtractBusy(windows, busy) {
  const free = [];
  for (const window of windows) {
    let cursor = localDateTime(window.service_date, window.start_time);
    const windowEnd = localDateTime(window.service_date, window.end_time);
    for (const range of busy) {
      if (range.end_at <= cursor || range.start_at >= windowEnd) continue;
      if (range.start_at > cursor) free.push({ date: window.service_date, startTime: toHHMM(cursor), endTime: toHHMM(range.start_at) });
      if (range.end_at > cursor) cursor = range.end_at;
    }
    if (cursor < windowEnd) free.push({ date: window.service_date, startTime: toHHMM(cursor), endTime: window.end_time });
  }
  return free;
}

/** Published availability windows minus time already held or booked. */
async function publicAvailability(id, { from, to }) {
  await requirePublic(id);
  const start = from ?? todayLocal();
  const end = to ?? addDays(start, PUBLIC_AVAILABILITY_DEFAULT_DAYS);
  if (start < todayLocal()) throw invalid('from', 'from cannot be in the past', 'query');
  if (daysBetween(start, end) < 0 || daysBetween(start, end) > MAX_AVAILABILITY_WINDOW_DAYS) {
    throw invalid('to', `window must be 0-${MAX_AVAILABILITY_WINDOW_DAYS} days`, 'query');
  }
  const [windows, busy] = await Promise.all([
    repository.listAvailability(pool, id, { from: start, to: end, availableOnly: true }),
    allocationsService.guideBusyRanges(id, localDateTime(start), localDateTime(addDays(end, 1))),
  ]);
  const now = new Date();
  const slots = subtractBusy(windows, busy).filter((slot) => localDateTime(slot.date, slot.endTime) > now);
  return { guideId: id, from: start, to: end, slots };
}

async function listLanguages() {
  return (await repository.listLanguages(pool)).map(({ id, code, name }) => ({ id, code, name }));
}

// ---- Partner ----

async function listMine(ctx, { verificationStatus, status, page, limit, sort }) {
  const { rows, total } = await repository.list(pool, { partnerId: ctx.partner.partnerId, verificationStatus, status, page, limit, sort });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function getMine(ctx, id) {
  return toDetail(await requireOwned(pool, ctx, id), { admin: true });
}

async function create(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    await validateGuideInput(client, ctx, input);
    try {
      const entityId = await repository.insert(client, { ...input, partnerId: ctx.partner.partnerId });
      return { entityId, action: 'guides.created', newValues: input };
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('This user already has a guide profile', 'GUIDE_EXISTS');
      throw err;
    }
  });
  return getMine(ctx, id);
}

async function update(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    const before = await requireOwned(client, ctx, id, { forUpdate: true });
    if (changes.status && before.status === 'suspended') throw ApiError.conflict('A suspended guide can only be reactivated by an administrator', 'GUIDE_SUSPENDED');
    await validateGuideInput(client, ctx, changes);
    try {
      await repository.update(client, id, changes);
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('This user already has a guide profile', 'GUIDE_EXISTS');
      throw err;
    }
    return { entityId: id, action: 'guides.updated', ...diff({ displayName: before.display_name, status: before.status, bio: before.bio }, changes) };
  });
  return getMine(ctx, id);
}

async function setLanguages(ctx, id, { languageIds }) {
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    if ((await repository.countLanguages(client, languageIds)) !== languageIds.length) throw invalid('languageIds', 'one or more languages do not exist');
    await repository.replaceLanguages(client, id, languageIds);
    return { entityId: id, action: 'guides.languages_changed', newValues: { languageIds } };
  });
  return getMine(ctx, id);
}

async function setDestinations(ctx, id, { destinationIds }) {
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    await destinationsService.assertDestinationsExist(client, destinationIds, 'destinationIds');
    await repository.replaceDestinations(client, id, destinationIds);
    return { entityId: id, action: 'guides.destinations_changed', newValues: { destinationIds } };
  });
  return getMine(ctx, id);
}

async function requireOwnedService(db, ctx, guideId, serviceId, options) {
  const service = await repository.findService(db, serviceId, options);
  if (!service || service.partner_id !== ctx.partner.partnerId || service.guide_id !== guideId) {
    throw ApiError.notFound('Guide service not found', 'GUIDE_SERVICE_NOT_FOUND');
  }
  return service;
}

async function createService(ctx, guideId, input) {
  let serviceId;
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    await requireOwned(client, ctx, guideId, { forUpdate: true });
    serviceId = await repository.insertService(client, guideId, input);
    return { entityId: guideId, action: 'guides.service_created', newValues: { serviceId, ...input } };
  });
  return toService(await repository.findService(pool, serviceId));
}

async function updateService(ctx, guideId, serviceId, changes) {
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    await requireOwnedService(client, ctx, guideId, serviceId, { forUpdate: true });
    await repository.updateService(client, serviceId, changes);
    return { entityId: guideId, action: 'guides.service_updated', newValues: { serviceId, ...changes } };
  });
  return toService(await repository.findService(pool, serviceId));
}

async function setServiceStatus(ctx, guideId, serviceId, { status }) {
  return updateService(ctx, guideId, serviceId, { status });
}

/** Replaces all windows in [from, to] with `slots` (each inside the range, none overlapping). */
async function setAvailability(ctx, id, { from, to, slots }) {
  if (from < todayLocal()) throw invalid('from', 'past dates cannot be changed');
  const span = daysBetween(from, to);
  if (span < 0 || span > MAX_AVAILABILITY_WINDOW_DAYS) throw invalid('to', `window must be 0-${MAX_AVAILABILITY_WINDOW_DAYS} days`);
  slots.forEach((slot, index) => {
    if (slot.date < from || slot.date > to) throw invalid(`slots.${index}.date`, 'slot date must be within from..to');
  });
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    try {
      await repository.replaceAvailability(client, id, { from, to, slots });
    } catch (err) {
      if (err.code === '23P01') throw invalid('slots', 'availability windows must not overlap');
      throw err;
    }
    // Every held/booked time range in the window must remain inside an available window.
    const busy = await allocationsService.guideBusyRanges(id, localDateTime(from), localDateTime(addDays(to, 1)), client);
    const covered = (range) =>
      slots.some(
        (slot) => slot.status === 'available' && localDateTime(slot.date, slot.startTime) <= range.start_at && localDateTime(slot.date, slot.endTime) >= range.end_at,
      );
    if (busy.some((range) => !covered(range))) {
      throw ApiError.conflict('The new availability would remove time that is already reserved', 'GUIDE_HAS_BOOKINGS');
    }
    return { entityId: id, action: 'guides.availability_changed', newValues: { from, to, slots: slots.length } };
  });
  const rows = await repository.listAvailability(pool, id, { from, to });
  return { guideId: id, from, to, slots: rows.map((s) => ({ id: s.id, date: s.service_date, startTime: s.start_time, endTime: s.end_time, status: s.status })) };
}

const toDocument = (row) => ({
  id: row.id,
  mediaId: row.document_media_id,
  documentType: row.document_type,
  reviewStatus: row.review_status,
  reviewedAt: iso(row.reviewed_at),
  createdAt: iso(row.created_at),
});

/** Submitting a document moves an unverified/rejected guide into review. */
async function addDocument(ctx, id, { mediaId, documentType }) {
  let document;
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    const guide = await requireOwned(client, ctx, id, { forUpdate: true });
    await mediaService.assertAttachable(client, ctx, mediaId, { purposes: ['verification_document'] });
    try {
      document = toDocument(await repository.insertDocument(client, { guideId: id, mediaId, documentType }));
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('This document is already submitted', 'DOCUMENT_EXISTS');
      throw err;
    }
    if (['unverified', 'rejected'].includes(guide.verification_status)) await repository.update(client, id, { verificationStatus: 'pending' });
    return { entityId: id, action: 'guides.document_submitted', newValues: { mediaId, documentType } };
  });
  return document;
}

// ---- Admin ----

async function adminList({ verificationStatus, status, q, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { verificationStatus, status, q, sort, page, limit });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function adminGet(id) {
  const row = await repository.find(pool, id);
  if (!row) throw notFound();
  const [detail, documents] = await Promise.all([toDetail(row, { admin: true }), repository.listDocuments(pool, id)]);
  return {
    ...detail,
    documents: await Promise.all(documents.map(async (doc) => ({ ...toDocument(doc), media: await mediaService.getForAuthorizedReview(doc.document_media_id) }))),
  };
}

async function assertNotOwnOrganisation(ctx, guide) {
  if (await partnersService.isMember(guide.partner_id, ctx.actorUserId)) {
    throw ApiError.forbidden('You cannot review a guide of an organisation you belong to', 'SELF_REVIEW_FORBIDDEN');
  }
}

async function setVerification(ctx, id, { verificationStatus, notes }) {
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    const before = await repository.find(client, id, { forUpdate: true });
    if (!before) throw notFound();
    await assertNotOwnOrganisation(ctx, before);
    await repository.update(client, id, { verificationStatus });
    await repository.reviewPendingDocuments(client, id, verificationStatus === 'verified' ? 'approved' : 'rejected', ctx.actorUserId);
    return {
      entityId: id,
      action: 'guides.verification_changed',
      oldValues: { verificationStatus: before.verification_status },
      newValues: { verificationStatus, notes: notes ?? null },
    };
  });
  return adminGet(id);
}

async function setStatus(ctx, id, { status, reason }) {
  await auditService.auditedTransaction(ctx, 'guide', async (client) => {
    const before = await repository.find(client, id, { forUpdate: true });
    if (!before) throw notFound();
    await repository.update(client, id, { status });
    return { entityId: id, action: 'guides.status_changed', oldValues: { status: before.status }, newValues: { status, reason: reason ?? null } };
  });
  return adminGet(id);
}

async function createLanguage(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'guide_language', async (client) => ({
    entityId: await repository.insertLanguage(client, input),
    action: 'guide_languages.created',
    newValues: input,
  }));
  return repository.findLanguage(pool, id);
}

async function updateLanguage(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'guide_language', async (client) => {
    const before = await repository.findLanguage(client, id, { forUpdate: true });
    if (!before) throw ApiError.notFound('Language not found', 'LANGUAGE_NOT_FOUND');
    await repository.updateLanguage(client, id, changes);
    return { entityId: id, action: 'guide_languages.updated', ...diff(before, changes) };
  });
  return repository.findLanguage(pool, id);
}

// ---- Interface for the booking engine ----

/**
 * Prices and checks a guide service at date + start time. With `lock` the guide row is
 * locked FOR UPDATE (serialising all bookings of that guide); a GiST exclusion
 * constraint on inventory_holds is the final guarantee against overlaps.
 */
async function prepareBooking(db, { resourceId, date, startTime, participants }, { lock = false } = {}) {
  const service = await repository.findService(db, resourceId);
  const guide = service && (await repository.find(db, service.guide_id, { forUpdate: lock, publicOnly: true }));
  if (!service || !guide || service.status !== 'active') throw ApiError.notFound('Guide service is not available for booking', 'RESOURCE_NOT_FOUND');

  const startAt = localDateTime(date, startTime);
  const endAt = new Date(startAt.getTime() + service.duration_minutes * 60_000);
  const windows = await repository.listAvailability(db, guide.id, { from: date, to: date, availableOnly: true });
  const inWindow = windows.some((w) => localDateTime(w.service_date, w.start_time) <= startAt && localDateTime(w.service_date, w.end_time) >= endAt);
  const busy = await allocationsService.guideBusyRanges(guide.id, startAt, endAt, db);
  const fitsGroup = participants <= service.max_group_size;

  return {
    itemType: 'guide_service',
    itemReferenceId: service.id,
    partnerId: guide.partner_id,
    bookingMode: service.booking_mode,
    description: `${service.title} with ${guide.display_name} on ${date} at ${startTime}`,
    quantity: 1,
    unitPrice: service.price,
    subtotal: service.price,
    serviceStartAt: startAt,
    serviceEndAt: endAt,
    available: fitsGroup && inWindow && busy.length === 0,
    unavailableReason: !fitsGroup
      ? `Group size limit is ${service.max_group_size}`
      : !inWindow
        ? 'The guide is not available at that time'
        : busy.length
          ? 'The guide is already booked at that time'
          : null,
    hold: { resourceType: 'guide', resourceId: guide.id, startAt, endAt, quantity: 1 },
    cancellationPolicy: null,
    details: {
      guideId: guide.id,
      guideName: guide.display_name,
      serviceId: service.id,
      serviceTitle: service.title,
      date,
      startTime,
      durationMinutes: service.duration_minutes,
      participants,
    },
  };
}

// ---- Interface for search ----

async function search({ q, limit }) {
  const rows = await repository.search(pool, { q, limit });
  const cards = await toCards(rows);
  return cards.map((card, index) => ({ ...card, rank: Number(rows[index].rank) }));
}

module.exports = {
  prepareBooking,
  listPublic,
  listForDestination,
  getPublic,
  listPublicServices,
  publicAvailability,
  listLanguages,
  listMine,
  getMine,
  create,
  update,
  setLanguages,
  setDestinations,
  createService,
  updateService,
  setServiceStatus,
  setAvailability,
  addDocument,
  adminList,
  adminGet,
  setVerification,
  setStatus,
  createLanguage,
  updateLanguage,
  search,
};
