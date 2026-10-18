import 'server-only';
import { cache } from 'react';
import { getCatalogue } from './publicApi';

// Fetcher factories for public catalogue resources (W41): one implementation for every list/detail pair, so
// features declare paths instead of repeating the cached-read, 404 → null and key-validation logic.

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_PAGE = Object.freeze({ data: [], meta: { page: 1, limit: 0, total: 0 } });

/** Paged list (GET `path`); `query` must already be contract-validated. A 404 reads as an empty page. */
export const catalogueList = (path) => cache(async (query) => (await getCatalogue(path, query)) ?? EMPTY_PAGE);

/** Plain reference list (GET `path` → data[]), e.g. amenities or languages. */
export const catalogueOptions = (path) => cache(async () => (await getCatalogue(path))?.data ?? []);

/**
 * One item (GET `path/{key}`) or null when it is not public. Keys that do not match `pattern` never reach the
 * backend, so a malformed URL is a plain 404.
 */
export const catalogueItem = (path, pattern) => cache(async (key) => (typeof key === 'string' && pattern.test(key) ? ((await getCatalogue(`${path}/${key}`))?.data ?? null) : null));
