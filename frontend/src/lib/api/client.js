// Browser-side API client (W3). The only way client code talks to the backend: same-origin calls to the BFF
// under /api/*. It never sees tokens; it adds the CSRF header to state-changing requests (W7).
import { CSRF_COOKIE_CANDIDATES } from '@/lib/bff/cookies';

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId, retryAfter }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const found = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

export function csrfToken() {
  for (const name of CSRF_COOKIE_CANDIDATES) {
    const value = readCookie(name);
    if (value) return value;
  }
  return null;
}

/**
 * Calls a BFF route and returns the success envelope ({ success, data, meta? }), or null for 204.
 * Throws ApiError carrying the backend `code`, `details`, `requestId` and `Retry-After`.
 * @param {string} path same-origin path starting with /api/
 * @param {{ method?: string, body?: unknown, headers?: HeadersInit, signal?: AbortSignal }} options
 */
export async function apiFetch(path, { method = 'GET', body, headers, signal } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.startsWith('//')) {
    throw new Error(`apiFetch: only same-origin /api/ paths are allowed (got "${path}")`);
  }
  const outgoing = new Headers(headers);
  outgoing.set('Accept', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken();
    if (token) outgoing.set('X-CSRF-Token', token);
  }
  if (body !== undefined) outgoing.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(path, { method, headers: outgoing, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your connection and try again.' });
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;
  if (response.status === 204) return null;
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.ok && json?.success) return json;
  const error = json?.error;
  throw new ApiError({
    status: response.status,
    code: error?.code ?? 'UNEXPECTED_RESPONSE',
    message: error?.message ?? 'Something went wrong. Please try again.',
    details: error?.details,
    requestId: error?.requestId ?? requestId,
    retryAfter: response.headers.get('retry-after') ?? undefined,
  });
}

export const api = {
  get: (path, options) => apiFetch(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiFetch(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => apiFetch(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => apiFetch(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiFetch(path, { ...options, method: 'DELETE' }),
};
