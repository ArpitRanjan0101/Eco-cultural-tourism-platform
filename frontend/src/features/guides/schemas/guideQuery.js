import { z } from 'zod';
import { addDays, daysBetween } from '@/lib/formatting/dates';
import { labelledOptions, pageParam, parseListQuery, slugParam, textParam } from '@/lib/url/listQuery';

// GET /guides query contract: page, q 2..100, destination slug, language code (^[a-z]{2,3}$), sort enum
// (default displayName). Only verified, active guides of approved partners are listed (backend D6).
export const GUIDE_PAGE_SIZE = 12;
export const GUIDE_SORT_LABELS = {
  displayName: 'Name (A–Z)',
  '-displayName': 'Name (Z–A)',
  '-yearsExperience': 'Most experienced',
  yearsExperience: 'Least experienced',
  startingPrice: 'Price: low to high',
  '-startingPrice': 'Price: high to low',
  '-createdAt': 'Newest guides',
  createdAt: 'Longest listed',
};
const SORTS = Object.keys(GUIDE_SORT_LABELS);

const FIELDS = {
  page: pageParam,
  q: textParam,
  destination: slugParam,
  language: z.string().regex(/^[a-z]{2,3}$/),
  sort: z.enum(SORTS),
};

export const parseGuideQuery = (searchParams) => parseListQuery(searchParams, FIELDS, { pageSize: GUIDE_PAGE_SIZE });
export const guideSortOptions = () => labelledOptions(SORTS, GUIDE_SORT_LABELS);

/** Longest window the backend returns in one read (GET /guides/:id/availability, MAX_AVAILABILITY_WINDOW_DAYS). */
export const MAX_GUIDE_WINDOW_DAYS = 92;

/** Availability window: from today (Jharkhand) up to 92 days long (UX mirror of the backend rule). */
export function guideWindowSchema(today) {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');
  return z
    .object({ from: date.refine((value) => value >= today, 'The start cannot be in the past.'), to: date })
    .superRefine((value, ctx) => {
      const span = daysBetween(value.from, value.to);
      if (span === null) return;
      if (span < 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end must be on or after the start.' });
      else if (span > MAX_GUIDE_WINDOW_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: `Check up to ${MAX_GUIDE_WINDOW_DAYS} days at a time.` });
    });
}

/** The backend's own default window: the next 14 days. */
export const defaultGuideWindow = (today) => ({ from: today, to: addDays(today, 13) });
