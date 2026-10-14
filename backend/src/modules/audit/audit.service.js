'use strict';

const auditRepository = require('./audit.repository');

/**
 * Records an administrative/security event. Pass the transaction client of the
 * change being audited so the audit row commits atomically with it.
 * `ctx` is the request context ({ actorUserId, ip, requestId }).
 */
async function record(db, ctx, { action, entityType, entityId, oldValues, newValues }) {
  await auditRepository.insert(db, {
    actorUserId: ctx.actorUserId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress: ctx.ip,
    requestId: ctx.requestId,
  });
}

module.exports = { record };
