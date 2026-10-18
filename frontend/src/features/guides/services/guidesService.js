import { api } from '@/lib/api/client';
import { toQueryString } from '@/lib/url/query';

// Browser-side guide calls, always through the BFF forwarder (/api/v1/*, W3/W5).
export const guidesService = {
  /** GET /guides/:id/availability — published time slots in [from, to] (YYYY-MM-DD, ≤ 92 days). */
  availability: async ({ guideId, from, to }, { signal } = {}) => (await api.get(`/api/v1/guides/${guideId}/availability?${toQueryString({ from, to })}`, { signal })).data,
};
