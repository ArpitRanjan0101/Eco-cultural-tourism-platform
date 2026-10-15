'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { districtRefSchema } = require('../geography/geography.schema');
const { imageSchema } = require('../destinations/destinations.schema');
const { SUPPLY_STATUSES } = require('../../core/utils/moderation');
const { SORT_COLUMNS } = require('./properties.repository');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');

const { money, date, time, bookingMode } = f;
const propertyType = z.enum(['hotel', 'resort', 'homestay', 'guest_house', 'eco_lodge', 'camp', 'dharamshala']);
const supplyStatus = z.enum(SUPPLY_STATUSES);
const amenityCategory = z.enum(['general', 'room', 'bathroom', 'food', 'outdoor', 'accessibility', 'safety', 'connectivity']);
const destinationRef = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });

// ---- responses ----
const amenitySchema = z
  .object({ id: z.string().uuid(), code: z.string(), name: z.string(), category: amenityCategory, icon: z.string().nullable() })
  .openapi('Amenity');
const galleryImage = imageSchema.extend({ sortOrder: z.number().int(), isCover: z.boolean() });
const roomSchema = z
  .object({
    id: z.string().uuid(),
    propertyId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    maxAdults: z.number().int(),
    maxChildren: z.number().int(),
    totalUnits: z.number().int(),
    basePrice: z.string(),
    currency: z.string(),
    status: z.enum(['active', 'inactive']),
    amenities: z.array(amenitySchema),
    images: z.array(galleryImage),
  })
  .openapi('RoomType');
const cancellationPolicy = z
  .object({
    tiers: z
      .array(z.object({ hoursBeforeCheckIn: z.number().int().min(0).max(8760), refundPercent: z.number().int().min(0).max(100) }).strict())
      .min(1)
      .max(10)
      .refine((tiers) => new Set(tiers.map((t) => t.hoursBeforeCheckIn)).size === tiers.length, 'hoursBeforeCheckIn values must be unique'),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .openapi('CancellationPolicy');
const propertyCardSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    propertyType,
    bookingMode,
    startingPrice: z.string().nullable(),
    currency: z.string(),
    location: f.geoPoint.nullable(),
    district: districtRefSchema.nullable(),
    destination: destinationRef.nullable(),
    coverImage: imageSchema.nullable(),
    distanceKm: z.number().optional(),
    status: supplyStatus.optional().openapi({ description: 'Partner/admin views only' }),
  })
  .openapi('PropertyCard');
const propertyDetailSchema = propertyCardSchema
  .extend({
    description: z.string().nullable(),
    address: z.string().nullable(),
    contactPhone: z.string().nullable(),
    checkInTime: z.string(),
    checkOutTime: z.string(),
    gallery: z.array(galleryImage),
    amenities: z.array(amenitySchema),
    policies: z.object({
      cancellationPolicy,
      childPolicy: z.string().nullable(),
      houseRules: z.string().nullable(),
      identificationPolicy: z.string().nullable(),
      isDefault: z.boolean(),
    }),
    rooms: z.array(roomSchema),
  })
  .openapi('PropertyDetail');
const availabilitySchema = z
  .object({
    propertyId: z.string().uuid(),
    checkIn: z.string(),
    checkOut: z.string(),
    nights: z.number().int(),
    currency: z.string(),
    bookingMode,
    rooms: z.array(
      z.object({
        roomTypeId: z.string().uuid(),
        name: z.string(),
        maxAdults: z.number().int(),
        maxChildren: z.number().int(),
        availableUnits: z.number().int(),
        fitsOccupancy: z.boolean(),
        available: z.boolean(),
        nightly: z.array(z.object({ date: z.string(), price: z.string(), availableUnits: z.number().int() })),
        totalPrice: z.string(),
      }),
    ),
  })
  .openapi('PropertyAvailability');
const calendarSchema = z
  .object({
    roomTypeId: z.string().uuid(),
    physicalUnits: z.number().int(),
    basePrice: z.string(),
    currency: z.string(),
    days: z.array(
      z.object({
        date: z.string(),
        totalUnits: z.number().int(),
        blockedUnits: z.number().int(),
        reservedUnits: z.number().int(),
        availableUnits: z.number().int(),
        nightlyPrice: z.string(),
        inventoryOverride: z.boolean(),
        rateOverride: z.boolean(),
      }),
    ),
  })
  .openapi('RoomCalendar');

// ---- requests ----
const publicListQuery = z
  .object({
    ...paginationQuery,
    district: f.slug.optional(),
    destination: f.slug.optional(),
    propertyType: propertyType.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    sort: sortQuery(SORT_COLUMNS, 'name'),
  })
  .strict();
const destinationPropertiesQuery = z.object({ ...paginationQuery, sort: sortQuery(SORT_COLUMNS, 'startingPrice') }).strict();
const availabilityQuery = z
  .object({
    checkIn: date,
    checkOut: date,
    adults: z.coerce.number().int().min(1).max(40).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
    rooms: z.coerce.number().int().min(1).max(20).default(1),
  })
  .strict();
