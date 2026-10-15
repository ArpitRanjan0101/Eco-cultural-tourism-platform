'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const mediaLinks = require('../../core/database/mediaLinks');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { slugify } = require('../../core/utils/slug');
const { sum, multiply } = require('../../core/utils/money');
const { todayLocal, daysBetween, addDays, localDateTime } = require('../../core/utils/dates');
const { assertAdminTransition, statusAfterPartnerEdit } = require('../../core/utils/moderation');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const geographyService = require('../geography/geography.service');
const destinationsService = require('../destinations/destinations.service');
const partnersService = require('../partners/partners.service');
const settingsService = require('../settings/settings.service');
const allocationsService = require('../bookings/allocations.service');
const repository = require('./properties.repository');

const CURRENCY = 'INR';
const MAX_CALENDAR_DAYS = 366;
const MAX_STAY_NIGHTS = 30;
const DESTINATION_RADIUS_KM = 25;

// Platform default when a property has not set its own policy (DECISIONS D7).
const defaultCancellationPolicy = () => settingsService.get('booking.default_cancellation_policy');

const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
const roomNotFound = () => ApiError.notFound('Room type not found', 'ROOM_NOT_FOUND');
const invalid = (path, message) => ApiError.validation([{ location: 'body', path, message }]);
const toAmenity = (row) => ({ id: row.id, code: row.code, name: row.name, category: row.category, icon: row.icon });

function toRoom(row, { amenities = [], images = [] } = {}) {
  return {
    id: row.id,
    propertyId: row.property_id,
    name: row.name,
    description: row.description,
    maxAdults: row.max_adults,
    maxChildren: row.max_children,
    totalUnits: row.total_units,
    basePrice: row.base_price,
    currency: CURRENCY,
    status: row.status,
    amenities,
    images,
  };
}

