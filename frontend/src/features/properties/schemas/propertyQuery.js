import { z } from 'zod';
import { addDays, daysBetween } from '@/lib/formatting/dates';
import { labelledOptions, pageParam, parseListQuery, slugParam, textParam } from '@/lib/url/listQuery';

// GET /properties query contract (docs/api/openapi.json): page, q 2..100, district/destination slugs,
// propertyType enum, sort enum (default name). The API has no amenity filter, so none is offered.
export const PROPERTY_PAGE_SIZE = 12;
export const PROPERTY_TYPE_LABELS = {
  hotel: 'Hotel',
  resort: 'Resort',
  homestay: 'Homestay',
  guest_house: 'Guest house',
  eco_lodge: 'Eco lodge',
  camp: 'Camp',
  dharamshala: 'Dharamshala',
};
export const PROPERTY_SORT_LABELS = {
  name: 'Name (A–Z)',
  '-name': 'Name (Z–A)',
  startingPrice: 'Price: low to high',
  '-startingPrice': 'Price: high to low',
  '-createdAt': 'Newest listings',
  createdAt: 'Oldest listings',
};
const SORTS = Object.keys(PROPERTY_SORT_LABELS);

const FIELDS = {
  page: pageParam,
  q: textParam,
  district: slugParam,
  destination: slugParam,
  propertyType: z.enum(Object.keys(PROPERTY_TYPE_LABELS)),
  sort: z.enum(SORTS),
};

/** Validated stay list state from Next.js searchParams (see parseListQuery). */
export const parsePropertyQuery = (searchParams) => parseListQuery(searchParams, FIELDS, { pageSize: PROPERTY_PAGE_SIZE });
export const propertySortOptions = () => labelledOptions(SORTS, PROPERTY_SORT_LABELS);
export const propertyTypeOptions = () => labelledOptions(Object.keys(PROPERTY_TYPE_LABELS), PROPERTY_TYPE_LABELS);

/** Longest stay the form accepts in one check (UX mirror; the backend answers 422 for its own limit). */
export const MAX_STAY_NIGHTS = 30;

/**
 * GET /properties/:id/availability parameters (UX mirror of the contract: dates YYYY-MM-DD, adults 1..40,
 * children 0..20, rooms 1..20). Check-in from today in Jharkhand; check-out after check-in.
 */
export function stayAvailabilitySchema(today) {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');
  return z
    .object({
      checkIn: date.refine((value) => value >= today, 'Check-in cannot be in the past.'),
      checkOut: date,
      adults: z.coerce.number({ message: 'Enter a number of adults.' }).int().min(1, 'At least 1 adult.').max(40, 'At most 40 adults.'),
      children: z.coerce.number({ message: 'Enter a number of children.' }).int().min(0, 'Cannot be negative.').max(20, 'At most 20 children.'),
      rooms: z.coerce.number({ message: 'Enter a number of rooms.' }).int().min(1, 'At least 1 room.').max(20, 'At most 20 rooms.'),
    })
    .superRefine((value, ctx) => {
      const nights = daysBetween(value.checkIn, value.checkOut);
      if (nights === null) return;
      if (nights < 1) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: 'Check-out must be after check-in.' });
      else if (nights > MAX_STAY_NIGHTS) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: `Check up to ${MAX_STAY_NIGHTS} nights at a time.` });
    });
}

/** Default dates for the first check: tomorrow → the day after (Jharkhand calendar). */
export const defaultStay = (today) => ({ checkIn: addDays(today, 1), checkOut: addDays(today, 2), adults: '2', children: '0', rooms: '1' });
