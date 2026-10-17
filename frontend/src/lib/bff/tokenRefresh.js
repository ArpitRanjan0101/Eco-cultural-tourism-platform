import 'server-only';
import { createHash } from 'node:crypto';
import { backendRequest } from './backendClient';
import { BffError } from './errors';

// One in-flight refresh per refresh token, shared by the proxy and route handlers in this process (W6). Backend
// A4 revokes the whole session if a rotated token is presented again, so concurrent requests carrying the same
// token must share one rotation. Settled results are kept briefly for requests that still carry the old token.
const FLIGHTS = Symbol.for('jharkhand-tourism.bff.refreshFlights');
const KEEP_SETTLED_MS = 30_000;

function flights() {
  globalThis[FLIGHTS] ??= new Map();
  return globalThis[FLIGHTS];
}

function sweep(map, now) {
  for (const [key, entry] of map) {
    if (entry.settledAt && now - entry.settledAt > KEEP_SETTLED_MS) map.delete(key);
  }
}

async function rotate(refreshToken, context) {
  try {
    const result = await backendRequest({ method: 'POST', path: '/api/v1/auth/refresh', body: { refreshToken }, context });
    if (result.status === 200 && result.data?.success) return { ok: true, session: result.data.data };
    const code = result.data?.error?.code ?? 'REFRESH_FAILED';
    // 401/422: the token is dead (expired, revoked, reused, malformed) — the session must be cleared.
    const terminal = result.status === 401 || result.status === 422;
    return { ok: false, terminal, status: result.status, code };
  } catch (error) {
    if (error instanceof BffError) return { ok: false, terminal: false, status: error.status, code: error.code };
    throw error;
  }
}

/**
 * Rotates the session. Resolves { ok: true, session } or { ok: false, terminal, status, code }.
 * Transient failures (429, 5xx, timeouts) are not kept, so the next request can try again.
 */
export function refreshSession(refreshToken, context = {}) {
  const map = flights();
  const now = Date.now();
  sweep(map, now);
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const existing = map.get(key);
  if (existing) return existing.promise;

  const entry = { settledAt: null };
  entry.promise = rotate(refreshToken, context).then((result) => {
    if (result.ok || result.terminal) entry.settledAt = Date.now();
    else map.delete(key);
    return result;
  });
  map.set(key, entry);
  return entry.promise;
}

/** Test helper: forget every in-flight and settled refresh. */
export function resetRefreshFlights() {
  flights().clear();
}
