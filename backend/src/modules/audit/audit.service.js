'use strict';

const { withTransaction } = require('../../core/database/transaction');
const { translateUniqueViolation } = require('../../core/errors/dbErrors');
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

/**
 * Runs an administrative mutation and its audit record in one transaction.
 * `mutate(client)` returns { entityId, action, oldValues, newValues }; nothing is
 * audited when newValues is empty (no-op update). Unique violations become 409s.
 */
async function auditedTransaction(ctx, entityType, mutate) {
  try {
    return await withTransaction(async (client) => {
      const { entityId, action, oldValues = null, newValues = {} } = await mutate(client);
      if (action && Object.keys(newValues).length > 0) {
        await record(client, ctx, { action, entityType, entityId, oldValues, newValues });
      }
      return entityId;
    });
  } catch (err) {
    throw translateUniqueViolation(err, entityType.replace(/_/g, ' '));
  }
}

module.exports = { record, auditedTransaction };
