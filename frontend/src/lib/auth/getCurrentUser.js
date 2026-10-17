import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getServerEnv } from '@/config/env.server';
import { backendData } from '@/lib/bff/backendClient';
import { BffError } from '@/lib/bff/errors';
import { resolveClientIp, resolveRequestId } from '@/lib/bff/requestContext';
import { readSession } from '@/lib/bff/session';

/**
 * The signed-in user (AuthenticatedUser from GET /auth/me) or null. Memoised per request. The proxy has already
 * refreshed an expiring session, so a 401 here means "not signed in". Other failures propagate to error.jsx.
 */
export const getCurrentUser = cache(async () => {
  const env = getServerEnv();
  const { accessToken } = readSession(await cookies(), env.SESSION_COOKIE_SECURE);
  if (!accessToken) return null;
  const incoming = await headers();
  try {
    const { data } = await backendData({
      path: '/api/v1/auth/me',
      accessToken,
      context: { requestId: resolveRequestId(incoming), clientIp: resolveClientIp(incoming, env.TRUSTED_PROXY_HOPS) },
    });
    return data;
  } catch (error) {
    if (error instanceof BffError && error.status === 401) return null;
    throw error;
  }
});
