import { getServerEnv } from '@/config/env.server';

// Rendered on request: the sitemap must be an absolute URL, which needs runtime configuration (W38).
export const dynamic = 'force-dynamic';

// Private areas and search result permutations are never indexed (they also send noindex).
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/account', '/partner', '/admin', '/checkout', '/payments', '/api', '/design-system', '/search'] }],
    sitemap: `${getServerEnv().APP_ORIGIN}/sitemap.xml`,
  };
}
