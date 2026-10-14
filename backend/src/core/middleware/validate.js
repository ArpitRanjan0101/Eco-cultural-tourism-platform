'use strict';

const ApiError = require('../errors/ApiError');

const PARTS = ['params', 'query', 'body'];

/**
 * Validates request parts against zod schemas. Parsed (coerced, stripped) values
 * are exposed on req.valid; Express 5 makes req.query read-only.
 */
function validate(schemas) {
  return function validateRequest(req, _res, next) {
    const valid = {};
    const issues = [];
    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location: part, path: issue.path.join('.'), message: issue.message });
        }
      }
    }
    if (issues.length > 0) return next(ApiError.validation(issues));
    req.valid = valid;
    return next();
  };
}

module.exports = validate;
