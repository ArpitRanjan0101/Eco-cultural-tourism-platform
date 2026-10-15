'use strict';

const { pool } = require('../../config/database');
const repository = require('./settings.repository');

/**
 * Approved setting keys with their defaults (DECISIONS O2/O4, D7). Rows in
 * platform_settings override these; migration 0012 seeds the same values so the
 * effective configuration is visible in the database.
 */
const DEFAULTS = Object.freeze({
  'booking.hold_minutes': 15,
  'booking.request_approval_hours': 24,
  'booking.payment_window_hours': 24,
  'booking.max_advance_days': 365,
  'booking.tax_rate_percent': 0,
  'booking.default_cancellation_policy': {
    tiers: [
      { hoursBeforeCheckIn: 72, refundPercent: 100 },
      { hoursBeforeCheckIn: 24, refundPercent: 50 },
      { hoursBeforeCheckIn: 0, refundPercent: 0 },
    ],
  },
});

// Settings change rarely; a short in-process cache keeps per-request reads cheap.
// Admin edits (Phase 9) call invalidate(); other instances converge within the TTL.
const CACHE_TTL_MS = 30_000;
let cache = null;
let loadedAt = 0;

async function load() {
  if (!cache || Date.now() - loadedAt > CACHE_TTL_MS) {
    cache = new Map((await repository.findAll(pool)).map((row) => [row.key, row.value_json]));
    loadedAt = Date.now();
  }
  return cache;
}

/** Effective value: database override, else the code default. Unknown keys are programming errors. */
async function get(key) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown platform setting ${key}`);
  const settings = await load();
  return settings.has(key) ? settings.get(key) : DEFAULTS[key];
}

function invalidate() {
  cache = null;
}

module.exports = { DEFAULTS, get, invalidate };
