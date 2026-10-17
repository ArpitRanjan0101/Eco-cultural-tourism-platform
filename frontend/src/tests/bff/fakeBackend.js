import { NextRequest } from 'next/server';
import { vi } from 'vitest';

export const SERVICE_TOKEN = 'test-service-token-0123456789abcdef';
export const APP_ORIGIN = 'http://localhost:3000';
export const CSRF = 'csrf-token-for-tests-0123456789abcdefgh';

/**
 * Replaces global fetch with a fake Express. `routes` maps "METHOD /path" to (request) => Response (or a
 * function returning a promise). Every call is recorded with its headers and body.
 */
export function fakeBackend(routes = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const call = { method: init.method ?? 'GET', path: url.pathname, search: url.search, headers, body: init.body ?? null, url };
    calls.push(call);
    const handler = routes[`${call.method} ${url.pathname}`];
    if (!handler) return Response.json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'no fake route', requestId: 'fake' } }, { status: 404 });
    return handler(call);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const ok = (data, status = 200) => Response.json({ success: true, data }, { status });
export const fail = (status, code, message = code) => Response.json({ success: false, error: { code, message, requestId: 'backend-req' } }, { status });

/** A JWT-shaped token with `exp` seconds from now (signature is irrelevant to the BFF). */
export function jwt(expInSeconds = 900) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + expInSeconds })}.sig`;
}

export function authSession(overrides = {}) {
  return {
    tokenType: 'Bearer',
    accessToken: jwt(900),
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: 'refresh-token-new-0123456789abcdef',
    refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    user: { id: 'u1', fullName: 'Test User', email: 't@example.org', roles: ['tourist'] },
    ...overrides,
  };
}

/**
 * Builds a NextRequest as the browser would send it to the BFF.
 * @param {{ method?: string, cookies?: Record<string,string>, body?: unknown, headers?: Record<string,string>,
 *   csrf?: boolean, origin?: string|null }} options
 */
export function browserRequest(path, { method = 'GET', cookies = {}, body, headers = {}, csrf = true, origin = APP_ORIGIN } = {}) {
  const jar = { ...(csrf ? { jt_csrf: CSRF } : {}), ...cookies };
  const h = new Headers(headers);
  h.set('cookie', Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '));
  h.set('x-forwarded-for', h.get('x-forwarded-for') ?? '203.0.113.7');
  if (origin) h.set('origin', origin);
  if (csrf && method !== 'GET' && !h.has('x-csrf-token')) h.set('x-csrf-token', CSRF);
  let payload;
  if (body !== undefined) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    if (!h.has('content-type')) h.set('content-type', 'application/json');
  }
  return new NextRequest(`${APP_ORIGIN}${path}`, { method, headers: h, body: payload });
}

/** Parses Set-Cookie headers of a response into { name: { value, attributes } }. */
export function setCookies(response) {
  const result = {};
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const index = pair.indexOf('=');
    result[pair.slice(0, index)] = { value: decodeURIComponent(pair.slice(index + 1)), attributes: attributes.map((a) => a.toLowerCase()) };
  }
  return result;
}
