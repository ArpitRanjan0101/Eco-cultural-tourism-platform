'use strict';

/**
 * Postman collection (v2.1) generated from the same route definitions that drive Express and
 * OpenAPI, so it can never drift from the API. Run:
 *   docker compose run --rm --no-deps -T api node src/docs/postman.js collection  > docs/api/postman_collection.json
 *   docker compose run --rm --no-deps -T api node src/docs/postman.js environment > docs/api/postman_environment.json
 *
 * Conventions (see docs/api/POSTMAN.md):
 *  - every request sends X-Internal-Service-Token (collection pre-request script) except the webhook;
 *  - user routes use Bearer {{accessToken}} (captured by Auth › Log in / Refresh);
 *  - path parameters are Postman path variables bound to collection variables ({{destinationId}} …),
 *    which "create" requests and the first item of list requests fill in automatically;
 *  - dates in bodies use rolling variables ({{dateIn10Days}} …) computed before each request.
 */
const { buildOpenApiDocument } = require('./openapi');
const { scenariosFolder } = require('./postman-scenarios');
const routes = require('../modules');

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const PREFIX = '/api/v1';

// ---------------------------------------------------------------------------
// Naming: path segment → variable
// ---------------------------------------------------------------------------

const camel = (text) => text.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function singular(segment) {
  const word = camel(segment);
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Literal values or variables for parameters whose name alone is ambiguous. */
const PARAM_OVERRIDES = {
  'DELETE /favorites/:type/:id': { type: 'destination', id: '{{destinationId}}' },
  'POST /webhooks/payments/:provider': { provider: 'razorpay' },
};

function pathVariable(route, param, segments, index) {
  const override = PARAM_OVERRIDES[`${route.method.toUpperCase()} ${route.path}`]?.[param];
  if (override) return override;
  if (param === 'code') return '{{menuCode}}';
  if (param !== 'id' && param !== 'slug') return `{{${param}}}`;
  const owner = singular(segments[index - 1]);
  return `{{${owner}${param === 'id' ? 'Id' : 'Slug'}}}`;
}

/** Variable filled by a successful create/list response of this route (null = none). */
function resourceVariable(route) {
  const statics = route.path.split('/').filter((s) => s && !s.startsWith(':'));
  const last = statics.at(-1);
  if (!last || ['me', 'search', 'suggestions', 'nearby', 'filters', 'featured', 'reports', 'dashboard', 'settings', 'apply'].includes(last)) return null;
  return singular(last);
}

// ---------------------------------------------------------------------------
// Example values from JSON Schema (OpenAPI 3.0, generated from zod)
// ---------------------------------------------------------------------------

const DATE = /^\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$$/;
const TIME = /\[01\]\\d\|2\[0-3\]/;
const MONEY = /\\d\{1,10\}/;

const UUID_FIELDS = {
  subjectId: '{{destinationId}}',
  resourceId: '{{roomId}}',
  categoryId: '{{destinationCategoryId}}',
  avatarMediaId: '{{mediaId}}',
  coverMediaId: '{{mediaId}}',
  photoMediaId: '{{mediaId}}',
  parentId: null,
};

const DATE_FIELDS = {
  checkIn: '{{dateIn10Days}}',
  checkOut: '{{dateIn12Days}}',
  startDate: '{{dateIn10Days}}',
  endDate: '{{dateIn12Days}}',
  from: '{{dateIn10Days}}',
  to: '{{dateIn12Days}}',
  date: '{{dateIn10Days}}',
};

const STRING_FIELDS = {
  email: 'traveller.{{$timestamp}}@example.com',
  password: 'Jharkhand-2026!',
  currentPassword: '{{adminPassword}}',
  newPassword: 'Jharkhand-2026-new!',
  fullName: 'Asha Munda',
  businessName: 'Netarhat Eco Stays',
  legalName: 'Netarhat Eco Stays Pvt Ltd',
  displayName: 'Ravi Oraon',
  phone: '+919876543210',
  token: 'paste-the-token-from-the-email',
  refreshToken: '{{refreshToken}}',
  reason: 'Change of travel plans',
  note: 'Reviewed and approved',
  notes: 'Carry rain gear',
  comment: 'Beautiful place, well organised visit.',
  altText: 'Hundru Falls in monsoon',
  address: 'Main Road, Ranchi, Jharkhand',
  taxIdentifier: 'ABCDE1234F',
  code: 'sample_code',
  icon: 'leaf',
  q: 'falls',
  provider: 'razorpay',
  currency: 'INR',
};

const VARIABLE_STRING = /^\{\{[A-Za-z]+\}\}$/;

// Response examples show concrete JSON (fixed ids/dates and every field) instead of request
// variables; toggled around the response-example generation in buildItem.
let responseMode = false;
const SAMPLE = {
  uuid: '3f2b8c1e-8d4a-4c55-9a51-6f0e2a9d7b10',
  dateTime: '2026-10-16T09:30:00.000Z',
  date: '2026-10-26',
};

function resolve(doc, schema) {
  let current = schema;
  while (current?.$ref) current = doc.components.schemas[current.$ref.split('/').pop()];
  return current;
}

function example(doc, raw, name = '', depth = 0) {
  const schema = resolve(doc, raw);
  // Deep enough for the deepest DTO (trip → days → stops → destination card); still bounded.
  if (!schema || depth > 12) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map((part) => example(doc, part, name, depth + 1)));
  if (schema.oneOf || schema.anyOf) return example(doc, (schema.oneOf || schema.anyOf)[0], name, depth + 1);
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined && schema.type !== 'object' && schema.type !== 'array') return schema.default;

  switch (schema.type) {
    case 'object': {
      const props = schema.properties || {};
      const required = new Set(schema.required || []);
      const out = {};
      const optional = [];
      for (const [key, prop] of Object.entries(props)) {
        const value = example(doc, prop, key, depth + 1);
        if (value === null || value === undefined) continue;
        if (required.has(key)) out[key] = value;
        else optional.push([key, value]);
      }
      // Optional fields: show the plain ones (no unset id variables); for all-optional (PATCH)
      // bodies keep the example small.
      const plain = optional.filter(([, value]) => !(typeof value === 'string' && VARIABLE_STRING.test(value) && value.endsWith('Id}}')));
      const shown = responseMode ? optional : required.size ? plain : plain.slice(0, 2);
      for (const [key, value] of shown) out[key] = value;
      return out;
    }
    case 'array': {
      const item = example(doc, schema.items, name.replace(/Ids$/, 'Id').replace(/s$/, ''), depth + 1);
      const count = Math.max(schema.minItems || 1, 1);
      return item === null ? [] : Array.from({ length: count }, () => item);
    }
    case 'integer':
    case 'number':
      return numberFor(name, schema);
    case 'boolean':
      return name.startsWith('is') || name === 'featured' ? true : false;
    case 'string':
      return stringFor(name, schema);
    default:
      return null;
  }
}

