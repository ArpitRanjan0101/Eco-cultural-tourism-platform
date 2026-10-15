'use strict';

/** Actor and correlation data passed from controllers to services (audit, policies). */
function requestContext(req) {
  return {
    actorUserId: req.auth?.userId ?? null,
    actorRoles: req.auth?.roles ?? [],
    actorPermissions: req.auth?.permissions ?? [],
    actorEmailVerified: req.auth?.emailVerified ?? false,
    sessionId: req.auth?.sessionId ?? null,
    // Set by the partner-context guard on /partners/me routes: { partnerId, role, partnerType, status }.
    partner: req.partner ?? null,
    ip: req.clientIp ?? req.ip ?? null,
    requestId: req.id,
  };
}

module.exports = { requestContext };
