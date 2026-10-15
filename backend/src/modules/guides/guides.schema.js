'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { imageSchema } = require('../destinations/destinations.schema');
const { mediaSchema } = require('../media/media.schema');
const { SORT_COLUMNS } = require('./guides.repository');

const { date, money, time, bookingMode } = f;
const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');
const verificationStatus = z.enum(['unverified', 'pending', 'verified', 'rejected']);
const guideStatus = z.enum(['active', 'inactive', 'suspended']);
const ref = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });

// ---- responses ----
const languageSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }).openapi('GuideLanguage');
const serviceSchema = z
  .object({
    id: z.string().uuid(),
    guideId: z.string().uuid(),
    title: z.string(),
    durationMinutes: z.number().int(),
    price: z.string(),
    currency: z.string(),
    maxGroupSize: z.number().int(),
    description: z.string().nullable(),
    bookingMode,
    status: z.enum(['active', 'inactive']),
  })
  .openapi('GuideService');
const guideCardSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    yearsExperience: z.number().int(),
    startingPrice: z.string().nullable(),
    currency: z.string(),
    photo: imageSchema.nullable(),
    languages: z.array(languageSchema),
    destinations: z.array(ref),
    partner: z.object({ id: z.string().uuid(), businessName: z.string() }).nullable(),
    verificationStatus: verificationStatus.optional(),
    status: guideStatus.optional(),
  })
  .openapi('GuideCard');
const guideDetailSchema = guideCardSchema.extend({ bio: z.string().nullable(), services: z.array(serviceSchema) }).openapi('GuideDetail');
const documentSchema = z
  .object({
    id: z.string().uuid(),
    mediaId: z.string().uuid(),
    documentType: z.string(),
    reviewStatus: z.enum(['pending', 'approved', 'rejected']),
    reviewedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('GuideDocument');
const adminGuideSchema = guideDetailSchema.extend({ documents: z.array(documentSchema.extend({ media: mediaSchema.nullable() })) }).openapi('GuideReview');
const availabilitySchema = z
  .object({
    guideId: z.string().uuid(),
    from: z.string(),
    to: z.string(),
    slots: z.array(
      z.object({ id: z.string().uuid().optional(), date: z.string(), startTime: z.string(), endTime: z.string(), status: z.enum(['available', 'blocked']).optional() }),
    ),
  })
  .openapi('GuideAvailability');

// ---- requests ----
const publicListQuery = z
  .object({
    ...paginationQuery,
    destination: f.slug.optional(),
    language: z.string().regex(/^[a-z]{2,3}$/).optional(),
    q: z.string().trim().min(2).max(100).optional(),
    sort: sortQuery(SORT_COLUMNS, 'displayName'),
  })
  .strict();
const destinationGuidesQuery = publicListQuery.omit({ destination: true });
const availabilityQuery = z.object({ from: date.optional(), to: date.optional() }).strict();
const partnerListQuery = z
  .object({ ...paginationQuery, verificationStatus: verificationStatus.optional(), status: guideStatus.optional(), sort: sortQuery(SORT_COLUMNS, '-createdAt') })
  .strict();
const adminListQuery = partnerListQuery.extend({ q: z.string().trim().min(2).max(100).optional() }).strict();

const guideFields = {
  displayName: f.name(150),
  userId: f.uuid.nullable(),
  photoMediaId: f.uuid.nullable(),
  bio: f.optionalText(5000),
  yearsExperience: z.number().int().min(0).max(80),
};
const createBody = z.object(guideFields).partial().required({ displayName: true }).strict();
const updateBody = atLeastOne(z.object({ ...guideFields, status: z.enum(['active', 'inactive']) }).partial().strict());
const languagesBody = z.object({ languageIds: f.uniqueIds({ max: 20 }) }).strict();
const destinationsBody = z.object({ destinationIds: f.uniqueIds({ max: 50 }) }).strict();

const serviceFields = {
  title: f.name(150),
  durationMinutes: z.number().int().min(30).max(4320),
  price: money,
  maxGroupSize: z.number().int().min(1).max(100),
  description: f.optionalText(5000),
  bookingMode,
};
const createServiceBody = z.object(serviceFields).partial({ description: true, bookingMode: true }).strict();
const updateServiceBody = atLeastOne(z.object(serviceFields).partial().strict());
const serviceStatusBody = f.statusBody(z.enum(['active', 'inactive']));

const availabilityBody = z
  .object({
    from: date,
    to: date,
    slots: z
      .array(
        z
          .object({ date, startTime: time, endTime: time, status: z.enum(['available', 'blocked']).default('available') })
          .strict()
          .refine((slot) => slot.startTime < slot.endTime, { message: 'startTime must be before endTime', path: ['endTime'] }),
      )
      .max(500),
  })
  .strict();
const documentBody = z
  .object({ mediaId: f.uuid, documentType: z.enum(['government_id', 'guide_license', 'training_certificate', 'police_verification', 'other']) })
  .strict();

const verificationBody = z
  .object({ verificationStatus: z.enum(['verified', 'rejected']), notes: z.string().trim().min(3).max(2000).optional() })
  .strict()
  .refine((b) => b.verificationStatus !== 'rejected' || b.notes, { message: 'notes are required when rejecting', path: ['notes'] });
const adminStatusBody = z
  .object({ status: guideStatus, reason: z.string().trim().min(3).max(1000).optional() })
  .strict()
  .refine((b) => b.status !== 'suspended' || b.reason, { message: 'reason is required when suspending', path: ['reason'] });
const languageBody = z.object({ code: z.string().regex(/^[a-z]{2,3}$/, 'ISO 639 code, e.g. "hi" or "sat"'), name: f.name(100) }).strict();
const updateLanguageBody = z.object({ name: f.name(100) }).strict();

const guideParams = z.object({ id: f.uuid });
const serviceParams = z.object({ id: f.uuid, serviceId: f.uuid });

module.exports = {
  languageSchema,
  serviceSchema,
  guideCardSchema,
  guideDetailSchema,
  documentSchema,
  adminGuideSchema,
  availabilitySchema,
  publicListQuery,
  destinationGuidesQuery,
  availabilityQuery,
  partnerListQuery,
  adminListQuery,
  createBody,
  updateBody,
  languagesBody,
  destinationsBody,
  createServiceBody,
  updateServiceBody,
  serviceStatusBody,
  availabilityBody,
  documentBody,
  verificationBody,
  adminStatusBody,
  languageBody,
  updateLanguageBody,
  guideParams,
  serviceParams,
};