/** Cards with district/destination refs and cover image, resolved in batches. */
async function toCards(rows, { admin = false } = {}) {
  const [districts, destinations, covers, partners] = await Promise.all([
    geographyService.getDistrictRefMap(rows.map((row) => row.district_id)),
    destinationsService.getDestinationRefMap(rows.map((row) => row.destination_id)),
    mediaService.getPublicMediaMap(rows.map((row) => row.cover_media_id)),
    admin ? partnersService.getPartnerRefMap(rows.map((row) => row.partner_id)) : new Map(),
  ]);
  return rows.map((row) => {
    const cover = covers.get(row.cover_media_id);
    const card = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      propertyType: row.property_type,
      bookingMode: row.booking_mode,
      startingPrice: row.starting_price,
      currency: CURRENCY,
      location: row.latitude === null ? null : { latitude: row.latitude, longitude: row.longitude },
      district: districts.get(row.district_id) ?? null,
      destination: destinations.get(row.destination_id) ?? null,
      coverImage: cover ? { id: cover.id, url: cover.url, altText: cover.altText, width: cover.width, height: cover.height } : null,
    };
    if (row.distance_m !== undefined) card.distanceKm = Math.round(Number(row.distance_m) / 10) / 100;
    if (admin) Object.assign(card, { status: row.status, partner: partners.get(row.partner_id) ?? null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
    return card;
  });
}

async function roomsWithDetails(propertyIds, { activeOnly }) {
  const rooms = await repository.listRooms(pool, propertyIds, { activeOnly });
  const ids = rooms.map((room) => room.id);
  const [amenities, galleries] = await Promise.all([
    ids.length ? repository.linkedAmenities(pool, 'room_type_amenities', ids) : [],
    ids.length ? mediaService.buildGalleries(await mediaLinks.listLinks(pool, 'room_type_media', ids)) : new Map(),
  ]);
  return rooms.map((room) =>
    toRoom(room, {
      amenities: amenities.filter((a) => a.owner_id === room.id).map(toAmenity),
      images: galleries.get(room.id) ?? [],
    }),
  );
}

async function toDetail(row, { admin = false } = {}) {
  const [[card], amenities, galleries, policy, rooms, fallbackPolicy] = await Promise.all([
    toCards([row], { admin }),
    repository.linkedAmenities(pool, 'property_amenities', [row.id]),
    mediaService.buildGalleries(await mediaLinks.listLinks(pool, 'property_media', [row.id])),
    repository.findPolicy(pool, row.id),
    roomsWithDetails([row.id], { activeOnly: !admin }),
    defaultCancellationPolicy(),
  ]);
  return {
    ...card,
    description: row.description,
    address: row.address,
    contactPhone: row.contact_phone,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    gallery: galleries.get(row.id) ?? [],
    amenities: amenities.map(toAmenity),
    policies: {
      cancellationPolicy: policy?.cancellation_policy ?? fallbackPolicy,
      childPolicy: policy?.child_policy ?? null,
      houseRules: policy?.house_rules ?? null,
      identificationPolicy: policy?.identification_policy ?? null,
      isDefault: !policy,
    },
    rooms,
  };
}

// ---- ownership ----

async function requireOwned(db, ctx, id, options) {
  const row = await repository.find(db, { id }, options);
  if (!row || row.partner_id !== ctx.partner.partnerId) throw notFound();
  return row;
}

async function requireOwnedRoom(db, ctx, propertyId, roomId, options) {
  const room = await repository.findRoom(db, roomId, options);
  if (!room || room.partner_id !== ctx.partner.partnerId || (propertyId && room.property_id !== propertyId)) throw roomNotFound();
  return room;
}

async function requirePublic(selector) {
  const row = await repository.find(pool, selector, { publicOnly: true });
  if (!row) throw notFound();
  return row;
}

async function validateReferences(db, { districtId, destinationId }) {
  if (districtId) await geographyService.assertDistrictExists(db, districtId);
  if (destinationId) await destinationsService.assertDestinationsExist(db, [destinationId], 'destinationId');
}

// ---- Public ----

async function listPublic({ district, destination, propertyType, q, sort, page, limit }) {
  const districtIds = district ? [await geographyService.resolvePublicDistrictId(district)] : undefined;
  const destinationId = destination ? (await destinationsService.resolvePublished(destination)).id : undefined;
  const { rows, total } = await repository.list(pool, { publicOnly: true, districtIds, destinationId, propertyType, q, sort, page, limit });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function getPublic(slug) {
  return toDetail(await requirePublic({ slug }));
}

async function listPublicRooms(id) {
  await requirePublic({ id });
  return roomsWithDetails([id], { activeOnly: true });
}

/** Properties linked to a destination or within 25 km of it. */
async function listForDestination(slug, { page, limit, sort }) {
  const destination = await destinationsService.resolvePublished(slug);
  const near = destination.location && { ...destination.location, radiusMeters: DESTINATION_RADIUS_KM * 1000 };
  const { rows, total } = await repository.list(pool, { publicOnly: true, destinationId: destination.id, near, sort, page, limit });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

function assertStayDates(checkIn, checkOut) {
  const nights = daysBetween(checkIn, checkOut);
  if (checkIn < todayLocal()) throw ApiError.validation([{ location: 'query', path: 'checkIn', message: 'checkIn cannot be in the past' }]);
  if (nights < 1 || nights > MAX_STAY_NIGHTS) {
    throw ApiError.validation([{ location: 'query', path: 'checkOut', message: `stay must be 1-${MAX_STAY_NIGHTS} nights` }]);
  }
  return nights;
}

/** Nightly grid with reserved units subtracted: sellable = total - blocked - allocated. */
async function sellableGrid(db, roomIds, from, to) {
  if (roomIds.length === 0) return [];
  const [grid, allocated] = await Promise.all([
    repository.nightlyGrid(db, roomIds, from, to),
    allocationsService.roomNightUnits(roomIds, from, to, db),
  ]);
  return grid.map((night) => {
    const reserved = allocated.get(`${night.room_type_id}|${night.stay_date}`) ?? 0;
    return { ...night, allocated_units: reserved, sellable: night.total_units - night.blocked_units - reserved };
  });
}

/**
 * Indicative availability and price per room type (reservations subtracted). Booking
 * creation re-checks the same numbers under a room-type row lock.
 */
async function availability(id, { checkIn, checkOut, adults, children, rooms: roomCount }) {
  const property = await requirePublic({ id });
  const nights = assertStayDates(checkIn, checkOut);
  const rooms = await repository.listRooms(pool, [property.id], { activeOnly: true });
  const grid = await sellableGrid(pool, rooms.map((r) => r.id), checkIn, checkOut);

  return {
    propertyId: property.id,
    checkIn,
    checkOut,
    nights,
    currency: CURRENCY,
    bookingMode: property.booking_mode,
    rooms: rooms.map((room) => {
      const nightsForRoom = grid.filter((n) => n.room_type_id === room.id);
      const availableUnits = Math.max(0, Math.min(...nightsForRoom.map((n) => n.sellable)));
      const fitsOccupancy = adults <= room.max_adults * roomCount && children <= room.max_children * roomCount;
      const nightlyTotal = sum(nightsForRoom.map((n) => n.nightly_price));
      return {
        roomTypeId: room.id,
        name: room.name,
        maxAdults: room.max_adults,
        maxChildren: room.max_children,
        availableUnits,
        fitsOccupancy,
        available: fitsOccupancy && availableUnits >= roomCount,
        nightly: nightsForRoom.map((n) => ({ date: n.stay_date, price: n.nightly_price, availableUnits: Math.max(0, n.sellable) })),
        totalPrice: multiply(nightlyTotal, roomCount),
      };
    }),
  };
}

async function listAmenities() {
  return (await repository.listAmenities(pool)).map(toAmenity);
}

// ---- Partner ----

async function listMine(ctx, { status, page, limit, sort }) {
  const { rows, total } = await repository.list(pool, { partnerId: ctx.partner.partnerId, statuses: status ? [status] : undefined, page, limit, sort });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function getMine(ctx, id) {
  return toDetail(await requireOwned(pool, ctx, id), { admin: true });
}

async function create(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await validateReferences(client, input);
    const values = { ...input, slug: input.slug ?? slugify(input.name), partnerId: ctx.partner.partnerId };
    const entityId = await repository.insert(client, values);
    return { entityId, action: 'properties.created', newValues: values };
  });
  return getMine(ctx, id);
}

/** Partner edit. A rejected property is resubmitted for review by editing it. */
async function update(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    const before = await requireOwned(client, ctx, id, { forUpdate: true });
    await validateReferences(client, changes);
    const updates = { ...changes, status: statusAfterPartnerEdit(before.status) };
    if (before.status === 'published') {
      const missing = ['description', 'address', 'location'].filter((field) => changes[field] === null);
      if (missing.length) throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'A published property needs these fields', { missing });
    }
    await repository.update(client, id, updates);
    return { entityId: id, action: 'properties.updated', ...diff({ status: before.status, name: before.name, description: before.description }, updates) };
  });
  return getMine(ctx, id);
}

