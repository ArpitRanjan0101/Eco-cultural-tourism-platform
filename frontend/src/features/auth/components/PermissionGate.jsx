import { hasPermissions } from '@/lib/permissions/permissionGate';

/**
 * Shows `children` only when the user holds the required permission codes; otherwise `fallback` (default
 * nothing). Presentation only (W13) — never a security boundary; Express enforces every permission.
 * @param {{ user: { permissions: string[] } | null, require: string|string[], mode?: 'all'|'any',
 *   fallback?: React.ReactNode, children: React.ReactNode }} props
 */
export default function PermissionGate({ user, require, mode = 'all', fallback = null, children }) {
  return hasPermissions(user, require, mode) ? children : fallback;
}
