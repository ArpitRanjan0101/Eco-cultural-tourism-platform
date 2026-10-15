'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');
const { destinationCardSchema } = require('../destinations/destinations.schema');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');
const tripStatus = z.enum(['draft', 'planned', 'archived']);

const tripFields = {
  title: f.name(150),
  startDate: f.date.nullable(),
  endDate: f.date.nullable(),
  travelerCount: z.number().int().min(1).max(50),
};
const createBody = z
  .object(tripFields)
  .partial({ startDate: true, endDate: true, travelerCount: true })
  .strict()
  .refine((b) => Boolean(b.startDate) === Boolean(b.endDate), { message: 'startDate and endDate must be set together', path: ['endDate'] })
  .refine((b) => !b.startDate || (b.endDate >= b.startDate && (Date.parse(b.endDate) - Date.parse(b.startDate)) / 86_400_000 < 60), {
    message: 'a trip lasts 1-60 days',
    path: ['endDate'],
  });
const updateBody = atLeastOne(z.object({ ...tripFields, status: tripStatus }).partial().strict());
const listQuery = z.object({ ...paginationQuery, status: tripStatus.optional() }).strict();

const dayBody = z.object({ dayNumber: z.number().int().min(1).max(60).optional(), title: f.optionalText(150).optional() }).strict();
const updateDayBody = atLeastOne(z.object({ dayNumber: z.number().int().min(1).max(60), title: f.optionalText(150) }).partial().strict());

const stopFields = {
  destinationId: f.uuid.nullable(),
  title: f.name(150),
  notes: f.optionalText(2000),
  startTime: f.time.nullable(),
  endTime: f.time.nullable(),
};
const createStopBody = z
  .object(stopFields)
  .partial()
  .strict()
  .refine((b) => b.destinationId || b.title, { message: 'destinationId or title is required', path: ['title'] })
  .refine((b) => !b.startTime || !b.endTime || b.endTime > b.startTime, { message: 'endTime must be after startTime', path: ['endTime'] });
const updateStopBody = atLeastOne(z.object(stopFields).partial().strict());
const reorderBody = z
  .object({ days: z.array(z.object({ dayId: f.uuid, stopIds: f.uniqueIds({ max: 30 }) }).strict()).min(1).max(60) })
  .strict()
  .refine((b) => new Set(b.days.map((d) => d.dayId)).size === b.days.length, { message: 'each day may be listed once', path: ['days'] });

const tripParams = z.object({ id: f.uuid });
const dayParams = z.object({ id: f.uuid, dayId: f.uuid });
const stopParams = z.object({ id: f.uuid, stopId: f.uuid });

const tripSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    travelerCount: z.number().int(),
    status: tripStatus,
    dayCount: z.number().int(),
    stopCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('TripSummary');
const tripSchema = tripSummarySchema
  .extend({
    days: z.array(
      z.object({
        id: z.string().uuid(),
        dayNumber: z.number().int(),
        date: z.string().nullable(),
        title: z.string().nullable(),
        stops: z.array(
          z.object({
            id: z.string().uuid(),
            title: z.string(),
            notes: z.string().nullable(),
            startTime: z.string().nullable(),
            endTime: z.string().nullable(),
            sortOrder: z.number().int(),
            destinationId: z.string().uuid().nullable(),
            destination: destinationCardSchema.nullable(),
          }),
        ),
      }),
    ),
  })
  .openapi('Trip');

module.exports = {
  createBody,
  updateBody,
  listQuery,
  dayBody,
  updateDayBody,
  createStopBody,
  updateStopBody,
  reorderBody,
  tripParams,
  dayParams,
  stopParams,
  tripSummarySchema,
  tripSchema,
};
