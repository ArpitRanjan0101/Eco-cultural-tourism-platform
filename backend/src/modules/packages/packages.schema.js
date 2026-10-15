'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { SUPPLY_STATUSES } = require('../../core/utils/moderation');
const { imageSchema } = require('../destinations/destinations.schema');
const { SORT_COLUMNS } = require('./packages.repository');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');
const supplyStatus = z.enum(SUPPLY_STATUSES);
const ref = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });

const departureSchema = z
  .object({
    id: z.string().uuid(),
    packageId: z.string().uuid(),
    startDate: z.string(),
    endDate: z.string(),
    totalSeats: z.number().int(),
    pricePerPerson: z.string(),
    currency: z.string(),
    status: z.enum(['scheduled', 'closed', 'cancelled']),
    seatsAvailable: z.number().int().optional().openapi({ description: 'Public departure lists: seats minus held/booked' }),
  })
  .openapi('PackageDeparture');
const cardSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    summary: z.string().nullable(),
    durationDays: z.number().int(),
    durationNights: z.number().int(),
    minTravelers: z.number().int(),
    maxTravelers: z.number().int(),
    bookingMode: f.bookingMode,
    startingPrice: z.string().nullable(),
    currency: z.string(),
    nextDeparture: z.string().nullable(),
    coverImage: imageSchema.nullable(),
    partner: z.object({ id: z.string().uuid(), businessName: z.string() }).nullable(),
    status: supplyStatus.optional(),
  })
  .openapi('PackageCard');
const detailSchema = cardSchema
  .extend({
    description: z.string().nullable(),
    destinations: z.array(ref),
    itinerary: z.array(
      z.object({
        dayNumber: z.number().int(),
        title: z.string(),
        description: z.string().nullable(),
        items: z.array(z.object({ activityTitle: z.string(), description: z.string().nullable(), destination: ref.nullable() })),
      }),
    ),
    inclusions: z.array(z.string()),
    exclusions: z.array(z.string()),
    gallery: z.array(imageSchema.extend({ sortOrder: z.number().int(), isCover: z.boolean() })),
    upcomingDepartures: z.array(departureSchema),
  })
  .openapi('PackageDetail');
const availabilitySchema = z
  .object({
    packageId: z.string().uuid(),
    travelers: z.number().int(),
    withinGroupLimits: z.boolean(),
    departures: z.array(departureSchema.extend({ seatsAvailable: z.number().int(), available: z.boolean() })),
  })
  .openapi('PackageAvailability');

const publicListQuery = z
  .object({ ...paginationQuery, destination: f.slug.optional(), q: z.string().trim().min(2).max(100).optional(), sort: sortQuery(SORT_COLUMNS, 'nextDeparture') })
  .strict();
const availabilityQuery = z.object({ travelers: z.coerce.number().int().min(1).max(500).default(1) }).strict();
const partnerListQuery = z.object({ ...paginationQuery, status: supplyStatus.optional(), sort: sortQuery(SORT_COLUMNS, '-createdAt') }).strict();
const adminListQuery = partnerListQuery.extend({ partnerId: f.uuid.optional(), q: z.string().trim().min(2).max(100).optional() }).strict();

const fields = {
  name: f.name(150),
  slug: f.slug,
  summary: f.optionalText(500),
  description: f.optionalText(20000),
  durationDays: z.number().int().min(1).max(60),
  durationNights: z.number().int().min(0).max(60),
  minTravelers: z.number().int().min(1).max(500),
  maxTravelers: z.number().int().min(1).max(500),
  bookingMode: f.bookingMode,
};
const createBody = z
  .object(fields)
  .partial()
  .required({ name: true, durationDays: true, durationNights: true, maxTravelers: true })
  .strict()
  .refine((b) => b.durationNights === b.durationDays || b.durationNights === b.durationDays - 1, {
    message: 'durationNights must equal durationDays or durationDays - 1',
    path: ['durationNights'],
  })
  .refine((b) => (b.minTravelers ?? 1) <= b.maxTravelers, { message: 'maxTravelers must be >= minTravelers', path: ['maxTravelers'] });
const updateBody = atLeastOne(z.object(fields).partial().strict());
const destinationsBody = z.object({ destinationIds: f.uniqueIds({ max: 30 }) }).strict();
const itineraryBody = z
  .object({
    days: z
      .array(
        z
          .object({
            dayNumber: z.number().int().min(1).max(60),
            title: f.name(150),
            description: f.optionalText(5000).optional(),
            items: z
              .array(
                z.object({ activityTitle: f.name(150), description: f.optionalText(2000).optional(), destinationId: f.uuid.nullable().optional() }).strict(),
              )
              .max(20)
              .default([]),
          })
          .strict(),
      )
      .max(60)
      .refine((days) => new Set(days.map((d) => d.dayNumber)).size === days.length, 'dayNumber values must be unique'),
  })
  .strict();
const inclusionsBody = z
  .object({ items: z.array(z.object({ description: f.name(300), inclusionType: z.enum(['included', 'excluded']) }).strict()).max(60) })
  .strict();
const mediaBody = z.object({ mediaId: f.uuid, sortOrder: z.number().int().min(0).max(1000).default(0) }).strict();
const departureBody = z.object({ startDate: f.date, totalSeats: z.number().int().min(1).max(1000), pricePerPerson: f.money }).strict();
const updateDepartureBody = atLeastOne(
  z
    .object({ startDate: f.date, totalSeats: z.number().int().min(1).max(1000), pricePerPerson: f.money, status: z.enum(['scheduled', 'closed', 'cancelled']) })
    .partial()
    .strict(),
);
const adminStatusBody = z
  .object({ status: supplyStatus, reason: z.string().trim().min(3).max(1000).optional() })
  .strict()
  .refine((b) => !['rejected', 'suspended'].includes(b.status) || b.reason, { message: 'reason is required', path: ['reason'] });

const idParams = z.object({ id: f.uuid });
const departureParams = z.object({ id: f.uuid, departureId: f.uuid });
const mediaParams = z.object({ id: f.uuid, mediaId: f.uuid });

module.exports = {
  departureSchema,
  cardSchema,
  detailSchema,
  availabilitySchema,
  publicListQuery,
  availabilityQuery,
  partnerListQuery,
  adminListQuery,
  createBody,
  updateBody,
  destinationsBody,
  itineraryBody,
  inclusionsBody,
  mediaBody,
  departureBody,
  updateDepartureBody,
  adminStatusBody,
  idParams,
  departureParams,
  mediaParams,
};
