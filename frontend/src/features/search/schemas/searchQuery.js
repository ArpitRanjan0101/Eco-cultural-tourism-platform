import { z } from 'zod';
import { firstValue } from '@/lib/url/query';

// GET /search contract: q 2..100 (required), type enum, district/region/category slugs, page. Location and
// category filters apply to destinations only (backend search.service). Non-destination searches are paged inside
// the first 500 results, so pages beyond that are never requested.
export const SEARCH_PAGE_SIZE = 12;
export const SEARCH_TYPES = ['destination', 'district', 'property', 'guide', 'experience', 'package'];
export const SEARCH_WINDOW = 500;
export const TYPE_LABELS = { destination: 'Destinations', district: 'Districts', property: 'Stays', guide: 'Guides', experience: 'Experiences', package: 'Packages' };

const slug = z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const FIELDS = {
  q: z.string().trim().min(2).max(100),
  type: z.enum(SEARCH_TYPES),
  district: slug,
  region: slug,
  category: slug,
  page: z.coerce.number().int().min(1).max(10000),
};

/**
 * Validated search state from searchParams. `query` is null without a usable q (nothing is sent to the API).
 * @returns {{ params: Record<string,string>, query: object|null, page: number, maxPage: number|undefined,
 *   qTooShort: boolean, filtered: boolean }}
 */
export function parseSearchQuery(searchParams = {}) {
  const params = {};
  for (const [key, schema] of Object.entries(FIELDS)) {
    const raw = firstValue(searchParams[key]);
    if (raw === undefined || raw === '') continue;
    const parsed = schema.safeParse(raw);
    if (parsed.success) params[key] = String(parsed.data);
  }
  const rawQ = (firstValue(searchParams.q) ?? '').trim();
  const page = Number(params.page ?? 1);
  // Paging outside destination-only search is limited to the backend's 500-result window.
  const maxPage = params.type === 'destination' ? undefined : Math.floor(SEARCH_WINDOW / SEARCH_PAGE_SIZE);
  const usablePage = maxPage ? Math.min(page, maxPage) : page;
  return {
    params,
    page: usablePage,
    maxPage,
    qTooShort: rawQ.length > 0 && !params.q,
    filtered: Boolean(params.district || params.region || params.category),
    query: params.q ? { ...params, page: usablePage, limit: SEARCH_PAGE_SIZE } : null,
  };
}

/** Where a suggestion leads (GET /search/suggestions types: destination, district, category). */
export function suggestionHref(suggestion) {
  if (suggestion.type === 'destination') return `/destinations/${suggestion.slug}`;
  if (suggestion.type === 'district') return `/districts/${suggestion.slug}`;
  if (suggestion.type === 'category') return `/destinations?category=${encodeURIComponent(suggestion.slug)}`;
  return null;
}