async function setAmenities(ctx, id, { amenityIds }) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    if ((await repository.countAmenities(client, amenityIds)) !== amenityIds.length) throw invalid('amenityIds', 'one or more amenities do not exist');
    await repository.replaceAmenities(client, 'property_amenities', id, amenityIds);
    return { entityId: id, action: 'properties.amenities_changed', newValues: { amenityIds } };
  });
  return getMine(ctx, id);
}

async function setPolicies(ctx, id, policy) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    await repository.upsertPolicy(client, id, policy);
    return { entityId: id, action: 'properties.policies_changed', newValues: policy };
  });
  return getMine(ctx, id);
}

async function attachMedia(ctx, id, link) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    await mediaService.assertAttachable(client, ctx, link.mediaId, { purposes: ['supply_image'] });
    await mediaLinks.attach(client, 'property_media', id, link);
    return { entityId: id, action: 'properties.media_attached', newValues: link };
  });
  return getMine(ctx, id);
}

async function detachMedia(ctx, id, mediaId) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwned(client, ctx, id, { forUpdate: true });
    if (!(await mediaLinks.detach(client, 'property_media', id, mediaId))) throw ApiError.notFound('Media is not attached', 'MEDIA_NOT_ATTACHED');
    return { entityId: id, action: 'properties.media_detached', oldValues: { mediaId }, newValues: { mediaId: null } };
  });
}

// ---- Partner: room types ----

async function getOwnedRoomDto(roomId) {
  const room = await repository.findRoom(pool, roomId);
  const [detailed] = (await roomsWithDetails([room.property_id], { activeOnly: false })).filter((r) => r.id === roomId);
  return detailed;
}

