'use strict';

const pino = require('pino');
const config = require('../../config');

// Credentials, tokens and personal secrets must never reach log output.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-internal-service-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.secret',
];

const logger = pino({
  level: config.logLevel,
  base: { service: config.app.name, version: config.app.version },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
});

module.exports = logger;
