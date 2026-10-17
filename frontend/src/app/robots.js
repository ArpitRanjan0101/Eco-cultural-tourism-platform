import { getServerEnv } from '@/config/env.server';

// Private areas are never indexed (they also send noindex). The sitemap arrives with the listing pages (Phase 5).
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/account', '/partner', '/admin', '/checkout', '/payments', '/api', '/design-system'] }],
    host: getServerEnv().APP_ORIGIN,
  };
}
