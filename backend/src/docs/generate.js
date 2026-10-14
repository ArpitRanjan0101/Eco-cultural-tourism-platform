'use strict';

// Prints the OpenAPI document to stdout, e.g.:
//   docker compose run --rm -T api node src/docs/generate.js > docs/api/openapi.json
const { buildOpenApiDocument } = require('./openapi');

process.stdout.write(`${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
