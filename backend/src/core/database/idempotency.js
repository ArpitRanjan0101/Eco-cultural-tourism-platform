'use strict';

const { createHash } = require('node:crypto');
const ApiError = require('../errors/ApiError');

const DEFAULT_TTL_HOURS = 24;
const KEY_PATTERN = /^[A-Za-z0-9_:.-]{8,128}$/;

/** Canonical JSON (sorted keys) so equivalent bodies hash identically. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const hashRequest = (body) => createHash('sha256').update(canonical(body)).digest('hex');

function requireKey(header) {
  if (!header) throw ApiError.badRequest('Idempotency-Key header is required', undefined, 'IDEMPOTENCY_KEY_REQUIRED');
  if (!KEY_PATTERN.test(header)) throw ApiError.badRequest('Idempotency-Key must be 8-128 characters [A-Za-z0-9_:.-]', undefined, 'IDEMPOTENCY_KEY_INVALID');
  return header;
}

/**
 * Runs `fn(client)` at most once per (scope, key) inside the caller's transaction.
 * The record is inserted first: a concurrent duplicate blocks on the unique index until
 * the first transaction commits and then replays its stored response. A failed attempt
 * rolls back with its record, so the client may retry with the same key.
 * Returns { replayed, status, body }.
 */
async function runOnce(client, { scope, key, body, ttlHours = DEFAULT_TTL_HOURS }, fn) {
  const requestHash = hashRequest(body);
  await client.query('DELETE FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2 AND expires_at <= now()', [scope, key]);
  const inserted = await client.query(
    `INSERT INTO idempotency_records (scope, idempotency_key, request_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4)) ON CONFLICT (scope, idempotency_key) DO NOTHING RETURNING id`,
    [scope, key, requestHash, ttlHours],
  );

  if (inserted.rowCount === 0) {
    const { rows } = await client.query(
      'SELECT request_hash, response_status, response_body FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2',
      [scope, key],
    );
    const record = rows[0];
    if (record.request_hash !== requestHash) {
      throw ApiError.conflict('Idempotency-Key was already used with a different request', 'IDEMPOTENCY_KEY_REUSED');
    }
    if (record.response_status === null) throw ApiError.conflict('The original request is still in progress', 'IDEMPOTENCY_IN_PROGRESS');
    return { replayed: true, status: record.response_status, body: record.response_body };
  }

  const { status, body: responseBody } = await fn(client);
  await client.query('UPDATE idempotency_records SET response_status = $2, response_body = $3 WHERE id = $1', [
    inserted.rows[0].id,
    status,
    responseBody,
  ]);
  return { replayed: false, status, body: responseBody };
}

async function purgeExpired(db) {
  const { rowCount } = await db.query('DELETE FROM idempotency_records WHERE expires_at < now()');
  return rowCount;
}

module.exports = { runOnce, requireKey, hashRequest, purgeExpired };
