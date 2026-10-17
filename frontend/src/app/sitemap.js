import { getServerEnv } from '@/config/env.server';
import { getCatalogue } from '@/lib/bff/publicApi';

// Rendered on request (it needs runtime configuration and live data); the catalogue reads are fetch-cached.
export const dynamic = 'force-dynamic';

const MAX_PAGES = 20; // up to 2,000 destinations at 100 per page

async function allDestinations() {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await getCatalogue('/api/v1/destinations', { page, limit: 100 });
    if (!result?.data.length) break;
    items.push(...result.data);
    if (items.length >= result.meta.total) break;
  }
  return items;
}

/** Public, indexable URLs: main sections, every active district, every published destination. */
export default async function sitemap() {
  const origin = getServerEnv().APP_ORIGIN;
  const [districts, destinations] = await Promise.all([getCatalogue('/api/v1/districts').then((result) => result?.data ?? []), allDestinations()]);
  return [
    ...['/', '/explore', '/destinations', '/districts'].map((path) => ({ url: `${origin}${path}`, changeFrequency: 'weekly', priority: path === '/' ? 1 : 0.8 })),
    ...districts.map((district) => ({ url: `${origin}/districts/${district.slug}`, changeFrequency: 'monthly', priority: 0.6 })),
    ...destinations.map((destination) => ({ url: `${origin}/destinations/${destination.slug}`, changeFrequency: 'monthly', priority: 0.7 })),
  ];
}
