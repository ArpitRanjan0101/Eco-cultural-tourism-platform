// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeBackend, ok } from '../bff/fakeBackend';
import { page, SECTION_FIXTURES } from './fixtures';

// React.cache only memoises inside a server render; outside it, call through.
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal()), cache: (fn) => fn }));
const { getAnnouncements, getHomepage, getMenu, getPublishedPage } = await import('@/cms/adapters/cms.adapter');

afterEach(() => vi.unstubAllGlobals());

describe('CMS adapter (published content only, 4.6, 4.23)', () => {
  it('reads the published homepage with cacheable public requests (no user token, no per-request headers)', async () => {
    const { calls, fetchMock } = fakeBackend({ 'GET /api/v1/content/homepage': () => ok(page([{ id: 's1', type: 'hero', data: SECTION_FIXTURES.hero }], { pageType: 'homepage' })) });
    const home = await getHomepage();
    expect(home.sections[0].type).toBe('hero');
    expect(calls[0].headers.get('authorization')).toBeNull();
    expect(calls[0].headers.get('x-request-id')).toBeNull();
    expect(fetchMock.mock.calls[0][1].next).toEqual({ revalidate: 60, tags: ['cms'] });
  });

  it('returns null when nothing is published (404) and throws on malformed pages', async () => {
    fakeBackend({ 'GET /api/v1/content/homepage': () => fail(404, 'PAGE_NOT_FOUND') });
    expect(await getHomepage()).toBeNull();
    fakeBackend({ 'GET /api/v1/content/homepage': () => ok({ id: 'x', sections: 'nope' }) });
    await expect(getHomepage()).rejects.toThrow();
  });

  it('only requests well-formed slugs', async () => {
    const { calls } = fakeBackend({ 'GET /api/v1/content/pages/about-us': () => ok(page([], { slug: 'about-us' })) });
    expect(await getPublishedPage('../admin')).toBeNull();
    expect(await getPublishedPage('About Us')).toBeNull();
    expect(calls).toHaveLength(0);
    expect((await getPublishedPage('about-us')).slug).toBe('about-us');
  });

  it('menus and announcements degrade instead of failing the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeBackend({
      'GET /api/v1/content/menus/main': () => fail(503, 'TIMEOUT'),
      'GET /api/v1/content/menus/footer': () => fail(404, 'MENU_NOT_FOUND'),
      'GET /api/v1/content/announcements': () => fail(503, 'TIMEOUT'),
    });
    expect(await getMenu('main')).toBeNull();
    expect(await getMenu('footer')).toBeNull();
    expect(await getAnnouncements()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
