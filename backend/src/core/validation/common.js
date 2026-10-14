'use strict';

const { z } = require('./zod');

const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  })
  .openapi('ErrorResponse');

/** Wraps a data schema in the standard success envelope. */
function successEnvelope(dataSchema, { paginated = false } = {}) {
  const shape = { success: z.literal(true), data: dataSchema };
  if (paginated) {
    shape.meta = z.object({ page: z.number().int(), limit: z.number().int(), total: z.number().int() });
  }
  return z.object(shape);
}

const ERROR_DESCRIPTIONS = {
  400: 'Malformed request',
  401: 'Missing or invalid service token / user credentials',
  403: 'Authenticated but not permitted',
  404: 'Resource not found',
  409: 'Conflict (state, inventory or idempotency)',
  413: 'Payload too large',
  422: 'Validation failed',
  429: 'Rate limit exceeded',
  503: 'Dependency unavailable',
};

/** Builds OpenAPI `responses` entries for the given error status codes. */
function errorResponses(...statuses) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      { description: ERROR_DESCRIPTIONS[status], content: { 'application/json': { schema: errorResponseSchema } } },
    ]),
  );
}

module.exports = { errorResponseSchema, successEnvelope, errorResponses };
