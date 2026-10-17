// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPopupContent } from '@/components/maps/PlaceMarker';
import { osmLink, toMapPlaces } from '@/components/maps/places';
import { parseDestinationQuery, sortOptions } from '@/features/destinations/schemas/destinationQuery';
import { parseSearchQuery, suggestionHref } from '@/features/search/schemas/searchQuery';
import { hrefWith, toQueryString } from '@/lib/url/query';
import { destination } from './fixtures';

describe('URL query state (5.5, 5.7)', () => {
  it('hrefWith keeps filters, removes keys, and resets the page on filter changes', () => {
    const params = { q: 'falls', district: 'ranchi', page: '3' };
    expect(hrefWith('/destinations', params, { category: 'waterfalls' })).toBe('/destinations?q=falls&district=ranchi&category=waterfalls');
    expect(hrefWith('/destinations', params, { district: null })).toBe('/destinations?q=falls');
    expect(hrefWith('/destinations', params, { page: 4 })).toBe('/destinations?q=falls&district=ranchi&page=4');
    expect(hrefWith('/destinations', params, { page: 1 })).toBe('/destinations?q=falls&district=ranchi');
    expect(toQueryString({ a: '', b: undefined, c: 'x y' })).toBe('c=x+y');
  });

  it('destination query: contract values pass, everything else is dropped (never forwarded)', () => {
    const ok = parseDestinationQuery({ q: ' falls ', district: 'ranchi', category: 'waterfalls', featured: 'true', sort: '-publishedAt', page: '2' });
    expect(ok.params).toEqual({ page: '2', q: 'falls', district: 'ranchi', category: 'waterfalls', featured: 'true', sort: '-publishedAt' });
    expect(ok.query).toMatchObject({ page: 2, limit: 12 });
    const bad = parseDestinationQuery({ q: 'x', district: 'Ranchi!', category: '../admin', featured: 'yes', sort: 'price', page: '0', extra: 'x' });
    expect(bad.params).toEqual({});
    expect(bad.dropped.sort()).toEqual(['category', 'district', 'featured', 'page', 'q', 'sort']);
    expect(bad.query).toEqual({ page: 1, limit: 12 });
    expect(parseDestinationQuery({ district: 'ranchi', q: 'lake' }, ['q']).params).toEqual({ q: 'lake' });
  });

  it('sort options are the advertised backend sorts only', () => {
    expect(sortOptions(['name', '-publishedAt', 'bogus']).map((option) => option.value)).toEqual(['name', '-publishedAt']);
  });

  it('search query: q 2..100 required, type enum, filters, paging capped to the backend window', () => {
    expect(parseSearchQuery({}).query).toBeNull();
    expect(parseSearchQuery({ q: 'a' })).toMatchObject({ query: null, qTooShort: true });
    const unified = parseSearchQuery({ q: 'falls', page: '99', region: 'kolhan' });
    expect(unified).toMatchObject({ page: 41, maxPage: 41, filtered: true });
    expect(unified.query).toMatchObject({ q: 'falls', region: 'kolhan', page: 41, limit: 12 });
    const typed = parseSearchQuery({ q: 'falls', type: 'destination', page: '99' });
    expect(typed).toMatchObject({ page: 99, maxPage: undefined });
    expect(parseSearchQuery({ q: 'falls', type: 'hotel' }).params.type).toBeUndefined();
  });

  it('suggestion links by type', () => {
    expect(suggestionHref({ type: 'destination', slug: 'a' })).toBe('/destinations/a');
    expect(suggestionHref({ type: 'district', slug: 'b' })).toBe('/districts/b');
    expect(suggestionHref({ type: 'category', slug: 'c' })).toBe('/destinations?category=c');
    expect(suggestionHref({ type: 'other', slug: 'd' })).toBeNull();
  });
});

describe('map adapters (5.6)', () => {
  it('only real API coordinates become map places — no invented points', () => {
    const places = toMapPlaces(
      [destination(), destination({ id: 'x', location: null }), destination({ id: 'y', location: { latitude: 200, longitude: 0 } })],
      { href: (item) => `/destinations/${item.slug}`, subtitle: (item) => item.district.name },
    );
    expect(places).toEqual([{ id: 'dest1', name: 'Sample Falls', latitude: 23.4, longitude: 85.4, href: '/destinations/sample-falls', subtitle: 'Sample District' }]);
  });

  it('popup content is built from text nodes, so names cannot inject markup', async () => {
    const { JSDOM } = await import('jsdom');
    const { document } = new JSDOM('').window;
    const popup = createPopupContent({ name: '<img src=x onerror=alert(1)>', href: '/destinations/x', subtitle: '<b>bold</b>' }, document);
    expect(popup.querySelector('img, b')).toBeNull();
    expect(popup.querySelector('a').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(popup.querySelector('a').getAttribute('href')).toBe('/destinations/x');
  });

  it('builds an OpenStreetMap link for a point', () => {
    expect(osmLink({ latitude: 23.4, longitude: 85.4 })).toBe('https://www.openstreetmap.org/?mlat=23.4&mlon=85.4#map=14/23.4/85.4');
  });
});
