// URL query state helpers (LLD §6): filters live in the URL so pages are shareable and server-rendered.

/** Next.js searchParams value → single string (first value of repeated keys), or undefined. */
export function firstValue(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/** Plain object of string params (empty/undefined dropped) → URLSearchParams string without "?". */
export function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/**
 * `pathname` with the current filters plus `overrides` (null removes a key). Any filter change resets
 * `page` unless the override sets it, so a new filter never lands on an out-of-range page.
 */
export function hrefWith(pathname, params, overrides = {}) {
  const next = { ...params, ...overrides };
  if (!('page' in overrides)) delete next.page;
  for (const [key, value] of Object.entries(overrides)) if (value === null) delete next[key];
  if (Number(next.page) === 1) delete next.page;
  const query = toQueryString(next);
  return query ? `${pathname}?${query}` : pathname;
}
