import { NextResponse } from 'next/server';
import { getServerEnv } from '@/config/env.server';
import { applyCookieWrites, clearedSessionCookieWrites, cookieNames, csrfCookieWrite, sessionCookieWrites } from '@/lib/bff/cookies';
import { newCsrfToken } from '@/lib/bff/csrf';
import { resolveClientIp, resolveRequestId } from '@/lib/bff/requestContext';
import { accessTokenNeedsRefresh, readSession } from '@/lib/bff/session';
import { refreshSession } from '@/lib/bff/tokenRefresh';

// Request headers only the proxy may set; anything a browser sends under these names is dropped.
export const PATHNAME_HEADER = 'x-jt-pathname';
const STRIPPED_INBOUND = ['x-internal-service-token', 'x-client-ip', PATHNAME_HEADER];

/**
 * Runs before every page and BFF route (W6):
 *  1. refreshes the session when the access token is missing or about to expire (single-flight per token),
 *     writing the new cookies to the response AND to the forwarded request so this render already uses them;
 *  2. clears the session when Express says the refresh token is dead;
 *  3. issues the CSRF double-submit cookie (W7);
 *  4. tells server layouts the current path (for sign-in redirects).
 */
export async function proxy(request) {
  const env = getServerEnv();
  const secure = env.SESSION_COOKIE_SECURE;
  const names = cookieNames(secure);
  const { accessToken, refreshToken } = readSession(request.cookies, secure);

  let writes = [];
  if (refreshToken && accessTokenNeedsRefresh(accessToken)) {
    const result = await refreshSession(refreshToken, {
      requestId: resolveRequestId(request.headers),
      clientIp: resolveClientIp(request.headers, env.TRUSTED_PROXY_HOPS),
    });
    if (result.ok) writes = sessionCookieWrites(result.session, secure);
    else if (result.terminal) writes = clearedSessionCookieWrites(secure);
  }

  // Make this request see the post-refresh cookies.
  for (const { name, value } of writes) {
    if (value) request.cookies.set(name, value);
    else request.cookies.delete(name);
  }
  const headers = new Headers(request.headers);
  for (const name of STRIPPED_INBOUND) headers.delete(name);
  headers.set(PATHNAME_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.next({ request: { headers } });
  applyCookieWrites(response.cookies, writes);
  if (!request.cookies.get(names.csrf)) applyCookieWrites(response.cookies, [csrfCookieWrite(newCsrfToken(), secure)]);
  return response;
}

export const config = {
  // Everything except static assets and the container health check.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
