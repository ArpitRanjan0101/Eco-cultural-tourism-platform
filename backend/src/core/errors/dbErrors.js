'use strict';

const ApiError = require('./ApiError');

/** Converts a unique-violation into a 409 naming the clashing field; other errors pass through. */
function translateUniqueViolation(err, entity) {
  if (err.code !== '23505') return err;
  const constraint = err.constraint || '';
  const field = ['slug', 'code', 'name', 'source_path'].find((candidate) => constraint.includes(candidate)) || 'value';
  const label = field === 'source_path' ? 'source path' : field;
  return ApiError.conflict(`A ${entity} with this ${label} already exists`, `${field.toUpperCase()}_TAKEN`);
}

module.exports = { translateUniqueViolation };
