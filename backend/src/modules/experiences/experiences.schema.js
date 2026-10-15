'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { SUPPLY_STATUSES } = require('../../core/utils/moderation');
const { imageSchema } = require('../destinations/destinations.schema');
const { SORT_COLUMNS } = require('./experiences.repository');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');
const supplyStatus = z.enum(SUPPLY_STATUSES);
const timestamp = z.string().datetime({ offset: true });
const ref = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });

const sessionSchema = z
  .object({
    id: z.string().uuid(),
    experienceId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    capacity: z.number().int(),
    pricePerPerson: z.string(),
    currency: z.string(),
    status: z.enum(['scheduled', 'cancelled']),
    seatsAvailable: z.number().int().optional().openapi({ description: 'Public session lists: capacity minus held/booked seats' }),
  })
  .openapi('ExperienceSession');
const cardSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    durationMinutes: z.number().int(),
    minParticipants: z.number().int(),
    maxParticipants: z.number().int(),
    bookingMode: f.bookingMode,
    startingPrice: z.string().nullable(),
    currency: z.string(),
    nextSessionAt: z.string().datetime().nullable(),
    destination: ref.nullable(),
    coverImage: imageSchema.nullable(),
    partner: z.object({ id: z.string().uuid(), businessName: z.string() }).nullable(),
    status: supplyStatus.optional(),
  })
  .openapi('ExperienceCard');
const detailSchema = cardSchema
  .extend({
    description: z.string().nullable(),
    gallery: z.array(imageSchema.extend({ sortOrder: z.number().int(), isCover: z.boolean() })),
    upcomingSessions: z.array(sessionSchema),
  })
  .openapi('ExperienceDetail');
const availabilitySchema = z
  .object({
    experienceId: z.string().uuid(),
    participants: z.number().int(),
    withinGroupLimits: z.boolean(),
    sessions: z.array(sessionSchema.extend({ seatsAvailable: z.number().int(), available: z.boolean() })),
  })
  .openapi('ExperienceAvailability');

const publicListQuery = z
  .object({ ...paginationQuery, destination: f.slug.optional(), q: z.string().trim().min(2).max(100).optional(), sort: sortQuery(SORT_COLUMNS, 'nextSessionAt') })
  .strict();
const destinationQuery = publicListQuery.omit({ destination: true });
const windowQuery = z.object({ from: timestamp.optional(), to: timestamp.optional() }).strict();
const availabilityQuery = windowQuery.extend({ participants: z.coerce.number().int().min(1).max(500).default(1) }).strict();
const partnerListQuery = z.object({ ...paginationQuery, status: supplyStatus.optional(), sort: sortQuery(SORT_COLUMNS, '-createdAt') }).strict();
const adminListQuery = partnerListQuery.extend({ partnerId: f.uuid.optional(), q: z.string().trim().min(2).max(100).optional() }).strict();

const fields = {
  destinationId: f.uuid.nullable(),
  name: f.name(150),
  slug: f.slug,
  description: f.optionalText(20000),
  durationMinutes: z.number().int().min(15).max(4320),
  minParticipants: z.number().int().min(1).max(500),
  maxParticipants: z.number().int().min(1).max(500),
  bookingMode: f.bookingMode,
};
const createBody = z
  .object(fields)
  .partial()
  .required({ name: true, durationMinutes: true, maxParticipants: true })
  .strict()
  .refine((b) => (b.minParticipants ?? 1) <= b.maxParticipants, { message: 'maxParticipants must be >= minParticipants', path: ['maxParticipants'] });
const updateBody = atLeastOne(z.object(fields).partial().strict());
const sessionBody = z
  .object({ startsAt: timestamp, endsAt: timestamp, capacity: z.number().int().min(1).max(1000), pricePerPerson: f.money })
  .strict();
const updateSessionBody = atLeastOne(
  z.object({ startsAt: timestamp, endsAt: timestamp, capacity: z.number().int().min(1).max(1000), pricePerPerson: f.money, status: z.enum(['scheduled', 'cancelled']) }).partial().strict(),
);
const mediaBody = z.object({ mediaId: f.uuid, sortOrder: z.number().int().min(0).max(1000).default(0) }).strict();
const adminStatusBody = z
  .object({ status: supplyStatus, reason: z.string().trim().min(3).max(1000).optional() })
  .strict()
  .refine((b) => !['rejected', 'suspended'].includes(b.status) || b.reason, { message: 'reason is required', path: ['reason'] });

const idParams = z.object({ id: f.uuid });
const sessionParams = z.object({ id: f.uuid, sessionId: f.uuid });
const mediaParams = z.object({ id: f.uuid, mediaId: f.uuid });

module.exports = {
  sessionSchema,
  cardSchema,
  detailSchema,
  availabilitySchema,
  publicListQuery,
  destinationQuery,
  windowQuery,
  availabilityQuery,
  partnerListQuery,
  adminListQuery,
  createBody,
  updateBody,
  sessionBody,
  updateSessionBody,
  mediaBody,
  adminStatusBody,
  idParams,
  sessionParams,
  mediaParams,
};
