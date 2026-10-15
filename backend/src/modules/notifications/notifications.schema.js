'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');

const notificationSchema = z
  .object({
    id: z.string().uuid(),
    type: z.string(),
    title: z.string(),
    message: z.string(),
    relatedType: z.string().nullable(),
    relatedId: z.string().uuid().nullable(),
    read: z.boolean(),
    readAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('Notification');

const templateSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    channel: z.enum(['email', 'in_app']),
    subject: z.string(),
    body: z.string(),
    status: f.activeStatus,
    updatedAt: z.string().datetime(),
  })
  .openapi('NotificationTemplate');

const listQuery = z
  .object({ ...paginationQuery, unreadOnly: z.enum(['true', 'false']).transform((v) => v === 'true').default('false') })
  .strict();

// Templates are plain text with {{placeholders}}; values and text are escaped when rendered as HTML.
const updateTemplateBody = z
  .object({ subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000), status: f.activeStatus })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');

module.exports = { notificationSchema, templateSchema, listQuery, updateTemplateBody, idParams: f.idParams };
