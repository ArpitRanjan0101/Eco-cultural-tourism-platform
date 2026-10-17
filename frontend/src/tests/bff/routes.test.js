// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logoutAll } from '@/app/api/auth/logout-all/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as refresh } from '@/app/api/auth/refresh/route';
import { GET as session } from '@/app/api/session/route';
import { DELETE as forwardDelete, GET as forwardGet, PATCH as forwardPatch, POST as forwardPost } from '@/app/api/v1/[...path]/route';
import { refreshSession, resetRefreshFlights } from '@/lib/bff/tokenRefresh';
import { proxy } from '@/proxy';
import { SERVICE_TOKEN, authSession, browserRequest, fail, fakeBackend, jwt, ok, setCookies } from './fakeBackend';

const params = (...path) => ({ params: Promise.resolve({ path }) });
const SIGNED_IN = { jt_at: jwt(900), jt_rt: 'refresh-token-old-0123456789abcdef' };

beforeEach(() => resetRefreshFlights());
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/auth/login (3.4)', () => {
  it('sets HttpOnly session cookies and returns only the user — never the tokens', async () => {
    const backendSession = authSession();
    const { calls } = fakeBackend({ 'POST /api/v1/auth/login': () => ok(backendSession) });
    const response = await login(browserRequest('/api/auth/login', { method: 'POST', body: { email: 't@example.org', password: 'pw' } }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ success: true, data: { user: backendSession.user } });
    expect(text).not.toContain(backendSession.accessToken);
    expect(text).not.toContain(backendSession.refreshToken);
    const cookies = setCookies(response);
    expect(cookies.jt_at.value).toBe(backendSession.accessToken);
    expect(cookies.jt_at.attributes).toEqual(expect.arrayContaining(['httponly', 'samesite=lax', 'path=/']));
    expect(cookies.jt_rt.value).toBe(backendSession.refreshToken);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    // Service-level auth only: no user JWT on the login call; the browser IP is forwarded.
    expect(calls[0].headers.get('x-internal-service-token')).toBe(SERVICE_TOKEN);
    expect(calls[0].headers.get('authorization')).toBeNull();
    expect(calls[0].headers.get('x-client-ip')).toBe('203.0.113.7');
  });

  it('passes backend failures through unchanged and sets no cookies', async () => {
    fakeBackend({ 'POST /api/v1/auth/login': () => fail(401, 'INVALID_CREDENTIALS') });
    const response = await login(browserRequest('/api/auth/login', { method: 'POST', body: { email: 'a@b.in', password: 'x' } }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('INVALID_CREDENTIALS');
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('rejects requests without CSRF protection before calling Express', async () => {
    const { calls } = fakeBackend();
    const response = await login(browserRequest('/api/auth/login', { method: 'POST', body: {}, csrf: false }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CSRF_FAILED');
    expect(calls).toHaveLength(0);
  });

  it('refuses non-JSON bodies (415) and maps an unreachable backend to 502', async () => {
    fakeBackend();
    const text = await login(browserRequest('/api/auth/login', { method: 'POST', body: 'email=a', headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
    expect(text.status).toBe(415);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
    const down = await login(browserRequest('/api/auth/login', { method: 'POST', body: { email: 'a@b.in', password: 'x' } }));
    expect(down.status).toBe(502);
    expect((await down.json()).error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', requestId: down.headers.get('x-request-id') });
  });
});

describe('logout, logout-all, refresh, session (3.4, 3.5)', () => {
  it('logout revokes the refresh token and clears cookies — even when Express is down', async () => {
    const { calls } = fakeBackend({ 'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }) });
    const response = await logout(browserRequest('/api/auth/logout', { method: 'POST', cookies: SIGNED_IN }));
    expect(response.status).toBe(204);
    expect(JSON.parse(calls[0].body)).toEqual({ refreshToken: SIGNED_IN.jt_rt });
    expect(setCookies(response).jt_at.value).toBe('');
    expect(setCookies(response).jt_rt.value).toBe('');

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
    const offline = await logout(browserRequest('/api/auth/logout', { method: 'POST', cookies: SIGNED_IN }));
    expect(offline.status).toBe(204);
    expect(setCookies(offline).jt_rt.value).toBe('');
  });

  it('logout-all needs a session, sends the bearer token and clears cookies', async () => {
    const { calls } = fakeBackend({ 'POST /api/v1/auth/logout-all': () => new Response(null, { status: 204 }) });
    expect((await logoutAll(browserRequest('/api/auth/logout-all', { method: 'POST' }))).status).toBe(401);
    const response = await logoutAll(browserRequest('/api/auth/logout-all', { method: 'POST', cookies: SIGNED_IN }));
    expect(response.status).toBe(204);
    expect(calls[0].headers.get('authorization')).toBe(`Bearer ${SIGNED_IN.jt_at}`);
    expect(setCookies(response).jt_at.value).toBe('');
  });

  it('refresh rotates cookies; a dead token clears them with the backend code', async () => {
    const next = authSession();
    fakeBackend({ 'POST /api/v1/auth/refresh': () => ok(next) });
    const response = await refresh(browserRequest('/api/auth/refresh', { method: 'POST', cookies: SIGNED_IN }));
    expect(response.status).toBe(200);
    expect(setCookies(response).jt_rt.value).toBe(next.refreshToken);
    expect(await response.text()).not.toContain(next.refreshToken);

    resetRefreshFlights();
    fakeBackend({ 'POST /api/v1/auth/refresh': () => fail(401, 'REFRESH_TOKEN_REUSED') });
    const reused = await refresh(browserRequest('/api/auth/refresh', { method: 'POST', cookies: SIGNED_IN }));
    expect(reused.status).toBe(401);
    expect((await reused.json()).error.code).toBe('REFRESH_TOKEN_REUSED');
    expect(setCookies(reused).jt_rt.value).toBe('');
  });

  it('GET /api/session returns the user, or null when anonymous or the token is rejected', async () => {
    fakeBackend({ 'GET /api/v1/auth/me': ({ headers }) => (headers.get('authorization') === `Bearer ${SIGNED_IN.jt_at}` ? ok({ id: 'u1', permissions: [] }) : fail(401, 'INVALID_TOKEN')) });
    expect(await (await session(browserRequest('/api/session'))).json()).toEqual({ success: true, data: null });
    expect((await (await session(browserRequest('/api/session', { cookies: SIGNED_IN }))).json()).data.id).toBe('u1');
    expect((await (await session(browserRequest('/api/session', { cookies: { jt_at: 'stale' } }))).json()).data).toBeNull();
  });
});

describe('generic forwarder /api/v1/* (3.6, W5)', () => {
  it('forwards an allowlisted call with query, JWT, service token, and allowed headers only', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/destinations': () => Response.json({ success: true, data: [], meta: { page: 2 } }, { headers: { 'set-cookie': 'evil=1' } }) });
    const response = await forwardGet(
      browserRequest('/api/v1/destinations?page=2&district=ranchi', {
        cookies: SIGNED_IN,
        headers: { 'x-internal-service-token': 'spoofed', authorization: 'Bearer spoofed', 'x-client-ip': '6.6.6.6', 'idempotency-key': 'idem-0123456789' },
      }),
      params('destinations'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [], meta: { page: 2 } });
    expect(response.headers.getSetCookie()).toEqual([]);
    const sent = calls[0];
    expect(sent.search).toBe('?page=2&district=ranchi');
    expect(sent.headers.get('x-internal-service-token')).toBe(SERVICE_TOKEN);
    expect(sent.headers.get('authorization')).toBe(`Bearer ${SIGNED_IN.jt_at}`);
    expect(sent.headers.get('x-client-ip')).toBe('203.0.113.7');
    expect(sent.headers.get('idempotency-key')).toBe('idem-0123456789');
  });

  it.each([
    ['unknown path', 'GET', ['nope']],
    ['session route kept out of the forwarder', 'POST', ['auth', 'login']],
    ['refresh kept out', 'POST', ['auth', 'refresh']],
    ['webhook', 'POST', ['webhooks', 'payments', 'razorpay']],
    ['wrong method for a known path', 'DELETE', ['regions']],
    ['dot segment', 'GET', ['destinations', '..', 'admin', 'users']],
    ['encoded slash in a segment', 'GET', ['destinations', 'a/b']],
  ])('404 without calling Express: %s', async (_label, method, path) => {
    const { calls } = fakeBackend();
    const handler = { GET: forwardGet, POST: forwardPost, DELETE: forwardDelete }[method];
    const response = await handler(browserRequest(`/api/v1/${path.join('/')}`, { method, body: method === 'POST' ? {} : undefined }), params(...path));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('ROUTE_NOT_FOUND');
    expect(calls).toHaveLength(0);
  });

  it('mutations need CSRF; the body is forwarded verbatim; backend errors pass through', async () => {
    const { calls } = fakeBackend({ 'PATCH /api/v1/users/me': () => fail(422, 'VALIDATION_ERROR') });
    const blocked = await forwardPatch(browserRequest('/api/v1/users/me', { method: 'PATCH', body: { fullName: 'x' }, csrf: false, cookies: SIGNED_IN }), params('users', 'me'));
    expect(blocked.status).toBe(403);
    expect(calls).toHaveLength(0);
    const response = await forwardPatch(browserRequest('/api/v1/users/me', { method: 'PATCH', body: { fullName: 'x' }, cookies: SIGNED_IN }), params('users', 'me'));
    expect(response.status).toBe(422);
    expect(calls[0].body).toBe('{"fullName":"x"}');
  });

  it('anonymous calls to user routes reach Express without a JWT and get its 401', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/users/me': ({ headers }) => (headers.get('authorization') ? ok({}) : fail(401, 'AUTH_REQUIRED')) });
    const response = await forwardGet(browserRequest('/api/v1/users/me', { headers: { authorization: `Bearer ${jwt()}` } }), params('users', 'me'));
    expect(response.status).toBe(401);
    expect(calls[0].headers.get('authorization')).toBeNull();
  });

  it('rejects oversized bodies with 413', async () => {
    fakeBackend();
    const big = JSON.stringify({ text: 'x'.repeat(2 * 1024 * 1024) });
    const response = await forwardPost(browserRequest('/api/v1/trips', { method: 'POST', body: big, cookies: SIGNED_IN }), params('trips'));
    expect(response.status).toBe(413);
  });
});

describe('single-flight refresh (3.4, W6)', () => {
  it('parallel requests with the same refresh token cause exactly one backend rotation', async () => {
    let resolveRefresh;
    const { calls } = fakeBackend({ 'POST /api/v1/auth/refresh': () => new Promise((resolve) => (resolveRefresh = () => resolve(ok(authSession())))) });
    const pending = Array.from({ length: 6 }, () => refreshSession('refresh-token-old-0123456789abcdef'));
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'));
    resolveRefresh();
    const results = await Promise.all(pending);
    expect(calls).toHaveLength(1);
    expect(new Set(results.map((r) => r.session.refreshToken)).size).toBe(1);
    // A request still carrying the old token shortly afterwards reuses the result instead of replaying it.
    await refreshSession('refresh-token-old-0123456789abcdef');
    expect(calls).toHaveLength(1);
  });

  it('terminal failures are remembered; transient failures are retried', async () => {
    const { calls } = fakeBackend({ 'POST /api/v1/auth/refresh': () => fail(503, 'TIMEOUT') });
    expect(await refreshSession('refresh-token-a-0123456789abcdef')).toMatchObject({ ok: false, terminal: false, status: 503 });
    await refreshSession('refresh-token-a-0123456789abcdef');
    expect(calls).toHaveLength(2);

    resetRefreshFlights();
    const dead = fakeBackend({ 'POST /api/v1/auth/refresh': () => fail(401, 'SESSION_REVOKED') });
    expect(await refreshSession('refresh-token-b-0123456789abcdef')).toMatchObject({ ok: false, terminal: true, code: 'SESSION_REVOKED' });
    await refreshSession('refresh-token-b-0123456789abcdef');
    expect(dead.calls).toHaveLength(1);
  });
});

describe('proxy (3.4, 3.5)', () => {
  const overridden = (response) => response.headers.get('x-middleware-request-cookie') ?? '';

  it('issues a CSRF cookie and stamps the path; strips spoofed internal headers', async () => {
    fakeBackend();
    const response = await proxy(browserRequest('/account?tab=1', { csrf: false, headers: { 'x-jt-pathname': '/evil', 'x-internal-service-token': 'spoof' } }));
    const csrf = setCookies(response).jt_csrf;
    expect(csrf.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrf.attributes).toEqual(expect.arrayContaining(['samesite=strict', 'path=/']));
    expect(csrf.attributes).not.toContain('httponly');
    expect(response.headers.get('x-middleware-request-x-jt-pathname')).toBe('/account?tab=1');
    expect(response.headers.get('x-middleware-request-x-internal-service-token')).toBeNull();
  });

  it('does nothing to a fresh session', async () => {
    const { calls } = fakeBackend();
    const response = await proxy(browserRequest('/account', { cookies: SIGNED_IN }));
    expect(calls).toHaveLength(0);
    expect(setCookies(response).jt_at).toBeUndefined();
  });

  it('refreshes an expiring session and makes this request use the new cookies', async () => {
    const next = authSession();
    fakeBackend({ 'POST /api/v1/auth/refresh': () => ok(next) });
    const response = await proxy(browserRequest('/account', { cookies: { jt_at: jwt(20), jt_rt: SIGNED_IN.jt_rt } }));
    expect(setCookies(response).jt_at.value).toBe(next.accessToken);
    expect(setCookies(response).jt_rt.value).toBe(next.refreshToken);
    expect(overridden(response)).toContain(next.accessToken);
  });

  it('clears the session when the refresh token is dead, keeps it on transient errors', async () => {
    fakeBackend({ 'POST /api/v1/auth/refresh': () => fail(401, 'REFRESH_TOKEN_EXPIRED') });
    const dead = await proxy(browserRequest('/account', { cookies: { jt_rt: SIGNED_IN.jt_rt } }));
    expect(setCookies(dead).jt_rt.value).toBe('');
    expect(overridden(dead)).not.toContain(SIGNED_IN.jt_rt);

    resetRefreshFlights();
    fakeBackend({ 'POST /api/v1/auth/refresh': () => fail(503, 'TIMEOUT') });
    const transient = await proxy(browserRequest('/account', { cookies: { jt_rt: SIGNED_IN.jt_rt } }));
    expect(setCookies(transient).jt_rt).toBeUndefined();
  });
});
