// Link rules shared by every CMS surface. Same allowlist as the backend (core/validation/fields.js safeHref):
// a same-site path or an https URL. Checked again here so a bad value can never become an executable link.

const PATH = /^\/(?!\/)[^\s\\]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isSafeHref(value) {
  return typeof value === 'string' && (PATH.test(value) || HTTPS.test(value));
}

export function isExternalHref(value) {
  return typeof value === 'string' && HTTPS.test(value);
}

export function isSlug(value) {
  return typeof value === 'string' && SLUG.test(value);
}

/**
 * href for a public menu item by linkType (CMS_CONTRACTS.md §4), or null when the value is unusable.
 * @param {{ linkType: string, linkValue: string }} item
 */
export function menuItemHref({ linkType, linkValue }) {
  switch (linkType) {
    case 'internal':
      return PATH.test(linkValue) ? linkValue : null;
    case 'external':
      return HTTPS.test(linkValue) ? linkValue : null;
    case 'page':
      return isSlug(linkValue) ? `/pages/${linkValue}` : null;
    case 'destination':
      return isSlug(linkValue) ? `/destinations/${linkValue}` : null;
    case 'district':
      return isSlug(linkValue) ? `/districts/${linkValue}` : null;
    case 'category':
      return isSlug(linkValue) ? `/destinations?category=${linkValue}` : null;
    default:
      return null;
  }
}

/** Normalises a public menu tree: drops items with unusable links (and their branches) and caps depth at 3. */
export function toNavItems(items, depth = 1) {
  if (!Array.isArray(items) || depth > 3) return [];
  return items.flatMap((item) => {
    const href = menuItemHref(item);
    if (!href) return [];
    return [{ id: item.id, label: item.label, href, external: isExternalHref(href), children: toNavItems(item.children, depth + 1) }];
  });
}
