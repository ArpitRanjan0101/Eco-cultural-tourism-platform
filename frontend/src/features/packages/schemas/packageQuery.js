import { z } from 'zod';
import { labelledOptions, pageParam, parseListQuery, slugParam, textParam } from '@/lib/url/listQuery';

// GET /packages query contract: page, q 2..100, destination slug, sort enum (default nextDeparture).
export const PACKAGE_PAGE_SIZE = 12;
export const PACKAGE_SORT_LABELS = {
  nextDeparture: 'Next departure first',
  name: 'Name (A–Z)',
  '-name': 'Name (Z–A)',
  startingPrice: 'Price: low to high',
  '-startingPrice': 'Price: high to low',
  durationDays: 'Shortest first',
  '-durationDays': 'Longest first',
  '-createdAt': 'Newest packages',
};
const SORTS = Object.keys(PACKAGE_SORT_LABELS);

const FIELDS = { page: pageParam, q: textParam, destination: slugParam, sort: z.enum(SORTS) };

export const parsePackageQuery = (searchParams) => parseListQuery(searchParams, FIELDS, { pageSize: PACKAGE_PAGE_SIZE });
export const packageSortOptions = () => labelledOptions(SORTS, PACKAGE_SORT_LABELS);

/** Party size for GET /packages/:id/availability (UX mirror: within the package's traveller limits). */
export function travelersSchema({ minTravelers, maxTravelers }) {
  return z.coerce
    .number({ message: 'Enter the number of travellers.' })
    .int('Enter a whole number.')
    .min(minTravelers, `This package needs at least ${minTravelers}.`)
    .max(maxTravelers, `This package takes at most ${maxTravelers}.`);
}
