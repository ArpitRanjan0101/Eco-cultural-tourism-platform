// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeBackend, ok } from '../bff/fakeBackend';

vi.mock('react', async (importOriginal) => ({ ...(await importOriginal()), cache: (fn) => fn }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9', 'x-request-id': 'req-abcdefgh' }) }));

const { getDestination, listDestinations } = await import('@/features/destinations/server/destinations.server');
const { getDistrict } = await import('@/features/geography/server/geography.server');
const { runSearch } = await import('@/features/search/server/search.server');

afterEach(() => vi.unstubAllGlobals());

describe('server fetchers (5.8)', () => {
  it('catalogue reads are cached public reads: no user token, no per-request headers', async () => {
    const { calls, fetchMock } = fakeBackend({ 'GET /api/v1/destinations': () => Response.json({ success: true, data: [], meta: { page: 2, limit: 12, total: 0 } }) });
    const result = await listDestinations({ page: 2, limit: 12, district: 'ranchi' });
    expect(result.meta.page).toBe(2);
    expect(calls[0].search).toBe('?page=2&limit=12&district=ranchi');
    expect(calls[0].headers.get('authorization')).toBeNull();
    expect(calls[0].headers.get('x-client-ip')).toBeNull();
    expect(fetchMock.mock.calls[0][1].next).toEqual({ revalidate: 60, tags: ['catalogue'] });
  });

  it('missing resources are null (→ 404 page); malformed slugs never reach the API', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/destinations/gone': () => fail(404, 'DESTINATION_NOT_FOUND') });
    expect(await getDestination('gone')).toBeNull();
    expect(await getDestination('../admin')).toBeNull();
    expect(await getDistrict('Bad Slug')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('backend failures propagate to the error boundary instead of looking like "not found"', async () => {
    fakeBackend({ 'GET /api/v1/destinations/x': () => fail(503, 'TIMEOUT') });
    await expect(getDestination('x')).rejects.toMatchObject({ status: 503 });
  });

  it('search is per request, uncached, and carries the visitor IP for rate limits', async () => {
    const { calls, fetchMock } = fakeBackend({ 'GET /api/v1/search': () => ok([]) });
    await runSearch({ q: 'falls', page: 1, limit: 12 });
    expect(calls[0].search).toBe('?q=falls&page=1&limit=12');
    expect(calls[0].headers.get('x-client-ip')).toBe('203.0.113.9');
    expect(calls[0].headers.get('x-request-id')).toBe('req-abcdefgh');
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });
});
