'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const controller = require('./notifications.controller');
const schema = require('./notifications.schema');

const TAGS = ['Notifications'];
const own = { auth: 'user', permissions: ['notifications.read.own'] };
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });

const routes = [
  {
    method: 'get',
    path: '/notifications',
    tags: TAGS,
    summary: 'Read in-app inbox',
    ...own,
    request: { query: schema.listQuery },
    response: ok(z.array(schema.notificationSchema), { paginated: true }),
    handler: controller.listOwn,
  },
  {
    method: 'get',
    path: '/notifications/unread-count',
    tags: TAGS,
    summary: 'Get unread count',
    ...own,
    response: ok(z.object({ unread: z.number().int() })),
    handler: controller.unreadCount,
  },
  {
    method: 'patch',
    path: '/notifications/:id/read',
    tags: TAGS,
    summary: 'Mark own item read',
    ...own,
    request: { params: schema.idParams },
    response: ok(schema.notificationSchema),
    errors: [404],
    handler: controller.markRead,
  },
  {
    method: 'post',
    path: '/notifications/read-all',
    tags: TAGS,
    summary: 'Mark all own items read',
    ...own,
    response: ok(z.object({ updated: z.number().int() })),
    handler: controller.markAllRead,
  },
  {
    method: 'get',
    path: '/admin/notification-templates',
    tags: ['Admin: Notifications'],
    summary: 'List templates',
    auth: 'user',
    permissions: ['notification_templates.manage'],
    response: ok(z.array(schema.templateSchema)),
    handler: controller.listTemplates,
  },
  {
    method: 'patch',
    path: '/admin/notification-templates/:id',
    tags: ['Admin: Notifications'],
    summary: 'Edit template',
    description: 'Plain text with {{placeholders}}; rendered values and text are HTML-escaped in email. Inactive templates are not sent. Audited.',
    auth: 'user',
    permissions: ['notification_templates.manage'],
    request: { params: schema.idParams, body: schema.updateTemplateBody },
    response: ok(schema.templateSchema),
    errors: [404],
    handler: controller.updateTemplate,
  },
];

module.exports = routes;
