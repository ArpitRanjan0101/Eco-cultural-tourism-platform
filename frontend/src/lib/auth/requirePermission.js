import 'server-only';
import { hasPermissions } from '@/lib/permissions/permissionGate';
import { requireSession } from './requireSession';

/**
 * Signed-in guard plus a permission check. Returns { user, allowed }; the caller renders the forbidden state
 * when `allowed` is false. Presentation only (W13): Express answers 403 to anything the user may not do.
 * @param {string|string[]} required
 * @param {{ mode?: 'all'|'any', fallbackPath?: string }} options
 */
export async function requirePermission(required, { mode = 'all', fallbackPath } = {}) {
  const user = await requireSession(fallbackPath);
  return { user, allowed: hasPermissions(user, required, mode) };
}
