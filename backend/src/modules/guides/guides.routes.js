'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./guides.controller');
const schema = require('./guides.schema');
const { partnerGuard } = require('../partners/partners.service');
const { partnerHeaders } = require('../partners/partners.schema');

const PUBLIC = ['Guides'];
const PARTNER = ['Partner: Guides'];
const ADMIN = ['Admin: Guides'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });
const created = (dataSchema) => ({ status: 201, schema: successEnvelope(dataSchema) });
const cards = ok(z.array(schema.guideCardSchema), { paginated: true });

const partner = {
  auth: 'user',
  permissions: ['guides.manage.own'],
  headers: partnerHeaders,
  middleware: [partnerGuard({ supply: 'guides' })],
  errors: [400, 404],
};
const verify = { auth: 'user', permissions: ['guides.verify'] };
const languages = { auth: 'user', permissions: ['languages.manage'] };

const routes = [
  {
    method: 'get',
    path: '/guides',
    tags: PUBLIC,
    summary: 'Search guides',
    description: 'Only active, verified guides of approved partners.',
    request: { query: schema.publicListQuery },
    response: cards,
    errors: [404],
    handler: controller.listPublic,
  },
  { method: 'get', path: '/guides/:id', tags: PUBLIC, summary: 'Read guide', request: { params: schema.guideParams }, response: ok(schema.guideDetailSchema), errors: [404], handler: controller.getPublic },
  {
    method: 'get',
    path: '/guides/:id/services',
    tags: PUBLIC,
    summary: 'Read guide services',
    request: { params: schema.guideParams },
    response: ok(z.array(schema.serviceSchema)),
    errors: [404],
    handler: controller.listPublicServices,
  },
  {
    method: 'get',
    path: '/guides/:id/availability',
    tags: PUBLIC,
    summary: 'Read available slots',
    description: 'Published availability windows (default next 14 days, max 92).',
    request: { params: schema.guideParams, query: schema.availabilityQuery },
    response: ok(schema.availabilitySchema),
    errors: [404],
    handler: controller.publicAvailability,
  },
  { method: 'get', path: '/languages', tags: PUBLIC, summary: 'List supported languages', response: ok(z.array(schema.languageSchema)), handler: controller.listLanguages },
  {
    method: 'get',
    path: '/destinations/:slug/guides',
    tags: ['Destinations'],
    summary: 'Find guides for destination',
    request: { params: f.slugParams, query: schema.destinationGuidesQuery },
    response: cards,
    errors: [404],
    handler: controller.listForDestination,
  },

  { method: 'get', path: '/partners/me/guides', tags: PARTNER, summary: 'List partner guides', ...partner, request: { query: schema.partnerListQuery }, response: cards, handler: controller.listMine },
  {
    method: 'post',
    path: '/partners/me/guides',
    tags: PARTNER,
    summary: 'Create guide profile',
    description: 'Optional userId must be a member of the organisation; guides become public once verified.',
    ...partner,
    request: { body: schema.createBody },
    response: created(schema.guideDetailSchema),
    errors: [400, 409],
    handler: controller.create,
  },
  {
    method: 'patch',
    path: '/partners/me/guides/:id',
    tags: PARTNER,
    summary: 'Edit guide profile',
    ...partner,
    request: { params: schema.guideParams, body: schema.updateBody },
    response: ok(schema.guideDetailSchema),
    errors: [400, 404, 409],
    handler: controller.update,
  },
  {
    method: 'put',
    path: '/partners/me/guides/:id/languages',
    tags: PARTNER,
    summary: 'Set guide languages',
    ...partner,
    request: { params: schema.guideParams, body: schema.languagesBody },
    response: ok(schema.guideDetailSchema),
    handler: controller.setLanguages,
  },
  {
    method: 'put',
    path: '/partners/me/guides/:id/destinations',
    tags: PARTNER,
    summary: 'Set guide destinations',
    ...partner,
    request: { params: schema.guideParams, body: schema.destinationsBody },
    response: ok(schema.guideDetailSchema),
    handler: controller.setDestinations,
  },
  {
    method: 'post',
    path: '/partners/me/guides/:id/services',
    tags: PARTNER,
    summary: 'Create guide service',
    ...partner,
    request: { params: schema.guideParams, body: schema.createServiceBody },
    response: created(schema.serviceSchema),
    handler: controller.createService,
  },
  {
    method: 'patch',
    path: '/partners/me/guides/:id/services/:serviceId',
    tags: PARTNER,
    summary: 'Edit guide service',
    ...partner,
    request: { params: schema.serviceParams, body: schema.updateServiceBody },
    response: ok(schema.serviceSchema),
    handler: controller.updateService,
  },
  {
    method: 'patch',
    path: '/partners/me/guides/:id/services/:serviceId/status',
    tags: PARTNER,
    summary: 'Set guide service status',
    ...partner,
    request: { params: schema.serviceParams, body: schema.serviceStatusBody },
    response: ok(schema.serviceSchema),
    handler: controller.setServiceStatus,
  },
  {
    method: 'put',
    path: '/partners/me/guides/:id/availability',
    tags: PARTNER,
    summary: 'Update guide availability',
    description: 'Replaces every window between from and to (max 92 days, not in the past). Overlapping windows are rejected (422).',
    ...partner,
    request: { params: schema.guideParams, body: schema.availabilityBody },
    response: ok(schema.availabilitySchema),
    handler: controller.setAvailability,
  },
  {
    method: 'post',
    path: '/partners/me/guides/:id/documents',
    tags: PARTNER,
    summary: 'Submit verification documents',
    description: 'Attaches a private verification_document upload; an unverified/rejected guide moves to pending review.',
    ...partner,
    request: { params: schema.guideParams, body: schema.documentBody },
    response: created(schema.documentSchema),
    errors: [400, 404, 409],
    handler: controller.addDocument,
  },

  { method: 'get', path: '/admin/guides', tags: ADMIN, summary: 'Verification/moderation list', ...verify, request: { query: schema.adminListQuery }, response: cards, handler: controller.adminList },
  {
    method: 'get',
    path: '/admin/guides/:id',
    tags: ADMIN,
    summary: 'Guide review detail',
    description: 'Includes verification documents with 5-minute signed URLs.',
    ...verify,
    request: { params: schema.guideParams },
    response: ok(schema.adminGuideSchema),
    errors: [404],
    handler: controller.adminGet,
  },
  {
    method: 'patch',
    path: '/admin/guides/:id/verification',
    tags: ADMIN,
    summary: 'Approve/reject verification',
    description: 'Reviewers cannot verify guides of an organisation they belong to.',
    ...verify,
    request: { params: schema.guideParams, body: schema.verificationBody },
    response: ok(schema.adminGuideSchema),
    errors: [404],
    handler: controller.setVerification,
  },
  {
    method: 'patch',
    path: '/admin/guides/:id/status',
    tags: ADMIN,
    summary: 'Activate/suspend guide',
    ...verify,
    request: { params: schema.guideParams, body: schema.adminStatusBody },
    response: ok(schema.adminGuideSchema),
    errors: [404],
    handler: controller.setStatus,
  },
  { method: 'get', path: '/admin/languages', tags: ADMIN, summary: 'Manage language list', ...languages, response: ok(z.array(schema.languageSchema)), handler: controller.listLanguages },
  {
    method: 'post',
    path: '/admin/languages',
    tags: ADMIN,
    summary: 'Add supported language',
    ...languages,
    request: { body: schema.languageBody },
    response: created(schema.languageSchema),
    errors: [409],
    handler: controller.createLanguage,
  },
  {
    method: 'patch',
    path: '/admin/languages/:id',
    tags: ADMIN,
    summary: 'Update language',
    ...languages,
    request: { params: f.idParams, body: schema.updateLanguageBody },
    response: ok(schema.languageSchema),
    errors: [404],
    handler: controller.updateLanguage,
  },
];

module.exports = routes;
