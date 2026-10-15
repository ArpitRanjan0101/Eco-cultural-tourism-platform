'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./packages.controller');
const schema = require('./packages.schema');
const { partnerGuard } = require('../partners/partners.service');
const { partnerHeaders } = require('../partners/partners.schema');

const PUBLIC = ['Packages'];
const PARTNER = ['Partner: Packages'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });
const created = (dataSchema) => ({ status: 201, schema: successEnvelope(dataSchema) });
const cards = ok(z.array(schema.cardSchema), { paginated: true });
const detail = ok(schema.detailSchema);
const partner = {
  auth: 'user',
  permissions: ['packages.manage.own'],
  headers: partnerHeaders,
  middleware: [partnerGuard({ supply: 'packages' })],
  errors: [400, 404],
};

const routes = [
  { method: 'get', path: '/packages', tags: PUBLIC, summary: 'Browse packages', request: { query: schema.publicListQuery }, response: cards, errors: [404], handler: controller.listPublic },
  { method: 'get', path: '/packages/:slug', tags: PUBLIC, summary: 'Read package', request: { params: f.slugParams }, response: detail, errors: [404], handler: controller.getPublic },
  {
    method: 'get',
    path: '/packages/:id/departures',
    tags: PUBLIC,
    summary: 'List package departures',
    request: { params: schema.idParams },
    response: ok(z.array(schema.departureSchema)),
    errors: [404],
    handler: controller.listPublicDepartures,
  },
  {
    method: 'get',
    path: '/packages/:id/availability',
    tags: PUBLIC,
    summary: 'Get departure capacity',
    description: 'Indicative seats per departure; bookings re-check under row locks.',
    request: { params: schema.idParams, query: schema.availabilityQuery },
    response: ok(schema.availabilitySchema),
    errors: [404],
    handler: controller.availability,
  },
  { method: 'get', path: '/partners/me/packages', tags: PARTNER, summary: 'List owned packages', ...partner, request: { query: schema.partnerListQuery }, response: cards, handler: controller.listMine },
  {
    method: 'post',
    path: '/partners/me/packages',
    tags: PARTNER,
    summary: 'Create package',
    description: 'Created in pending_review.',
    ...partner,
    request: { body: schema.createBody },
    response: created(schema.detailSchema),
    errors: [400, 409],
    handler: controller.create,
  },
  {
    method: 'patch',
    path: '/partners/me/packages/:id',
    tags: PARTNER,
    summary: 'Edit package',
    ...partner,
    request: { params: schema.idParams, body: schema.updateBody },
    response: detail,
    errors: [400, 404, 409],
    handler: controller.update,
  },
  { method: 'put', path: '/partners/me/packages/:id/destinations', tags: PARTNER, summary: 'Set linked destinations', ...partner, request: { params: schema.idParams, body: schema.destinationsBody }, response: detail, handler: controller.setDestinations },
  {
    method: 'put',
    path: '/partners/me/packages/:id/itinerary',
    tags: PARTNER,
    summary: 'Save ordered days and activities',
    description: 'Replaces the itinerary; day numbers cannot exceed the package duration.',
    ...partner,
    request: { params: schema.idParams, body: schema.itineraryBody },
    response: detail,
    handler: controller.setItinerary,
  },
  { method: 'put', path: '/partners/me/packages/:id/inclusions', tags: PARTNER, summary: 'Save included/excluded items', ...partner, request: { params: schema.idParams, body: schema.inclusionsBody }, response: detail, handler: controller.setInclusions },
  { method: 'post', path: '/partners/me/packages/:id/media', tags: PARTNER, summary: 'Attach gallery', ...partner, request: { params: schema.idParams, body: schema.mediaBody }, response: detail, handler: controller.attachMedia },
  {
    method: 'delete',
    path: '/partners/me/packages/:id/media/:mediaId',
    tags: PARTNER,
    summary: 'Detach image',
    ...partner,
    request: { params: schema.mediaParams },
    response: { status: 204, description: 'Detached' },
    handler: controller.detachMedia,
  },
  {
    method: 'post',
    path: '/partners/me/packages/:id/departures',
    tags: PARTNER,
    summary: 'Create departure',
    description: 'endDate is derived from the package duration. One departure per start date.',
    ...partner,
    request: { params: schema.idParams, body: schema.departureBody },
    response: created(schema.departureSchema),
    errors: [400, 404, 409],
    handler: controller.createDeparture,
  },
  {
    method: 'patch',
    path: '/partners/me/packages/:id/departures/:departureId',
    tags: PARTNER,
    summary: 'Edit departure',
    description: 'Future departures only (409 DEPARTURE_STARTED).',
    ...partner,
    request: { params: schema.departureParams, body: schema.updateDepartureBody },
    response: ok(schema.departureSchema),
    errors: [400, 404, 409],
    handler: controller.updateDeparture,
  },
  {
    method: 'get',
    path: '/admin/packages',
    tags: ['Admin: Packages'],
    summary: 'Moderation listing',
    auth: 'user',
    permissions: ['packages.moderate'],
    request: { query: schema.adminListQuery },
    response: cards,
    handler: controller.adminList,
  },
  {
    method: 'patch',
    path: '/admin/packages/:id/status',
    tags: ['Admin: Packages'],
    summary: 'Approve/publish/reject',
    description: 'Publishing requires summary, description, at least one destination and an itinerary.',
    auth: 'user',
    permissions: ['packages.moderate'],
    request: { params: schema.idParams, body: schema.adminStatusBody },
    response: detail,
    errors: [404, 409],
    handler: controller.setStatus,
  },
];

module.exports = routes;
