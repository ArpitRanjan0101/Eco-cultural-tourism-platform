import 'server-only';
import { catalogueItem, catalogueList, SLUG } from '@/lib/bff/catalogue';

/** Published packages, filtered and paged (GET /packages). `query` comes from parsePackageQuery. */
export const listPackages = catalogueList('/api/v1/packages');

/** Published package detail with itinerary and inclusions (GET /packages/:slug) or null. */
export const getPackage = catalogueItem('/api/v1/packages', SLUG);
