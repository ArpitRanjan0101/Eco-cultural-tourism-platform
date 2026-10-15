'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery } = require('../../core/utils/pagination');
const { DESTINATION_SORT, PARTNER_SORT } = require('./analytics.repository');

const bookingType = z.enum(['property_room', 'guide_service', 'experience_session', 'package_departure']);
const money = z.string().openapi({ example: '12500.00' });
const range = {
  from: f.date.optional().openapi({ description: 'Local date (Asia/Kolkata); default 29 days before `to`' }),
  to: f.date.optional().openapi({ description: 'Inclusive local date; default today' }),
};
const seriesQuery = { ...range, groupBy: z.enum(['day', 'week', 'month']).default('day') };

const partnerReportQuery = z.object({ ...seriesQuery, bookingType: bookingType.optional() }).strict();
const platformReportQuery = z.object({ ...seriesQuery, bookingType: bookingType.optional(), partnerId: f.uuid.optional() }).strict();
const destinationsQuery = z
  .object({
    ...paginationQuery,
    ...range,
    status: f.publishStatus.optional(),
    districtId: f.uuid.optional(),
    sort: z.enum(Object.keys(DESTINATION_SORT)).default('bookings'),
  })
  .strict();
const partnersQuery = z
  .object({
    ...paginationQuery,
    ...range,
    partnerType: z.enum(['accommodation', 'guide', 'operator', 'multi']).optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
    sort: z.enum(Object.keys(PARTNER_SORT)).default('bookedValue'),
  })
  .strict();

const rangeSchema = z.object({ from: z.string(), to: z.string(), groupBy: z.enum(['day', 'week', 'month']) });
const bookingCounts = {
  bookings: z.number().int(),
  confirmed: z.number().int().openapi({ description: 'Confirmed or completed' }),
  cancelled: z.number().int(),
  rejected: z.number().int(),
  expired: z.number().int(),
  pending: z.number().int().openapi({ description: 'Requested or awaiting payment' }),
  bookedValue: money.openapi({ description: 'Total of confirmed/completed bookings' }),
};
const bookingTotals = z.object({ ...bookingCounts, averageBookingValue: money });
const bookingsReportSchema = z
  .object({
    range: rangeSchema,
    currency: z.string(),
    totals: bookingTotals,
    byType: z.array(z.object({ bookingType, ...bookingCounts })),
    series: z.array(z.object({ period: z.string(), bookings: z.number().int(), confirmed: z.number().int(), cancelled: z.number().int(), bookedValue: money })),
  })
  .openapi('BookingsReport');
const revenueAmounts = { captured: money, refunded: money, net: money };
const revenueReportSchema = z
  .object({
    range: rangeSchema,
    currency: z.string(),
    totals: z.object({ ...revenueAmounts, payments: z.number().int(), refunds: z.number().int() }),
    byType: z.array(z.object({ bookingType, ...revenueAmounts, payments: z.number().int(), refunds: z.number().int() })),
    series: z.array(z.object({ period: z.string(), ...revenueAmounts })),
  })
  .openapi('RevenueReport');
const destinationRowSchema = z
  .object({
    destination: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), status: z.string() }),
    bookings: z.number().int(),
    bookedValue: money,
    favorites: z.number().int(),
    tripStops: z.number().int(),
    reviews: z.number().int(),
    averageRating: z.number().nullable(),
  })
  .openapi('DestinationReportRow');
const partnerRowSchema = z
  .object({
    partner: z.object({ id: z.string().uuid(), businessName: z.string(), partnerType: z.string(), status: z.string() }),
    bookings: z.number().int(),
    confirmed: z.number().int(),
    cancelled: z.number().int(),
    cancellationRate: z.number().openapi({ description: 'Percent of bookings cancelled' }),
    bookedValue: money,
    captured: money,
    refunded: money,
    net: money,
  })
  .openapi('PartnerReportRow');
const reportPageEnvelope = (row) =>
  z.object({
    success: z.literal(true),
    data: z.array(row),
    meta: z.object({ page: z.number().int(), limit: z.number().int(), total: z.number().int(), from: z.string(), to: z.string() }),
  });

const last30Days = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  bookings: bookingTotals,
  revenue: z.object(revenueAmounts),
});
const platformDashboardSchema = z
  .object({
    generatedAt: z.string().datetime(),
    currency: z.string(),
    users: z.object({ total: z.number().int(), active: z.number().int(), newLast30Days: z.number().int() }),
    last30Days,
    bookings: z.object({ createdToday: z.number().int(), upcomingNext7Days: z.number().int(), awaitingPartnerApproval: z.number().int() }),
    attention: z.object({
      partnerApplications: z.number().int(),
      propertiesPendingReview: z.number().int(),
      guidesPendingVerification: z.number().int(),
      experiencesPendingReview: z.number().int(),
      packagesPendingReview: z.number().int(),
      reviewsPending: z.number().int(),
      refundsFailed: z.number().int(),
      paymentWebhooksFailed: z.number().int(),
      outboxEventsFailed: z.number().int(),
    }),
  })
  .openapi('PlatformDashboard');
const partnerDashboardSchema = z
  .object({
    generatedAt: z.string().datetime(),
    currency: z.string(),
    partner: z.object({ id: z.string().uuid(), businessName: z.string(), status: z.string() }),
    last30Days,
    bookings: z.object({ awaitingApproval: z.number().int(), upcomingNext7Days: z.number().int() }),
    upcoming: z.array(
      z.object({ id: z.string().uuid(), reference: z.string(), bookingType, status: z.string(), totalAmount: money, serviceStartAt: z.string().datetime() }),
    ),
    supply: z.array(z.object({ type: z.enum(['property', 'guide', 'experience', 'package']), status: z.string(), count: z.number().int() })),
    rating: z.object({ count: z.number().int(), average: z.number().nullable() }),
  })
  .openapi('PartnerDashboard');

module.exports = {
  partnerReportQuery,
  platformReportQuery,
  destinationsQuery,
  partnersQuery,
  bookingsReportSchema,
  revenueReportSchema,
  destinationRowSchema,
  partnerRowSchema,
  reportPageEnvelope,
  platformDashboardSchema,
  partnerDashboardSchema,
};
