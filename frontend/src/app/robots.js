// Private areas are never indexed (they also send noindex). The sitemap arrives with the listing pages (Phase 5).
// Static: generated at build time, so it must not depend on runtime server configuration.
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/account', '/partner', '/admin', '/checkout', '/payments', '/api', '/design-system'] }],
  };
}
