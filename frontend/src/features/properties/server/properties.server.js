import 'server-only';
import { catalogueItem, catalogueList, SLUG } from '@/lib/bff/catalogue';

/** Published stays, filtered and paged (GET /properties). `query` comes from parsePropertyQuery. */
export const listProperties = catalogueList('/api/v1/properties');

/**
 * Published stay detail (GET /properties/:slug) or null. The detail already carries rooms, amenities and
 * policies, so the page needs no separate /rooms or /amenities read.
 */
export const getProperty = catalogueItem('/api/v1/properties', SLUG);
