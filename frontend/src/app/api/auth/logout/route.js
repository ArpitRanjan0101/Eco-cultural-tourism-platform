import { NextResponse } from 'next/server';
import { backendRequest } from '@/lib/bff/backendClient';
import { applyCookieWrites, clearedSessionCookieWrites } from '@/lib/bff/cookies';
import { createBffHandler } from '@/lib/bff/routeHandler';

export const dynamic = 'force-dynamic';

/** Revokes this session in Express (best effort) and always clears the browser's session cookies. */
export const POST = createBffHandler(async (request, ctx) => {
  if (ctx.session.refreshToken) {
    try {
      await backendRequest({ method: 'POST', path: '/api/v1/auth/logout', body: { refreshToken: ctx.session.refreshToken }, context: ctx.backendContext });
    } catch {
      // The local sign-out still happens; the refresh token expires on its own if revocation did not reach Express.
    }
  }
  const response = new NextResponse(null, { status: 204 });
  applyCookieWrites(response.cookies, clearedSessionCookieWrites(ctx.env.SESSION_COOKIE_SECURE));
  return response;
});