function numberFor(name, schema) {
  const known = { latitude: 23.3441, longitude: 85.3096, rating: 5, adults: 2, participants: 2, travelerCount: 2, rooms: 1, page: 1, limit: 20, radiusKm: 25, durationMinutes: 120, durationDays: 2, durationNights: 1, maxAdults: 2, maxChildren: 1, totalUnits: 3, capacity: 10, totalSeats: 12, maxParticipants: 10, minParticipants: 1, maxGroupSize: 6, maxTravelers: 10, yearsExperience: 5, dayNumber: 1, sortOrder: 0 };
  let value = known[name] ?? schema.minimum ?? 1;
  if (schema.minimum !== undefined) value = Math.max(value, schema.minimum + (schema.exclusiveMinimum ? 1 : 0));
  if (schema.maximum !== undefined) value = Math.min(value, schema.maximum);
  return schema.type === 'integer' ? Math.round(value) : value;
}

function stringFor(name, schema) {
  if (responseMode) {
    if (schema.format === 'uuid') return SAMPLE.uuid;
    if (schema.format === 'date-time') return SAMPLE.dateTime;
    if (schema.pattern && DATE.test(schema.pattern)) return SAMPLE.date;
    if (name === 'email' || schema.format === 'email') return 'asha.munda@example.com';
    if (name === 'slug') return 'hundru-falls';
    if (/accessToken|refreshToken/.test(name)) return 'eyJhbGciOiJIUzI1NiIs…(truncated)';
  }
  if (schema.format === 'uuid') {
    if (name in UUID_FIELDS) return UUID_FIELDS[name];
    return name.endsWith('Id') ? `{{${name}}}` : '{{destinationId}}';
  }
  if (schema.format === 'date-time') return name.toLowerCase().startsWith('end') ? '{{dateTimeIn6DaysPlus2h}}' : '{{dateTimeIn6Days}}';
  if (schema.format === 'email' || name === 'email') return STRING_FIELDS.email;
  if (schema.pattern && DATE.test(schema.pattern)) return DATE_FIELDS[name] ?? '{{dateIn10Days}}';
  if (schema.pattern && TIME.test(schema.pattern)) return /^(end|close)/i.test(name) ? '17:00' : '09:00';
  if (schema.pattern && MONEY.test(schema.pattern)) return name === 'amount' ? '500.00' : '2500.00';
  if (name in STRING_FIELDS) return STRING_FIELDS[name];
  if (name === 'slug') return 'sample-slug-{{$timestamp}}';
  if (/phone/i.test(name)) return '+919876543210';
  if (/(amount|price|fee|total|value|captured|refunded|net|subtotal)$/i.test(name)) return '2500.00';
  if (name === 'sourcePath') return '/old-page-{{$timestamp}}';
  // Site paths satisfy every link rule (safeHref, internal menu links, CTA hrefs).
  if (/^(link|linkValue|targetPath|href|ctaHref)$/.test(name)) return '/destinations';
  if (/url|href/i.test(name)) return 'https://www.example.org/';
  if (/name|title|heading|label/i.test(name)) return name === 'name' ? 'Sample {{$timestamp}}' : 'Sample title';
  const text = /description|summary|body|content|bio/i.test(name) ? 'Sample text for testing the Jharkhand Tourism API.' : 'sample';
  const min = schema.minLength || 0;
  return text.length >= min ? text.slice(0, schema.maxLength || text.length) : text.padEnd(min, '.');
}

