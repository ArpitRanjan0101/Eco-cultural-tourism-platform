'use strict';

const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const auditService = require('../audit/audit.service');
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

const DESCRIPTIONS = Object.freeze({
  'booking.hold_minutes': 'Minutes an instant booking holds capacity while awaiting payment',
  'booking.request_approval_hours': 'Hours a partner has to approve a request-to-book',
  'booking.payment_window_hours': 'Hours the guest has to pay after a request is approved',
  'booking.max_advance_days': 'How far ahead (days) a service can be booked',
  'booking.tax_rate_percent': 'Tax applied to new bookings, percent (0 until finance sign-off, O2)',
  'booking.default_cancellation_policy': 'Refund tiers used when a property has no policy of its own',
});

// Settings change rarely; a short in-process cache keeps per-request reads cheap.
// Admin edits invalidate this instance at once; other instances converge within the TTL.
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

function toEntries(rows) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return Object.keys(DEFAULTS).map((key) => {
    const row = byKey.get(key);
    return {
      key,
      description: DESCRIPTIONS[key],
      value: row ? row.value_json : DEFAULTS[key],
      defaultValue: DEFAULTS[key],
      isDefault: !row || JSON.stringify(row.value_json) === JSON.stringify(DEFAULTS[key]),
      updatedBy: row?.updated_by ?? null,
      updatedAt: row ? row.updated_at.toISOString() : null,
    };
  });
}

/** Every known key with its effective value (rows for unknown keys are ignored). */
async function list() {
  return toEntries(await repository.findAll(pool));
}

/**
 * Applies validated changes atomically; `null` restores the code default. Each changed key
 * is audited. New values apply to bookings created afterwards (existing ones keep snapshots).
 */
async function update(ctx, { values }) {
  await withTransaction(async (client) => {
    const current = new Map((await repository.findAll(client, { forUpdate: true })).map((row) => [row.key, row.value_json]));
    for (const [key, value] of Object.entries(values)) {
      const before = current.has(key) ? current.get(key) : DEFAULTS[key];
      const after = value === null ? DEFAULTS[key] : value;
      if (value === null) await repository.remove(client, key);
      else await repository.upsert(client, key, value, ctx.actorUserId);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await auditService.record(client, ctx, { action: 'settings.updated', entityType: 'platform_setting', entityId: key, oldValues: { value: before }, newValues: { value: after } });
      }
    }
  });
  invalidate();
  return list();
}

module.exports = { DEFAULTS, get, invalidate, list, update };
