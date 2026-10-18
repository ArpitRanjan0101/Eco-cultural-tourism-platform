import { getServerEnv } from '@/config/env.server';
import { getCatalogue } from '@/lib/bff/publicApi';

// Rendered on request (it needs runtime configuration and live data); the catalogue reads are fetch-cached.
export const dynamic = 'force-dynamic';

const MAX_PAGES = 20; // up to 2,000 items per catalogue at 100 per page

/** Every published item of a paged catalogue list. */
async function allOf(path) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await getCatalogue(path, { page, limit: 100 });
    if (!result?.data.length) break;
    items.push(...result.data);
    if (items.length >= result.meta.total) break;
  }
  return items;
}

// Detail URL per catalogue (guides are addressed by id, everything else by slug).
const CATALOGUES = [
  { api: '/api/v1/destinations', url: (item) => `/destinations/${item.slug}`, priority: 0.7, changeFrequency: 'monthly' },
  { api: '/api/v1/properties', url: (item) => `/stays/${item.slug}`, priority: 0.6, changeFrequency: 'weekly' },
  { api: '/api/v1/experiences', url: (item) => `/experiences/${item.slug}`, priority: 0.6, changeFrequency: 'weekly' },
  { api: '/api/v1/packages', url: (item) => `/packages/${item.slug}`, priority: 0.6, changeFrequency: 'weekly' },
  { api: '/api/v1/guides', url: (item) => `/guides/${item.id}`, priority: 0.5, changeFrequency: 'weekly' },
];
const SECTIONS = ['/', '/explore', '/destinations', '/districts', '/stays', '/experiences', '/guides', '/packages'];

/** Public, indexable URLs: main sections, every active district and every published catalogue item. */
export default async function sitemap() {
  const origin = getServerEnv().APP_ORIGIN;
  const [districts, ...catalogues] = await Promise.all([getCatalogue('/api/v1/districts').then((result) => result?.data ?? []), ...CATALOGUES.map((catalogue) => allOf(catalogue.api))]);
  return [
    ...SECTIONS.map((path) => ({ url: `${origin}${path}`, changeFrequency: 'weekly', priority: path === '/' ? 1 : 0.8 })),
    ...districts.map((district) => ({ url: `${origin}/districts/${district.slug}`, changeFrequency: 'monthly', priority: 0.6 })),
    ...CATALOGUES.flatMap((catalogue, index) => catalogues[index].map((item) => ({ url: `${origin}${catalogue.url(item)}`, changeFrequency: catalogue.changeFrequency, priority: catalogue.priority }))),
  ];
}
