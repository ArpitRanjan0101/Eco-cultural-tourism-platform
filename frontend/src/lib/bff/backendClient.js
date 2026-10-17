import 'server-only';
import { getServerEnv } from '@/config/env.server';
import { BffError } from './errors';

// Only these API areas are ever called; the path is always built by our code, never taken from a caller.
const ALLOWED_PATH = /^\/(api\/v1|health)\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]*$/;
// Headers a caller may add (W8). Everything else, including any service/authorization header, is ignored.
const EXTRA_HEADERS = new Map([
  ['idempotency-key', /^[A-Za-z0-9_.:-]{8,255}$/],
  ['x-partner-id', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
]);
const PASSED_BACK = ['content-type', 'retry-after', 'idempotent-replay', 'x-request-id'];

function assertSafePath(path) {
  if (typeof path !== 'string' || !ALLOWED_PATH.test(path) || /\/\.{1,2}(\/|$)/.test(path) || path.includes('//')) {
    throw new Error(`backendClient: refusing unsafe path "${String(path).slice(0, 80)}"`);
  }
}

/**
 * Calls Express through nginx's private listener (W3). Always sends the service token; sends the user's JWT only
 * when `accessToken` is given. Never retries. Returns { status, headers, data, text } for any HTTP status;
 * throws BffError 504 UPSTREAM_TIMEOUT / 502 UPSTREAM_UNAVAILABLE when no response arrives.
 * @param {{ method?: string, path: string, search?: string, body?: unknown, rawBody?: string,
 *   accessToken?: string|null, context?: { requestId?: string, clientIp?: string|null },
 *   headers?: Record<string, string|null|undefined>, next?: object }} options
 */
export async function backendRequest({ method = 'GET', path, search = '', body, rawBody, accessToken, context = {}, headers = {}, next }) {
  assertSafePath(path);
  const env = getServerEnv();
  const base = new URL(env.BACKEND_INTERNAL_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.pathname !== path) throw new Error('backendClient: path normalisation changed the target');
  if (search) url.search = search;

  const outgoing = new Headers({ Accept: 'application/json', 'X-Internal-Service-Token': env.INTERNAL_SERVICE_TOKEN });
  if (context.requestId) outgoing.set('X-Request-Id', context.requestId);
  if (context.clientIp) outgoing.set('X-Client-Ip', context.clientIp);
  if (accessToken) outgoing.set('Authorization', `Bearer ${accessToken}`);
  for (const [name, value] of Object.entries(headers)) {
    const rule = EXTRA_HEADERS.get(name.toLowerCase());
    if (rule && typeof value === 'string' && rule.test(value)) outgoing.set(name, value);
  }

  let payload;
  if (rawBody !== undefined && rawBody !== '') payload = rawBody;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload !== undefined) outgoing.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: outgoing,
      body: payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(env.BACKEND_TIMEOUT_MS),
      ...(next ? { next } : { cache: 'no-store' }),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new BffError({
      status: timedOut ? 504 : 502,
      code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      message: timedOut ? 'The service took too long to respond.' : 'The service is unavailable. Please try again shortly.',
      requestId: context.requestId,
    });
  }

  const text = response.status === 204 ? '' : await response.text();
  let data = null;
  if (text && (response.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  const passed = new Headers();
  for (const name of PASSED_BACK) {
    const value = response.headers.get(name);
    if (value) passed.set(name, value);
  }
  return { status: response.status, headers: passed, data, text };
}

/** Like backendRequest, but returns the success envelope ({ data, meta }) and throws BffError otherwise. */
export async function backendData(options) {
  const result = await backendRequest(options);
  if (result.status >= 200 && result.status < 300 && (result.status === 204 || result.data?.success)) {
    return result.status === 204 ? { data: null } : { data: result.data.data, meta: result.data.meta };
  }
  const error = BffError.fromBackend(result.status, result.data, options.context?.requestId);
  error.retryAfter = result.headers.get('retry-after') ?? undefined;
  throw error;
}
