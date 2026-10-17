import { NextResponse } from 'next/server';
import { applyCookieWrites, clearedSessionCookieWrites, sessionCookieWrites } from '@/lib/bff/cookies';
import { jsonError } from '@/lib/bff/errors';
import { createBffHandler } from '@/lib/bff/routeHandler';
import { refreshSession } from '@/lib/bff/tokenRefresh';

export const dynamic = 'force-dynamic';

/**
 * Explicit session rotation. Pages and API calls normally never need it — the proxy refreshes before they run
 * (W6) — but long-lived client views can call it. Shares the single-flight refresh with the proxy.
 */
export const POST = createBffHandler(async (request, ctx) => {
  const secure = ctx.env.SESSION_COOKIE_SECURE;
  if (!ctx.session.refreshToken) {
    const response = jsonError(401, 'AUTH_REQUIRED', 'Please sign in.', ctx.requestId);
    return response;
  }
  const result = await refreshSession(ctx.session.refreshToken, ctx.backendContext);
  if (result.ok) {
    const response = NextResponse.json({ success: true, data: { user: result.session.user } });
    applyCookieWrites(response.cookies, sessionCookieWrites(result.session, secure));
    return response;
  }
  const response = NextResponse.json(
    { success: false, error: { code: result.code, message: result.terminal ? 'Your session has ended. Please sign in again.' : 'Could not refresh the session. Please try again.', requestId: ctx.requestId } },
    { status: result.terminal ? 401 : result.status },
  );
  if (result.terminal) applyCookieWrites(response.cookies, clearedSessionCookieWrites(secure));
  return response;
});