async function createRoom(ctx, propertyId, input) {
  let roomId;
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwned(client, ctx, propertyId, { forUpdate: true });
    try {
      roomId = await repository.insertRoom(client, propertyId, input);
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('A room type with this name already exists', 'NAME_TAKEN');
      throw err;
    }
    if (input.amenityIds?.length) {
      if ((await repository.countAmenities(client, input.amenityIds)) !== input.amenityIds.length) throw invalid('amenityIds', 'one or more amenities do not exist');
      await repository.replaceAmenities(client, 'room_type_amenities', roomId, input.amenityIds);
    }
    return { entityId: propertyId, action: 'properties.room_created', newValues: { roomId, ...input } };
  });
  return getOwnedRoomDto(roomId);
}

async function updateRoom(ctx, propertyId, roomId, changes) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    const before = await requireOwnedRoom(client, ctx, propertyId, roomId, { forUpdate: true });
    const { amenityIds, ...fields } = changes;
    try {
      await repository.updateRoom(client, roomId, fields);
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('A room type with this name already exists', 'NAME_TAKEN');
      throw err;
    }
    if (fields.totalUnits !== undefined && fields.totalUnits < before.total_units) {
      await repository.clampInventory(client, roomId, fields.totalUnits);
      const today = todayLocal();
      await assertNotBelowAllocated(client, roomId, today, addDays(today, MAX_CALENDAR_DAYS));
    }
    if (amenityIds) {
      if ((await repository.countAmenities(client, amenityIds)) !== amenityIds.length) throw invalid('amenityIds', 'one or more amenities do not exist');
      await repository.replaceAmenities(client, 'room_type_amenities', roomId, amenityIds);
    }
    return { entityId: propertyId, action: 'properties.room_updated', oldValues: { roomId }, newValues: { roomId, ...changes } };
  });
  return getOwnedRoomDto(roomId);
}

async function setRoomStatus(ctx, propertyId, roomId, { status }) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    const before = await requireOwnedRoom(client, ctx, propertyId, roomId, { forUpdate: true });
    await repository.updateRoom(client, roomId, { status });
    return { entityId: propertyId, action: 'properties.room_status_changed', oldValues: { roomId, status: before.status }, newValues: { roomId, status } };
  });
  return getOwnedRoomDto(roomId);
}

async function attachRoomMedia(ctx, propertyId, roomId, link) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwnedRoom(client, ctx, propertyId, roomId, { forUpdate: true });
    await mediaService.assertAttachable(client, ctx, link.mediaId, { purposes: ['supply_image'] });
    await mediaLinks.attach(client, 'room_type_media', roomId, link);
    return { entityId: propertyId, action: 'properties.room_media_attached', newValues: { roomId, ...link } };
  });
  return getOwnedRoomDto(roomId);
}

async function detachRoomMedia(ctx, propertyId, roomId, mediaId) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    await requireOwnedRoom(client, ctx, propertyId, roomId, { forUpdate: true });
    if (!(await mediaLinks.detach(client, 'room_type_media', roomId, mediaId))) throw ApiError.notFound('Media is not attached', 'MEDIA_NOT_ATTACHED');
    return { entityId: propertyId, action: 'properties.room_media_detached', oldValues: { roomId, mediaId }, newValues: { mediaId: null } };
  });
}

// ---- Partner: inventory and rate calendars ----

function assertCalendarRanges(ranges) {
  const today = todayLocal();
  let days = 0;
  for (const [index, range] of ranges.entries()) {
    if (range.from < today) throw invalid(`ranges.${index}.from`, 'past dates cannot be changed');
    if (range.to < range.from) throw invalid(`ranges.${index}.to`, 'to must not be before from');
    days += daysBetween(range.from, range.to) + 1;
  }
  if (days > MAX_CALENDAR_DAYS) throw invalid('ranges', `at most ${MAX_CALENDAR_DAYS} days per request`);
}

/** Inventory may never drop below units already held or booked (caller holds the room-type lock). */
async function assertNotBelowAllocated(db, roomId, from, toExclusive) {
  const short = (await sellableGrid(db, [roomId], from, toExclusive)).find((night) => night.sellable < 0);
  if (short) {
    throw ApiError.conflict(`Inventory on ${short.stay_date} would fall below ${short.allocated_units} reserved unit(s)`, 'INVENTORY_BELOW_ALLOCATED', {
      date: short.stay_date,
      reservedUnits: short.allocated_units,
    });
  }
}

