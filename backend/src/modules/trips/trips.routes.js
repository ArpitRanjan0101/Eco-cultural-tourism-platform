'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./trips.controller');
const schema = require('./trips.schema');

const TAGS = ['Trip planner'];
const own = { auth: 'user', permissions: ['trips.manage.own'] };
const trip = { status: 200, schema: successEnvelope(schema.tripSchema) };
const created = { status: 201, schema: successEnvelope(schema.tripSchema) };

// Static '/stops/reorder' is registered before '/stops/:stopId' (DECISIONS C7). Mutations return the full trip.
const routes = [
  {
    method: 'get',
    path: '/trips',
    tags: TAGS,
    summary: 'List own trips',
    ...own,
    request: { query: schema.listQuery },
    response: { status: 200, schema: successEnvelope(z.array(schema.tripSummarySchema), { paginated: true }) },
    handler: controller.list,
  },
  {
    method: 'post',
    path: '/trips',
    tags: TAGS,
    summary: 'Create trip',
    description: 'A trip with dates starts with one empty day per date. Trips never reserve anything.',
    ...own,
    request: { body: schema.createBody },
    response: created,
    handler: controller.create,
  },
  { method: 'get', path: '/trips/:id', tags: TAGS, summary: 'Read trip', ...own, request: { params: schema.tripParams }, response: trip, errors: [404], handler: controller.get },
  {
    method: 'patch',
    path: '/trips/:id',
    tags: TAGS,
    summary: 'Edit trip',
    description: 'Changing dates re-dates the days; shortening below existing days is refused (409 DAYS_OUTSIDE_RANGE).',
    ...own,
    request: { params: schema.tripParams, body: schema.updateBody },
    response: trip,
    errors: [404, 409],
    handler: controller.update,
  },
  {
    method: 'delete',
    path: '/trips/:id',
    tags: TAGS,
    summary: 'Delete draft trip',
    description: 'Only drafts; planned trips are archived via PATCH status (409 TRIP_NOT_DRAFT).',
    ...own,
    request: { params: schema.tripParams },
    response: { status: 204, description: 'Deleted' },
    errors: [404, 409],
    handler: controller.remove,
  },
  {
    method: 'post',
    path: '/trips/:id/days',
    tags: TAGS,
    summary: 'Add itinerary day',
    ...own,
    request: { params: schema.tripParams, body: schema.dayBody },
    response: created,
    errors: [404, 409],
    handler: controller.addDay,
  },
  {
    method: 'patch',
    path: '/trips/:id/days/:dayId',
    tags: TAGS,
    summary: 'Edit itinerary day',
    ...own,
    request: { params: schema.dayParams, body: schema.updateDayBody },
    response: trip,
    errors: [404, 409],
    handler: controller.updateDay,
  },
  {
    method: 'delete',
    path: '/trips/:id/days/:dayId',
    tags: TAGS,
    summary: 'Remove day',
    description: 'Removes the day and its stops; returns the updated trip.',
    ...own,
    request: { params: schema.dayParams },
    response: trip,
    errors: [404],
    handler: controller.deleteDay,
  },
  {
    method: 'post',
    path: '/trips/:id/days/:dayId/stops',
    tags: TAGS,
    summary: 'Add day stop',
    description: 'Appended at the end of the day. destinationId must be a published destination; title defaults to its name.',
    ...own,
    request: { params: schema.dayParams, body: schema.createStopBody },
    response: created,
    errors: [404, 409],
    handler: controller.addStop,
  },
  {
    method: 'patch',
    path: '/trips/:id/stops/reorder',
    tags: TAGS,
    summary: 'Reorder stops',
    description: 'Each listed day receives exactly its listed stops in order; stops may move between listed days.',
    ...own,
    request: { params: schema.tripParams, body: schema.reorderBody },
    response: trip,
    errors: [404, 409],
    handler: controller.reorderStops,
  },
  {
    method: 'patch',
    path: '/trips/:id/stops/:stopId',
    tags: TAGS,
    summary: 'Edit stop',
    ...own,
    request: { params: schema.stopParams, body: schema.updateStopBody },
    response: trip,
    errors: [404],
    handler: controller.updateStop,
  },
  {
    method: 'delete',
    path: '/trips/:id/stops/:stopId',
    tags: TAGS,
    summary: 'Delete stop',
    description: 'Remaining stops of the day are renumbered; returns the updated trip.',
    ...own,
    request: { params: schema.stopParams },
    response: trip,
    errors: [404],
    handler: controller.deleteStop,
  },
];

module.exports = routes;
