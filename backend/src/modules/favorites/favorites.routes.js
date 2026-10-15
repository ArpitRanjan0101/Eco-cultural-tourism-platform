'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./favorites.controller');
const schema = require('./favorites.schema');

const TAGS = ['Favorites'];
const own = { auth: 'user', permissions: ['favorites.manage.own'] };

const routes = [
  {
    method: 'get',
    path: '/favorites',
    tags: TAGS,
    summary: 'List favorites',
    ...own,
    request: { query: schema.listQuery },
    response: { status: 200, schema: successEnvelope(z.array(schema.favoriteSchema), { paginated: true }) },
    handler: controller.list,
  },
  {
    method: 'post',
    path: '/favorites',
    tags: TAGS,
    summary: 'Save item',
    description: 'Only publicly listed items. Idempotent: 201 when newly saved, 200 when it was already saved.',
    ...own,
    request: { body: schema.addBody },
    response: { status: 201, schema: successEnvelope(schema.favoriteSchema) },
    errors: [404],
    handler: controller.add,
  },
  {
    method: 'delete',
    path: '/favorites/:type/:id',
    tags: TAGS,
    summary: 'Remove saved item',
    ...own,
    request: { params: schema.removeParams },
    response: { status: 204, description: 'Removed' },
    errors: [404],
    handler: controller.remove,
  },
];

module.exports = routes;
