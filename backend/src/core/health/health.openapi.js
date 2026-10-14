'use strict';

const { z } = require('../validation/zod');
const { successEnvelope, errorResponses } = require('../validation/common');

const checkSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().optional(),
  reason: z.string().optional(),
});

function register(registry) {
  registry.registerPath({
    method: 'get',
    path: '/health/live',
    tags: ['Health'],
    summary: 'Process liveness',
    security: [],
    responses: {
      200: {
        description: 'Process is running',
        content: { 'application/json': { schema: successEnvelope(z.object({ status: z.literal('live') })) } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    tags: ['Health'],
    summary: 'Dependency readiness (PostgreSQL, Redis, migrations; worker reported, not gating)',
    security: [{ ServiceToken: [] }],
    responses: {
      200: {
        description: 'All gating dependencies are up',
        content: {
          'application/json': {
            schema: successEnvelope(
              z.object({
                status: z.literal('ready'),
                checks: z.object({
                  database: checkSchema,
                  redis: checkSchema,
                  migrations: checkSchema,
                  worker: checkSchema,
                  storage: checkSchema,
                }),
              }),
            ),
          },
        },
      },
      ...errorResponses(401, 503),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health/version',
    tags: ['Health'],
    summary: 'Deployment information',
    security: [{ ServiceToken: [] }],
    responses: {
      200: {
        description: 'Build and runtime version',
        content: {
          'application/json': {
            schema: successEnvelope(
              z.object({
                name: z.string(),
                version: z.string(),
                commit: z.string(),
                node: z.string(),
                environment: z.string(),
                uptimeSeconds: z.number().int(),
              }),
            ),
          },
        },
      },
      ...errorResponses(401),
    },
  });
}

module.exports = { register };
