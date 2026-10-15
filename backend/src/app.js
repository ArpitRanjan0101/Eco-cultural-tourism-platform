'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const requestId = require('./core/middleware/requestId');
const httpLogger = require('./core/middleware/httpLogger');
const { requireServiceToken } = require('./core/middleware/serviceToken');
const clientIp = require('./core/middleware/clientIp');
const notFound = require('./core/middleware/notFound');
const errorHandler = require('./core/middleware/errorHandler');
const { mountRoutes } = require('./core/http/routes');
const healthRoutes = require('./core/health/health.routes');
const { buildOpenApiDocument } = require('./docs/openapi');
const { authenticate, requirePermissions, requireAnyPermission } = require('./modules/auth/auth.middleware');
const moduleRoutes = require('./modules');

function createApiRouter() {
  const api = express.Router();

  // Payment webhooks are mounted before the service-token gate: they authenticate with
  // provider signatures instead (and nginx forwards only this path from the public edge).
  const guards = { authenticate, requirePermissions, requireAnyPermission };
  mountRoutes(api, moduleRoutes.filter((route) => route.auth === 'webhook'), guards);

  api.use(requireServiceToken);
  api.use(clientIp);
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/openapi.json', (_req, res) => res.json(buildOpenApiDocument()));
  mountRoutes(api, moduleRoutes.filter((route) => route.auth !== 'webhook'), guards);

  return api;
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(requestId);
  app.use(httpLogger);
  // The raw bytes are kept for provider webhook signature verification (HMAC over the exact body).
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buffer) => {
        req.rawBody = buffer;
      },
    }),
  );

  app.use('/health', healthRoutes);
  app.use('/api/v1', createApiRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
