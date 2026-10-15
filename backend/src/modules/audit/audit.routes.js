'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./audit.controller');
const schema = require('./audit.schema');

const routes = [
  {
    method: 'get',
    path: '/admin/audit-logs',
    tags: ['Admin: Audit'],
    summary: 'Search audit logs',
    description: 'Append-only administrative/security trail, newest first. Dates are local (Asia/Kolkata), inclusive.',
    auth: 'user',
    permissions: ['audit.read'],
    request: { query: schema.searchQuery },
    response: { status: 200, schema: successEnvelope(z.array(schema.auditLogSchema), { paginated: true }) },
    handler: controller.search,
  },
];

module.exports = routes;