async function writeInventory(ctx, roomId, { ranges }) {
  assertCalendarRanges(ranges);
  await auditService.auditedTransaction(ctx, 'room_type', async (client) => {
    const room = await requireOwnedRoom(client, ctx, null, roomId, { forUpdate: true });
    for (const [index, range] of ranges.entries()) {
      if (range.totalUnits !== undefined && range.totalUnits > room.total_units) {
        throw invalid(`ranges.${index}.totalUnits`, `cannot exceed the room type's ${room.total_units} physical units`);
      }
      try {
        await repository.upsertInventory(client, roomId, { ...range, defaultTotal: room.total_units });
      } catch (err) {
        if (err.code === '23514') throw invalid(`ranges.${index}.blockedUnits`, 'blocked units cannot exceed total units');
        throw err;
      }
      await assertNotBelowAllocated(client, roomId, range.from, addDays(range.to, 1));
    }
    return { entityId: roomId, action: 'rooms.inventory_changed', newValues: { ranges } };
  });
  return calendar(ctx, roomId, { from: ranges[0].from, to: ranges.at(-1).to });
}

async function writeRates(ctx, roomId, { ranges }) {
  assertCalendarRanges(ranges);
  await auditService.auditedTransaction(ctx, 'room_type', async (client) => {
    await requireOwnedRoom(client, ctx, null, roomId, { forUpdate: true });
    for (const range of ranges) await repository.upsertRates(client, roomId, range);
    return { entityId: roomId, action: 'rooms.rates_changed', newValues: { ranges } };
  });
  return calendar(ctx, roomId, { from: ranges[0].from, to: ranges.at(-1).to });
}

/** Day-by-day calendar for [from, to] inclusive. */
async function calendar(ctx, roomId, { from, to }) {
  const room = await requireOwnedRoom(pool, ctx, null, roomId);
  const days = daysBetween(from, to) + 1;
  if (days < 1 || days > MAX_CALENDAR_DAYS) {
    throw ApiError.validation([{ location: 'query', path: 'to', message: `range must be 1-${MAX_CALENDAR_DAYS} days` }]);
  }
  const grid = await sellableGrid(pool, [roomId], from, addDays(to, 1));
  return {
    roomTypeId: roomId,
    physicalUnits: room.total_units,
    basePrice: room.base_price,
    currency: CURRENCY,
    days: grid.map((n) => ({
      date: n.stay_date,
      totalUnits: n.total_units,
      blockedUnits: n.blocked_units,
      reservedUnits: n.allocated_units,
      availableUnits: Math.max(0, n.sellable),
      nightlyPrice: n.nightly_price,
      inventoryOverride: n.has_inventory_override,
      rateOverride: n.has_rate_override,
    })),
  };
}

// ---- Admin ----

async function adminList({ status, partnerId, q, sort, page, limit }) {
  const { rows, total } = await repository.list(pool, { statuses: status ? [status] : undefined, partnerId, q, sort, page, limit });
  return { items: await toCards(rows, { admin: true }), meta: pageMeta({ page, limit }, total) };
}

async function adminGet(id) {
  const row = await repository.find(pool, { id });
  if (!row) throw notFound();
  return toDetail(row, { admin: true });
}

async function setStatus(ctx, id, { status, reason }) {
  await auditService.auditedTransaction(ctx, 'property', async (client) => {
    const before = await repository.find(client, { id }, { forUpdate: true });
    if (!before) throw notFound();
    assertAdminTransition(before.status, status);
    if (status === 'published') {
      const missing = ['description', 'address'].filter((field) => !before[field]);
      if (before.latitude === null) missing.push('location');
      if ((await repository.listRooms(client, [id], { activeOnly: true })).length === 0) missing.push('activeRoomType');
      if (missing.length) throw new ApiError(422, 'PUBLISH_REQUIREMENTS', 'Property is incomplete for publishing', { missing });
    }
    await repository.update(client, id, { status });
    return { entityId: id, action: 'properties.status_changed', oldValues: { status: before.status }, newValues: { status, reason: reason ?? null } };
  });
  return adminGet(id);
}

async function createAmenity(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'amenity', async (client) => ({
    entityId: await repository.insertAmenity(client, input),
    action: 'amenities.created',
    newValues: input,
  }));
  return toAmenity(await repository.findAmenity(pool, id));
}

