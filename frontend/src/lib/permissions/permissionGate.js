// UI-only permission checks (W13). Express re-checks every permission and ownership on every request; these
// helpers only decide what to show. Always gate on permission codes from GET /auth/me, never on role codes.

/**
 * @param {{ permissions?: string[] } | string[] | null | undefined} subject user (or its permission list)
 * @param {string | string[]} required
 * @param {'all'|'any'} mode
 */
export function hasPermissions(subject, required, mode = 'all') {
  const granted = new Set(Array.isArray(subject) ? subject : (subject?.permissions ?? []));
  const needed = Array.isArray(required) ? required : [required];
  if (needed.length === 0) return true;
  return mode === 'any' ? needed.some((code) => granted.has(code)) : needed.every((code) => granted.has(code));
}

// Holding any of these opens the admin area; each admin page then checks its own permission
// (PERMISSIONS_MATRIX.md §2).
export const ADMIN_AREA_PERMISSIONS = Object.freeze([
  'reports.read.platform',
  'users.read',
  'roles.read',
  'geography.manage',
  'destinations.read',
  'properties.moderate',
  'guides.verify',
  'experiences.moderate',
  'packages.moderate',
  'partners.review',
  'bookings.read.platform',
  'payments.read.platform',
  'reviews.moderate',
  'cms.manage',
  'notification_templates.manage',
  'audit.read',
  'settings.read',
]);
