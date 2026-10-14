'use strict';

/**
 * Builds a parameterised UPDATE for the provided fields only. `columns` maps API
 * field names to SQL column names (an allowlist); `expressions` optionally maps a
 * field to a SQL expression using `$n` (e.g. a PostGIS constructor).
 * Returns null when nothing would change.
 */
function buildUpdate(table, id, fields, columns, expressions = {}) {
  const values = [id];
  const sets = [];
  for (const [field, column] of Object.entries(columns)) {
    if (fields[field] === undefined) continue;
    const value = fields[field];
    if (expressions[field] && value !== null) {
      const params = expressions[field].params(value);
      const placeholders = params.map((param) => {
        values.push(param);
        return `$${values.length}`;
      });
      sets.push(`${column} = ${expressions[field].sql(...placeholders)}`);
    } else {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return null;
  return { text: `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, values };
}

// PostGIS point from {latitude, longitude}.
const geoPointExpression = {
  params: (point) => [point.longitude, point.latitude],
  sql: (lng, lat) => `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
};

/** Changed-field diff for audit records. */
function diff(before, changes) {
  const oldValues = {};
  const newValues = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      oldValues[key] = before[key] ?? null;
      newValues[key] = value;
    }
  }
  return { oldValues, newValues };
}

module.exports = { buildUpdate, geoPointExpression, diff };
