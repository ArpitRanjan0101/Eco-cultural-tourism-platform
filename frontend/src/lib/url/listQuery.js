import { z } from 'zod';
import { firstValue } from './query';

// Shared URL → list-query parsing for every catalogue list page (W42). Each feature declares the fields its
// backend list operation accepts; URL values outside the contract are dropped, never forwarded.

/** Backend slug parameter (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 160). */
export const slugParam = z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
/** Backend page parameter (1..10000). */
export const pageParam = z.coerce.number().int().min(1).max(10000);
/** Backend free-text `q` parameter (2..100 after trimming). */
export const textParam = z.string().trim().min(2).max(100);

/**
 * Validated list state from Next.js searchParams.
 * @param {Record<string, string|string[]|undefined>} searchParams
 * @param {Record<string, import('zod').ZodType>} fields contract schema per URL key
 * @param {{ pageSize: number, allowed?: string[] }} options `allowed` limits the keys read (default: all fields)
 * @returns {{ query: object, params: Record<string,string>, page: number, dropped: string[] }}
 *   `query` → backend (with page and limit); `params` → URL building; `dropped` = names of rejected values.
 */
export function parseListQuery(searchParams = {}, fields, { pageSize, allowed = Object.keys(fields) }) {
  const params = {};
  const dropped = [];
  for (const key of allowed) {
    const raw = firstValue(searchParams[key]);
    if (raw === undefined || raw === '') continue;
    const parsed = fields[key].safeParse(raw);
    if (parsed.success) params[key] = String(parsed.data);
    else dropped.push(key);
  }
  const page = Number(params.page ?? 1);
  return { params, page, dropped, query: { ...params, page, limit: pageSize } };
}

/** `[value, …]` + `{ value: label }` → select options in the given order, unlabelled values skipped. */
export function labelledOptions(values, labels) {
  return values.filter((value) => labels[value]).map((value) => ({ value, label: labels[value] }));
}
