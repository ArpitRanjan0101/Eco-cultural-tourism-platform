'use strict';

const { z } = require('../validation/zod');

const MAX_LIMIT = 100;

const paginationQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
};

/**
 * Builds a `sort` query schema from an allowlist mapping API field -> SQL column.
 * Values are `field` (ascending) or `-field` (descending).
 */
function sortQuery(columns, defaultSort) {
  const fields = Object.keys(columns);
  const values = fields.flatMap((field) => [field, `-${field}`]);
  return z.enum(values).default(defaultSort);
}

/** Turns a validated sort value into a safe ORDER BY clause with a stable tiebreaker. */
function orderBy(sort, columns, tiebreaker = 'id') {
  const descending = sort.startsWith('-');
  const column = columns[descending ? sort.slice(1) : sort];
  return `${column} ${descending ? 'DESC' : 'ASC'} NULLS LAST, ${tiebreaker} ${descending ? 'DESC' : 'ASC'}`;
}

function pageWindow({ page, limit }) {
  return { limit, offset: (page - 1) * limit };
}

function pageMeta({ page, limit }, total) {
  return { page, limit, total };
}

/** Escapes LIKE/ILIKE wildcards in user-supplied search text. */
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

module.exports = { paginationQuery, sortQuery, orderBy, pageWindow, pageMeta, likePattern, MAX_LIMIT };
