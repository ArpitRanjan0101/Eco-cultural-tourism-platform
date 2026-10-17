import { api } from '@/lib/api/client';
import { toQueryString } from '@/lib/url/query';

// Browser-side search calls, always through the BFF forwarder (/api/v1/*, W3/W5) — never directly to Express.
export const searchService = {
  /** GET /search/suggestions (q 1..60, limit ≤ 10). */
  suggestions: async (q, { signal } = {}) => (await api.get(`/api/v1/search/suggestions?${toQueryString({ q: q.slice(0, 60), limit: 8 })}`, { signal })).data,
  /** GET /search/nearby around real device coordinates (type destination|property). */
  nearby: async ({ lat, lng, radiusKm, type, limit = 12 }, { signal } = {}) => api.get(`/api/v1/search/nearby?${toQueryString({ lat, lng, radiusKm, type, limit })}`, { signal }),
};
