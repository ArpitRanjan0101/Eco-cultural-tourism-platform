'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const mediaLinks = require('../../core/database/mediaLinks');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { slugify } = require('../../core/utils/slug');
const { assertAdminTransition, statusAfterPartnerEdit } = require('../../core/utils/moderation');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const destinationsService = require('../destinations/destinations.service');
const partnersService = require('../partners/partners.service');
const repository = require('./experiences.repository');

const CURRENCY = 'INR';
const DAY_MS = 86_400_000;
const MAX_SESSION_WINDOW_DAYS = 120;

const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Experience not found', 'EXPERIENCE_NOT_FOUND');
const sessionNotFound = () => ApiError.notFound('Session not found', 'SESSION_NOT_FOUND');
const invalid = (path, message, location = 'body') => ApiError.validation([{ location, path, message }]);

const toSession = (row) => ({
  id: row.id,
  experienceId: row.experience_id,
  startsAt: iso(row.starts_at),
  endsAt: iso(row.ends_at),
  capacity: row.capacity,
  pricePerPerson: row.price_per_person,
  currency: CURRENCY,
  status: row.status,
});

async function toCards(rows, { admin = false } = {}) {
  const [destinations, covers, partners] = await Promise.all([
    destinationsService.getDestinationRefMap(rows.map((row) => row.destination_id)),
    mediaService.getPublicMediaMap(rows.map((row) => row.cover_media_id)),
    partnersService.getPartnerRefMap(rows.map((row) => row.partner_id)),
  ]);
  return rows.map((row) => {
    const cover = covers.get(row.cover_media_id);
    const card = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      durationMinutes: row.duration_minutes,
      minParticipants: row.min_participants,
      maxParticipants: row.max_participants,
      bookingMode: row.booking_mode,
      startingPrice: row.starting_price,
      currency: CURRENCY,
      nextSessionAt: iso(row.next_session_at),
      destination: destinations.get(row.destination_id) ?? null,
      coverImage: cover ? { id: cover.id, url: cover.url, altText: cover.altText, width: cover.width, height: cover.height } : null,
      partner: partners.has(row.partner_id) ? { id: row.partner_id, businessName: partners.get(row.partner_id).businessName } : null,
    };
    if (admin) Object.assign(card, { status: row.status, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
    return card;
  });
}

async function toDetail(row, { admin = false } = {}) {
  const now = new Date();
  const [[card], galleries, sessions] = await Promise.all([
    toCards([row], { admin }),
    mediaService.buildGalleries(await mediaLinks.listLinks(pool, 'experience_media', [row.id])),
    repository.listSessions(pool, row.id, { from: now, to: new Date(now.getTime() + MAX_SESSION_WINDOW_DAYS * DAY_MS), scheduledOnly: !admin }),
  ]);
  return { ...card, description: row.description, gallery: galleries.get(row.id) ?? [], upcomingSessions: sessions.slice(0, 20).map(toSession) };
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

function sessionWindow({ from, to }) {
  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(start.getTime() + 30 * DAY_MS);
  if (end <= start || end - start > MAX_SESSION_WINDOW_DAYS * DAY_MS) {
    throw invalid('to', `window must be up to ${MAX_SESSION_WINDOW_DAYS} days after from`, 'query');
  }
  return { from: start, to: end };
}

// ---- Public ----

async function listPublic({ destination, q, sort, page, limit }) {
  const destinationId = destination ? (await destinationsService.resolvePublished(destination)).id : undefined;
  const { rows, total } = await repository.list(pool, { publicOnly: true, destinationId, q, sort, page, limit });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function listForDestination(slug, query) {
  return listPublic({ ...query, destination: slug });
}

async function getPublic(slug) {
  return toDetail(await requirePublic({ slug }));
}

async function listPublicSessions(id, query) {
  await requirePublic({ id });
  const window = sessionWindow(query);
  const rows = await repository.listSessions(pool, id, { ...window, scheduledOnly: true });
  return rows.filter((row) => row.starts_at > new Date()).map(toSession);
}

/**
 * Seats per upcoming session for a party size. Seats already held/booked are
 * subtracted by the booking engine (Phase 5), which also locks the session row.
 */
async function availability(id, { from, to, participants }) {
  const experience = await requirePublic({ id });
  const window = sessionWindow({ from, to });
  const rows = await repository.listSessions(pool, id, { ...window, scheduledOnly: true });
  const withinGroupLimits = participants >= experience.min_participants && participants <= experience.max_participants;
  return {
    experienceId: id,
    participants,
    withinGroupLimits,
    sessions: rows
      .filter((row) => row.starts_at > new Date())
      .map((row) => ({ ...toSession(row), seatsAvailable: row.capacity, available: withinGroupLimits && row.capacity >= participants })),
  };
}

// ---- Partner ----

async function listMine(ctx, { status, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { partnerId: ctx.partner.partnerId, statuses: status ? [status] : undefined, sort, page, limit });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function getMine(ctx, id) {
  return toDetail(await requireOwned(pool, ctx, id), { admin: true });
}

async function create(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    if (input.destinationId) await destinationsService.assertDestinationsExist(client, [input.destinationId], 'destinationId');
    const values = { ...input, slug: input.slug ?? slugify(input.name), partnerId: ctx.partner.partnerId };
    return { entityId: await repository.insert(client, values), action: 'experiences.created', newValues: values };
  });
  return getMine(ctx, id);
}

async function update(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    const before = await requireOwned(client, ctx, id, { forUpdate: true });
    if (changes.destinationId) await destinationsService.assertDestinationsExist(client, [changes.destinationId], 'destinationId');
    const min = changes.minParticipants ?? before.min_participants;
    const max = changes.maxParticipants ?? before.max_participants;
    if (max < min) throw invalid('maxParticipants', 'maxParticipants must be >= minParticipants');
    if (before.status === 'published' && (changes.description === null || changes.destinationId === null)) {
      throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'A published experience needs a description and destination');
    }
    const updates = { ...changes, status: statusAfterPartnerEdit(before.status) };
    await repository.update(client, id, updates);
    return { entityId: id, action: 'experiences.updated', ...diff({ name: before.name, status: before.status }, updates) };
  });
  return getMine(ctx, id);
}

