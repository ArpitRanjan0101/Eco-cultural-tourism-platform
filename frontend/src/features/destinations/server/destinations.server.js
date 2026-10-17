import 'server-only';
import { cache } from 'react';
import { getCatalogue } from '@/lib/bff/publicApi';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const empty = { data: [], meta: { page: 1, limit: 0, total: 0 } };

/** Published destinations, filtered and paged (GET /destinations). `query` comes from parseDestinationQuery. */
export const listDestinations = cache(async (query) => (await getCatalogue('/api/v1/destinations', query)) ?? empty);

/** Featured destinations (GET /destinations/featured). */
export const getFeaturedDestinations = cache(async (limit = 8) => (await getCatalogue('/api/v1/destinations/featured', { limit }))?.data ?? []);

/** Published destination detail (GET /destinations/:slug) or null. */
export const getDestination = cache(async (slug) => (SLUG.test(slug) ? ((await getCatalogue(`/api/v1/destinations/${slug}`))?.data ?? null) : null));

/** Published destinations near this one, nearest first, with distanceKm (GET /destinations/:slug/nearby). */
export const getNearbyDestinations = cache(async (slug, { limit = 6, radiusKm = 50 } = {}) => (await getCatalogue(`/api/v1/destinations/${slug}/nearby`, { limit, radiusKm })) ?? empty);

/** Experiences / stays / guides around the destination (GET /destinations/:slug/{experiences|properties|guides}). */
export const getDestinationSupply = cache(async (slug, kind, limit = 4) => {
  if (!['experiences', 'properties', 'guides'].includes(kind)) throw new Error(`unknown supply kind ${kind}`);
  return (await getCatalogue(`/api/v1/destinations/${slug}/${kind}`, { limit })) ?? empty;
});

/** Approved reviews with the rating summary in meta.rating (GET /destinations/:slug/reviews). */
export const getDestinationReviews = cache(async (slug, page = 1, limit = 5) => (await getCatalogue(`/api/v1/destinations/${slug}/reviews`, { page, limit })) ?? { ...empty, meta: { ...empty.meta, rating: null } });
