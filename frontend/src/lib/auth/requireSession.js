import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeNextPath } from './safeRedirect';
import { getCurrentUser } from './getCurrentUser';

/**
 * Server-side guard for protected layouts and pages: returns the user, or redirects to /login with the current
 * path as `next`. Presentation only — Express enforces access on every API call (W13).
 */
export async function requireSession(fallbackPath = '/account') {
  const user = await getCurrentUser();
  if (user) return user;
  const current = safeNextPath((await headers()).get('x-jt-pathname'), fallbackPath);
  redirect(`/login?next=${encodeURIComponent(current)}`);
}
