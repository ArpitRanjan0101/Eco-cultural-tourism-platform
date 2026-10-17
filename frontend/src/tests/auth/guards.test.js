// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeBackend, ok } from '../bff/fakeBackend';

const state = { cookies: {}, headers: {} };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name) => (name in state.cookies ? { value: state.cookies[name] } : undefined) }),
  headers: async () => new Headers(state.headers),
}));
vi.mock('next/navigation', () => ({
  redirect: (url) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));
// React.cache only memoises inside a server render; outside it, call through.
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal()), cache: (fn) => fn }));

const { getCurrentUser } = await import('@/lib/auth/getCurrentUser');
const { requireSession } = await import('@/lib/auth/requireSession');
const { requirePermission } = await import('@/lib/auth/requirePermission');

const USER = { id: 'u1', permissions: ['users.read'] };

beforeEach(() => {
  state.cookies = {};
  state.headers = { 'x-jt-pathname': '/account/trips?view=list' };
});
afterEach(() => vi.unstubAllGlobals());

describe('server route guards (3.15)', () => {
  it('getCurrentUser: null without a cookie, the user with one, null when Express rejects the token', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/auth/me': ({ headers }) => (headers.get('authorization') === 'Bearer good' ? ok(USER) : fail(401, 'INVALID_TOKEN')) });
    expect(await getCurrentUser()).toBeNull();
    expect(calls).toHaveLength(0);
    state.cookies = { jt_at: 'good' };
    expect(await getCurrentUser()).toEqual(USER);
    state.cookies = { jt_at: 'revoked' };
    expect(await getCurrentUser()).toBeNull();
  });

  it('getCurrentUser surfaces backend outages instead of treating them as signed out', async () => {
    fakeBackend({ 'GET /api/v1/auth/me': () => fail(503, 'TIMEOUT') });
    state.cookies = { jt_at: 'good' };
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 503 });
  });

  it('requireSession redirects anonymous users to /login with the current path as next', async () => {
    fakeBackend();
    await expect(requireSession()).rejects.toMatchObject({ url: '/login?next=%2Faccount%2Ftrips%3Fview%3Dlist' });
    state.headers = { 'x-jt-pathname': '//evil.example' };
    await expect(requireSession('/admin')).rejects.toMatchObject({ url: '/login?next=%2Fadmin' });
  });

  it('requirePermission returns allowed=false for signed-in users without the permission', async () => {
    fakeBackend({ 'GET /api/v1/auth/me': () => ok(USER) });
    state.cookies = { jt_at: 'good' };
    expect(await requirePermission(['users.read'])).toEqual({ user: USER, allowed: true });
    expect((await requirePermission(['settings.write', 'audit.read'], { mode: 'any' })).allowed).toBe(false);
  });
});
