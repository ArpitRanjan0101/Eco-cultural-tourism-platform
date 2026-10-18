import { api } from '@/lib/api/client';
import { toQueryString } from '@/lib/url/query';

// Browser-side package calls, always through the BFF forwarder (/api/v1/*, W3/W5).
export const packagesService = {
  /** GET /packages/:id/availability — seats per upcoming departure for a number of travellers. */
  availability: async ({ packageId, travelers }, { signal } = {}) => (await api.get(`/api/v1/packages/${packageId}/availability?${toQueryString({ travelers })}`, { signal })).data,
};
