'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { mediaSchema } = require('../media/media.schema');
const { SORT_COLUMNS } = require('./partners.repository');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');

const partnerType = z.enum(['accommodation', 'guide', 'operator', 'multi']);
const partnerStatus = z.enum(['pending', 'approved', 'rejected', 'suspended']);
const memberRole = z.enum(['owner', 'manager', 'staff']);
const documentType = z.enum(['business_registration', 'gst_certificate', 'pan_card', 'identity_proof', 'address_proof', 'tourism_license', 'other']);

/** Documents the optional organisation selector for users in several partner organisations. */
const partnerHeaders = z.object({
  'x-partner-id': z.string().uuid().optional().openapi({ description: 'Required only when the user belongs to several partner organisations' }),
});

const partnerFields = {
  partnerType,
  businessName: f.name(200),
  legalName: f.name(200),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'phone must be E.164').nullable(),
  address: f.optionalText(500),
  taxIdentifier: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8,20}$/, 'tax identifier must be 8-20 letters/digits (e.g. GSTIN or PAN)').nullable(),
};

const applyBody = z
  .object(partnerFields)
  .partial({ phone: true, address: true, taxIdentifier: true })
  .strict();
const updateMineBody = atLeastOne(z.object(partnerFields).partial().strict());
const documentBody = z.object({ mediaId: f.uuid, documentType }).strict();
const addMemberBody = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: memberRole.default('staff') }).strict();
const memberRoleBody = z.object({ role: memberRole }).strict();
const userIdParams = z.object({ userId: f.uuid });

const adminListQuery = z
  .object({
    ...paginationQuery,
    status: partnerStatus.optional(),
    partnerType: partnerType.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: sortQuery(SORT_COLUMNS, '-createdAt'),
  })
  .strict();
const adminStatusBody = z
  .object({ status: partnerStatus, notes: z.string().trim().min(3).max(2000).optional() })
  .strict()
  .refine((body) => !['rejected', 'suspended'].includes(body.status) || body.notes, {
    message: 'notes are required when rejecting or suspending',
    path: ['notes'],
  });

const partnerSchema = z
  .object({
    id: z.string().uuid(),
    partnerType,
    businessName: z.string(),
    legalName: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    taxIdentifier: z.string().nullable(),
    status: partnerStatus,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Partner');
const myPartnerSchema = partnerSchema.extend({ myRole: memberRole }).openapi('MyPartner');
const memberSchema = z
  .object({ userId: z.string().uuid(), fullName: z.string(), email: z.string(), role: memberRole, joinedAt: z.string().datetime() })
  .openapi('PartnerMember');
const documentSchema = z
  .object({
    id: z.string().uuid(),
    mediaId: z.string().uuid(),
    documentType,
    reviewStatus: z.enum(['pending', 'approved', 'rejected']),
    reviewedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('PartnerDocument');
const partnerDetailSchema = partnerSchema
  .extend({
    members: z.array(memberSchema),
    documents: z.array(documentSchema),
    history: z.array(
      z.object({
        previousStatus: z.string().nullable(),
        newStatus: z.string(),
        reviewedBy: z.string().uuid().nullable(),
        notes: z.string().nullable(),
        createdAt: z.string().datetime(),
      }),
    ),
  })
  .openapi('PartnerDetail');
const reviewDocumentSchema = documentSchema.extend({ media: mediaSchema.nullable() }).openapi('PartnerDocumentForReview');

module.exports = {
  partnerHeaders,
  applyBody,
  updateMineBody,
  documentBody,
  addMemberBody,
  memberRoleBody,
  userIdParams,
  adminListQuery,
  adminStatusBody,
  partnerSchema,
  myPartnerSchema,
  memberSchema,
  documentSchema,
  partnerDetailSchema,
  reviewDocumentSchema,
};
