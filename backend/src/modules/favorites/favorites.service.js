'use strict';

const { pool } = require('../../config/database');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const subjects = require('../subjects/subjects.service');
const repository = require('./favorites.repository');

/** Saved (wishlisted) public items. Subjects that later go private stay listed as unavailable. */
async function toFavorites(rows) {
  const cards = await subjects.resolveCards(rows.map((row) => ({ subjectType: row.subject_type, subjectId: row.subject_id })));
  return rows.map((row) => {
    const card = cards.get(`${row.subject_type}:${row.subject_id}`) ?? null;
    return {
      id: row.id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      available: card !== null,
      item: card,
      createdAt: row.created_at.toISOString(),
    };
  });
}

async function list(ctx, query) {
  const { rows, total } = await repository.list(pool, ctx.actorUserId, query);
  return { items: await toFavorites(rows), meta: pageMeta(query, total) };
}

/** Idempotent: saving an already-saved item returns it with created=false. */
async function add(ctx, { subjectType, subjectId }) {
  if (!(await subjects.isPublic(subjectType, subjectId))) throw ApiError.notFound('Item not found', 'SUBJECT_NOT_FOUND');
  const { row, created } = await repository.upsert(pool, ctx.actorUserId, subjectType, subjectId);
  const [favorite] = await toFavorites([row]);
  return { favorite, created };
}

async function remove(ctx, { type, id }) {
  if (!(await repository.remove(pool, ctx.actorUserId, type, id))) throw ApiError.notFound('Favorite not found', 'FAVORITE_NOT_FOUND');
}

module.exports = { list, add, remove };
