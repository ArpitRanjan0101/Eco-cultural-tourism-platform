'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./experiences.controller');
const schema = require('./experiences.schema');
const { partnerGuard } = require('../partners/partners.service');
const { partnerHeaders } = require('../partners/partners.schema');

const PUBLIC = ['Experiences'];
const PARTNER = ['Partner: Experiences'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });
const created = (dataSchema) => ({ status: 201, schema: successEnvelope(dataSchema) });
const cards = ok(z.array(schema.cardSchema), { paginated: true });
const partner = {
  auth: 'user',
  permissions: ['experiences.manage.own'],
  headers: partnerHeaders,
  middleware: [partnerGuard({ supply: 'experiences' })],
  errors: [400, 404],
};

const routes = [
  { method: 'get', path: '/experiences', tags: PUBLIC, summary: 'List experiences', request: { query: schema.publicListQuery }, response: cards, errors: [404], handler: controller.listPublic },
  { method: 'get', path: '/experiences/:slug', tags: PUBLIC, summary: 'Read experience', request: { params: f.slugParams }, response: ok(schema.detailSchema), errors: [404], handler: controller.getPublic },
  {
    method: 'get',
    path: '/experiences/:id/sessions',
    tags: PUBLIC,
    summary: 'List sessions',
    description: 'Upcoming scheduled sessions in [from, to) (default next 30 days, max 120).',
    request: { params: schema.idParams, query: schema.windowQuery },
    response: ok(z.array(schema.sessionSchema)),
    errors: [404],
    handler: controller.listPublicSessions,
  },
  {
    method: 'get',
    path: '/experiences/:id/availability',
    tags: PUBLIC,
    summary: 'Check seats',
    description: 'Indicative seats per session for a party size; bookings re-check under row locks.',
    request: { params: schema.idParams, query: schema.availabilityQuery },
    response: ok(schema.availabilitySchema),
    errors: [404],
    handler: controller.availability,
  },
  {
    method: 'get',
    path: '/destinations/:slug/experiences',
    tags: ['Destinations'],
    summary: 'Get related experiences',
    request: { params: f.slugParams, query: schema.destinationQuery },
    response: cards,
    errors: [404],
    handler: controller.listForDestination,
  },
  { method: 'get', path: '/partners/me/experiences', tags: PARTNER, summary: 'List partner experiences', ...partner, request: { query: schema.partnerListQuery }, response: cards, handler: controller.listMine },
  {
    method: 'post',
    path: '/partners/me/experiences',
    tags: PARTNER,
    summary: 'Create experience',
    description: 'Created in pending_review.',
    ...partner,
    request: { body: schema.createBody },
    response: created(schema.detailSchema),
    errors: [400, 409],
    handler: controller.create,
  },
  {
    method: 'patch',
    path: '/partners/me/experiences/:id',
    tags: PARTNER,
    summary: 'Edit experience',
    ...partner,
    request: { params: schema.idParams, body: schema.updateBody },
    response: ok(schema.detailSchema),
    errors: [400, 404, 409],
    handler: controller.update,
  },
  {
    method: 'post',
    path: '/partners/me/experiences/:id/sessions',
    tags: PARTNER,
    summary: 'Create session',
    ...partner,
    request: { params: schema.idParams, body: schema.sessionBody },
    response: created(schema.sessionSchema),
    handler: controller.createSession,
  },
  {
    method: 'patch',
    path: '/partners/me/experiences/:id/sessions/:sessionId',
    tags: PARTNER,
    summary: 'Update session',
    description: 'Future sessions only (409 SESSION_STARTED).',
    ...partner,
    request: { params: schema.sessionParams, body: schema.updateSessionBody },
    response: ok(schema.sessionSchema),
    errors: [400, 404, 409],
    handler: controller.updateSession,
  },
  {
    method: 'delete',
    path: '/partners/me/experiences/:id/sessions/:sessionId',
    tags: PARTNER,
    summary: 'Remove unused session',
    ...partner,
    request: { params: schema.sessionParams },
    response: { status: 204, description: 'Removed' },
    errors: [400, 404, 409],
    handler: controller.deleteSession,
  },
  {
    method: 'post',
    path: '/partners/me/experiences/:id/media',
    tags: PARTNER,
    summary: 'Attach media',
    ...partner,
    request: { params: schema.idParams, body: schema.mediaBody },
    response: ok(schema.detailSchema),
    handler: controller.attachMedia,
  },
  {
    method: 'delete',
    path: '/partners/me/experiences/:id/media/:mediaId',
    tags: PARTNER,
    summary: 'Detach media',
    ...partner,
    request: { params: schema.mediaParams },
    response: { status: 204, description: 'Detached' },
    handler: controller.detachMedia,
  },
  {
    method: 'get',
    path: '/admin/experiences',
    tags: ['Admin: Experiences'],
    summary: 'Moderation listing',
    auth: 'user',
    permissions: ['experiences.moderate'],
    request: { query: schema.adminListQuery },
    response: cards,
    handler: controller.adminList,
  },
  {
    method: 'patch',
    path: '/admin/experiences/:id/status',
    tags: ['Admin: Experiences'],
    summary: 'Approve, publish or reject',
    auth: 'user',
    permissions: ['experiences.moderate'],
    request: { params: schema.idParams, body: schema.adminStatusBody },
    response: ok(schema.detailSchema),
    errors: [404, 409],
    handler: controller.setStatus,
  },
];

module.exports = routes;
