'use strict';

const ApiError = require('../errors/ApiError');
const logger = require('../logging/logger');

const BODY_PARSER_ERRORS = {
  'entity.parse.failed': () => ApiError.badRequest('Malformed JSON body', undefined, 'INVALID_JSON'),
  'entity.too.large': () => new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large'),
  'encoding.unsupported': () => new ApiError(415, 'UNSUPPORTED_ENCODING', 'Unsupported content encoding'),
  'charset.unsupported': () => new ApiError(415, 'UNSUPPORTED_CHARSET', 'Unsupported charset'),
};

// Safety net only: services are expected to translate expected database errors themselves.
const DATABASE_ERRORS = {
  '23505': () => ApiError.conflict('Resource already exists', 'DUPLICATE_RESOURCE'),
  '23503': () => ApiError.conflict('Referenced resource does not exist or is still in use', 'REFERENCE_CONFLICT'),
  '23514': () => new ApiError(422, 'CONSTRAINT_VIOLATION', 'Request violates a data constraint'),
  '23P01': () => ApiError.conflict('Resource is already allocated for that time', 'ALLOCATION_CONFLICT'),
  '22P02': () => ApiError.badRequest('Invalid input value', undefined, 'INVALID_INPUT'),
  '40001': () => ApiError.conflict('Concurrent update, please retry', 'CONCURRENT_UPDATE'),
  '40P01': () => ApiError.conflict('Concurrent update, please retry', 'CONCURRENT_UPDATE'),
  '57014': () => ApiError.unavailable('Request timed out', 'TIMEOUT'),
};

function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err && BODY_PARSER_ERRORS[err.type]) return BODY_PARSER_ERRORS[err.type]();
  if (err && typeof err.code === 'string' && DATABASE_ERRORS[err.code]) return DATABASE_ERRORS[err.code]();
  return null;
}

// Express identifies error handlers by their four-argument arity.
function errorHandler(err, req, res, _next) {
  let apiError = toApiError(err);
  if (!apiError) {
    (req.log || logger).error({ err, requestId: req.id }, 'Unhandled error');
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  } else if (apiError.status >= 500) {
    (req.log || logger).error({ err, requestId: req.id }, 'Server error');
  }

  if (res.headersSent) {
    res.destroy();
    return;
  }

  const error = { code: apiError.code, message: apiError.message, requestId: req.id };
  if (apiError.details !== undefined) error.details = apiError.details;
  res.status(apiError.status).json({ success: false, error });
}

module.exports = errorHandler;
