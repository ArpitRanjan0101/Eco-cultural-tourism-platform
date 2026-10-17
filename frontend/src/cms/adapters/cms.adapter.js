import 'server-only';
import { cache } from 'react';
import { backendData } from '@/lib/bff/backendClient';
import { BffError } from '@/lib/bff/errors';
import { isSlug } from '../links';
import { publicPageSchema } from '../sectionSchemas';

// Public CMS reads (service token only, no user data) may be cached briefly (W9). No per-request headers are
// sent, so the fetch cache key is stable.
const PUBLIC_CACHE = { revalidate: 60, tags: ['cms'] };

async function publicData(path) {
  try {
    return (await backendData({ path, next: PUBLIC_CACHE })).data;
  } catch (error) {
    if (error instanceof BffError && error.status === 404) return null;
    throw error;
  }
}

function log(msg, error) {
  console.warn(JSON.stringify({ level: 'warn', msg, code: error?.code, status: error?.status }));
}

/** Published homepage, or null when none is published (G5). Malformed pages throw (error boundary). */
export const getHomepage = cache(async () => {
  const page = await publicData('/api/v1/content/homepage');
  return page ? publicPageSchema.parse(page) : null;
});

/** A published CMS page by slug, or null (unknown, draft, archived or malformed slug). */
export const getPublishedPage = cache(async (slug) => {
  if (!isSlug(slug)) return null;
  const page = await publicData(`/api/v1/content/pages/${slug}`);
  return page ? publicPageSchema.parse(page) : null;
});

/** Active public menu tree by code, or null. Chrome must never take the page down: failures degrade to null. */
export const getMenu = cache(async (code) => {
  if (!isSlug(code)) return null;
  try {
    return await publicData(`/api/v1/content/menus/${code}`);
  } catch (error) {
    log('cms.menu_unavailable', error);
    return null;
  }
});

/** Announcements active now; [] when there are none or the service is unavailable. */
export const getAnnouncements = cache(async () => {
  try {
    const items = await backendData({ path: '/api/v1/content/announcements', next: { revalidate: 30, tags: ['cms'] } });
    return Array.isArray(items.data) ? items.data : [];
  } catch (error) {
    log('cms.announcements_unavailable', error);
    return [];
  }
});
