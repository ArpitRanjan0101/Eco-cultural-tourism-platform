'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { districtRefSchema } = require('../geography/geography.schema');
const { SORT_COLUMNS } = require('./destinations.repository');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

// ---- opening hours (strict JSON shape stored in JSONB) ----
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24h)');
const timeRange = z
  .object({ open: time, close: time })
  .strict()
  .refine((range) => range.open < range.close, 'open must be before close');
const day = z.array(timeRange).max(4);
const openingHours = z
  .object({
    monday: day,
    tuesday: day,
    wednesday: day,
    thursday: day,
    friday: day,
    saturday: day,
    sunday: day,
    notes: z.string().trim().max(500),
  })
  .partial()
  .strict()
  .openapi('OpeningHours');

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'amount must be a decimal string, e.g. "50.00"');

// ---- response schemas ----
const imageSchema = z
  .object({ id: z.string().uuid(), url: z.string().url(), altText: z.string().nullable(), width: z.number().int().nullable(), height: z.number().int().nullable() })
  .openapi('Image');
const categoryRef = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });

const categorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    status: f.activeStatus,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('DestinationCategory');

const destinationCardSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    summary: z.string().nullable(),
    featured: z.boolean(),
    entryFee: z.string().nullable(),
    location: f.geoPoint.nullable(),
    district: districtRefSchema.nullable(),
    coverImage: imageSchema.nullable(),
    categories: z.array(categoryRef),
    distanceKm: z.number().optional().openapi({ description: 'Only on nearby results' }),
    status: f.publishStatus.optional().openapi({ description: 'Admin views only' }),
  })
  .openapi('DestinationCard');

const destinationDetailSchema = destinationCardSchema
  .extend({
    description: z.string().nullable(),
    address: z.string().nullable(),
    openingHours: openingHours.nullable(),
    bestTimeToVisit: z.string().nullable(),
    publishedAt: z.string().datetime().nullable(),
    gallery: z.array(imageSchema.extend({ sortOrder: z.number().int(), isCover: z.boolean() })),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
    related: z.array(destinationCardSchema),
  })
  .openapi('DestinationDetail');

// ---- requests ----
const publicListQuery = z
  .object({
    ...paginationQuery,
    district: f.slug.optional(),
    region: f.slug.optional(),
    category: f.slug.optional(),
    featured: booleanQuery.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    sort: sortQuery(SORT_COLUMNS, 'name'),
  })
  .strict();

const districtDestinationsQuery = publicListQuery.omit({ district: true, region: true });
const featuredQuery = z.object({ limit: z.coerce.number().int().min(1).max(24).default(8) }).strict();
const nearbyQuery = z
  .object({ ...paginationQuery, radiusKm: z.coerce.number().min(1).max(300).default(50) })
  .strict();

const adminListQuery = z
  .object({
    ...paginationQuery,
    status: f.publishStatus.optional(),
    districtId: f.uuid.optional(),
    featured: booleanQuery.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    sort: sortQuery(SORT_COLUMNS, '-createdAt'),
  })
  .strict();

const destinationFields = {
  districtId: f.uuid,
  name: f.name(150),
  slug: f.slug,
  summary: f.optionalText(500),
  description: f.optionalText(20000),
  location: f.geoPoint.nullable(),
  address: f.optionalText(500),
  openingHours: openingHours.nullable(),
  bestTimeToVisit: f.optionalText(200),
  entryFee: money.nullable(),
  featured: z.boolean(),
};
const createBody = z
  .object(destinationFields)
  .partial()
  .required({ districtId: true, name: true })
  .strict();
const updateBody = atLeastOne(z.object(destinationFields).partial().strict());

const statusBody = f.statusBody(f.publishStatus);
const categoriesBody = z.object({ categoryIds: f.uniqueIds({ max: 20 }) }).strict();
const attachMediaBody = z
  .object({ mediaId: f.uuid, sortOrder: z.number().int().min(0).max(1000).default(0), isCover: z.boolean().default(false) })
  .strict();
const mediaParams = z.object({ id: f.uuid, mediaId: f.uuid });
const faqsBody = z
  .object({
    faqs: z
      .array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(3000) }).strict())
      .max(50),
  })
  .strict();
const relatedBody = z.object({ destinationIds: f.uniqueIds({ max: 20 }) }).strict();

const categoryFields = { name: f.name(100), slug: f.slug, description: f.optionalText(2000), icon: z.string().regex(/^[a-z0-9-]{1,50}$/).nullable() };
const createCategoryBody = z.object(categoryFields).partial().required({ name: true }).strict();
const updateCategoryBody = atLeastOne(z.object(categoryFields).partial().strict());
const categoryListQuery = z.object({ status: f.activeStatus.optional() }).strict();

module.exports = {
  imageSchema,
  categorySchema,
  destinationCardSchema,
  destinationDetailSchema,
  publicListQuery,
  districtDestinationsQuery,
  featuredQuery,
  nearbyQuery,
  adminListQuery,
  createBody,
  updateBody,
  statusBody,
  categoriesBody,
  attachMediaBody,
  mediaParams,
  faqsBody,
  relatedBody,
  createCategoryBody,
  updateCategoryBody,
  categoryListQuery,
};
