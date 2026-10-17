import 'server-only';
import { headers } from 'next/headers';
import { getServerEnv } from '@/config/env.server';
import { backendData } from './backendClient';
import { BffError } from './errors';
import { resolveClientIp, resolveRequestId } from './requestContext';

const CATALOGUE_CACHE = { revalidate: 60, tags: ['catalogue'] };

/**
 * Server-side read of public catalogue data (W9). Cached for 60 s with no per-request headers (stable cache key);
 * returns { data, meta } or null when the resource does not exist (404). Other failures throw to error.jsx.
 * @param {string} path backend path under /api/v1
 * @param {Record<string, string|number|undefined>} [query] already-validated parameters
 */
export async function getCatalogue(path, query) {
  try {
    return await backendData({ path, search: queryString(query), next: CATALOGUE_CACHE });
  } catch (error) {
    if (error instanceof BffError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Per-request public read (search): never cached, and carries the visitor's IP and request id so the backend's
 * per-IP rate limits apply to the visitor, not to the BFF as a whole (W8, W32).
 */
export async function getLive(path, query) {
  const env = getServerEnv();
  const incoming = await headers();
  return backendData({
    path,
    search: queryString(query),
    context: { requestId: resolveRequestId(incoming), clientIp: resolveClientIp(incoming, env.TRUSTED_PROXY_HOPS) },
  });
}

function queryString(query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}
