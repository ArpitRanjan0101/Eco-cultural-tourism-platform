'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./geography.controller');
const schema = require('./geography.schema');

const PUBLIC = ['Geography'];
const ADMIN = ['Admin: Geography'];
const ok = (dataSchema) => ({ status: 200, schema: successEnvelope(dataSchema) });
const created = (dataSchema) => ({ status: 201, schema: successEnvelope(dataSchema) });
const admin = { auth: 'user', permissions: ['geography.manage'] };

// GET /districts/:slug/destinations is served by the destinations module.
const routes = [
  { method: 'get', path: '/regions', tags: PUBLIC, summary: 'List regions', response: ok(z.array(schema.regionSchema)), handler: controller.listPublicRegions },
  {
    method: 'get',
    path: '/districts',
    tags: PUBLIC,
    summary: 'List districts',
    request: { query: schema.publicDistrictQuery },
    response: ok(z.array(schema.districtSchema)),
    handler: controller.listPublicDistricts,
  },
  {
    method: 'get',
    path: '/districts/:slug',
    tags: PUBLIC,
    summary: 'Get district',
    request: { params: f.slugParams },
    response: ok(schema.districtSchema),
    errors: [404],
    handler: controller.getPublicDistrict,
  },

  {
    method: 'get',
    path: '/admin/regions',
    tags: ADMIN,
    summary: 'List managed regions',
    ...admin,
    request: { query: schema.adminListQuery },
    response: ok(z.array(schema.regionSchema)),
    handler: controller.listRegions,
  },
  {
    method: 'post',
    path: '/admin/regions',
    tags: ADMIN,
    summary: 'Create region',
    ...admin,
    request: { body: schema.createRegionBody },
    response: created(schema.regionSchema),
    errors: [409],
    handler: controller.createRegion,
  },
  {
    method: 'patch',
    path: '/admin/regions/:id',
    tags: ADMIN,
    summary: 'Update region',
    ...admin,
    request: { params: f.idParams, body: schema.updateRegionBody },
    response: ok(schema.regionSchema),
    errors: [404, 409],
    handler: controller.updateRegion,
  },
  {
    method: 'patch',
    path: '/admin/regions/:id/status',
    tags: ADMIN,
    summary: 'Set region status',
    ...admin,
    request: { params: f.idParams, body: schema.activeStatusBody },
    response: ok(schema.regionSchema),
    errors: [404],
    handler: controller.setRegionStatus,
  },
  {
    method: 'get',
    path: '/admin/districts',
    tags: ADMIN,
    summary: 'List managed districts',
    ...admin,
    request: { query: schema.adminDistrictQuery },
    response: ok(z.array(schema.districtSchema)),
    handler: controller.listDistricts,
  },
  {
    method: 'post',
    path: '/admin/districts',
    tags: ADMIN,
    summary: 'Create district',
    ...admin,
    request: { body: schema.createDistrictBody },
    response: created(schema.districtSchema),
    errors: [404, 409],
    handler: controller.createDistrict,
  },
  {
    method: 'patch',
    path: '/admin/districts/:id',
    tags: ADMIN,
    summary: 'Update district',
    ...admin,
    request: { params: f.idParams, body: schema.updateDistrictBody },
    response: ok(schema.districtSchema),
    errors: [404, 409],
    handler: controller.updateDistrict,
  },
  {
    method: 'patch',
    path: '/admin/districts/:id/status',
    tags: ADMIN,
    summary: 'Set district status',
    ...admin,
    request: { params: f.idParams, body: schema.activeStatusBody },
    response: ok(schema.districtSchema),
    errors: [404],
    handler: controller.setDistrictStatus,
  },
];

module.exports = routes;
