'use strict';

const { randomUUID } = require('node:crypto');

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Accepts a well-formed upstream X-Request-Id (nginx/BFF) or generates one. */
function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
