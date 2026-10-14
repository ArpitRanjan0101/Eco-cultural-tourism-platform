'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');
const { destinationCardSchema } = require('../destinations/destinations.schema');
const { districtRefSchema } = require('../geography/geography.schema');
const service = require('./search.service');

// ---- schemas ----
const searchQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(2).max(100),
    type: z.enum(service.SEARCH_TYPES).optional(),
    district: f.slug.optional(),
    region: f.slug.optional(),
    category: f.slug.optional(),
  })
  .strict();
const suggestionsQuery = z
  .object({ q: z.string().trim().min(1).max(60), limit: z.coerce.number().int().min(1).max(10).default(8) })
  .strict();
const nearbyQuery = z
  .object({
    ...paginationQuery,
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce.number().min(1).max(service.NEARBY.maxKm).default(service.NEARBY.defaultKm),
    type: z.enum(service.NEARBY_TYPES).default('destination'),
  })
  .strict();

const destinationResult = destinationCardSchema.extend({ type: z.literal('destination'), rank: z.number().optional() });
const districtResult = z.object({
  type: z.literal('district'),
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  region: districtRefSchema.shape.region,
  location: f.geoPoint.nullable(),
  rank: z.number(),
});
const searchResult = z.discriminatedUnion('type', [destinationResult, districtResult]).openapi('SearchResult');
const suggestion = z
  .object({ type: z.enum(['destination', 'district', 'category']), id: z.string().uuid(), name: z.string(), slug: z.string(), subtitle: z.string().nullable() })
  .openapi('SearchSuggestion');
const filtersSchema = z
  .object({
    types: z.array(z.string()),
    nearbyTypes: z.array(z.string()),
    regions: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        slug: z.string(),
        districts: z.array(z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), destinationCount: z.number().int() })),
      }),
    ),
    categories: z.array(z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), icon: z.string().nullable(), count: z.number().int() })),
    sorts: z.array(z.string()),
    radiusKm: z.object({ defaultKm: z.number(), maxKm: z.number() }),
  })
  .openapi('SearchFilters');


module.exports = { searchQuery, suggestionsQuery, nearbyQuery, destinationResult, searchResult, suggestion, filtersSchema };