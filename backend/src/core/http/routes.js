'use strict';

const validate = require('../middleware/validate');
const { rateLimit } = require('../middleware/rateLimit');
const { errorResponses } = require('../validation/common');

/**
 * Route definitions are the single source for both Express wiring and OpenAPI,
 * so every mounted route is documented with its auth, permissions and schemas.
 *
 * {
 *   method, path,                       // Express path, e.g. '/admin/users/:id'
 *   summary, tags,
 *   auth: 'service' | 'user',           // 'user' = service token + user JWT
 *   permissions: ['users.read'],        // all required
 *   rateLimit: { name, windowSeconds, max, by: 'ip' | 'user' },
 *   request: { params, query, body },   // zod schemas
 *   response: { status, schema?, description? },
 *   errors: [404, 409],                 // extra documented error statuses
 *   handler,
 * }
 */
function mountRoutes(router, routes, { authenticate, requirePermissions }) {
  for (const route of routes) {
    const chain = [];
    const limiter = route.rateLimit ? rateLimit(route.rateLimit) : null;
    if (limiter && route.rateLimit.by !== 'user') chain.push(limiter);
    if (route.auth === 'user') chain.push(authenticate);
    if (route.permissions?.length) chain.push(requirePermissions(...route.permissions));
    if (limiter && route.rateLimit.by === 'user') chain.push(limiter);
    if (route.request) chain.push(validate(route.request));
    chain.push(route.handler);
    router[route.method](route.path, ...chain);
  }
}

const toOpenApiPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

function registerRoutesOpenApi(registry, routes, prefix = '/api/v1') {
  for (const route of routes) {
    const statuses = new Set([401, ...(route.errors || [])]);
    if (route.auth === 'user') statuses.add(403);
    if (route.request) statuses.add(422);
    if (route.rateLimit) statuses.add(429);

    const request = {};
    if (route.request?.params) request.params = route.request.params;
    if (route.request?.query) request.query = route.request.query;
    if (route.request?.body) request.body = { content: { 'application/json': { schema: route.request.body } } };

    const { status, schema, description } = route.response;
    const success = { description: description || route.summary };
    if (schema) success.content = { 'application/json': { schema } };

    const notes = [];
    if (route.permissions?.length) notes.push(`Requires permission(s): ${route.permissions.join(', ')}.`);
    if (route.rateLimit) {
      notes.push(`Rate limit: ${route.rateLimit.max} per ${route.rateLimit.windowSeconds}s per ${route.rateLimit.by || 'ip'}.`);
    }
    if (route.description) notes.push(route.description);

    registry.registerPath({
      method: route.method,
      path: prefix + toOpenApiPath(route.path),
      tags: route.tags,
      summary: route.summary,
      description: notes.join(' ') || undefined,
      security: route.auth === 'user' ? [{ ServiceToken: [], BearerAuth: [] }] : [{ ServiceToken: [] }],
      request,
      responses: { [status]: success, ...errorResponses(...[...statuses].sort()) },
    });
  }
}

module.exports = { mountRoutes, registerRoutesOpenApi };
