import 'server-only';
import { cache } from 'react';
import { UUID } from '@/lib/bff/catalogue';
import { getCatalogue } from '@/lib/bff/publicApi';

export const REVIEW_SUBJECTS = ['destination', 'property', 'guide', 'experience', 'package'];
const none = { data: [], meta: { page: 1, limit: 0, total: 0, rating: null } };

/**
 * Approved reviews of a publicly listed item with the rating summary in meta.rating (GET /reviews). An unknown
 * subject type or a malformed id is never sent; a subject that is not public (404) has no reviews.
 */
export const getReviews = cache(async (subjectType, subjectId, { page = 1, limit = 5 } = {}) => {
  if (!REVIEW_SUBJECTS.includes(subjectType) || !UUID.test(subjectId ?? '')) return none;
  return (await getCatalogue('/api/v1/reviews', { subjectType, subjectId, page, limit })) ?? none;
});
