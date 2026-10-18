import { api } from '@/lib/api/client';
import { toQueryString } from '@/lib/url/query';

// Browser-side stay calls, always through the BFF forwarder (/api/v1/*, W3/W5).
export const propertiesService = {
  /** GET /properties/:id/availability — indicative rooms and prices for dates and guests (rate-limited per IP). */
  availability: async ({ propertyId, ...params }, { signal } = {}) => (await api.get(`/api/v1/properties/${propertyId}/availability?${toQueryString(params)}`, { signal })).data,
};
