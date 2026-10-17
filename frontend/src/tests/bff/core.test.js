// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchOperation } from '@/lib/bff/allowlist';
import { FORWARDED_OPERATIONS } from '@/lib/bff/allowlist.generated';
import { backendData, backendRequest } from '@/lib/bff/backendClient';
import { clearedSessionCookieWrites, cookieNames, csrfCookieWrite, sessionCookieWrites } from '@/lib/bff/cookies';
import { verifyCsrf } from '@/lib/bff/csrf';
import { BffError } from '@/lib/bff/errors';
import { resolveClientIp, resolveRequestId } from '@/lib/bff/requestContext';
import { accessTokenNeedsRefresh, jwtExpiresAt } from '@/lib/bff/session';
import { safeNextPath } from '@/lib/auth/safeRedirect';
import { hasPermissions } from '@/lib/permissions/permissionGate';
import { APP_ORIGIN, CSRF, SERVICE_TOKEN, authSession, browserRequest, fail, fakeBackend, jwt, ok } from './fakeBackend';

afterEach(() => vi.unstubAllGlobals());

describe('backendClient (3.1, 3.2)', () => {
  it('always sends the service token, the user JWT only when given, and request context', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/regions': () => ok([]) });
    await backendRequest({ path: '/api/v1/regions', search: '?page=2', context: { requestId: 'req-12345678', clientIp: '203.0.113.7' } });
    await backendRequest({ path: '/api/v1/regions', accessToken: 'user.jwt.token' });
    expect(calls[0].url.href).toBe('http://backend.test:8081/api/v1/regions?page=2');
    expect(calls[0].headers.get('x-internal-service-token')).toBe(SERVICE_TOKEN);
    expect(calls[0].headers.get('authorization')).toBeNull();
    expect(calls[0].headers.get('x-request-id')).toBe('req-12345678');
    expect(calls[0].headers.get('x-client-ip')).toBe('203.0.113.7');
    expect(calls[1].headers.get('authorization')).toBe('Bearer user.jwt.token');
  });

  it('passes only allowlisted extra headers with valid values', async () => {
    const { calls } = fakeBackend({ 'POST /api/v1/bookings': () => ok({}, 201) });
    await backendRequest({
      method: 'POST',
      path: '/api/v1/bookings',
      body: { a: 1 },
      headers: {
        'Idempotency-Key': 'key-0123456789',
        'X-Partner-Id': 'not-a-uuid',
        'X-Internal-Service-Token': 'spoofed',
        Authorization: 'Bearer spoofed',
        Host: 'evil.example',
      },
    });
    const sent = calls[0].headers;
    expect(sent.get('idempotency-key')).toBe('key-0123456789');
    expect(sent.get('x-partner-id')).toBeNull();
    expect(sent.get('x-internal-service-token')).toBe(SERVICE_TOKEN);
    expect(sent.get('authorization')).toBeNull();
    expect(sent.get('content-type')).toBe('application/json');
    expect(calls[0].body).toBe('{"a":1}');
  });

  it.each(['/admin', 'http://evil.example/api/v1/x', '/api/v1/../admin', '/api/v1//x', '/api/v1/a/./b', '//evil.example/api/v1/x', '/api/v2/x'])(
    'refuses unsafe path %s',
    async (path) => {
      fakeBackend();
      await expect(backendRequest({ path })).rejects.toThrow(/unsafe path|normalisation/);
    },
  );

  it('maps timeouts to 504 and network failures to 502, without retrying', async () => {
    const timeout = vi.fn(() => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })));
    vi.stubGlobal('fetch', timeout);
    await expect(backendRequest({ path: '/api/v1/regions' })).rejects.toMatchObject({ status: 504, code: 'UPSTREAM_TIMEOUT' });
    expect(timeout).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
    await expect(backendRequest({ path: '/api/v1/regions' })).rejects.toMatchObject({ status: 502, code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('backendData unwraps success and throws BffError with the backend code (3.3)', async () => {
    fakeBackend({
      'GET /api/v1/regions': () => ok([{ id: 'r1' }]),
      'GET /api/v1/auth/me': () => fail(401, 'TOKEN_EXPIRED'),
      'GET /api/v1/districts': () => new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    });
    expect((await backendData({ path: '/api/v1/regions' })).data).toEqual([{ id: 'r1' }]);
    await expect(backendData({ path: '/api/v1/auth/me' })).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    const error = await backendData({ path: '/api/v1/districts' }).catch((e) => e);
    expect(error).toBeInstanceOf(BffError);
    expect(error).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
  });
});

describe('cookies and session (3.3)', () => {
  it('uses __Host- names when Secure and plain names in development', () => {
    expect(cookieNames(true)).toEqual({ access: '__Host-jt_at', refresh: '__Host-jt_rt', csrf: '__Host-jt_csrf', partner: '__Host-jt_partner' });
    expect(cookieNames(false).access).toBe('jt_at');
  });

  it('session cookies are HttpOnly, SameSite=Lax, path=/, and live until the backend expiry', () => {
    const now = Date.now();
    const session = authSession({ accessTokenExpiresAt: new Date(now + 900_000).toISOString(), refreshTokenExpiresAt: new Date(now + 86_400_000).toISOString() });
    const [access, refresh] = sessionCookieWrites(session, true, now);
    expect(access).toMatchObject({ name: '__Host-jt_at', value: session.accessToken, options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900 } });
    expect(refresh.options.maxAge).toBe(86_400);
    expect(clearedSessionCookieWrites(false).map((w) => [w.name, w.options.maxAge, w.options.expires.getTime()])).toEqual([
      ['jt_at', 0, 0],
      ['jt_rt', 0, 0],
      ['jt_partner', 0, 0],
    ]);
    expect(csrfCookieWrite('x', true).options).toMatchObject({ httpOnly: false, sameSite: 'strict', secure: true });
  });

  it('reads JWT expiry without trusting it and refreshes within 60 s of expiry', () => {
    const now = Date.now();
    expect(jwtExpiresAt(jwt(120))).toBeGreaterThan(now);
    expect(jwtExpiresAt('garbage')).toBeNull();
    expect(accessTokenNeedsRefresh(null)).toBe(true);
    expect(accessTokenNeedsRefresh(jwt(30))).toBe(true);
    expect(accessTokenNeedsRefresh(jwt(600))).toBe(false);
    expect(accessTokenNeedsRefresh('not.a-jwt')).toBe(true);
  });
});