// ---------------------------------------------------------------------------
// Hand-written bodies where a schema-derived example cannot satisfy cross-field rules
// ---------------------------------------------------------------------------

const BODY_OVERRIDES = {
  'POST /auth/login': { email: '{{adminEmail}}', password: '{{adminPassword}}' },
  'POST /auth/register': { fullName: 'Asha Munda', email: 'traveller.{{$timestamp}}@example.com', password: 'Jharkhand-2026!' },
  'POST /auth/change-password': { currentPassword: '{{adminPassword}}', newPassword: 'Jharkhand-2026-new!' },
  'POST /auth/reset-password': { token: 'paste-the-token-from-the-email', newPassword: 'Jharkhand-2026-new!' },
  'PUT /admin/roles/:id/permissions': { permissions: ['destinations.read', 'destinations.manage', 'cms.manage'] },
  'POST /admin/languages': { code: 'kfq', name: 'Korku' },
  'PUT /admin/cms/menus/:id/items': {
    items: [
      { label: 'Destinations', linkType: 'internal', linkValue: '/destinations', isEnabled: true, children: [] },
      { label: 'Plan a trip', linkType: 'internal', linkValue: '/trips', isEnabled: true, children: [] },
    ],
  },
  'POST /bookings/quote': { itemType: 'property_room', resourceId: '{{roomId}}', checkIn: '{{dateIn10Days}}', checkOut: '{{dateIn12Days}}', rooms: 1, adults: 2 },
  'POST /bookings': {
    itemType: 'property_room',
    resourceId: '{{roomId}}',
    checkIn: '{{dateIn10Days}}',
    checkOut: '{{dateIn12Days}}',
    rooms: 1,
    adults: 2,
    travelers: [{ fullName: 'Asha Munda', isPrimary: true }, { fullName: 'Ravi Munda' }],
  },
  'POST /trips': { title: 'Monsoon weekend in Ranchi', startDate: '{{dateIn10Days}}', endDate: '{{dateIn12Days}}', travelerCount: 2 },
  'PATCH /trips/:id': { title: 'Monsoon weekend (updated)', status: 'planned' },
  'POST /trips/:id/days/:dayId/stops': { destinationId: '{{destinationId}}', startTime: '09:00', endTime: '11:00', notes: 'Carry rain gear' },
  'PATCH /trips/:id/stops/reorder': { days: [{ dayId: '{{dayId}}', stopIds: ['{{stopId}}'] }] },
  'POST /favorites': { subjectType: 'destination', subjectId: '{{destinationId}}' },
  'POST /reviews': { subjectType: 'destination', subjectId: '{{destinationId}}', rating: 5, title: 'Unforgettable', comment: 'Beautiful place, well organised visit.' },
  'PATCH /admin/reviews/:id/status': { status: 'approved' },
  'PATCH /admin/settings': { values: { 'booking.hold_minutes': 15 } },
  'POST /media/upload-init': { purpose: 'content_image', mimeType: 'image/png', fileSize: 2048, altText: 'Hundru Falls in monsoon' },
  'POST /media/upload-complete': { mediaId: '{{mediaId}}' },
  // Real values come from Razorpay Checkout's success handler (see docs/api/POSTMAN.md, payments).
  'POST /payments/verify': { providerOrderId: '{{providerOrderId}}', providerPaymentId: 'pay_xxxxxxxxxxxxxx', signature: '0'.repeat(64) },
  'POST /admin/bookings/:id/refund': { amount: '500.00', reason: 'Goodwill gesture' },
  'POST /bookings/:id/cancel': { reason: 'Change of travel plans' },
  'POST /partners/apply': { partnerType: 'accommodation', businessName: 'Netarhat Eco Stays {{$timestamp}}', legalName: 'Netarhat Eco Stays Pvt Ltd', email: 'partner.{{$timestamp}}@example.com' },
  'POST /webhooks/payments/:provider': {
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_xxxxxxxxxxxxxx', order_id: '{{providerOrderId}}', amount: 400000, currency: 'INR', status: 'captured', method: 'upi' } } },
    created_at: 1760000000,
  },
};

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

