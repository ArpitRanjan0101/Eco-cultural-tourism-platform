import { z } from 'zod';
import { labelledOptions, pageParam, parseListQuery, slugParam, textParam } from '@/lib/url/listQuery';

// GET /experiences query contract: page, q 2..100, destination slug, sort enum (default nextSessionAt).
export const EXPERIENCE_PAGE_SIZE = 12;
export const EXPERIENCE_SORT_LABELS = {
  nextSessionAt: 'Next session first',
  name: 'Name (A–Z)',
  '-name': 'Name (Z–A)',
  startingPrice: 'Price: low to high',
  '-startingPrice': 'Price: high to low',
  '-createdAt': 'Newest experiences',
};
const SORTS = Object.keys(EXPERIENCE_SORT_LABELS);

const FIELDS = { page: pageParam, q: textParam, destination: slugParam, sort: z.enum(SORTS) };

export const parseExperienceQuery = (searchParams) => parseListQuery(searchParams, FIELDS, { pageSize: EXPERIENCE_PAGE_SIZE });
export const experienceSortOptions = () => labelledOptions(SORTS, EXPERIENCE_SORT_LABELS);

/** Session window per check (backend default 30 days, maximum 120). */
export const SESSION_WINDOW_DAYS = 30;

/**
 * Party size and first date for GET /experiences/:id/availability (UX mirror: participants within the
 * experience's own group limits, date from today in Jharkhand).
 */
export function sessionCheckSchema({ today, minParticipants, maxParticipants }) {
  return z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.').refine((value) => value >= today, 'The date cannot be in the past.'),
    participants: z.coerce
      .number({ message: 'Enter the number of people.' })
      .int('Enter a whole number.')
      .min(minParticipants, `This experience needs at least ${minParticipants}.`)
      .max(maxParticipants, `This experience takes at most ${maxParticipants}.`),
  });
}

/** Jharkhand midnight of a calendar date as an ISO instant (Asia/Kolkata is UTC+05:30 all year). */
export const kolkataMidnight = (date) => new Date(`${date}T00:00:00+05:30`).toISOString();
