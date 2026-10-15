'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./properties.controller');
const schema = require('./properties.schema');
const { partnerGuard } = require('../partners/partners.service');
const { partnerHeaders } = require('../partners/partners.schema');

const PUBLIC = ['Accommodation'];
const PARTNER = ['Partner: Accommodation'];
const ADMIN = ['Admin: Accommodation'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });
const created = (dataSchema) => ({ status: 201, schema: successEnvelope(dataSchema) });
const noContent = { status: 204, description: 'Done' };
const cards = ok(z.array(schema.propertyCardSchema), { paginated: true });
const detail = ok(schema.propertyDetailSchema);

// Partner routes: role permission + approved accommodation-capable organisation + ownership (in the service).
const partner = {
  auth: 'user',
  permissions: ['properties.manage.own'],
  headers: partnerHeaders,
  middleware: [partnerGuard({ supply: 'properties' })],
  errors: [400, 404],
};
const moderate = { auth: 'user', permissions: ['properties.moderate'] };
const amenities = { auth: 'user', permissions: ['amenities.manage'] };

const routes = [
  { method: 'get', path: '/properties', tags: PUBLIC, summary: 'Search accommodation', request: { query: schema.publicListQuery }, response: cards, errors: [404], handler: controller.listPublic },
  { method: 'get', path: '/properties/:slug', tags: PUBLIC, summary: 'Read property', request: { params: f.slugParams }, response: detail, errors: [404], handler: controller.getPublic },
  {
    method: 'get',
    path: '/properties/:id/rooms',
    tags: PUBLIC,
    summary: 'List room types',
    request: { params: schema.propertyParams },
    response: ok(z.array(schema.roomSchema)),
    errors: [404],
    handler: controller.listPublicRooms,
  },
  {
    method: 'get',
    path: '/properties/:id/availability',
    tags: PUBLIC,
    summary: 'Check dates, guests and prices',
    description: 'Indicative only; POST /bookings/quote and booking creation re-check availability authoritatively.',
    rateLimit: { name: 'property_availability', windowSeconds: 60, max: 120 },
    request: { params: schema.propertyParams, query: schema.availabilityQuery },
    response: ok(schema.availabilitySchema),
    errors: [404],
    handler: controller.availability,
  },
  { method: 'get', path: '/amenities', tags: PUBLIC, summary: 'List amenities', response: ok(z.array(schema.amenitySchema)), handler: controller.listAmenities },
  {
    method: 'get',
    path: '/destinations/:slug/properties',
    tags: ['Destinations'],
    summary: 'Get nearby properties',
    description: 'Published properties linked to the destination or within 25 km of it.',
    request: { params: f.slugParams, query: schema.destinationPropertiesQuery },
    response: cards,
    errors: [404],
    handler: controller.listForDestination,
  },

  { method: 'get', path: '/partners/me/properties', tags: PARTNER, summary: 'List owned properties', ...partner, request: { query: schema.partnerListQuery }, response: cards, handler: controller.listMine },
  {
    method: 'post',
    path: '/partners/me/properties',
    tags: PARTNER,
    summary: 'Create property',
    description: 'Created in pending_review; an admin publishes it.',
    ...partner,
    request: { body: schema.createBody },
    response: created(schema.propertyDetailSchema),
    errors: [400, 409],
    handler: controller.create,
  },
  {
    method: 'patch',
    path: '/partners/me/properties/:id',
    tags: PARTNER,
    summary: 'Edit property',
    description: 'Editing a rejected property resubmits it for review.',
    ...partner,
    request: { params: schema.propertyParams, body: schema.updateBody },
    response: detail,
    errors: [400, 404, 409],
    handler: controller.update,
  },
  { method: 'put', path: '/partners/me/properties/:id/amenities', tags: PARTNER, summary: 'Assign property amenities', ...partner, request: { params: schema.propertyParams, body: schema.amenitiesBody }, response: detail, handler: controller.setAmenities },
  {
    method: 'put',
    path: '/partners/me/properties/:id/policies',
    tags: PARTNER,
    summary: 'Edit property policies',
    description: 'Cancellation tiers (hours before check-in -> refund %) are snapshotted onto each booking.',
    ...partner,
    request: { params: schema.propertyParams, body: schema.policiesBody },
    response: detail,
    handler: controller.setPolicies,
  },
  { method: 'post', path: '/partners/me/properties/:id/media', tags: PARTNER, summary: 'Attach images', ...partner, request: { params: schema.propertyParams, body: schema.mediaBody }, response: detail, handler: controller.attachMedia },
  {
    method: 'delete',
    path: '/partners/me/properties/:id/media/:mediaId',
    tags: PARTNER,
    summary: 'Detach image',
    ...partner,
    request: { params: schema.propertyMediaParams },
    response: noContent,
    handler: controller.detachMedia,
  },
  {
    method: 'post',
    path: '/partners/me/properties/:id/rooms',
    tags: PARTNER,
    summary: 'Create room type',
    ...partner,
    request: { params: schema.propertyParams, body: schema.createRoomBody },
    response: created(schema.roomSchema),
    errors: [400, 404, 409],
    handler: controller.createRoom,
  },
  {
    method: 'patch',
    path: '/partners/me/properties/:id/rooms/:roomId',
    tags: PARTNER,
    summary: 'Edit room type',
    description: 'Reducing totalUnits clamps any date overrides above the new count.',
    ...partner,
    request: { params: schema.roomParams, body: schema.updateRoomBody },
    response: ok(schema.roomSchema),
    errors: [400, 404, 409],
    handler: controller.updateRoom,
  },
  {
    method: 'patch',
    path: '/partners/me/properties/:id/rooms/:roomId/status',
    tags: PARTNER,
    summary: 'Change room status',
    ...partner,
    request: { params: schema.roomParams, body: schema.roomStatusBody },
    response: ok(schema.roomSchema),
    handler: controller.setRoomStatus,
  },
  {
    method: 'post',
    path: '/partners/me/properties/:id/rooms/:roomId/media',
    tags: PARTNER,
    summary: 'Attach room image',
    ...partner,
    request: { params: schema.roomParams, body: schema.roomMediaBody },
    response: ok(schema.roomSchema),
    handler: controller.attachRoomMedia,
  },
  {
    method: 'delete',
    path: '/partners/me/properties/:id/rooms/:roomId/media/:mediaId',
    tags: PARTNER,
    summary: 'Detach room image',
    ...partner,
    request: { params: schema.roomMediaParams },
    response: noContent,
    handler: controller.detachRoomMedia,
  },
  {
    method: 'put',
    path: '/partners/me/rooms/:roomId/inventory',
    tags: PARTNER,
    summary: 'Write inventory calendar',
    description: 'Upserts per-date total/blocked units for date ranges (max 366 days, no past dates, total <= physical units).',
    ...partner,
    request: { params: schema.roomOnlyParams, body: schema.inventoryBody },
    response: ok(schema.calendarSchema),
    handler: controller.writeInventory,
  },
  {
    method: 'put',
    path: '/partners/me/rooms/:roomId/rates',
    tags: PARTNER,
    summary: 'Write date-based rate calendar',
    ...partner,
    request: { params: schema.roomOnlyParams, body: schema.ratesBody },
    response: ok(schema.calendarSchema),
    handler: controller.writeRates,
  },
  {
    method: 'get',
    path: '/partners/me/rooms/:roomId/calendar',
    tags: PARTNER,
    summary: 'Read calendar',
    ...partner,
    request: { params: schema.roomOnlyParams, query: schema.calendarQuery },
    response: ok(schema.calendarSchema),
    handler: controller.calendar,
  },

  { method: 'get', path: '/admin/properties', tags: ADMIN, summary: 'Approval listing', ...moderate, request: { query: schema.adminListQuery }, response: cards, handler: controller.adminList },
  { method: 'get', path: '/admin/properties/:id', tags: ADMIN, summary: 'Property approval detail', ...moderate, request: { params: schema.propertyParams }, response: detail, errors: [404], handler: controller.adminGet },
  {
    method: 'patch',
    path: '/admin/properties/:id/status',
    tags: ADMIN,
    summary: 'Approve/reject/suspend property',
    description: 'Publishing requires description, address, location and an active room type. Public listing also requires an approved partner.',
    ...moderate,
    request: { params: schema.propertyParams, body: schema.adminStatusBody },
    response: detail,
    errors: [404, 409],
    handler: controller.setStatus,
  },
  { method: 'get', path: '/admin/amenities', tags: ADMIN, summary: 'Admin amenity list', ...amenities, response: ok(z.array(schema.amenitySchema)), handler: controller.listAmenities },
  {
    method: 'post',
    path: '/admin/amenities',
    tags: ADMIN,
    summary: 'Add amenity',
    ...amenities,
    request: { body: schema.amenityBody },
    response: created(schema.amenitySchema),
    errors: [409],
    handler: controller.createAmenity,
  },
  {
    method: 'patch',
    path: '/admin/amenities/:id',
    tags: ADMIN,
    summary: 'Edit amenity',
    ...amenities,
    request: { params: f.idParams, body: schema.updateAmenityBody },
    response: ok(schema.amenitySchema),
    errors: [404],
    handler: controller.updateAmenity,
  },
];

module.exports = routes;