const COLLECTION_PRE_REQUEST = [
  '// Service token only to the API host (never to Mailpit or other URLs) and never on provider webhooks.',
  "const apiHost = pm.variables.replaceIn('{{healthUrl}}');",
  "const target = pm.variables.replaceIn(pm.request.url.toString());",
  "if (target.startsWith(apiHost) && !pm.request.url.getPath().includes('/webhooks/')) {",
  "  pm.request.headers.upsert({ key: 'X-Internal-Service-Token', value: pm.variables.get('serviceToken') || '' });",
  '}',
  '// Rolling future dates for booking/trip bodies (YYYY-MM-DD and ISO date-times).',
  'const at = (days, hours = 0) => new Date(Date.now() + days * 864e5 + hours * 36e5);',
  'for (const n of [1, 3, 5, 6, 10, 11, 12, 20, 30]) pm.variables.set(`dateIn${n}Days`, at(n).toISOString().slice(0, 10));',
  "pm.variables.set('dateTimeIn6Days', at(6).toISOString());",
  "pm.variables.set('dateTimeIn6DaysPlus2h', at(6, 2).toISOString());",
];

const COLLECTION_TEST = [
  '(() => {',
  '  // Checks for every API response (other hosts, e.g. Mailpit, are skipped).',
  "  if (!pm.variables.replaceIn(pm.request.url.toString()).startsWith(pm.variables.replaceIn('{{healthUrl}}'))) return;",
  "  const isJson = pm.response.code !== 204 && (pm.response.headers.get('Content-Type') || '').includes('json');",
  '  const body = isJson ? pm.response.json() : {};',
  '  // 503 PAYMENTS_NOT_CONFIGURED is the documented answer while Razorpay keys are not set.',
  "  const expected503 = pm.response.code === 503 && body.error && body.error.code === 'PAYMENTS_NOT_CONFIGURED';",
  "  pm.test('no server error', () => pm.expect(expected503 || pm.response.code < 500, JSON.stringify(body.error || '')).to.equal(true));",
  "  if (isJson) pm.test('standard envelope', () => pm.expect(body).to.have.property('success'));",
  '})();',
];

const setVar = (name, expression) => `if (${expression} !== undefined && ${expression} !== null) pm.collectionVariables.set('${name}', ${expression});`;

