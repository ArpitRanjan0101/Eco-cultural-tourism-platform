import 'server-only';
import { cache } from 'react';
import { getCatalogue, getLive } from '@/lib/bff/publicApi';

/** Unified or typed search (GET /search). Per request, with the visitor's IP for the backend rate limit. */
export const runSearch = cache(async (query) => getLive('/api/v1/search', query));

/** Filter metadata: types, regions with districts and counts, categories with counts, sorts, radius (cached). */
export const getSearchFilters = cache(async () => (await getCatalogue('/api/v1/search/filters'))?.data ?? null);
