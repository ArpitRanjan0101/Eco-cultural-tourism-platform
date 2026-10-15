'use strict';

const { successEnvelope } = require('../../core/validation/common');
const controller = require('./analytics.controller');
const schema = require('./analytics.schema');
const { partnerGuard } = require('../partners/partners.service');
const { partnerHeaders } = require('../partners/partners.schema');

const ADMIN = ['Admin: Reports'];
const PARTNER = ['Partner reports'];
const platform = { auth: 'user', permissions: ['reports.read.platform'] };
const partner = { auth: 'user', permissions: ['reports.read.partner'], headers: partnerHeaders, middleware: [partnerGuard({})] };
const ok = (dataSchema) => ({ status: 200, schema: successEnvelope(dataSchema) });
const RANGE_NOTE = 'Local calendar dates (Asia/Kolkata), `to` inclusive; default the last 30 days; at most 366 days.';

const routes = [
  {
    method: 'get',
    path: '/admin/dashboard',
    tags: ADMIN,
    summary: 'Platform dashboard',
    description: 'Users, last-30-day bookings/revenue, and moderation/operations queues needing attention.',
    ...platform,
    response: ok(schema.platformDashboardSchema),
    handler: controller.platformDashboard,
  },
  {
    method: 'get',
    path: '/admin/reports/bookings',
    tags: ADMIN,
    summary: 'Bookings report',
    description: `Bookings created in the range by current status, type and period. ${RANGE_NOTE}`,
    ...platform,
    request: { query: schema.platformReportQuery },
    response: ok(schema.bookingsReportSchema),
    handler: controller.platformBookings,
  },
  {
    method: 'get',
    path: '/admin/reports/revenue',
    tags: ADMIN,
    summary: 'Revenue report',
    description: `Captured payments minus succeeded refunds, by the date money moved. ${RANGE_NOTE}`,
    ...platform,
    request: { query: schema.platformReportQuery },
    response: ok(schema.revenueReportSchema),
    handler: controller.platformRevenue,
  },
  {
    method: 'get',
    path: '/admin/reports/destinations',
    tags: ADMIN,
    summary: 'Destination performance',
    description: `Per destination: attributed bookings, favorites, trip-plan stops and approved reviews in the range. ${RANGE_NOTE}`,
    ...platform,
    request: { query: schema.destinationsQuery },
    response: { status: 200, schema: schema.reportPageEnvelope(schema.destinationRowSchema) },
    handler: controller.destinations,
  },
  {
    method: 'get',
    path: '/admin/reports/partners',
    tags: ADMIN,
    summary: 'Partner performance',
    description: `Per partner: bookings, cancellations, booked value, captured/refunded/net revenue. ${RANGE_NOTE}`,
    ...platform,
    request: { query: schema.partnersQuery },
    response: { status: 200, schema: schema.reportPageEnvelope(schema.partnerRowSchema) },
    handler: controller.partners,
  },
  {
    method: 'get',
    path: '/partners/me/dashboard',
    tags: PARTNER,
    summary: 'Partner dashboard',
    description: 'Own organisation: last-30-day bookings/revenue, approvals waiting, next confirmed services, supply status, rating.',
    ...partner,
    response: ok(schema.partnerDashboardSchema),
    handler: controller.partnerDashboard,
  },
  {
    method: 'get',
    path: '/partners/me/reports/bookings',
    tags: PARTNER,
    summary: 'Own bookings report',
    description: RANGE_NOTE,
    ...partner,
    request: { query: schema.partnerReportQuery },
    response: ok(schema.bookingsReportSchema),
    handler: controller.partnerBookings,
  },
  {
    method: 'get',
    path: '/partners/me/reports/revenue',
    tags: PARTNER,
    summary: 'Own revenue report',
    description: `Gross amounts collected for the organisation's bookings (before any platform commission — O2). ${RANGE_NOTE}`,
    ...partner,
    request: { query: schema.partnerReportQuery },
    response: ok(schema.revenueReportSchema),
    handler: controller.partnerRevenue,
  },
];

module.exports = routes;