function captureScript(route) {
  const key = `${route.method.toUpperCase()} ${route.path}`;
  const lines = ['if (pm.response.code >= 300) return;', 'const body = pm.response.json();', 'const data = body.data;'];
  const special = {
    'POST /auth/login': [setVar('accessToken', 'data.accessToken'), setVar('refreshToken', 'data.refreshToken'), setVar('userId', 'data.user && data.user.id')],
    'POST /auth/refresh': [setVar('accessToken', 'data.accessToken'), setVar('refreshToken', 'data.refreshToken')],
    'POST /media/upload-init': [setVar('mediaId', 'data.media.id'), setVar('uploadUrl', 'data.upload.url')],
    'POST /bookings/:id/payment-order': [setVar('orderId', 'data.order.id'), setVar('providerOrderId', 'data.checkout.orderId')],
    'POST /partners/apply': [setVar('partnerId', 'data.id')],
    'POST /trips': [setVar('tripId', 'data.id'), setVar('dayId', 'data.days[0] && data.days[0].id')],
    'POST /trips/:id/days': [setVar('dayId', 'data.days[data.days.length - 1].id')],
    'POST /trips/:id/days/:dayId/stops': ['const stops = data.days.flatMap((d) => d.stops);', setVar('stopId', 'stops[stops.length - 1] && stops[stops.length - 1].id')],
  }[key];
  if (special) return [...lines, ...special];

  const resource = resourceVariable(route);
  if (!resource) return null;
  const hasPathParams = route.path.includes(':');
  if (route.method === 'post' && route.response.status === 201) {
    return [...lines, setVar(`${resource}Id`, 'data && data.id'), "if (data && data.slug) pm.collectionVariables.set('" + resource + "Slug', data.slug);"];
  }
  if (route.method === 'get' && !hasPathParams) {
    // Lists fill empty variables with their first item so detail requests work straight away.
    return [
      ...lines,
      'const first = Array.isArray(data) ? data[0] : null;',
      'if (!first) return;',
      `if (!pm.collectionVariables.get('${resource}Id') && first.id) pm.collectionVariables.set('${resource}Id', first.id);`,
      `if (!pm.collectionVariables.get('${resource}Slug') && first.slug) pm.collectionVariables.set('${resource}Slug', first.slug);`,
    ];
  }
  return null;
}

const WEBHOOK_PRE_REQUEST = [
  '// Razorpay signs the exact raw body with the webhook secret (HMAC-SHA256, hex).',
  'const raw = pm.variables.replaceIn(pm.request.body.raw);',
  "pm.request.headers.upsert({ key: 'X-Razorpay-Signature', value: CryptoJS.HmacSHA256(raw, pm.variables.get('paymentWebhookSecret') || '').toString() });",
  "pm.request.headers.upsert({ key: 'X-Razorpay-Event-Id', value: 'evt_' + Date.now() });",
];

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function wrapIIFE(lines) {
  return ['(() => {', ...lines.map((line) => `  ${line}`), '})();'];
}

function describe(route) {
  const parts = [route.description || route.summary];
  if (route.auth === 'user') parts.push('**Auth:** service token + Bearer access token.');
  else if (route.auth === 'webhook') parts.push('**Auth:** provider signature only (computed by the pre-request script).');
  else parts.push('**Auth:** service token only.');
  if (route.permissions?.length) parts.push(`**Permissions:** ${route.permissions.join(', ')}`);
  if (route.anyPermissions?.length) parts.push(`**Any of:** ${route.anyPermissions.join(', ')}`);
  if (route.path.startsWith('/partners/me')) parts.push('**Partner context:** members of several organisations send `X-Partner-Id`.');
  if (route.rateLimit) parts.push(`**Rate limit:** ${route.rateLimit.max} per ${route.rateLimit.windowSeconds}s per ${route.rateLimit.by || 'IP'}.`);
  if (route.errors?.length) parts.push(`**Documented errors:** ${route.errors.join(', ')} (plus 401/403/422 where applicable).`);
  return parts.join('\n\n');
}

function queryParams(operation, doc) {
  return (operation.parameters || [])
    .filter((p) => p.in === 'query')
    .map((p) => {
      const value = example(doc, p.schema, p.name);
      return {
        key: p.name,
        value: value === null || value === undefined ? '' : String(value),
        description: p.schema?.description || (p.required ? 'Required' : 'Optional'),
        disabled: !p.required,
      };
    });
}

