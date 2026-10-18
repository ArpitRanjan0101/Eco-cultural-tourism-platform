'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

/**
 * Live availability check through the BFF forwarder (W41): runs for the submitted `params` (null = not yet),
 * keeps the previous answer on screen while a new one loads, and treats answers as fresh for 30 s. The backend
 * rate-limits these per visitor IP, which the forwarder passes on (W8).
 * @param {readonly unknown[]} key feature query key, e.g. ['properties', id, 'availability']
 * @param {(params: object, options: { signal: AbortSignal }) => Promise<unknown>} fetcher feature service call
 * @param {object|null} params validated request parameters
 */
export function useAvailability(key, fetcher, params) {
  return useQuery({
    queryKey: [...key, params],
    queryFn: ({ signal }) => fetcher(params, { signal }),
    enabled: params !== null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
