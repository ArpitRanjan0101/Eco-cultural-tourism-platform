'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

const PARTNER_COLUMNS = `p.id, p.partner_type, p.business_name, p.legal_name, p.email::text AS email, p.phone, p.address,
  p.tax_identifier, p.status, p.created_at, p.updated_at`;
const SORT_COLUMNS = { createdAt: 'p.created_at', businessName: 'p.business_name', updatedAt: 'p.updated_at' };

async function insertPartner(db, input) {
  const { rows } = await db.query(
    `INSERT INTO partners (partner_type, business_name, legal_name, email, phone, address, tax_identifier)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.partnerType, input.businessName, input.legalName, input.email, input.phone ?? null, input.address ?? null, input.taxIdentifier ?? null],
  );
  return rows[0].id;
}

async function findPartner(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${PARTNER_COLUMNS} FROM partners p WHERE p.id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function findPartnersByIds(db, ids) {
  const { rows } = await db.query(`SELECT ${PARTNER_COLUMNS} FROM partners p WHERE p.id = ANY($1::uuid[])`, [ids]);
  return rows;
}

async function updatePartner(db, id, fields) {
  const query = buildUpdate('partners', id, fields, {
    partnerType: 'partner_type',
    businessName: 'business_name',
    legalName: 'legal_name',
    email: 'email',
    phone: 'phone',
    address: 'address',
    taxIdentifier: 'tax_identifier',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

async function listPartners(db, { status, partnerType, q, sort, page, limit }) {
  const values = [status ?? null, partnerType ?? null, q ? likePattern(q) : null];
  const where = `WHERE ($1::text IS NULL OR p.status = $1) AND ($2::text IS NULL OR p.partner_type = $2)
                 AND ($3::text IS NULL OR p.business_name ILIKE $3 OR p.legal_name ILIKE $3 OR p.email ILIKE $3)`;
  const window = pageWindow({ page, limit });
  const [list, count] = await Promise.all([
    db.query(`SELECT ${PARTNER_COLUMNS} FROM partners p ${where} ORDER BY ${orderBy(sort, SORT_COLUMNS, 'p.id')} LIMIT $4 OFFSET $5`, [
      ...values,
      window.limit,
      window.offset,
    ]),
    db.query(`SELECT count(*)::int AS total FROM partners p ${where}`, values),
  ]);
  return { rows: list.rows, total: count.rows[0].total };
}

// ---- membership ----

async function membershipsForUser(db, userId) {
  const { rows } = await db.query(
    `SELECT pu.partner_id, pu.role, p.partner_type, p.status, p.business_name
     FROM partner_users pu JOIN partners p ON p.id = pu.partner_id
     WHERE pu.user_id = $1 ORDER BY pu.created_at`,
    [userId],
  );
  return rows;
}

async function hasOpenApplication(db, userId) {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM partner_users pu JOIN partners p ON p.id = pu.partner_id
                    WHERE pu.user_id = $1 AND pu.role = 'owner' AND p.status = 'pending') AS open`,
    [userId],
  );
  return rows[0].open;
}

async function listMembers(db, partnerId) {
  const { rows } = await db.query(
    `SELECT pu.user_id, pu.role, pu.created_at, u.full_name, u.email::text AS email
     FROM partner_users pu JOIN users u ON u.id = pu.user_id
     WHERE pu.partner_id = $1 ORDER BY pu.created_at`,
    [partnerId],
  );
  return rows;
}

async function findMember(db, partnerId, userId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT user_id, role FROM partner_users WHERE partner_id = $1 AND user_id = $2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [partnerId, userId],
  );
  return rows[0] ?? null;
}

async function addMember(db, partnerId, userId, role) {
  await db.query('INSERT INTO partner_users (partner_id, user_id, role) VALUES ($1, $2, $3)', [partnerId, userId, role]);
}

async function setMemberRole(db, partnerId, userId, role) {
  await db.query('UPDATE partner_users SET role = $3 WHERE partner_id = $1 AND user_id = $2', [partnerId, userId, role]);
}

async function removeMember(db, partnerId, userId) {
  await db.query('DELETE FROM partner_users WHERE partner_id = $1 AND user_id = $2', [partnerId, userId]);
}

/** Locks the owner rows so two concurrent demotions cannot remove the last owner. */
async function countOwnersForUpdate(db, partnerId) {
  const { rows } = await db.query(
    "SELECT user_id FROM partner_users WHERE partner_id = $1 AND role = 'owner' FOR UPDATE",
    [partnerId],
  );
  return rows.length;
}

async function memberUserIds(db, partnerId) {
  const { rows } = await db.query('SELECT user_id FROM partner_users WHERE partner_id = $1', [partnerId]);
  return rows.map((row) => row.user_id);
}

/** Partner types of every approved organisation the user belongs to. */
async function approvedTypesForUser(db, userId) {
  const { rows } = await db.query(
    `SELECT DISTINCT p.partner_type FROM partner_users pu JOIN partners p ON p.id = pu.partner_id
     WHERE pu.user_id = $1 AND p.status = 'approved'`,
    [userId],
  );
  return rows.map((row) => row.partner_type);
}

// ---- documents and history ----

async function insertDocument(db, { partnerId, mediaId, documentType }) {
  const { rows } = await db.query(
    `INSERT INTO partner_documents (partner_id, media_id, document_type) VALUES ($1, $2, $3)
     RETURNING id, partner_id, media_id, document_type, review_status, reviewed_at, created_at`,
    [partnerId, mediaId, documentType],
  );
  return rows[0];
}

async function listDocuments(db, partnerId) {
  const { rows } = await db.query(
    `SELECT id, partner_id, media_id, document_type, review_status, reviewed_by, reviewed_at, created_at
     FROM partner_documents WHERE partner_id = $1 ORDER BY created_at`,
    [partnerId],
  );
  return rows;
}

async function reviewPendingDocuments(db, partnerId, reviewStatus, reviewerId) {
  await db.query(
    `UPDATE partner_documents SET review_status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE partner_id = $1 AND review_status = 'pending'`,
    [partnerId, reviewStatus, reviewerId],
  );
}

async function insertHistory(db, { partnerId, previousStatus, newStatus, reviewedBy, notes }) {
  await db.query(
    `INSERT INTO partner_approval_history (partner_id, previous_status, new_status, reviewed_by, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [partnerId, previousStatus, newStatus, reviewedBy ?? null, notes ?? null],
  );
}

async function listHistory(db, partnerId) {
  const { rows } = await db.query(
    `SELECT id, previous_status, new_status, reviewed_by, notes, created_at
     FROM partner_approval_history WHERE partner_id = $1 ORDER BY created_at, id`,
    [partnerId],
  );
  return rows;
}

module.exports = {
  SORT_COLUMNS,
  insertPartner,
  findPartner,
  findPartnersByIds,
  updatePartner,
  listPartners,
  membershipsForUser,
  hasOpenApplication,
  listMembers,
  findMember,
  addMember,
  setMemberRole,
  removeMember,
  countOwnersForUpdate,
  memberUserIds,
  approvedTypesForUser,
  insertDocument,
  listDocuments,
  reviewPendingDocuments,
  insertHistory,
  listHistory,
};