function buildItem(route, doc) {
  const key = `${route.method.toUpperCase()} ${route.path}`;
  const openApiPath = PREFIX + route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const operation = doc.paths[openApiPath]?.[route.method];
  if (!operation) throw new Error(`No OpenAPI operation for ${key}`);

  const segments = route.path.split('/').filter(Boolean);
  const variables = [];
  segments.forEach((segment, index) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      variables.push({ key: name, value: pathVariable(route, name, segments, index) });
    }
  });

  const headers = [];
  const headerSchema = route.headers?.shape || {};
  if ('idempotency-key' in headerSchema) headers.push({ key: 'Idempotency-Key', value: '{{$guid}}', description: 'Required; a replay with the same key returns the original result.' });
  if ('x-partner-id' in headerSchema) headers.push({ key: 'X-Partner-Id', value: '{{partnerId}}', description: 'Only when the user belongs to several partner organisations.', disabled: true });

  const request = {
    method: route.method.toUpperCase(),
    header: headers,
    url: {
      raw: `{{baseUrl}}${route.path}`,
      host: ['{{baseUrl}}'],
      path: segments,
      query: queryParams(operation, doc),
      variable: variables,
    },
    description: describe(route),
  };
  if (!request.url.query.length) delete request.url.query;
  if (!variables.length) delete request.url.variable;
  if (route.auth !== 'user') request.auth = { type: 'noauth' };

  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  if (bodySchema) {
    const body = BODY_OVERRIDES[key] ?? example(doc, bodySchema);
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }

  const events = [];
  const capture = captureScript(route);
  if (capture) events.push({ listen: 'test', script: { type: 'text/javascript', exec: wrapIIFE(capture) } });
  if (route.auth === 'webhook') events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: WEBHOOK_PRE_REQUEST } });

  return {
    name: `${route.summary}  ·  ${route.method.toUpperCase()} ${route.path}`,
    request,
    response: responseExamples(route, operation, request, doc),
    ...(events.length ? { event: events } : {}),
  };
}

const STATUS_TEXT = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity' };
const REQUEST_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

/** The most useful failure for this route, as the real error envelope. */
function errorExample(route) {
  const error = (status, code, message, details) => ({ status, body: { success: false, error: { code, message, ...(details ? { details } : {}), requestId: REQUEST_ID } } });
  if (route.request?.body) {
    return error(422, 'VALIDATION_ERROR', 'Request validation failed', [{ location: 'body', path: 'fieldName', message: 'Required' }]);
  }
  if (route.path.includes(':')) return error(404, 'NOT_FOUND', 'Resource not found');
  if (route.auth === 'user') return error(401, 'AUTH_REQUIRED', 'User authentication required');
  return error(401, 'SERVICE_TOKEN_MISSING', 'Service authentication required');
}

/** Saved Postman examples: the success JSON (from the response schema) and a typical error. */
function responseExamples(route, operation, request, doc) {
  const status = route.response.status;
  const schema = operation.responses?.[status]?.content?.['application/json']?.schema;
  const headers = [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }, { key: 'X-Request-Id', value: REQUEST_ID }];
  const saved = (name, code, body) => ({
    name,
    originalRequest: request,
    status: STATUS_TEXT[code] || 'OK',
    code,
    _postman_previewlanguage: 'json',
    header: body === null ? headers.slice(1) : headers,
    body: body === null ? '' : body,
  });
  responseMode = true;
  let success;
  try {
    success = schema ? JSON.stringify(example(doc, schema), null, 2).replace(/ ?\{\{\$timestamp\}\}/g, '') : null;
  } finally {
    responseMode = false;
  }
  const failure = errorExample(route);
  return [
    saved(`${status} ${STATUS_TEXT[status] || ''}`.trim(), status, success),
    saved(`${failure.status} ${failure.body.error.code}`, failure.status, JSON.stringify(failure.body, null, 2)),
  ];
}

function startHereFolder() {
  const health = (name, path, description, auth) => ({
    name,
    request: {
      method: 'GET',
      url: { raw: `{{healthUrl}}${path}`, host: ['{{healthUrl}}'], path: path.split('/').filter(Boolean) },
      description,
      auth: auth ? undefined : { type: 'noauth' },
    },
  });
  const login = buildItem(routes.find((r) => r.method === 'post' && r.path === '/auth/login'), buildOpenApiDocument());
  login.name = 'Log in as the admin (stores accessToken / refreshToken)';
  const me = buildItem(routes.find((r) => r.method === 'get' && r.path === '/auth/me'), buildOpenApiDocument());
  me.name = 'Who am I (roles + permissions)';
  return {
    name: '00 · Start here',
    description: 'Run these first: health checks, then log in. The login stores the tokens used by every user route.',
    item: [
      health('Liveness  ·  GET /health/live', '/health/live', 'Public liveness probe.'),
      health('Readiness  ·  GET /health/ready', '/health/ready', 'Database, Redis, migrations, worker, storage and queue status (service token).', true),
      health('Version  ·  GET /health/version', '/health/version', 'Deployed version and commit (service token).', true),
      login,
      me,
    ],
  };
}

