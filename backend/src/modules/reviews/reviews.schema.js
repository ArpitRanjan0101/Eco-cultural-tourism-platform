'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');
const { SUBJECT_TYPES } = require('../subjects/subjects.service');

const subjectType = z.enum(SUBJECT_TYPES);
const reviewStatus = z.enum(['pending', 'approved', 'hidden', 'rejected']);
const rating = z.number().int().min(1).max(5);
const contentFields = { rating, title: f.optionalText(150), comment: f.optionalText(5000) };

const subjectQuery = z.object({ ...paginationQuery, subjectType, subjectId: f.uuid }).strict();
const pageQuery = z.object(paginationQuery).strict();
const createBody = z
  .object({ subjectType, subjectId: f.uuid, bookingId: f.uuid.optional(), ...contentFields })
  .partial({ title: true, comment: true })
  .strict()
  .refine((b) => (b.subjectType === 'destination') === (b.bookingId === undefined), {
    message: 'bookingId is required for bookable items and not accepted for destinations',
    path: ['bookingId'],
  });
const updateBody = z
  .object(contentFields)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');
const moderationQuery = z.object({ ...paginationQuery, status: reviewStatus.optional(), subjectType: subjectType.optional() }).strict();
const moderateBody = z
  .object({ status: z.enum(['approved', 'hidden', 'rejected']), note: z.string().trim().min(1).max(1000).optional() })
  .strict()
  .refine((b) => b.status === 'approved' || b.note, { message: 'a note is required when hiding or rejecting', path: ['note'] });

const publicReviewSchema = z
  .object({
    id: z.string().uuid(),
    subjectType,
    subjectId: z.string().uuid(),
    rating: z.number().int(),
    title: z.string().nullable(),
    comment: z.string().nullable(),
    verified: z.boolean().openapi({ description: 'Written from a completed booking' }),
    author: z.object({ displayName: z.string() }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Review');
const ownReviewSchema = publicReviewSchema
  .extend({ bookingId: z.string().uuid().nullable(), status: reviewStatus, moderationNote: z.string().nullable() })
  .openapi('OwnReview');
const adminReviewSchema = ownReviewSchema
  .extend({ userId: z.string().uuid(), moderatedBy: z.string().uuid().nullable() })
  .openapi('AdminReview');
const ratingSummarySchema = z
  .object({
    count: z.number().int(),
    average: z.number().nullable(),
    distribution: z.object({ 1: z.number().int(), 2: z.number().int(), 3: z.number().int(), 4: z.number().int(), 5: z.number().int() }),
  })
  .openapi('RatingSummary');
const subjectReviewsEnvelope = z.object({
  success: z.literal(true),
  data: z.array(publicReviewSchema),
  meta: z.object({ page: z.number().int(), limit: z.number().int(), total: z.number().int(), rating: ratingSummarySchema }),
});

module.exports = {
  subjectQuery,
  pageQuery,
  createBody,
  updateBody,
  moderationQuery,
  moderateBody,
  publicReviewSchema,
  ownReviewSchema,
  adminReviewSchema,
  subjectReviewsEnvelope,
};