async function requireOwnedSession(db, ctx, experienceId, sessionId, options) {
  const session = await repository.findSession(db, sessionId, options);
  if (!session || session.partner_id !== ctx.partner.partnerId || session.experience_id !== experienceId) throw sessionNotFound();
  return session;
}

function assertSessionTimes({ startsAt, endsAt }) {
  if (new Date(startsAt) <= new Date()) throw invalid('startsAt', 'sessions must start in the future');
  if (new Date(endsAt) <= new Date(startsAt)) throw invalid('endsAt', 'endsAt must be after startsAt');
}

async function createSession(ctx, id, input) {
  assertSessionTimes(input);
  let sessionId;
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    const experience = await requireOwned(client, ctx, id, { forUpdate: true });
    if (input.capacity < experience.min_participants) throw invalid('capacity', 'capacity cannot be below the minimum group size');
    sessionId = await repository.insertSession(client, id, input);
    return { entityId: id, action: 'experiences.session_created', newValues: { sessionId, ...input } };
  });
  return toSession(await repository.findSession(pool, sessionId));
}

/** Only future sessions can change; capacity/price changes never alter existing reservations' snapshots. */
async function updateSession(ctx, id, sessionId, changes) {
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    const session = await requireOwnedSession(client, ctx, id, sessionId, { forUpdate: true });
    if (session.starts_at <= new Date()) throw ApiError.conflict('Past or started sessions cannot be changed', 'SESSION_STARTED');
    const next = { startsAt: changes.startsAt ?? session.starts_at.toISOString(), endsAt: changes.endsAt ?? session.ends_at.toISOString() };
    if (changes.startsAt || changes.endsAt) assertSessionTimes(next);
    if (changes.capacity !== undefined && changes.capacity < session.min_participants) {
      throw invalid('capacity', 'capacity cannot be below the minimum group size');
    }
    await repository.updateSession(client, sessionId, changes);
    return { entityId: id, action: 'experiences.session_updated', newValues: { sessionId, ...changes } };
  });
  return toSession(await repository.findSession(pool, sessionId));
}

/** "Remove unused session": future sessions only (the booking engine adds the no-reservations check). */
async function deleteSession(ctx, id, sessionId) {
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    const session = await requireOwnedSession(client, ctx, id, sessionId, { forUpdate: true });
    if (session.starts_at <= new Date()) throw ApiError.conflict('Past or started sessions cannot be removed', 'SESSION_STARTED');
    await repository.deleteSession(client, sessionId);
    return { entityId: id, action: 'experiences.session_deleted', oldValues: toSession(session), newValues: { deleted: true } };
  });
}

async function attachMedia(ctx, id, link) {
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    await mediaService.assertAttachable(client, ctx, link.mediaId, { purposes: ['supply_image'] });
    await mediaLinks.attach(client, 'experience_media', id, link);
    return { entityId: id, action: 'experiences.media_attached', newValues: link };
  });
  return getMine(ctx, id);
}

async function detachMedia(ctx, id, mediaId) {
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    if (!(await mediaLinks.detach(client, 'experience_media', id, mediaId))) throw ApiError.notFound('Media is not attached', 'MEDIA_NOT_ATTACHED');
    return { entityId: id, action: 'experiences.media_detached', oldValues: { mediaId }, newValues: { mediaId: null } };
  });
}

// ---- Admin ----

async function adminList({ status, partnerId, q, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { statuses: status ? [status] : undefined, partnerId, q, sort, page, limit });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function setStatus(ctx, id, { status, reason }) {
  await auditService.auditedTransaction(ctx, 'experience', async (client) => {
    const before = await repository.find(client, { id }, { forUpdate: true });
    if (!before) throw notFound();
    assertAdminTransition(before.status, status);
    if (status === 'published' && (!before.description || !before.destination_id)) {
      throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'Experience is incomplete for publishing', {
        missing: ['description', 'destination'].filter((field) => !before[field === 'destination' ? 'destination_id' : field]),
      });
    }
    await repository.update(client, id, { status });
    return { entityId: id, action: 'experiences.status_changed', oldValues: { status: before.status }, newValues: { status, reason: reason ?? null } };
  });
  const row = await repository.find(pool, { id });
  return toDetail(row, { admin: true });
}

async function search({ q, limit }) {
  const rows = await repository.search(pool, { q, limit });
  const cards = await toCards(rows);
  return cards.map((card, index) => ({ ...card, rank: Number(rows[index].rank) }));
}

module.exports = {
  listPublic,
  listForDestination,
  getPublic,
  listPublicSessions,
  availability,
  listMine,
  create,
  update,
  createSession,
  updateSession,
  deleteSession,
  attachMedia,
  detachMedia,
  adminList,
  setStatus,
  search,
};
