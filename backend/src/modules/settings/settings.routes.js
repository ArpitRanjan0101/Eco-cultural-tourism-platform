'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./settings.controller');
const schema = require('./settings.schema');

const TAGS = ['Admin: Settings'];
const list = { status: 200, schema: successEnvelope(z.array(schema.settingSchema)) };

const routes = [
  {
    method: 'get',
    path: '/admin/settings',
    tags: TAGS,
    summary: 'Read platform settings',
    description: 'Every approved key with its effective value and default.',
    auth: 'user',
    permissions: ['settings.read'],
    response: list,
    handler: controller.list,
  },
  {
    method: 'patch',
    path: '/admin/settings',
    tags: TAGS,
    summary: 'Change platform settings',
    description:
      'Body `{ values: { "<key>": value } }` with per-key validation; `null` restores the default. Atomic, audited per key. ' +
      'Applies to bookings created afterwards; other API instances pick changes up within 30 s.',
    auth: 'user',
    permissions: ['settings.write'],
    request: { body: schema.updateBody },
    response: list,
    handler: controller.update,
  },
];

module.exports = routes;
