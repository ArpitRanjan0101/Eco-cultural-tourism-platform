import { z } from 'zod';
import { firstValue } from '@/lib/url/query';

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

const slug = z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const FIELDS = {
  page: z.coerce.number().int().min(1).max(10000),
  q: z.string().trim().min(2).max(100),
  district: slug,
  region: slug,
  category: slug,
  featured: z.enum(['true']),
  sort: z.enum(DESTINATION_SORTS),
};

/**
 * Validated destination list state from Next.js searchParams.
 * @returns {{ query: object, params: Record<string,string>, page: number, dropped: string[] }}
 *   `query` → backend (with limit); `params` → URL building; `dropped` = names of rejected values.
 */
export function parseDestinationQuery(searchParams = {}, allowed = Object.keys(FIELDS)) {
  const params = {};
  const dropped = [];
  for (const key of allowed) {
    const raw = firstValue(searchParams[key]);
    if (raw === undefined || raw === '') continue;
    const parsed = FIELDS[key].safeParse(raw);
    if (parsed.success) params[key] = String(parsed.data);
    else dropped.push(key);
  }
  const page = Number(params.page ?? 1);
  return { params, page, dropped, query: { ...params, page, limit: DESTINATION_PAGE_SIZE } };
}

/** Sort options to offer: the sorts the backend advertises (/search/filters), labelled, in that order. */
export function sortOptions(advertised) {
  return (advertised?.length ? advertised : DESTINATION_SORTS).filter((value) => SORT_LABELS[value]).map((value) => ({ value, label: SORT_LABELS[value] }));
}
