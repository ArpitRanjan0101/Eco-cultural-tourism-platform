'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { SORT_COLUMNS } = require('./bookings.repository');

const bookingType = z.enum(['property_room', 'guide_service', 'experience_session', 'package_departure']);
const bookingStatus = z.enum(['requested', 'pending_payment', 'confirmed', 'completed', 'rejected', 'expired', 'cancelled']);
const paymentStatus = z.enum(['unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded']);
const timestamp = z.string().datetime({ offset: true });

// ---- quote / booking request (discriminated by itemType) ----
const items = {
  property_room: z
    .object({
      itemType: z.literal('property_room'),
      resourceId: f.uuid.openapi({ description: 'Room type id' }),
      checkIn: f.date,
      checkOut: f.date,
      rooms: z.number().int().min(1).max(20),
      adults: z.number().int().min(1).max(40),
      children: z.number().int().min(0).max(20).default(0),
    })
    .strict(),
  guide_service: z
    .object({
      itemType: z.literal('guide_service'),
      resourceId: f.uuid.openapi({ description: 'Guide service id' }),
      date: f.date,
      startTime: f.time,
      participants: z.number().int().min(1).max(100),
    })
    .strict(),
  experience_session: z
    .object({
      itemType: z.literal('experience_session'),
      resourceId: f.uuid.openapi({ description: 'Experience session id' }),
      participants: z.number().int().min(1).max(500),
    })
    .strict(),
  package_departure: z
    .object({
      itemType: z.literal('package_departure'),
      resourceId: f.uuid.openapi({ description: 'Package departure id' }),
      travelerCount: z.number().int().min(1).max(500),
    })
    .strict(),
};

const quoteBody = z.discriminatedUnion('itemType', Object.values(items)).openapi('BookingQuoteRequest');

const partySize = (body) => {
  if (body.itemType === 'property_room') return body.adults + body.children;
  if (body.itemType === 'package_departure') return body.travelerCount;
  return body.participants;
};

const traveler = z.object({ fullName: f.name(150), age: z.number().int().min(0).max(120).optional(), isPrimary: z.boolean().default(false) }).strict();

const createBody = z
  .discriminatedUnion(
    'itemType',
    Object.values(items).map((schema) => schema.extend({ travelers: z.array(traveler).min(1).max(50) })),
  )
  .superRefine((body, ctx) => {
    if (body.travelers.filter((t) => t.isPrimary).length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['travelers'], message: 'exactly one traveller must be primary' });
    }
    if (body.travelers.length > partySize(body)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['travelers'], message: 'more travellers than the party size' });
    }
  })
  .openapi('BookingCreateRequest');

const idempotencyHeaders = z.object({
  'idempotency-key': z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/).openapi({ description: 'Required. Retries with the same key and body return the original booking.' }),
});

const cancelBody = z.object({ reason: z.string().trim().min(3).max(1000).optional() }).strict();
const approveBody = z.object({ note: z.string().trim().max(1000).optional() }).strict();
const rejectBody = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
const adminCancelBody = z.object({ reason: z.string().trim().min(3).max(1000), waiveFee: z.boolean().default(false) }).strict();

const ownListQuery = z
  .object({ ...paginationQuery, status: bookingStatus.optional(), bookingType: bookingType.optional(), sort: sortQuery(SORT_COLUMNS, '-createdAt') })
  .strict();
const partnerListQuery = ownListQuery.extend({ from: timestamp.optional(), to: timestamp.optional() }).strict();
const adminListQuery = partnerListQuery
  .extend({
    paymentStatus: paymentStatus.optional(),
    reference: z.string().regex(/^JHT-[0-9]{6}-[A-Z0-9]{6}$/).optional(),
    userId: f.uuid.optional(),
    partnerId: f.uuid.optional(),
  })
  .strict();

// ---- responses ----
const money = z.string();
const cancellationPolicy = z.object({ tiers: z.array(z.object({ hoursBeforeCheckIn: z.number(), refundPercent: z.number() })), notes: z.string().optional() });

const quoteSchema = z
  .object({
    itemType: bookingType,
    resourceId: z.string().uuid(),
    description: z.string(),
    bookingMode: f.bookingMode,
    currency: z.string(),
    quantity: z.number().int(),
    unitPrice: money,
    subtotal: money,
    taxAmount: money,
    discountAmount: money,
    totalAmount: money,
    available: z.boolean(),
    unavailableReason: z.string().nullable(),
    serviceStartAt: z.string().datetime(),
    serviceEndAt: z.string().datetime(),
    cancellationPolicy,
    details: z.record(z.unknown()),
    priceValidUntil: z.string().datetime(),
  })
  .openapi('BookingQuote');

const itemSchema = z.object({
  itemType: bookingType,
  resourceId: z.string().uuid(),
  description: z.string(),
  quantity: z.number().int(),
  unitPrice: money,
  totalAmount: money,
});

const bookingSummarySchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string(),
    bookingType,
    bookingMode: f.bookingMode,
    status: bookingStatus,
    paymentStatus,
    currency: z.string(),
    subtotal: money,
    taxAmount: money,
    discountAmount: money,
    totalAmount: money,
    serviceStartAt: z.string().datetime(),
    serviceEndAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    confirmedAt: z.string().datetime().nullable(),
    cancelledAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    item: itemSchema,
    userId: z.string().uuid().optional().openapi({ description: 'Admin views only' }),
    partnerId: z.string().uuid().optional().openapi({ description: 'Admin views only' }),
  })
  .openapi('BookingSummary');

const bookingDetailSchema = bookingSummarySchema
  .extend({
    item: itemSchema.extend({ details: z.record(z.unknown()), cancellationPolicy }),
    travelers: z.array(z.object({ fullName: z.string(), age: z.number().int().nullable(), isPrimary: z.boolean() })),
    cancellation: z
      .object({ reason: z.string().nullable(), cancellationFee: money, refundAmount: money, status: z.string(), createdAt: z.string().datetime() })
      .nullable(),
    history: z.array(z.object({ oldStatus: z.string().nullable(), newStatus: z.string(), reason: z.string().nullable(), createdAt: z.string().datetime() })),
  })
  .openapi('BookingDetail');

const statusSchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string(),
    status: bookingStatus,
    paymentStatus,
    expiresAt: z.string().datetime().nullable(),
    secondsRemaining: z.number().int().nullable(),
  })
  .openapi('BookingStatus');

const documentSchema = z
  .object({ id: z.string().uuid(), documentType: z.string(), createdAt: z.string().datetime(), media: z.record(z.unknown()).nullable() })
  .openapi('BookingDocument');

const idParams = z.object({ id: f.uuid });

module.exports = {
  quoteBody,
  createBody,
  idempotencyHeaders,
  cancelBody,
  approveBody,
  rejectBody,
  adminCancelBody,
  ownListQuery,
  partnerListQuery,
  adminListQuery,
  quoteSchema,
  bookingSummarySchema,
  bookingDetailSchema,
  statusSchema,
  documentSchema,
  idParams,
};