function buildPostmanCollection() {
  const doc = buildOpenApiDocument();
  const folders = new Map();
  for (const route of routes) {
    const tag = route.tags?.[0] || 'Other';
    if (!folders.has(tag)) folders.set(tag, []);
    folders.get(tag).push(buildItem(route, doc));
  }
  // 00 = start here, 01 = scenarios, 02… = one reference folder per OpenAPI tag.
  const numbered = [...folders.entries()].map(([tag, items], index) => ({ name: `${String(index + 2).padStart(2, '0')} · ${tag}`, item: items }));
  const scenarios = scenariosFolder();

  const variableNames = new Set(['accessToken', 'refreshToken', 'uploadUrl', 'orderId', 'providerOrderId', 'menuCode']);
  const collect = (text) => {
    for (const match of String(text).matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)) variableNames.add(match[1]);
  };
  // Only what is actually sent (descriptions mention template {{placeholders}} as prose).
  (function walk(list) {
    for (const entry of list) {
      if (entry.item) walk(entry.item);
      else collect(JSON.stringify([entry.request.url, entry.request.body ?? null, entry.request.header]));
    }
  })([...numbered, scenarios]);
  const environmentOwned = new Set(['baseUrl', 'healthUrl', 'serviceToken', 'adminEmail', 'adminPassword', 'paymentWebhookSecret']);
  const rolling = /^date(Time)?In/;
  const variable = [...variableNames]
    .filter((name) => !environmentOwned.has(name) && !rolling.test(name))
    .sort()
    .map((name) => ({ key: name, value: name === 'menuCode' ? 'main' : '', type: 'string' }));

  return {
    info: {
      name: 'Jharkhand Eco & Cultural Tourism API',
      description: [
        `Generated from the route definitions (${routes.length} routes + 3 health checks). Regenerate with \`node src/docs/postman.js collection\`; do not hand-edit.`,
        '',
        '1. Import this collection and `postman_environment.json`; select the environment.',
        '2. Set `serviceToken` (INTERNAL_SERVICE_TOKEN), `adminEmail`/`adminPassword` (BOOTSTRAP_ADMIN_*) in the environment.',
        '3. Run **00 · Start here › Log in as the admin**. Tokens are stored automatically.',
        '4. Create or list resources; ids are captured into collection variables used by detail requests.',
        '',
        'See docs/api/POSTMAN.md for ordered test scenarios (traveller, partner, admin, payments).',
      ].join('\n'),
      schema: SCHEMA,
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
    event: [
      { listen: 'prerequest', script: { type: 'text/javascript', exec: COLLECTION_PRE_REQUEST } },
      { listen: 'test', script: { type: 'text/javascript', exec: COLLECTION_TEST } },
    ],
    variable,
    item: [startHereFolder(), scenarios, ...numbered],
  };
}

function buildPostmanEnvironment() {
  const value = (key, val, type = 'default', description) => ({ key, value: val, type, enabled: true, ...(description ? { description } : {}) });
  return {
    name: 'Jharkhand Tourism · Local (Docker)',
    values: [
      value('baseUrl', 'http://localhost:8081/api/v1'),
      value('healthUrl', 'http://localhost:8081'),
      value('mailpitUrl', 'http://localhost:8025', 'default', 'Mailpit (development email inbox), used by the scenarios to read verification emails'),
      value('serviceToken', '', 'secret', 'INTERNAL_SERVICE_TOKEN from .env'),
      value('adminEmail', '', 'default', 'BOOTSTRAP_ADMIN_EMAIL from .env'),
      value('adminPassword', '', 'secret', 'BOOTSTRAP_ADMIN_PASSWORD from .env'),
      value('paymentWebhookSecret', '', 'secret', 'PAYMENT_WEBHOOK_SECRET from .env (webhook request only)'),
    ],
    _postman_variable_scope: 'environment',
  };
}

module.exports = { buildPostmanCollection, buildPostmanEnvironment, BODY_OVERRIDES };

if (require.main === module) {
  const what = process.argv[2];
  if (!['collection', 'environment'].includes(what)) {
    process.stderr.write('Usage: node src/docs/postman.js <collection | environment>\n');
    process.exitCode = 1;
  } else {
    const output = what === 'collection' ? buildPostmanCollection() : buildPostmanEnvironment();
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
}
