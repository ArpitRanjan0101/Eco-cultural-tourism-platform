'use strict';

const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { daysBetween } = require('../../core/utils/dates');
const destinationsService = require('../destinations/destinations.service');
const repository = require('./trips.repository');

/**
 * Private trip planner (Report §3 module 10): days and stops only — never a reservation.
 */
const MAX_STOPS_PER_DAY = 30;

const iso = (value) => (value ? value.toISOString() : null);
const notFound = () => ApiError.notFound('Trip not found', 'TRIP_NOT_FOUND');
const invalid = (path, message) => ApiError.validation([{ location: 'body', path, message }]);
const tripLength = (trip) => (trip.start_date ? daysBetween(trip.start_date, trip.end_date) + 1 : null);

function toSummary(row) {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    travelerCount: row.traveler_count,
    status: row.status,
    dayCount: row.day_count,
    stopCount: row.stop_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function toDetail(trip) {
  const [days, stops] = await Promise.all([repository.listDays(pool, trip.id), repository.listStops(pool, trip.id)]);
  const destinationIds = [...new Set(stops.map((s) => s.destination_id).filter(Boolean))];
  const cards = new Map((await destinationsService.getPublishedCards(destinationIds)).map((card) => [card.id, card]));
  return {
    ...toSummary(trip),
    days: days.map((day) => ({
      id: day.id,
      dayNumber: day.day_number,
      date: day.trip_date,
      title: day.title,
      stops: stops
        .filter((s) => s.trip_day_id === day.id)
        .map((s) => ({
          id: s.id,
          title: s.title,
          notes: s.notes,
          startTime: s.start_time,
          endTime: s.end_time,
          sortOrder: s.sort_order,
          destinationId: s.destination_id,
          // Unpublished/archived destinations stay on the plan without public details.
          destination: s.destination_id ? (cards.get(s.destination_id) ?? null) : null,
        })),
    })),
  };
}

/** Owner-only access; other users' trips are indistinguishable from missing ones. */
async function requireOwn(db, ctx, id, options) {
  const trip = await repository.find(db, id, options);
  if (!trip || trip.user_id !== ctx.actorUserId) throw notFound();
  return trip;
}

/** Runs a mutation under the trip row lock, then returns the fresh detail. */
async function mutate(ctx, tripId, fn) {
  await withTransaction(async (client) => {
    await fn(client, await requireOwn(client, ctx, tripId, { forUpdate: true }));
    await repository.touch(client, tripId);
  });
  return toDetail(await repository.find(pool, tripId));
}

async function assertDestination(destinationId) {
  if (!destinationId) return null;
  const [card] = await destinationsService.getPublishedCards([destinationId]);
  if (!card) throw invalid('destinationId', 'destination not found');
  return card;
}

// ---- trips ----

async function list(ctx, query) {
  const { rows, total } = await repository.list(pool, ctx.actorUserId, query);
  return { items: rows.map(toSummary), meta: pageMeta(query, total) };
}

async function get(ctx, id) {
  return toDetail(await requireOwn(pool, ctx, id));
}

/** A trip with dates starts with one empty day per date. */
async function create(ctx, input) {
  const id = await withTransaction(async (client) => {
    const tripId = await repository.insert(client, { ...input, userId: ctx.actorUserId });
    if (input.startDate) {
      const days = daysBetween(input.startDate, input.endDate) + 1;
      for (let dayNumber = 1; dayNumber <= days; dayNumber += 1) await repository.insertDay(client, tripId, { dayNumber });
      await repository.recomputeDayDates(client, tripId);
    }
    return tripId;
  });
  return get(ctx, id);
}

async function update(ctx, id, changes) {
  return mutate(ctx, id, async (client, trip) => {
    const startDate = changes.startDate !== undefined ? changes.startDate : trip.start_date;
    const endDate = changes.endDate !== undefined ? changes.endDate : trip.end_date;
    if ((startDate === null) !== (endDate === null)) throw invalid('endDate', 'startDate and endDate must be set together');
    if (startDate) {
      const length = daysBetween(startDate, endDate) + 1;
      if (length < 1 || length > 60) throw invalid('endDate', 'a trip lasts 1-60 days');
      if ((await repository.maxDayNumber(client, id)) > length) {
        throw ApiError.conflict('Remove the days beyond the new end date first', 'DAYS_OUTSIDE_RANGE');
      }
    }
    await repository.update(client, id, changes);
    await repository.recomputeDayDates(client, id);
  });
}

/** Only drafts are deleted; planned trips are archived instead (keeps the user's history). */
async function remove(ctx, id) {
  await withTransaction(async (client) => {
    const trip = await requireOwn(client, ctx, id, { forUpdate: true });
    if (trip.status !== 'draft') throw ApiError.conflict('Only draft trips can be deleted; archive it instead', 'TRIP_NOT_DRAFT');
    await repository.remove(client, id);
  });
}

// ---- days ----

async function addDay(ctx, id, { dayNumber, title }) {
  return mutate(ctx, id, async (client, trip) => {
    const number = dayNumber ?? (await repository.maxDayNumber(client, id)) + 1;
    const length = tripLength(trip);
    if (length !== null && number > length) throw invalid('dayNumber', `the trip has ${length} day(s); extend its dates first`);
    if (number > 60) throw invalid('dayNumber', 'a trip has at most 60 days');
    try {
      await repository.insertDay(client, id, { dayNumber: number, title });
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict(`Day ${number} already exists`, 'DAY_EXISTS');
      throw err;
    }
    await repository.recomputeDayDates(client, id);
  });
}

async function requireDay(db, tripId, dayId) {
  const day = await repository.findDay(db, tripId, dayId);
  if (!day) throw ApiError.notFound('Day not found', 'DAY_NOT_FOUND');
  return day;
}

async function updateDay(ctx, id, dayId, changes) {
  return mutate(ctx, id, async (client, trip) => {
    await requireDay(client, id, dayId);
    const length = tripLength(trip);
    if (changes.dayNumber && length !== null && changes.dayNumber > length) throw invalid('dayNumber', `the trip has ${length} day(s)`);
    try {
      await repository.updateDay(client, dayId, changes);
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict(`Day ${changes.dayNumber} already exists`, 'DAY_EXISTS');
      throw err;
    }
    await repository.recomputeDayDates(client, id);
  });
}

async function deleteDay(ctx, id, dayId) {
  return mutate(ctx, id, async (client) => {
    await requireDay(client, id, dayId);
    await repository.deleteDay(client, dayId);
  });
}

// ---- stops ----

async function addStop(ctx, id, dayId, input) {
  return mutate(ctx, id, async (client) => {
    await requireDay(client, id, dayId);
    if ((await repository.countStops(client, dayId)) >= MAX_STOPS_PER_DAY) throw ApiError.conflict(`A day holds at most ${MAX_STOPS_PER_DAY} stops`, 'DAY_FULL');
    const destination = await assertDestination(input.destinationId);
    const title = input.title ?? destination?.name;
    if (!title) throw invalid('title', 'title is required when no destination is chosen');
    await repository.insertStop(client, dayId, { ...input, title });
  });
}

async function requireStop(db, tripId, stopId) {
  const stop = await repository.findStop(db, tripId, stopId);
  if (!stop) throw ApiError.notFound('Stop not found', 'STOP_NOT_FOUND');
  return stop;
}

async function updateStop(ctx, id, stopId, changes) {
  return mutate(ctx, id, async (client) => {
    const stop = await requireStop(client, id, stopId);
    if (changes.destinationId) await assertDestination(changes.destinationId);
    const start = changes.startTime !== undefined ? changes.startTime : stop.start_time;
    const end = changes.endTime !== undefined ? changes.endTime : stop.end_time;
    if (start && end && end <= start) throw invalid('endTime', 'endTime must be after startTime');
    await repository.updateStop(client, stopId, changes);
  });
}

async function deleteStop(ctx, id, stopId) {
  return mutate(ctx, id, async (client) => {
    const stop = await requireStop(client, id, stopId);
    await repository.deleteStop(client, stopId);
    await repository.compactStops(client, stop.trip_day_id);
  });
}

/**
 * Re-orders stops and can move them between days. Each listed day receives exactly the
 * listed stops in order; together the lists must contain every stop currently on those days.
 */
async function reorderStops(ctx, id, { days }) {
  return mutate(ctx, id, async (client) => {
    const dayIds = days.map((d) => d.dayId);
    for (const dayId of dayIds) await requireDay(client, id, dayId);
    const current = (await repository.listStops(client, id)).filter((s) => dayIds.includes(s.trip_day_id)).map((s) => s.id);
    const requested = days.flatMap((d) => d.stopIds);
    if (requested.length !== current.length || new Set(requested).size !== requested.length || !current.every((sid) => requested.includes(sid))) {
      throw invalid('days', 'list every stop of the listed days exactly once');
    }
    for (const day of days) {
      for (const [position, stopId] of day.stopIds.entries()) await repository.placeStop(client, stopId, day.dayId, position);
    }
  });
}

module.exports = { list, get, create, update, remove, addDay, updateDay, deleteDay, addStop, updateStop, deleteStop, reorderStops };
