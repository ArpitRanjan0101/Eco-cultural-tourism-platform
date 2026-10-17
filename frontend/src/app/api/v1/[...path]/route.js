import { matchOperation } from '@/lib/bff/allowlist';
import { backendRequest } from '@/lib/bff/backendClient';
import { jsonError } from '@/lib/bff/errors';
import { createBffHandler, readBodyText, toBrowserResponse } from '@/lib/bff/routeHandler';

export const dynamic = 'force-dynamic';

const WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Generic BFF forwarder (W5): /api/v1/<path> → Express /api/v1/<path>, only for operations in the generated
 * contract allowlist. The backend path is rebuilt from validated segments; the browser never chooses a host.
 * Service token and user JWT are added server-side; only Idempotency-Key and X-Partner-Id pass through (W8).
 */
const forward = createBffHandler(async (request, ctx) => {
  const segments = ctx.params.path ?? [];
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[/\\]/.test(segment))) {
    return jsonError(404, 'ROUTE_NOT_FOUND', 'Not found.', ctx.requestId);
  }
  const path = `/api/v1/${segments.map(encodeURIComponent).join('/')}`;
  if (!matchOperation(request.method, path)) {
    return jsonError(404, 'ROUTE_NOT_FOUND', 'Not found.', ctx.requestId);
  }
  const result = await backendRequest({
    method: request.method,
    path,
    search: new URL(request.url).search,
    rawBody: WITH_BODY.has(request.method) ? await readBodyText(request, ctx.requestId) : undefined,
    accessToken: ctx.session.accessToken,
    context: ctx.backendContext,
    headers: {
      'Idempotency-Key': request.headers.get('idempotency-key'),
      'X-Partner-Id': request.headers.get('x-partner-id'),
    },
  });
  return toBrowserResponse(result, ctx.requestId);
});

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
