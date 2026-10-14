'use strict';

/** Actor and correlation data passed from controllers to services (audit, policies). */
function requestContext(req) {
  return {
    actorUserId: req.auth?.userId ?? null,
    actorRoles: req.auth?.roles ?? [],
    sessionId: req.auth?.sessionId ?? null,
    ip: req.clientIp ?? req.ip ?? null,
    requestId: req.id,
  };
}

module.exports = { requestContext };
