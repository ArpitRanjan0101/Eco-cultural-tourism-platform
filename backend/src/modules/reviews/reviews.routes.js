'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./reviews.controller');
const schema = require('./reviews.schema');

const TAGS = ['Reviews'];
const ADMIN = ['Admin: Reviews'];
const write = { auth: 'user', permissions: ['reviews.write.own'] };
const moderate = { auth: 'user', permissions: ['reviews.moderate'] };
const subjectReviews = { status: 200, schema: schema.subjectReviewsEnvelope };

const routes = [
  {
    method: 'get',
    path: '/destinations/:slug/reviews',
    tags: ['Destinations', ...TAGS],
    summary: 'List destination reviews',
    description: 'Approved reviews with the rating summary in meta.rating.',
    request: { params: f.slugParams, query: schema.pageQuery },
    response: subjectReviews,
    errors: [404],
    handler: controller.listForDestination,
  },
  {
    method: 'get',
    path: '/reviews',
    tags: TAGS,
    summary: 'List reviews of an item',
    description: 'Approved reviews of a publicly listed destination/property/guide/experience/package, rating summary in meta.rating.',
    request: { query: schema.subjectQuery },
    response: subjectReviews,
    errors: [404],
    handler: controller.listForSubject,
  },
  {
    method: 'post',
    path: '/reviews',
    tags: TAGS,
    summary: 'Write review',
    description:
      'Bookable items need bookingId of the author\'s own completed booking of that item (one review per booking; 422 BOOKING_NOT_REVIEWABLE). ' +
      'Destinations take one review per user without a booking. New reviews are pending until moderated.',
    ...write,
    rateLimit: { name: 'reviews_create', windowSeconds: 3600, max: 20, by: 'user' },
    request: { body: schema.createBody },
    response: { status: 201, schema: successEnvelope(schema.ownReviewSchema) },
    errors: [404, 409, 422],
    handler: controller.create,
  },
  {
    method: 'patch',
    path: '/reviews/:id',
    tags: TAGS,
    summary: 'Edit own review',
    description: 'The edited review returns to pending moderation.',
    ...write,
    request: { params: f.idParams, body: schema.updateBody },
    response: { status: 200, schema: successEnvelope(schema.ownReviewSchema) },
    errors: [404],
    handler: controller.update,
  },
  {
    method: 'delete',
    path: '/reviews/:id',
    tags: TAGS,
    summary: 'Delete own review',
    ...write,
    request: { params: f.idParams },
    response: { status: 204, description: 'Deleted' },
    errors: [404],
    handler: controller.remove,
  },
  {
    method: 'get',
    path: '/admin/reviews',
    tags: ADMIN,
    summary: 'Moderation queue',
    description: 'Oldest first; filter by status/subjectType.',
    ...moderate,
    request: { query: schema.moderationQuery },
    response: { status: 200, schema: successEnvelope(z.array(schema.adminReviewSchema), { paginated: true }) },
    handler: controller.listForModeration,
  },
  {
    method: 'patch',
    path: '/admin/reviews/:id/status',
    tags: ADMIN,
    summary: 'Moderate review',
    description: 'approved (public), hidden or rejected (note required). Audited.',
    ...moderate,
    request: { params: f.idParams, body: schema.moderateBody },
    response: { status: 200, schema: successEnvelope(schema.adminReviewSchema) },
    errors: [404],
    handler: controller.moderate,
  },
];

module.exports = routes;
