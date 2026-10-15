'use strict';

const { pool } = require('../../config/database');
const repository = require('./allocations.repository');

/**
 * Read-only allocation interface for supply modules (availability and change guards).
 * It has no dependency on supply modules, so they can use it without a cycle with the
 * booking service.
 */

/** Map "roomTypeId|YYYY-MM-DD" -> allocated units for nights in [from, to). */
async function roomNightUnits(roomTypeIds, from, to, db = pool) {
  if (roomTypeIds.length === 0) return new Map();
  const rows = await repository.roomNightAllocations(db, roomTypeIds, from, to);
  return new Map(rows.map((row) => [`${row.room_type_id}|${row.stay_date}`, row.units]));
}

const seatsAllocated = (resourceType, ids, db = pool) => repository.seatAllocations(db, resourceType, ids);
const guideBusyRanges = (guideId, from, to, db = pool) => repository.guideBusyRanges(db, guideId, from, to);
const hasActiveAllocations = (resourceType, resourceId, db = pool) => repository.hasActiveAllocations(db, resourceType, resourceId);

module.exports = { roomNightUnits, seatsAllocated, guideBusyRanges, hasActiveAllocations };