const partnerListQuery = z.object({ ...paginationQuery, status: supplyStatus.optional(), sort: sortQuery(SORT_COLUMNS, '-createdAt') }).strict();
const adminListQuery = z
  .object({
    ...paginationQuery,
    status: supplyStatus.optional(),
    partnerId: f.uuid.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    sort: sortQuery(SORT_COLUMNS, '-createdAt'),
  })
  .strict();

const propertyFields = {
  districtId: f.uuid,
  destinationId: f.uuid.nullable(),
  name: f.name(150),
  slug: f.slug,
  propertyType,
  description: f.optionalText(20000),
  address: f.optionalText(500),
  location: f.geoPoint.nullable(),
  contactPhone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'phone must be E.164').nullable(),
  checkInTime: time,
  checkOutTime: time,
  bookingMode,
};
const createBody = z.object(propertyFields).partial().required({ districtId: true, name: true, propertyType: true }).strict();
const updateBody = atLeastOne(z.object(propertyFields).partial().strict());
const amenitiesBody = z.object({ amenityIds: f.uniqueIds({ max: 60 }) }).strict();
const policiesBody = z
  .object({
    cancellationPolicy,
    childPolicy: f.optionalText(2000).optional(),
    houseRules: f.optionalText(5000).optional(),
    identificationPolicy: f.optionalText(2000).optional(),
  })
  .strict();
const mediaBody = z
  .object({ mediaId: f.uuid, sortOrder: z.number().int().min(0).max(1000).default(0), isCover: z.boolean().default(false) })
  .strict();
const roomMediaBody = z.object({ mediaId: f.uuid, sortOrder: z.number().int().min(0).max(1000).default(0) }).strict();

const roomFields = {
  name: f.name(100),
  description: f.optionalText(5000),
  maxAdults: z.number().int().min(1).max(20),
  maxChildren: z.number().int().min(0).max(10),
  totalUnits: z.number().int().min(1).max(500),
  basePrice: money,
  amenityIds: f.uniqueIds({ max: 60 }),
};
const createRoomBody = z.object(roomFields).partial({ description: true, maxChildren: true, amenityIds: true }).strict();
const updateRoomBody = atLeastOne(z.object(roomFields).partial().strict());
const roomStatusBody = f.statusBody(z.enum(['active', 'inactive']));

const range = { from: date, to: date };
const inventoryBody = z
  .object({
    ranges: z
      .array(
        z
          .object({ ...range, totalUnits: z.number().int().min(0).max(500).optional(), blockedUnits: z.number().int().min(0).max(500).optional() })
          .strict()
          .refine((r) => r.totalUnits !== undefined || r.blockedUnits !== undefined, 'totalUnits or blockedUnits is required'),
      )
      .min(1)
      .max(50),
  })
  .strict();
const ratesBody = z.object({ ranges: z.array(z.object({ ...range, nightlyPrice: money }).strict()).min(1).max(50) }).strict();
const calendarQuery = z.object(range).strict();

const adminStatusBody = z
  .object({ status: supplyStatus, reason: z.string().trim().min(3).max(1000).optional() })
  .strict()
  .refine((b) => !['rejected', 'suspended'].includes(b.status) || b.reason, { message: 'reason is required', path: ['reason'] });
const amenityBody = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/), name: f.name(100), category: amenityCategory, icon: z.string().regex(/^[a-z0-9-]{1,50}$/).nullable().optional() }).strict();
const updateAmenityBody = atLeastOne(
  z.object({ name: f.name(100), category: amenityCategory, icon: z.string().regex(/^[a-z0-9-]{1,50}$/).nullable() }).partial().strict(),
);

const propertyParams = z.object({ id: f.uuid });
const propertyMediaParams = z.object({ id: f.uuid, mediaId: f.uuid });
const roomParams = z.object({ id: f.uuid, roomId: f.uuid });
const roomMediaParams = z.object({ id: f.uuid, roomId: f.uuid, mediaId: f.uuid });
const roomOnlyParams = z.object({ roomId: f.uuid });

module.exports = {
  supplyStatus,
  amenitySchema,
  roomSchema,
  propertyCardSchema,
  propertyDetailSchema,
  availabilitySchema,
  calendarSchema,
  publicListQuery,
  destinationPropertiesQuery,
  availabilityQuery,
  partnerListQuery,
  adminListQuery,
  createBody,
  updateBody,
  amenitiesBody,
  policiesBody,
  mediaBody,
  roomMediaBody,
  createRoomBody,
  updateRoomBody,
  roomStatusBody,
  inventoryBody,
  ratesBody,
  calendarQuery,
  adminStatusBody,
  amenityBody,
  updateAmenityBody,
  propertyParams,
  propertyMediaParams,
  roomParams,
  roomMediaParams,
  roomOnlyParams,
};
