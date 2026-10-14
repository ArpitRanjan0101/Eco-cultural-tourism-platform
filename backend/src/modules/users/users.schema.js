'use strict';

const { z } = require('../../core/validation/zod');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { SORT_COLUMNS } = require('./users.repository');

const roleCode = z.string().regex(/^[a-z][a-z0-9_]{1,49}$/, 'invalid role code');
const permissionCode = z.string().regex(/^[a-z][a-z_]*(\.[a-z][a-z_]*){1,3}$/, 'invalid permission code');
const nullableText = (max) => z.string().trim().min(1).max(max).nullable();
const uniqueArray = (item, { min = 0, max }) =>
  z
    .array(item)
    .min(min)
    .max(max)
    .refine((items) => new Set(items).size === items.length, 'items must be unique');

const idParams = z.object({ id: z.string().uuid() });

const profileSchema = z
  .object({
    avatarMediaId: z.string().uuid().nullable(),
    preferredLanguage: z.string().nullable(),
    country: z.string().nullable(),
    state: z.string().nullable(),
    city: z.string().nullable(),
  })
  .openapi('UserProfile');

const userSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    status: z.enum(['active', 'suspended']),
    emailVerified: z.boolean(),
    phoneVerified: z.boolean(),
    roles: z.array(z.string()),
    lastLoginAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    profile: profileSchema,
  })
  .openapi('User');

const userSummarySchema = userSchema.omit({ profile: true }).openapi('UserSummary');

const roleSchema = z
  .object({ id: z.string().uuid(), code: z.string(), name: z.string(), description: z.string().nullable() })
  .openapi('Role');

const roleWithPermissionsSchema = roleSchema
  .extend({ permissions: z.array(z.string()), userCount: z.number().int() })
  .openapi('RoleWithPermissions');

const permissionSchema = z
  .object({ id: z.string().uuid(), code: z.string(), module: z.string(), description: z.string() })
  .openapi('Permission');

const updateMeBody = z
  .object({
    fullName: z.string().trim().min(1).max(150),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{7,14}$/, 'phone must be E.164, e.g. +919876543210')
      .nullable(),
    preferredLanguage: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'language must look like "en" or "hi-IN"')
      .nullable(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, 'country must be an ISO 3166-1 alpha-2 code')
      .nullable(),
    state: nullableText(100),
    city: nullableText(100),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'at least one field is required');

const adminUserListQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'suspended']).optional(),
    role: roleCode.optional(),
    sort: sortQuery(SORT_COLUMNS, '-createdAt'),
  })
  .strict();

const setStatusBody = z
  .object({
    status: z.enum(['active', 'suspended']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .refine((body) => body.status !== 'suspended' || body.reason, {
    message: 'reason is required when suspending a user',
    path: ['reason'],
  });

const setRolesBody = z.object({ roles: uniqueArray(roleCode, { min: 1, max: 10 }) }).strict();

const setRolePermissionsBody = z.object({ permissions: uniqueArray(permissionCode, { max: 500 }) }).strict();

module.exports = {
  idParams,
  userSchema,
  userSummarySchema,
  roleSchema,
  roleWithPermissionsSchema,
  permissionSchema,
  updateMeBody,
  adminUserListQuery,
  setStatusBody,
  setRolesBody,
  setRolePermissionsBody,
};
