'use strict';

const { pool } = require('../../config/database');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { todayLocal, addDays, daysBetween } = require('../../core/utils/dates');
const partnersService = require('../partners/partners.service');
const repository = require('./analytics.repository');

/**
 * Platform and partner reporting (Report §3 module 19). Read-only; amounts are decimal
 * strings in INR. Ranges are local calendar dates (default: the last 30 days).
 */
const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;
const CURRENCY = 'INR';

function resolveRange({ from, to, groupBy = 'day' }) {
  const end = to ?? (from ? addDays(from, DEFAULT_RANGE_DAYS - 1) : todayLocal());
  const start = from ?? addDays(end, -(DEFAULT_RANGE_DAYS - 1));
  const span = daysBetween(start, end);
  if (span < 0) throw ApiError.validation([{ location: 'query', path: 'to', message: 'to must be on or after from' }]);
  if (span >= MAX_RANGE_DAYS) throw ApiError.validation([{ location: 'query', path: 'from', message: `a range covers at most ${MAX_RANGE_DAYS} days` }]);
  return { from: start, to: end, groupBy };
}

const bookingCounts = (row) => ({
  bookings: row.bookings,
  confirmed: row.confirmed,
  cancelled: row.cancelled,
  rejected: row.rejected,
  expired: row.expired,
  pending: row.pending,
  bookedValue: row.booked_value,
});

async function bookingsReport(query, partnerId = null) {
  const range = resolveRange(query);
  const filter = { ...range, partnerId: partnerId ?? query.partnerId, bookingType: query.bookingType };
  const [{ totals, byType }, series] = await Promise.all([repository.bookingTotals(pool, filter), repository.bookingSeries(pool, filter)]);
  return {
    range,
    currency: CURRENCY,
    totals: { ...bookingCounts(totals), averageBookingValue: totals.average_value },
    byType: byType.map((row) => ({ bookingType: row.booking_type, ...bookingCounts(row) })),
    series: series.map((row) => ({ period: row.period, bookings: row.bookings, confirmed: row.confirmed, cancelled: row.cancelled, bookedValue: row.booked_value })),
  };
}

async function revenueReport(query, partnerId = null) {
  const range = resolveRange(query);
  const filter = { ...range, partnerId: partnerId ?? query.partnerId, bookingType: query.bookingType };
  const [byType, series] = await Promise.all([repository.revenueTotals(pool, filter), repository.revenueSeries(pool, filter)]);
  // Totals are summed in integer paise from the per-type decimal strings (no float drift).
  const paise = (field) => byType.reduce((sum, row) => sum + Math.round(Number(row[field]) * 100), 0);
  const fmt = (minor) => (minor / 100).toFixed(2);
  return {
    range,
    currency: CURRENCY,
    totals: {
      captured: fmt(paise('captured')),
      refunded: fmt(paise('refunded')),
      net: fmt(paise('net')),
      payments: byType.reduce((sum, row) => sum + row.payments, 0),
      refunds: byType.reduce((sum, row) => sum + row.refunds, 0),
    },
    byType: byType.map((row) => ({ bookingType: row.booking_type, captured: row.captured, refunded: row.refunded, net: row.net, payments: row.payments, refunds: row.refunds })),
    series: series.map((row) => ({ period: row.period, captured: row.captured, refunded: row.refunded, net: row.net })),
  };
}

async function destinationsReport(query) {
  const range = resolveRange(query);
  const { rows, total } = await repository.destinationReport(pool, { ...query, ...range });
  return {
    items: rows.map((row) => ({
      destination: { id: row.id, name: row.name, slug: row.slug, status: row.status },
      bookings: row.bookings,
      bookedValue: row.booked_value,
      favorites: row.favorites,
      tripStops: row.trip_stops,
      reviews: row.reviews,
      averageRating: row.average_rating,
    })),
    meta: { ...pageMeta(query, total), from: range.from, to: range.to },
  };
}

async function partnersReport(query) {
  const range = resolveRange(query);
  const { rows, total } = await repository.partnerReport(pool, { ...query, ...range });
  return {
    items: rows.map((row) => ({
      partner: { id: row.id, businessName: row.business_name, partnerType: row.partner_type, status: row.status },
      bookings: row.bookings,
      confirmed: row.confirmed,
      cancelled: row.cancelled,
      cancellationRate: row.bookings ? Math.round((row.cancelled / row.bookings) * 1000) / 10 : 0,
      bookedValue: row.booked_value,
      captured: row.captured,
      refunded: row.refunded,
      net: row.net,
    })),
    meta: { ...pageMeta(query, total), from: range.from, to: range.to },
  };
}

/** Last-30-days booking and revenue summary shared by both dashboards. */
async function last30Days(partnerId) {
  const range = resolveRange({});
  const [bookings, revenue] = await Promise.all([bookingsReport(range, partnerId), revenueReport(range, partnerId)]);
  return {
    range: { from: range.from, to: range.to },
    bookings: bookings.totals,
    revenue: { captured: revenue.totals.captured, refunded: revenue.totals.refunded, net: revenue.totals.net },
  };
}

async function platformDashboard() {
  const [counts, recent] = await Promise.all([repository.platformCounts(pool), last30Days(null)]);
  return {
    generatedAt: new Date().toISOString(),
    currency: CURRENCY,
    users: { total: counts.users_total, active: counts.users_active, newLast30Days: counts.users_new_30d },
    last30Days: recent,
    bookings: { createdToday: counts.bookings_today, upcomingNext7Days: counts.upcoming_7d, awaitingPartnerApproval: counts.awaiting_partner },
    attention: {
      partnerApplications: counts.partner_applications,
      propertiesPendingReview: counts.properties_pending,
      guidesPendingVerification: counts.guides_pending,
      experiencesPendingReview: counts.experiences_pending,
      packagesPendingReview: counts.packages_pending,
      reviewsPending: counts.reviews_pending,
      refundsFailed: counts.refunds_failed,
      paymentWebhooksFailed: counts.webhooks_failed,
      outboxEventsFailed: counts.outbox_failed,
    },
  };
}

async function partnerDashboard(ctx) {
  const { partnerId } = ctx.partner;
  const [details, recent, partner] = await Promise.all([
    repository.partnerCounts(pool, partnerId),
    last30Days(partnerId),
    partnersService.getPartnerRefMap([partnerId]).then((refs) => refs.get(partnerId)),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    currency: CURRENCY,
    partner,
    last30Days: recent,
    bookings: { awaitingApproval: details.counts.awaiting_approval, upcomingNext7Days: details.counts.upcoming_7d },
    upcoming: details.upcoming.map((row) => ({
      id: row.id,
      reference: row.booking_reference,
      bookingType: row.booking_type,
      status: row.booking_status,
      totalAmount: row.total_amount,
      serviceStartAt: row.service_start_at.toISOString(),
    })),
    supply: details.supply.map((row) => ({ type: row.type, status: row.status, count: row.n })),
    rating: { count: details.rating.count, average: details.rating.average },
  };
}

module.exports = { resolveRange, bookingsReport, revenueReport, destinationsReport, partnersReport, platformDashboard, partnerDashboard };
