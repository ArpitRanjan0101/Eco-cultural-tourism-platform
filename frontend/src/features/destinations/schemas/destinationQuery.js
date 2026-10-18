import { z } from 'zod';
import { labelledOptions, pageParam, parseListQuery, slugParam, textParam } from '@/lib/url/listQuery';

// GET /destinations query contract (docs/api/openapi.json): page 1..10000, q 2..100, district/region/category
// slugs, featured true|false, sort enum. URL values outside the contract are dropped, never forwarded.
export const DESTINATION_PAGE_SIZE = 12;
export const DESTINATION_SORTS = ['name', '-name', 'createdAt', '-createdAt', 'publishedAt', '-publishedAt'];
export const SORT_LABELS = {
  name: 'Name (A–Z)',
  '-name': 'Name (Z–A)',
  publishedAt: 'Longest listed',
  '-publishedAt': 'Recently added',
  createdAt: 'Oldest entries',
  '-createdAt': 'Newest entries',
};

const FIELDS = {
  page: pageParam,
  q: textParam,
  district: slugParam,
  region: slugParam,
  category: slugParam,
  featured: z.enum(['true']),
  sort: z.enum(DESTINATION_SORTS),
};

/**
 * Validated destination list state from Next.js searchParams.
 * @returns {{ query: object, params: Record<string,string>, page: number, dropped: string[] }}
 *   `query` → backend (with limit); `params` → URL building; `dropped` = names of rejected values.
 */
export function parseDestinationQuery(searchParams = {}, allowed = Object.keys(FIELDS)) {
  return parseListQuery(searchParams, FIELDS, { pageSize: DESTINATION_PAGE_SIZE, allowed });
}

/** Sort options to offer: the sorts the backend advertises (/search/filters), labelled, in that order. */
export function sortOptions(advertised) {
  return labelledOptions(advertised?.length ? advertised : DESTINATION_SORTS, SORT_LABELS);
}
