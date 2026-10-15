'use strict';

const { pool } = require('../../config/database');
const { withTransaction } = require('../../core/database/transaction');
const { diff } = require('../../core/database/sql');
const { appendOutboxEvent } = require('../../core/events/outbox');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const usersService = require('../users/users.service');
const repository = require('./partners.repository');

/** Supply each partner type may manage (DECISIONS O5) and the global role it confers when approved. */
const SUPPLY_BY_TYPE = {
  accommodation: ['properties'],
  guide: ['guides'],
  operator: ['experiences', 'packages'],
  multi: ['properties', 'guides', 'experiences', 'packages'],
};
const ROLES_BY_TYPE = {
  accommodation: ['hotel_partner'],
  guide: ['guide'],
  operator: ['package_provider'],
  multi: ['hotel_partner', 'guide', 'package_provider'],
};
const PARTNER_ROLES = ['hotel_partner', 'guide', 'package_provider'];

const STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  rejected: ['approved', 'pending'],
  approved: ['suspended'],
  suspended: ['approved'],
};
// Identity/legal fields are frozen once an organisation has been approved.
const LOCKED_AFTER_APPROVAL = ['partnerType', 'legalName', 'taxIdentifier'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const iso = (value) => (value ? value.toISOString() : null);

function toPartner(row) {
  return {
    id: row.id,
    partnerType: row.partner_type,
    businessName: row.business_name,
    legalName: row.legal_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    taxIdentifier: row.tax_identifier,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const toMember = (row) => ({ userId: row.user_id, fullName: row.full_name, email: row.email, role: row.role, joinedAt: iso(row.created_at) });
const toDocument = (row) => ({
  id: row.id,
  mediaId: row.media_id,
  documentType: row.document_type,
  reviewStatus: row.review_status,
  reviewedAt: iso(row.reviewed_at),
  createdAt: iso(row.created_at),
});

async function requirePartner(db, id, options) {
  const row = await repository.findPartner(db, id, options);
  if (!row) throw ApiError.notFound('Partner not found', 'PARTNER_NOT_FOUND');
  return row;
}

/** Recomputes a user's supply roles from their approved memberships. */
async function syncRolesForUser(db, userId) {
  const types = await repository.approvedTypesForUser(db, userId);
  const desired = [...new Set(types.flatMap((type) => ROLES_BY_TYPE[type]))];
  await usersService.syncManagedRoles(db, userId, { managed: PARTNER_ROLES, desired });
}

// ---- Partner context (organisation membership is checked on every partner request) ----

/**
 * Resolves the organisation a request acts for. A user with one membership uses it;
 * a user with several must send X-Partner-Id (DECISIONS C6).
 */
async function resolveContext(userId, requestedPartnerId, { supply, orgAdmin = false, allowUnapproved = false } = {}) {
  if (requestedPartnerId !== undefined && !UUID.test(requestedPartnerId)) {
    throw ApiError.badRequest('X-Partner-Id must be a UUID', undefined, 'INVALID_PARTNER_HEADER');
  }
  const memberships = await repository.membershipsForUser(pool, userId);
  if (memberships.length === 0) throw ApiError.forbidden('You are not a member of any partner organisation', 'NOT_A_PARTNER');

  let membership;
  if (requestedPartnerId) {
    membership = memberships.find((m) => m.partner_id === requestedPartnerId);
    if (!membership) throw ApiError.forbidden('You are not a member of this partner organisation', 'NOT_A_MEMBER');
  } else if (memberships.length === 1) {
    [membership] = memberships;
  } else {
    throw ApiError.badRequest('Several partner organisations found; send the X-Partner-Id header', undefined, 'PARTNER_CONTEXT_REQUIRED');
  }

  if (!allowUnapproved && membership.status !== 'approved') {
    throw ApiError.forbidden('The partner organisation is not approved', 'PARTNER_NOT_APPROVED');
  }
  if (supply && !SUPPLY_BY_TYPE[membership.partner_type].includes(supply)) {
    throw ApiError.forbidden(`A ${membership.partner_type} partner cannot manage ${supply}`, 'SUPPLY_NOT_ALLOWED');
  }
  if (orgAdmin && membership.role === 'staff') {
    throw ApiError.forbidden('Only owners and managers can do this', 'PARTNER_ROLE_REQUIRED');
  }
  return { partnerId: membership.partner_id, role: membership.role, partnerType: membership.partner_type, status: membership.status };
}

/** Express guard that sets req.partner. */
function partnerGuard(options) {
  return async function requirePartnerContext(req, _res, next) {
    req.partner = await resolveContext(req.auth.userId, req.get('x-partner-id'), options);
    next();
  };
}

// ---- Applicant / partner self-service ----

async function apply(ctx, input) {
  if (await repository.hasOpenApplication(pool, ctx.actorUserId)) {
    throw ApiError.conflict('You already have a pending partner application', 'APPLICATION_PENDING');
  }
  const id = await auditService.auditedTransaction(ctx, 'partner', async (client) => {
    const partnerId = await repository.insertPartner(client, input);
    await repository.addMember(client, partnerId, ctx.actorUserId, 'owner');
    await repository.insertHistory(client, { partnerId, previousStatus: null, newStatus: 'pending', reviewedBy: ctx.actorUserId });
    await appendOutboxEvent(client, {
      eventType: 'partner.applied',
      aggregateType: 'partner',
      aggregateId: partnerId,
      payload: { partnerId, businessName: input.businessName, applicantId: ctx.actorUserId },
    });
    return { entityId: partnerId, action: 'partners.applied', newValues: input };
  });
  return { ...toPartner(await requirePartner(pool, id)), myRole: 'owner' };
}

async function getMine(ctx) {
  return { ...toPartner(await requirePartner(pool, ctx.partner.partnerId)), myRole: ctx.partner.role };
}

async function updateMine(ctx, changes) {
  const id = ctx.partner.partnerId;
  await auditService.auditedTransaction(ctx, 'partner', async (client) => {
    const before = await requirePartner(client, id, { forUpdate: true });
    const locked = LOCKED_AFTER_APPROVAL.filter((field) => changes[field] !== undefined);
    if (locked.length && ['approved', 'suspended'].includes(before.status)) {
      throw ApiError.conflict(`These fields cannot change after approval: ${locked.join(', ')}`, 'FIELD_LOCKED');
    }
    const updates = { ...changes };
    // Editing a rejected application resubmits it for review.
    if (before.status === 'rejected') {
      updates.status = 'pending';
      await repository.insertHistory(client, { partnerId: id, previousStatus: 'rejected', newStatus: 'pending', reviewedBy: ctx.actorUserId, notes: 'Resubmitted' });
    }
    await repository.updatePartner(client, id, updates);
    return { entityId: id, action: 'partners.updated', ...diff(toPartner(before), updates) };
  });
  return getMine(ctx);
}

async function addDocument(ctx, { mediaId, documentType }) {
  return withTransaction(async (client) => {
    await mediaService.assertAttachable(client, ctx, mediaId, { purposes: ['verification_document'] });
    try {
      return toDocument(await repository.insertDocument(client, { partnerId: ctx.partner.partnerId, mediaId, documentType }));
    } catch (err) {
      if (err.code === '23505') throw ApiError.conflict('This document is already submitted', 'DOCUMENT_EXISTS');
      throw err;
    }
  });
}

async function listMembers(ctx) {
  return (await repository.listMembers(pool, ctx.partner.partnerId)).map(toMember);
}

/** Owners manage everyone; managers manage staff only; nobody edits their own membership role. */
function assertCanManageMember(ctx, targetRole, nextRole) {
  if (ctx.partner.role === 'owner') return;
  if (targetRole !== 'staff' || (nextRole && nextRole !== 'staff')) {
    throw ApiError.forbidden('Managers can only manage staff members', 'PARTNER_ROLE_REQUIRED');
  }
}

async function addMember(ctx, { email, role }) {
  const partnerId = ctx.partner.partnerId;
  assertCanManageMember(ctx, role, role);
  await auditService.auditedTransaction(ctx, 'partner', async (client) => {
    const account = await usersService.findAccountByEmail(client, email);
    if (!account || account.status !== 'active' || !account.emailVerified) {
      throw ApiError.validation([{ location: 'body', path: 'email', message: 'no active, email-verified account exists for this email' }]);
    }
    if (await repository.findMember(client, partnerId, account.id)) {
      throw ApiError.conflict('User is already a member', 'ALREADY_MEMBER');
    }
    await repository.addMember(client, partnerId, account.id, role);
    await syncRolesForUser(client, account.id);
    return { entityId: partnerId, action: 'partners.member_added', newValues: { userId: account.id, role } };
  });
  return listMembers(ctx);
}

async function changeMemberRole(ctx, userId, { role }) {
  const partnerId = ctx.partner.partnerId;
  if (userId === ctx.actorUserId) throw ApiError.forbidden('You cannot change your own role', 'SELF_MODIFICATION_FORBIDDEN');
  await auditService.auditedTransaction(ctx, 'partner', async (client) => {
    const owners = await repository.countOwnersForUpdate(client, partnerId);
    const member = await repository.findMember(client, partnerId, userId, { forUpdate: true });
    if (!member) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
    assertCanManageMember(ctx, member.role, role);
    if (member.role === 'owner' && role !== 'owner' && owners <= 1) {
      throw ApiError.conflict('An organisation must keep at least one owner', 'LAST_OWNER');
    }
    await repository.setMemberRole(client, partnerId, userId, role);
    return { entityId: partnerId, action: 'partners.member_role_changed', oldValues: { userId, role: member.role }, newValues: { userId, role } };
  });
  return listMembers(ctx);
}

async function removeMember(ctx, userId) {
  const partnerId = ctx.partner.partnerId;
  await auditService.auditedTransaction(ctx, 'partner', async (client) => {
    const owners = await repository.countOwnersForUpdate(client, partnerId);
    const member = await repository.findMember(client, partnerId, userId, { forUpdate: true });
    if (!member) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
    if (userId !== ctx.actorUserId) assertCanManageMember(ctx, member.role);
    if (member.role === 'owner' && owners <= 1) throw ApiError.conflict('An organisation must keep at least one owner', 'LAST_OWNER');
    await repository.removeMember(client, partnerId, userId);
    await syncRolesForUser(client, userId);
    return { entityId: partnerId, action: 'partners.member_removed', oldValues: { userId, role: member.role }, newValues: { removed: true } };
  });
}

// ---- Administration ----

async function adminList(query) {
  const { rows, total } = await repository.listPartners(pool, query);
  return { items: rows.map(toPartner), meta: pageMeta(query, total) };
}

async function adminGet(id) {
  const row = await requirePartner(pool, id);
  const [members, documents, history] = await Promise.all([
    repository.listMembers(pool, id),
    repository.listDocuments(pool, id),
    repository.listHistory(pool, id),
  ]);
  return {
    ...toPartner(row),
    members: members.map(toMember),
    documents: documents.map(toDocument),
    history: history.map((h) => ({ previousStatus: h.previous_status, newStatus: h.new_status, reviewedBy: h.reviewed_by, notes: h.notes, createdAt: iso(h.created_at) })),
  };
}

async function setStatus(ctx, id, { status, notes }) {
  await auditService.auditedTransaction(ctx, 'partner', async (client) => {
    const before = await requirePartner(client, id, { forUpdate: true });
    if (await repository.findMember(client, id, ctx.actorUserId)) {
      throw ApiError.forbidden('You cannot review an organisation you belong to', 'SELF_REVIEW_FORBIDDEN');
    }
    if (before.status === status) return { entityId: id };
    if (!STATUS_TRANSITIONS[before.status].includes(status)) {
      throw ApiError.conflict(`Cannot change status from ${before.status} to ${status}`, 'INVALID_STATUS_TRANSITION', {
        allowed: STATUS_TRANSITIONS[before.status],
      });
    }
    await repository.updatePartner(client, id, { status });
    if (status === 'approved' || status === 'rejected') await repository.reviewPendingDocuments(client, id, status, ctx.actorUserId);
    await repository.insertHistory(client, { partnerId: id, previousStatus: before.status, newStatus: status, reviewedBy: ctx.actorUserId, notes });
    for (const userId of await repository.memberUserIds(client, id)) await syncRolesForUser(client, userId);
    await appendOutboxEvent(client, {
      eventType: 'partner.status_changed',
      aggregateType: 'partner',
      aggregateId: id,
      payload: { partnerId: id, previousStatus: before.status, status, notes: notes ?? null },
    });
    return { entityId: id, action: 'partners.status_changed', oldValues: { status: before.status }, newValues: { status, notes: notes ?? null } };
  });
  return adminGet(id);
}

/** Verification documents with short-lived signed URLs (route requires partners.review). */
async function adminDocuments(id) {
  await requirePartner(pool, id);
  const documents = await repository.listDocuments(pool, id);
  return Promise.all(
    documents.map(async (doc) => ({ ...toDocument(doc), media: await mediaService.getForAuthorizedReview(doc.media_id) })),
  );
}

// ---- Interfaces for supply modules ----

/** Contacts of an organisation's members with the given roles (notification recipients). */
async function memberContacts(partnerId, roles = ['owner', 'manager'], db = pool) {
  const [partner] = await repository.findPartnersByIds(db, [partnerId]);
  const members = (await repository.listMembers(db, partnerId)).filter((member) => roles.includes(member.role));
  return {
    businessName: partner?.business_name ?? null,
    members: members.map((member) => ({ userId: member.user_id, email: member.email, fullName: member.full_name })),
  };
}

async function isMember(partnerId, userId, db = pool) {
  return Boolean(await repository.findMember(db, partnerId, userId));
}

async function getPartnerRefMap(ids, db = pool) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await repository.findPartnersByIds(db, unique);
  return new Map(rows.map((row) => [row.id, { id: row.id, businessName: row.business_name, status: row.status }]));
}

module.exports = {
  SUPPLY_BY_TYPE,
  partnerGuard,
  resolveContext,
  apply,
  getMine,
  updateMine,
  addDocument,
  listMembers,
  addMember,
  changeMemberRole,
  removeMember,
  adminList,
  adminGet,
  setStatus,
  adminDocuments,
  isMember,
  memberContacts,
  getPartnerRefMap,
};
