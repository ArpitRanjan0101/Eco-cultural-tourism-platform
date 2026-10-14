'use strict';

const { OpenAPIRegistry, OpenApiGeneratorV3 } = require('@asteasolutions/zod-to-openapi');
const config = require('../config');
const healthDocs = require('../core/health/health.openapi');
const { registerRoutesOpenApi } = require('../core/http/routes');
const moduleRoutes = require('../modules');

let cached;

function buildOpenApiDocument() {
  if (cached) return cached;
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'ServiceToken', {
    type: 'apiKey',
    in: 'header',
    name: 'X-Internal-Service-Token',
    description: 'Server-side BFF credential. Required on every /api/v1 route except payment webhooks.',
  });
  registry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'User access token forwarded by the BFF on protected routes.',
  });
  healthDocs.register(registry);
  registerRoutesOpenApi(registry, moduleRoutes);

  cached = new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Jharkhand Eco & Cultural Tourism API',
      version: config.app.version,
      description: 'Backend API consumed by the Next.js BFF. Business routes are prefixed with /api/v1.',
    },
    servers: [{ url: '/' }],
    security: [{ ServiceToken: [] }],
  });
  return cached;
}

module.exports = { buildOpenApiDocument };
