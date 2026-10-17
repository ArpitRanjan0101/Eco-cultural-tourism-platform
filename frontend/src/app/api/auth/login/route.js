import { NextResponse } from 'next/server';
import { backendRequest } from '@/lib/bff/backendClient';
import { applyCookieWrites, clearedSessionCookieWrites, sessionCookieWrites } from '@/lib/bff/cookies';
import { createBffHandler, readBodyText, toBrowserResponse } from '@/lib/bff/routeHandler';

export const dynamic = 'force-dynamic';

/**
 * Login (W3): credentials go to Express with the service token only. The returned tokens are written to HttpOnly
 * cookies and never sent to the browser; the response body carries the user summary only.
 */
export const POST = createBffHandler(async (request, ctx) => {
  const result = await backendRequest({
    method: 'POST',
    path: '/api/v1/auth/login',
    rawBody: await readBodyText(request, ctx.requestId),
    context: ctx.backendContext,
  });
  if (result.status !== 200 || !result.data?.success) return toBrowserResponse(result, ctx.requestId);

  const session = result.data.data;
  const response = NextResponse.json({ success: true, data: { user: session.user } });
  // A new login replaces any previous session and partner context in this browser.
  applyCookieWrites(response.cookies, clearedSessionCookieWrites(ctx.env.SESSION_COOKIE_SECURE));
  applyCookieWrites(response.cookies, sessionCookieWrites(session, ctx.env.SESSION_COOKIE_SECURE));
  return response;
});
