import 'server-only';
import { NextResponse } from 'next/server';
import { getServerEnv } from '@/config/env.server';
import { cookieNames } from './cookies';
import { SAFE_METHODS, verifyCsrf } from './csrf';
import { BffError, errorBody, errorResponse, jsonError } from './errors';
import { resolveClientIp, resolveRequestId } from './requestContext';
import { readSession } from './session';

export const MAX_BODY_BYTES = 2 * 1024 * 1024; // equals nginx private listener client_max_body_size

/**
 * Wraps a BFF route handler (W5, W7): request id + client IP context, CSRF/origin check on unsafe methods,
 * envelope errors, `Cache-Control: no-store` and `X-Request-Id` on every response.
 * The handler receives (request, ctx) with ctx = { requestId, clientIp, env, names, session, params, backendContext }.
 */
export function createBffHandler(handler, { csrf = true } = {}) {
  return async function bffHandler(request, routeContext) {
    const env = getServerEnv();
    const requestId = resolveRequestId(request.headers);
    const names = cookieNames(env.SESSION_COOKIE_SECURE);
    let response;
    try {
      if (csrf && !SAFE_METHODS.has(request.method)) {
        const failure = verifyCsrf(request, { appOrigin: env.APP_ORIGIN, csrfCookieName: names.csrf });
        if (failure) {
          console.warn(JSON.stringify({ level: 'warn', msg: 'bff.csrf_rejected', reason: failure, requestId, path: new URL(request.url).pathname }));
          response = jsonError(403, 'CSRF_FAILED', 'This request was blocked. Reload the page and try again.', requestId);
        }
      }
      if (!response) {
        const clientIp = resolveClientIp(request.headers, env.TRUSTED_PROXY_HOPS);
        const ctx = {
          requestId,
          clientIp,
          env,
          names,
          session: readSession(request.cookies, env.SESSION_COOKIE_SECURE),
          params: routeContext?.params ? await routeContext.params : {},
          backendContext: { requestId, clientIp },
        };
        response = await handler(request, ctx);
      }
    } catch (error) {
      response = errorResponse(error, requestId);
    }
    response.headers.set('X-Request-Id', requestId);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
}

/** Reads a request body as text: JSON only, size-limited. Empty bodies return ''. */
export async function readBodyText(request, requestId) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new BffError({ status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.', requestId });
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new BffError({ status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.', requestId });
  if (text && !(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new BffError({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request bodies must be JSON.', requestId });
  }
  return text;
}

/**
 * Turns a backendRequest result into a browser NextResponse: the envelope as-is, a few safe headers, no backend
 * cookies. A NextResponse so callers can still set session cookies on it.
 */
export function toBrowserResponse(result, requestId) {
  const headers = new Headers();
  for (const name of ['retry-after', 'idempotent-replay']) {
    const value = result.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (result.status === 204) return new NextResponse(null, { status: 204, headers });
  if (result.data && typeof result.data === 'object' && 'success' in result.data) {
    return NextResponse.json(result.data, { status: result.status, headers });
  }
  const error = BffError.fromBackend(result.status, null, requestId);
  return NextResponse.json(errorBody({ code: error.code, message: error.message, requestId }), { status: error.status });
}