describe('CSRF and origin (3.5)', () => {
  const check = (request) => verifyCsrf(request, { appOrigin: APP_ORIGIN, csrfCookieName: 'jt_csrf' });

  it('accepts same-origin requests that echo the cookie', () => {
    expect(check(browserRequest('/api/x', { method: 'POST' }))).toBeNull();
    expect(check(browserRequest('/api/x', { method: 'POST', origin: null, headers: { referer: `${APP_ORIGIN}/login` } }))).toBeNull();
  });

  it('rejects foreign origins, missing origin, missing or wrong tokens', () => {
    expect(check(browserRequest('/api/x', { method: 'POST', origin: 'https://evil.example' }))).toBe('origin-mismatch');
    expect(check(browserRequest('/api/x', { method: 'POST', origin: null }))).toBe('origin-missing');
    expect(check(browserRequest('/api/x', { method: 'POST', origin: null, headers: { referer: 'https://evil.example/a' } }))).toBe('origin-missing');
    expect(check(browserRequest('/api/x', { method: 'POST', csrf: false }))).toBe('token-missing');
    expect(check(browserRequest('/api/x', { method: 'POST', headers: { 'x-csrf-token': `${CSRF.slice(0, -1)}X` } }))).toBe('token-mismatch');
    expect(check(browserRequest('/api/x', { method: 'POST', headers: { 'x-csrf-token': 'short' } }))).toBe('token-mismatch');
  });
});

describe('request context', () => {
  it('resolves the browser IP from X-Forwarded-For by trusted hops', () => {
    const headers = (xff) => new Headers({ 'x-forwarded-for': xff });
    expect(resolveClientIp(headers('203.0.113.7'), 1)).toBe('203.0.113.7');
    expect(resolveClientIp(headers('1.1.1.1, 203.0.113.7, 10.0.0.2'), 2)).toBe('203.0.113.7');
    expect(resolveClientIp(headers('::ffff:172.19.0.8'), 1)).toBe('172.19.0.8');
    expect(resolveClientIp(headers('2001:db8::1'), 1)).toBe('2001:db8::1');
    expect(resolveClientIp(headers('not-an-ip'), 1)).toBeNull();
    expect(resolveClientIp(headers('203.0.113.7'), 3)).toBeNull();
    expect(resolveClientIp(headers('203.0.113.7'), 0)).toBeNull();
  });

  it('keeps well-formed request ids and replaces others', () => {
    expect(resolveRequestId(new Headers({ 'x-request-id': 'abc-12345678' }))).toBe('abc-12345678');
    expect(resolveRequestId(new Headers({ 'x-request-id': 'bad id\n' }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('contract allowlist (W5)', () => {
  it('excludes health, webhooks and the session routes; includes the rest of the contract', () => {
    const keys = FORWARDED_OPERATIONS.map(([m, p]) => `${m} ${p}`);
    expect(keys).toHaveLength(234);
    expect(keys).not.toContain('POST /api/v1/auth/login');
    expect(keys).not.toContain('POST /api/v1/auth/refresh');
    expect(keys.some((k) => k.includes('/webhooks/') || k.includes('/health/'))).toBe(false);
    expect(keys).toContain('POST /api/v1/auth/register');
  });

  it('matches concrete paths to templates one segment per parameter', () => {
    expect(matchOperation('GET', '/api/v1/destinations/netarhat')).toMatchObject({ template: '/api/v1/destinations/{slug}' });
    expect(matchOperation('DELETE', '/api/v1/destinations/netarhat')).toBeNull();
    expect(matchOperation('GET', '/api/v1/destinations/a/b/c/d')).toBeNull();
    expect(matchOperation('POST', '/api/v1/auth/login')).toBeNull();
    expect(matchOperation('GET', '/api/v1/admin/users')).not.toBeNull();
  });
});

describe('redirect and permission helpers', () => {
  it.each([
    ['/account/bookings?tab=past', '/account/bookings?tab=past'],
    ['https://evil.example', '/account'],
    ['//evil.example', '/account'],
    ['/\\evil.example', '/account'],
    ['/account\nSet-Cookie:x', '/account'],
    ['/login', '/account'],
    [undefined, '/account'],
  ])('safeNextPath(%j) → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it('hasPermissions supports all/any and permission lists or users', () => {
    const user = { permissions: ['users.read', 'audit.read'] };
    expect(hasPermissions(user, ['users.read', 'audit.read'])).toBe(true);
    expect(hasPermissions(user, ['users.read', 'roles.manage'])).toBe(false);
    expect(hasPermissions(user, ['users.read', 'roles.manage'], 'any')).toBe(true);
    expect(hasPermissions(null, 'users.read')).toBe(false);
    expect(hasPermissions(['a'], [])).toBe(true);
  });
});
