'use strict';

const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const { diff } = require('../../core/database/sql');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const auditService = require('../audit/audit.service');
const usersService = require('../users/users.service');
const bookingsService = require('../bookings/bookings.service');
const destinationsService = require('../destinations/destinations.service');
const subjects = require('../subjects/subjects.service');
const repository = require('./reviews.repository');

/**
 * Ratings and reviews. Bookable supply is reviewed only through the author's own completed
 * booking (verified, one per booking); destinations accept one unverified review per user.
 * Every new or edited review waits for moderation before it is public.
 */
const notFound = () => ApiError.notFound('Review not found', 'REVIEW_NOT_FOUND');
const iso = (value) => (value ? value.toISOString() : null);

function toPublic(row, names) {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    rating: row.rating,
    title: row.title,
    comment: row.comment,
    verified: row.booking_id !== null,
    author: { displayName: names.get(row.user_id) ?? 'Traveller' },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toOwn(row, names) {
  return { ...toPublic(row, names), bookingId: row.booking_id, status: row.status, moderationNote: row.moderation_note };
}

function toAdmin(row, names) {
  return { ...toOwn(row, names), userId: row.user_id, moderatedBy: row.moderated_by };
}

async function present(rows, mapper) {
  const names = await usersService.getDisplayNames(rows.map((row) => row.user_id));
  return rows.map((row) => mapper(row, names));
}

async function presentOne(id, mapper) {
  const [review] = await present([await repository.find(pool, id)], mapper);
  return review;
}

async function ratingSummary(subjectType, subjectId) {
  const rows = await repository.summary(pool, subjectType, subjectId);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const row of rows) {
    distribution[row.rating] = row.n;
    total += row.n;
    sum += row.rating * row.n;
  }
  return { count: total, average: total ? Math.round((sum / total) * 10) / 10 : null, distribution };
}

/** Approved reviews of a publicly visible subject with its rating summary. */
async function listForSubject(subjectType, subjectId, query) {
  if (!(await subjects.isPublic(subjectType, subjectId))) throw ApiError.notFound('Item not found', 'SUBJECT_NOT_FOUND');
  const [rows, summary] = await Promise.all([repository.listApproved(pool, subjectType, subjectId, query), ratingSummary(subjectType, subjectId)]);
  return { items: await present(rows, toPublic), meta: { ...pageMeta(query, summary.count), rating: summary } };
}

async function listForDestination(slug, query) {
  const destination = await destinationsService.resolvePublished(slug);
  return listForSubject('destination', destination.id, query);
}

async function create(ctx, input) {
  const { subjectType, subjectId, bookingId } = input;
  if (subjectType === 'destination') {
    if (!(await subjects.isPublic(subjectType, subjectId))) throw ApiError.notFound('Destination not found', 'SUBJECT_NOT_FOUND');
  } else {
    const reviewable = await bookingsService.getReviewableBooking(ctx.actorUserId, bookingId);
    if (!reviewable || reviewable.subjectType !== subjectType || reviewable.subjectId !== subjectId) {
      throw new ApiError(422, 'BOOKING_NOT_REVIEWABLE', 'Only a completed booking of this item can be reviewed');
    }
  }
  try {
    const id = await repository.insert(pool, { ...input, bookingId: subjectType === 'destination' ? null : bookingId, userId: ctx.actorUserId });
    return presentOne(id, toOwn);
  } catch (err) {
    if (err.code === '23505') throw ApiError.conflict('You have already reviewed this', 'REVIEW_EXISTS');
    throw err;
  }
}

async function requireOwn(db, ctx, id, options) {
  const review = await repository.find(db, id, options);
  if (!review || review.user_id !== ctx.actorUserId) throw notFound();
  return review;
}

/** Any edit (including of a rejected review) re-enters the moderation queue. */
async function update(ctx, id, changes) {
  await withTransaction(async (client) => {
    await requireOwn(client, ctx, id, { forUpdate: true });
    await repository.update(client, id, { ...changes, status: 'pending', moderatedBy: null, moderationNote: null });
  });
  return presentOne(id, toOwn);
}

async function remove(ctx, id) {
  await withTransaction(async (client) => {
    await requireOwn(client, ctx, id, { forUpdate: true });
    await repository.remove(client, id);
  });
}

async function listForModeration(query) {
  const { rows, total } = await repository.listForModeration(pool, query);
  return { items: await present(rows, toAdmin), meta: pageMeta(query, total) };
}

async function moderate(ctx, id, { status, note }) {
  await auditService.auditedTransaction(ctx, 'review', async (client) => {
    const review = await repository.find(client, id, { forUpdate: true });
    if (!review) throw notFound();
    const updates = { status, moderatedBy: ctx.actorUserId, moderationNote: note ?? null };
    await repository.update(client, id, updates);
    return { entityId: id, action: 'reviews.moderated', ...diff({ status: review.status, moderationNote: review.moderation_note }, updates) };
  });
  return presentOne(id, toAdmin);
}

module.exports = { listForSubject, listForDestination, create, update, remove, listForModeration, moderate };
