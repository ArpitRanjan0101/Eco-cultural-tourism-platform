'use strict';

const { parseEnv } = require('./env');

// Fail fast at startup when configuration is invalid.
module.exports = parseEnv(process.env);
