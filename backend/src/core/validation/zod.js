'use strict';

const { z } = require('zod');
const { extendZodWithOpenApi } = require('@asteasolutions/zod-to-openapi');

// Single zod instance with .openapi() support; every request schema imports it from here.
extendZodWithOpenApi(z);

module.exports = { z };
