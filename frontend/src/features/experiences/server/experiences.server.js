import 'server-only';
import { catalogueItem, catalogueList, SLUG } from '@/lib/bff/catalogue';

/** Published experiences, filtered and paged (GET /experiences). `query` comes from parseExperienceQuery. */
export const listExperiences = catalogueList('/api/v1/experiences');

/** Published experience detail (GET /experiences/:slug) or null. */
export const getExperience = catalogueItem('/api/v1/experiences', SLUG);