async function updateAmenity(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'amenity', async (client) => {
    const before = await repository.findAmenity(client, id, { forUpdate: true });
    if (!before) throw ApiError.notFound('Amenity not found', 'AMENITY_NOT_FOUND');
    await repository.updateAmenity(client, id, changes);
    return { entityId: id, action: 'amenities.updated', ...diff(before, changes) };
  });
  return toAmenity(await repository.findAmenity(pool, id));
}

// ---- Interface for the booking engine ----

/**
 * Prices and checks a room-type stay. With `lock`, the room-type row is locked FOR UPDATE
 * first, so concurrent bookings of the same room type are serialised and the capacity
 * check below is authoritative for the caller's transaction.
 */
async function prepareBooking(db, { resourceId, checkIn, checkOut, rooms: roomCount, adults, children = 0 }, { lock = false } = {}) {
  const room = await repository.findRoom(db, resourceId, { forUpdate: lock });
  const property = room && (await repository.find(db, { id: room.property_id }, { publicOnly: true }));
  if (!room || !property || room.status !== 'active') throw ApiError.notFound('Room type is not available for booking', 'RESOURCE_NOT_FOUND');
  const nights = daysBetween(checkIn, checkOut);
  if (nights < 1 || nights > MAX_STAY_NIGHTS) throw invalid('checkOut', `stay must be 1-${MAX_STAY_NIGHTS} nights`);

  const grid = await sellableGrid(db, [room.id], checkIn, checkOut);
  const availableUnits = Math.max(0, Math.min(...grid.map((night) => night.sellable)));
  const fitsOccupancy = adults <= room.max_adults * roomCount && children <= room.max_children * roomCount;
  const unitPrice = sum(grid.map((night) => night.nightly_price));
  const policy = (await repository.findPolicy(db, property.id))?.cancellation_policy ?? (await defaultCancellationPolicy());

  return {
    itemType: 'property_room',
    itemReferenceId: room.id,
    partnerId: property.partner_id,
    bookingMode: property.booking_mode,
    description: `${property.name} - ${room.name} x ${roomCount} room(s), ${nights} night(s)`,
    quantity: roomCount,
    unitPrice,
    subtotal: multiply(unitPrice, roomCount),
    serviceStartAt: localDateTime(checkIn, property.check_in_time),
    serviceEndAt: localDateTime(checkOut, property.check_out_time),
    available: fitsOccupancy && availableUnits >= roomCount,
    unavailableReason: !fitsOccupancy ? 'Party exceeds room occupancy' : availableUnits < roomCount ? `Only ${availableUnits} room(s) available` : null,
    hold: {
      resourceType: 'room_type',
      resourceId: room.id,
      startAt: localDateTime(checkIn),
      endAt: localDateTime(checkOut),
      quantity: roomCount,
    },
    cancellationPolicy: policy,
    details: {
      propertyId: property.id,
      propertyName: property.name,
      propertySlug: property.slug,
      roomTypeName: room.name,
      checkIn,
      checkOut,
      nights,
      rooms: roomCount,
      adults,
      children,
      checkInTime: property.check_in_time,
      checkOutTime: property.check_out_time,
      nightly: grid.map((night) => ({ date: night.stay_date, price: night.nightly_price })),
    },
  };
}

// ---- Interfaces for search ----

async function nearPoint({ latitude, longitude, radiusKm, page, limit }) {
  const { rows, total } = await repository.nearPoint(pool, { latitude, longitude, radiusMeters: radiusKm * 1000, limit, offset: (page - 1) * limit });
  return { items: await toCards(rows), meta: pageMeta({ page, limit }, total) };
}

async function search({ q, limit }) {
  const rows = await repository.search(pool, { q, limit });
  const cards = await toCards(rows);
  return cards.map((card, index) => ({ ...card, rank: Number(rows[index].rank) }));
}

module.exports = {
  prepareBooking,
  listPublic,
  getPublic,
  listPublicRooms,
  listForDestination,
  availability,
  listAmenities,
  listMine,
  getMine,
  create,
  update,
  setAmenities,
  setPolicies,
  attachMedia,
  detachMedia,
  createRoom,
  updateRoom,
  setRoomStatus,
  attachRoomMedia,
  detachRoomMedia,
  writeInventory,
  writeRates,
  calendar,
  adminList,
  adminGet,
  setStatus,
  createAmenity,
  updateAmenity,
  nearPoint,
  search,
};
