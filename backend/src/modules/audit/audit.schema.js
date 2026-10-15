'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');

const searchQuery = z
  .object({
    ...paginationQuery,
    actorUserId: f.uuid.optional(),
    entityType: z.string().regex(/^[a-z][a-z_]{0,49}$/).optional(),
    entityId: z.string().trim().min(1).max(100).optional(),
    action: z
      .string()
      .regex(/^[a-z][a-z_.]{0,99}$/)
      .optional()
      .openapi({ description: 'Exact action or prefix, e.g. "reviews." or "partners.status_changed"' }),
    from: f.date.optional(),
    to: f.date.optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.to >= q.from, { message: 'to must be on or after from', path: ['to'] });

const auditLogSchema = z
  .object({
    id: z.string().uuid(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    actor: z.object({ id: z.string().uuid(), email: z.string().nullable(), fullName: z.string().nullable() }).nullable(),
    oldValues: z.record(z.unknown()).nullable(),
    newValues: z.record(z.unknown()).nullable(),
    ipAddress: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('AuditLog');

module.exports = { searchQuery, auditLogSchema };
