'use strict';

const { pool } = require('../../config/database');
const { pageMeta } = require('../../core/utils/pagination');
const usersService = require('../users/users.service');
const auditRepository = require('./audit.repository');

/**
 * Audit-log search (Report §5.15). Kept apart from audit.service, which every module uses
 * to write records, so the users dependency does not form a require cycle.
 */
async function search(query) {
  const { rows, total } = await auditRepository.search(pool, query);
  const actors = await usersService.getUserRefMap(rows.map((row) => row.actor_user_id));
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actor: row.actor_user_id ? (actors.get(row.actor_user_id) ?? { id: row.actor_user_id, email: null, fullName: null }) : null,
      oldValues: row.old_values,
      newValues: row.new_values,
      ipAddress: row.ip_address,
      requestId: row.request_id,
      createdAt: row.created_at.toISOString(),
    })),
    meta: pageMeta(query, total),
  };
}

module.exports = { search };
