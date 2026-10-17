import 'server-only';
import { cache } from 'react';
import { getCatalogue } from '@/lib/bff/publicApi';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Active regions with district counts (GET /regions). */
export const getRegions = cache(async () => (await getCatalogue('/api/v1/regions'))?.data ?? []);

/** Active districts, optionally of one region (GET /districts?region=). */
export const getDistricts = cache(async (region) => (await getCatalogue('/api/v1/districts', { region: SLUG.test(region ?? '') ? region : undefined }))?.data ?? []);

/** One active district or null (GET /districts/:slug). */
export const getDistrict = cache(async (slug) => (SLUG.test(slug) ? ((await getCatalogue(`/api/v1/districts/${slug}`))?.data ?? null) : null));

/** Published destinations of a district, paged (GET /districts/:slug/destinations). Query is pre-validated. */
export const getDistrictDestinations = cache(async (slug, query) => getCatalogue(`/api/v1/districts/${slug}/destinations`, query));

/** Active destination categories (GET /destination-categories). */
export const getCategories = cache(async () => (await getCatalogue('/api/v1/destination-categories'))?.data ?? []);
