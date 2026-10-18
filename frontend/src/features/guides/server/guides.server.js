import 'server-only';
import { catalogueItem, catalogueList, catalogueOptions, UUID } from '@/lib/bff/catalogue';

/** Verified guides, filtered and paged (GET /guides). `query` comes from parseGuideQuery. */
export const listGuides = catalogueList('/api/v1/guides');

/** Guide profile by id (GET /guides/:id) or null; it includes the active services, so /services is not read. */
export const getGuide = catalogueItem('/api/v1/guides', UUID);

/** Supported guide languages (GET /languages) for the language filter. */
export const getLanguages = catalogueOptions('/api/v1/languages');
