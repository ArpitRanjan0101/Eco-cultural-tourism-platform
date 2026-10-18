import { api } from '@/lib/api/client';
import { toQueryString } from '@/lib/url/query';

// Browser-side experience calls, always through the BFF forwarder (/api/v1/*, W3/W5).
export const experiencesService = {
  /** GET /experiences/:id/availability — seats per scheduled session in [from, to) for a party size. */
  availability: async ({ experienceId, ...params }, { signal } = {}) => (await api.get(`/api/v1/experiences/${experienceId}/availability?${toQueryString(params)}`, { signal })).data,
};
