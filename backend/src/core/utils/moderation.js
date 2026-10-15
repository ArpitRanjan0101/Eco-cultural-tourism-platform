'use strict';

const ApiError = require('../errors/ApiError');

/**
 * Moderation lifecycle shared by partner supply (properties, experiences, packages):
 * partners create items in pending_review; admins publish, reject or suspend.
 * A partner edit to a rejected item resubmits it (rejected -> pending_review).
 */
const SUPPLY_STATUSES = ['pending_review', 'published', 'rejected', 'suspended'];

const ADMIN_TRANSITIONS = {
  pending_review: ['published', 'rejected'],
  rejected: ['published', 'pending_review'],
  published: ['suspended', 'rejected'],
  suspended: ['published'],
};

function assertAdminTransition(from, to) {
  if (from === to) return;
  if (!ADMIN_TRANSITIONS[from]?.includes(to)) {
    throw ApiError.conflict(`Cannot change status from ${from} to ${to}`, 'INVALID_STATUS_TRANSITION', {
      allowed: ADMIN_TRANSITIONS[from] ?? [],
    });
  }
}

/** Status after a partner edit: rejected items go back to review; others keep their status. */
const statusAfterPartnerEdit = (status) => (status === 'rejected' ? 'pending_review' : status);

module.exports = { SUPPLY_STATUSES, ADMIN_TRANSITIONS, assertAdminTransition, statusAfterPartnerEdit };
