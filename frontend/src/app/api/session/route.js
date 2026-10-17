import { NextResponse } from 'next/server';
import { backendRequest } from '@/lib/bff/backendClient';
import { createBffHandler, toBrowserResponse } from '@/lib/bff/routeHandler';

export const dynamic = 'force-dynamic';

/**
 * Current user for client components: `{ data: AuthenticatedUser }` when signed in, `{ data: null }` otherwise.
 * Permissions come from Express on every call (backend A3); the browser uses them for presentation only (W13).
 */
export const GET = createBffHandler(async (request, ctx) => {
  if (!ctx.session.accessToken) return NextResponse.json({ success: true, data: null });
  const result = await backendRequest({ path: '/api/v1/auth/me', accessToken: ctx.session.accessToken, context: ctx.backendContext });
  if (result.status === 401) return NextResponse.json({ success: true, data: null });
  return toBrowserResponse(result, ctx.requestId);
});
