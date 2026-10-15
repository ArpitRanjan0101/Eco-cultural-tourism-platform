'use strict';

const { z } = require('../../core/validation/zod');
const { successEnvelope } = require('../../core/validation/common');
const f = require('../../core/validation/fields');
const controller = require('./partners.controller');
const schema = require('./partners.schema');
const { partnerGuard } = require('./partners.service');

const TAGS = ['Partners'];
const ADMIN = ['Admin: Partners'];
const ok = (dataSchema, options) => ({ status: 200, schema: successEnvelope(dataSchema, options) });
const created = (dataSchema) => ({ status: 201, schema: successEnvelope(dataSchema) });

// Applicants (tourist role, partners.apply) can manage a pending organisation before approval grants partner roles.
const member = {
  auth: 'user',
  anyPermissions: ['partners.apply', 'partners.manage.own'],
  headers: schema.partnerHeaders,
  errors: [400],
};
const orgAdmin = { ...member, middleware: [partnerGuard({ allowUnapproved: true, orgAdmin: true })] };
const anyMember = { ...member, middleware: [partnerGuard({ allowUnapproved: true })] };
const review = { auth: 'user', permissions: ['partners.review'] };

const routes = [
  {
    method: 'post',
    path: '/partners/apply',
    tags: TAGS,
    summary: 'Submit partner application',
    description: 'Creates a pending organisation with the caller as owner. One open application per user (409 APPLICATION_PENDING).',
    auth: 'user',
    permissions: ['partners.apply'],
    rateLimit: { name: 'partner_apply', windowSeconds: 3600, max: 5, by: 'user' },
    request: { body: schema.applyBody },
    response: created(schema.myPartnerSchema),
    errors: [409],
    handler: controller.apply,
  },
  { method: 'get', path: '/partners/me', tags: TAGS, summary: 'Read own partner organisation', ...anyMember, response: ok(schema.myPartnerSchema), handler: controller.getMine },
  {
    method: 'patch',
    path: '/partners/me',
    tags: TAGS,
    summary: 'Update partner organisation',
    description: 'Owners/managers. partnerType, legalName and taxIdentifier lock after approval. Editing a rejected application resubmits it.',
    ...orgAdmin,
    request: { body: schema.updateMineBody },
    response: ok(schema.myPartnerSchema),
    errors: [400, 409],
    handler: controller.updateMine,
  },
  {
    method: 'post',
    path: '/partners/me/documents',
    tags: TAGS,
    summary: 'Upload verification document',
    description: 'Attaches a completed private verification_document upload made by the caller.',
    ...orgAdmin,
    request: { body: schema.documentBody },
    response: created(schema.documentSchema),
    errors: [400, 409],
    handler: controller.addDocument,
  },
  { method: 'get', path: '/partners/me/users', tags: TAGS, summary: 'List team members', ...anyMember, response: ok(z.array(schema.memberSchema)), handler: controller.listMembers },
  {
    method: 'post',
    path: '/partners/me/users',
    tags: TAGS,
    summary: 'Add verified existing user',
    description: 'Owners add any role; managers add staff only. The user must have an active, email-verified account.',
    ...orgAdmin,
    request: { body: schema.addMemberBody },
    response: created(z.array(schema.memberSchema)),
    errors: [400, 409],
    handler: controller.addMember,
  },
  {
    method: 'patch',
    path: '/partners/me/users/:userId',
    tags: TAGS,
    summary: 'Change partner-level role',
    ...orgAdmin,
    request: { params: schema.userIdParams, body: schema.memberRoleBody },
    response: ok(z.array(schema.memberSchema)),
    errors: [400, 404, 409],
    handler: controller.changeMemberRole,
  },
  {
    method: 'delete',
    path: '/partners/me/users/:userId',
    tags: TAGS,
    summary: 'Remove organisation membership',
    description: 'Members may leave; owners/managers remove others (managers: staff only). The last owner cannot be removed.',
    ...anyMember,
    request: { params: schema.userIdParams },
    response: { status: 204, description: 'Removed' },
    errors: [400, 404, 409],
    handler: controller.removeMember,
  },
  {
    method: 'get',
    path: '/admin/partners',
    tags: ADMIN,
    summary: 'Review partner applications',
    ...review,
    request: { query: schema.adminListQuery },
    response: ok(z.array(schema.partnerSchema), { paginated: true }),
    handler: controller.adminList,
  },
  {
    method: 'get',
    path: '/admin/partners/:id',
    tags: ADMIN,
    summary: 'View partner detail',
    ...review,
    request: { params: f.idParams },
    response: ok(schema.partnerDetailSchema),
    errors: [404],
    handler: controller.adminGet,
  },
  {
    method: 'patch',
    path: '/admin/partners/:id/status',
    tags: ADMIN,
    summary: 'Approve/reject/suspend partner',
    description:
      'Transitions: pending→approved|rejected, rejected→approved|pending, approved→suspended, suspended→approved. ' +
      'Approval grants members the supply role for the partner type; reviewers cannot review their own organisation.',
    ...review,
    request: { params: f.idParams, body: schema.adminStatusBody },
    response: ok(schema.partnerDetailSchema),
    errors: [404, 409],
    handler: controller.setStatus,
  },
  {
    method: 'get',
    path: '/admin/partners/:id/documents',
    tags: ADMIN,
    summary: 'View verification documents',
    description: 'Includes 5-minute signed URLs for the private files.',
    ...review,
    request: { params: f.idParams },
    response: ok(z.array(schema.reviewDocumentSchema)),
    errors: [404],
    handler: controller.adminDocuments,
  },
];

module.exports = routes;
