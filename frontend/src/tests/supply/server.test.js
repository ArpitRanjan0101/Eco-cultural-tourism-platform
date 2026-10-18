// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeBackend, ok } from '../bff/fakeBackend';
import { ids } from './fixtures';

vi.mock('react', async (importOriginal) => ({ ...(await importOriginal()), cache: (fn) => fn }));

const { getProperty, listProperties } = await import('@/features/properties/server/properties.server');
const { getGuide, getLanguages } = await import('@/features/guides/server/guides.server');
const { getExperience } = await import('@/features/experiences/server/experiences.server');
const { getPackage } = await import('@/features/packages/server/packages.server');
const { getReviews } = await import('@/features/reviews/server/reviews.server');
const { default: sitemap } = await import('@/app/sitemap');

afterEach(() => vi.unstubAllGlobals());
const page = (data) => Response.json({ success: true, data, meta: { page: 1, limit: 100, total: data.length } });

describe('supply server fetchers (5b.1)', () => {
  it('lists are cached public reads with the validated query only', async () => {
    const { calls, fetchMock } = fakeBackend({ 'GET /api/v1/properties': () => page([]) });
    await listProperties({ page: 1, limit: 12, propertyType: 'homestay' });
    expect(calls[0].search).toBe('?page=1&limit=12&propertyType=homestay');
    expect(calls[0].headers.get('authorization')).toBeNull();
    expect(calls[0].headers.get('x-client-ip')).toBeNull();
    expect(fetchMock.mock.calls[0][1].next).toEqual({ revalidate: 60, tags: ['catalogue'] });
  });

  it('a 404 list reads as an empty page; reference lists unwrap data', async () => {
    fakeBackend({ 'GET /api/v1/properties': () => fail(404, 'DESTINATION_NOT_FOUND'), 'GET /api/v1/languages': () => ok([{ id: 'l1', code: 'hi', name: 'Hindi' }]) });
    expect(await listProperties({ destination: 'gone', page: 1, limit: 12 })).toEqual({ data: [], meta: { page: 1, limit: 0, total: 0 } });
    expect(await getLanguages()).toEqual([{ id: 'l1', code: 'hi', name: 'Hindi' }]);
  });

  it('details: unknown → null; malformed slugs and ids never reach the backend', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/packages/gone': () => fail(404, 'PACKAGE_NOT_FOUND') });
    expect(await getPackage('gone')).toBeNull();
    expect(await getProperty('../admin')).toBeNull();
    expect(await getExperience('Bad Slug')).toBeNull();
    expect(await getGuide('not-a-uuid')).toBeNull();
    expect(await getGuide(undefined)).toBeNull();
    expect(calls.map((call) => call.path)).toEqual(['/api/v1/packages/gone']);
  });

  it('a guide is read by its id; backend failures propagate instead of looking like 404', async () => {
    fakeBackend({ [`GET /api/v1/guides/${ids.guide}`]: () => ok({ id: ids.guide }), 'GET /api/v1/experiences/x': () => fail(503, 'TIMEOUT') });
    expect(await getGuide(ids.guide)).toEqual({ id: ids.guide });
    await expect(getExperience('x')).rejects.toMatchObject({ status: 503 });
  });

  it('reviews: only known subject types and real ids are sent; the rating summary passes through', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/reviews': () => Response.json({ success: true, data: [], meta: { page: 1, limit: 5, total: 0, rating: { count: 0, average: null, distribution: {} } } }) });
    const result = await getReviews('property', ids.property);
    expect(calls[0].search).toBe(`?subjectType=property&subjectId=${ids.property}&page=1&limit=5`);
    expect(result.meta.rating.average).toBeNull();
    expect((await getReviews('user', ids.property)).data).toEqual([]);
    expect((await getReviews('guide', 'x')).meta.rating).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe('sitemap (5b.6)', () => {
  it('lists every catalogue section and each published stay, guide, experience and package', async () => {
    fakeBackend({
      'GET /api/v1/districts': () => ok([{ slug: 'ranchi' }]),
      'GET /api/v1/destinations': () => page([{ slug: 'sample-falls' }]),
      'GET /api/v1/properties': () => page([{ slug: 'sample-lodge' }]),
      'GET /api/v1/experiences': () => page([{ slug: 'sample-art-walk' }]),
      'GET /api/v1/packages': () => page([{ slug: 'sample-circuit' }]),
      'GET /api/v1/guides': () => page([{ id: ids.guide }]),
    });
    const urls = (await sitemap()).map((entry) => entry.url.replace('http://localhost:3000', ''));
    expect(urls).toEqual(expect.arrayContaining(['/stays', '/guides', '/experiences', '/packages', '/destinations/sample-falls', '/stays/sample-lodge', '/experiences/sample-art-walk', '/packages/sample-circuit', `/guides/${ids.guide}`, '/districts/ranchi']));
  });
});
