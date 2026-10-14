'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');

const regionRef = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });

const regionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    status: f.activeStatus,
    districtCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Region');

const districtSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    status: f.activeStatus,
    location: f.geoPoint.nullable(),
    region: regionRef,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('District');

const districtRefSchema = z
  .object({ id: z.string().uuid(), name: z.string(), slug: z.string(), region: regionRef })
  .openapi('DistrictRef');

const regionFields = { name: f.name(100), slug: f.slug, description: f.optionalText(5000) };
const createRegionBody = z.object({ ...regionFields, slug: f.slug.optional(), description: f.optionalText(5000).optional() }).strict();
const updateRegionBody = atLeastOne(z.object(regionFields).partial().strict());

const districtFields = {
  regionId: f.uuid,
  name: f.name(100),
  slug: f.slug,
  description: f.optionalText(5000),
  location: f.geoPoint.nullable(),
};
const createDistrictBody = z
  .object({
    ...districtFields,
    slug: f.slug.optional(),
    description: f.optionalText(5000).optional(),
    location: f.geoPoint.nullable().optional(),
  })
  .strict();
const updateDistrictBody = atLeastOne(z.object(districtFields).partial().strict());

const activeStatusBody = f.statusBody(f.activeStatus);
const adminListQuery = z.object({ status: f.activeStatus.optional() }).strict();
const adminDistrictQuery = z.object({ status: f.activeStatus.optional(), region: f.slug.optional() }).strict();
const publicDistrictQuery = z.object({ region: f.slug.optional() }).strict();

module.exports = {
  regionSchema,
  districtSchema,
  districtRefSchema,
  createRegionBody,
  updateRegionBody,
  createDistrictBody,
  updateDistrictBody,
  activeStatusBody,
  adminListQuery,
  adminDistrictQuery,
  publicDistrictQuery,
  atLeastOne,
};
