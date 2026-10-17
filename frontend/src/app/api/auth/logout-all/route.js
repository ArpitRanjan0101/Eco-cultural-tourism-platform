import { NextResponse } from 'next/server';
import { backendRequest } from '@/lib/bff/backendClient';
import { applyCookieWrites, clearedSessionCookieWrites } from '@/lib/bff/cookies';
import { jsonError } from '@/lib/bff/errors';
import { createBffHandler, toBrowserResponse } from '@/lib/bff/routeHandler';

export const dynamic = 'force-dynamic';

/** Revokes every session of the user in Express, then clears this browser's cookies. */
export const POST = createBffHandler(async (request, ctx) => {
  if (!ctx.session.accessToken) return jsonError(401, 'AUTH_REQUIRED', 'Please sign in.', ctx.requestId);
  const result = await backendRequest({ method: 'POST', path: '/api/v1/auth/logout-all', accessToken: ctx.session.accessToken, context: ctx.backendContext });
  const response = result.status === 204 ? new NextResponse(null, { status: 204 }) : toBrowserResponse(result, ctx.requestId);
  // 401: the session is already gone in Express — clear it here too.
  if (result.status === 204 || result.status === 401) {
    applyCookieWrites(response.cookies, clearedSessionCookieWrites(ctx.env.SESSION_COOKIE_SECURE));
  }
  return response;
});
