'use strict';

/**
 * Runnable end-to-end scenarios for the Postman collection (folder "01 · Scenarios").
 * Unlike the reference folders, these requests are ordered and chained: each step asserts its
 * outcome and stores the ids the next step needs, so the whole folder runs green in the
 * Collection Runner or newman against a freshly seeded development stack:
 *
 *   A admin publishes a destination → B a partner registers (verification email read from
 *   Mailpit), applies, is approved and lists a room → C a traveller registers, plans a trip and
 *   books (payment step accepts 503 when Razorpay keys are not configured) → D review +
 *   moderation → E admin dashboards/reports/audit → F sign-out and refresh-token revocation.
 *
 * Personas use separate token variables: admin {{accessToken}} (collection default),
 * partner {{partnerAccessToken}}, traveller {{travellerAccessToken}}.
 */

const json = (value) => JSON.stringify(value, null, 2);

function url(raw) {
  const [path, query] = raw.split('?');
  const host = path.startsWith('{{mailpitUrl}}') ? '{{mailpitUrl}}' : '{{baseUrl}}';
  const out = { raw, host: [host], path: path.slice(host.length).split('/').filter(Boolean) };
  if (query) out.query = query.split('&').map((pair) => ({ key: pair.split('=')[0], value: pair.split('=').slice(1).join('=') }));
  return out;
}

/** One chained request. `as` picks the persona token (null = service token only). */
function step(name, method, path, { as = 'admin', body, headers = [], tests = [], prerequest } = {}) {
  const token = { admin: '{{accessToken}}', partner: '{{partnerAccessToken}}', traveller: '{{travellerAccessToken}}' }[as];
  const request = {
    method,
    header: [...headers, ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : [])],
    url: url(path.startsWith('{{') ? path : `{{baseUrl}}${path}`),
    auth: token ? { type: 'bearer', bearer: [{ key: 'token', value: token, type: 'string' }] } : { type: 'noauth' },
  };
  if (body) request.body = { mode: 'raw', raw: json(body), options: { raw: { language: 'json' } } };
  // Postman's sandbox keeps one global scope across scripts: wrap each in a function so
  // `const` names do not collide between requests (and `return` can end a script early).
  const scoped = (lines) => ['(() => {', ...lines.map((line) => `  ${line}`), '})();'];
  const event = [
    {
      listen: 'test',
      script: { type: 'text/javascript', exec: scoped(['const res = pm.response;', "const body = res.code === 204 || !res.text() ? {} : res.json();", 'const data = body.data;', ...tests]) },
    },
  ];
  if (prerequest) event.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: scoped(prerequest) } });
  return { name, request, event };
}

const expect = (code) => `pm.test('status ${code}', () => pm.expect(res.code, JSON.stringify(body.error || '')).to.equal(${code}));`;
const save = (name, expression) => `pm.collectionVariables.set('${name}', ${expression});`;

/** Register → read the verification email from Mailpit (retrying while the worker sends it) → verify → log in. */
function onboard(persona, label) {
  const email = `{{${persona}Email}}`;
  return [
    step(`${label}: register`, 'POST', '/auth/register', {
      as: null,
      prerequest: [`pm.collectionVariables.set('${persona}Email', '${persona}.' + pm.collectionVariables.get('runId') + '@example.com');`, `pm.collectionVariables.set('${persona}MailTries', 0);`],
      body: { fullName: persona === 'partner' ? 'Ravi Oraon' : 'Asha Munda', email, password: 'Jharkhand-2026!' },
      tests: [expect(202)],
    }),
    step(`${label}: read the verification email (Mailpit)`, 'GET', `{{mailpitUrl}}/api/v1/search?query=to:${email}`, {
      as: null,
      tests: [
        '// The worker sends email asynchronously: retry this request (1 s apart) until it arrives.',
        'const messages = body.messages || [];',
        `const tries = Number(pm.collectionVariables.get('${persona}MailTries') || 0);`,
        'if (!messages.length) {',
        `  if (tries < 20) { pm.collectionVariables.set('${persona}MailTries', tries + 1); pm.execution.setNextRequest(pm.info.requestName); setTimeout(() => {}, 1000); }`,
        "  else pm.test('verification email arrived', () => pm.expect.fail('no email in Mailpit after 20 s — is the worker running?'));",
        '  return;',
        '}',
        "pm.sendRequest(pm.variables.replaceIn('{{mailpitUrl}}') + '/api/v1/message/' + messages[0].ID, (err, message) => {",
        "  const match = /verify-email\\?token=([^\\s\"<&]+)/.exec(message.json().Text || '');",
        "  pm.test('verification link found', () => pm.expect(match).to.not.equal(null));",
        `  if (match) pm.collectionVariables.set('${persona}VerifyToken', decodeURIComponent(match[1]));`,
        '});',
      ],
    }),
    step(`${label}: verify email`, 'POST', '/auth/verify-email', { as: null, body: { token: `{{${persona}VerifyToken}}` }, tests: [expect(200)] }),
    step(`${label}: log in`, 'POST', '/auth/login', {
      as: null,
      body: { email, password: 'Jharkhand-2026!' },
      tests: [expect(200), save(`${persona}AccessToken`, 'data.accessToken'), save(`${persona}RefreshToken`, 'data.refreshToken'), save(`${persona}UserId`, 'data.user.id')],
    }),
  ];
}

function scenariosFolder() {
  const admin = [
    step('A1 Admin: log in', 'POST', '/auth/login', {
      as: null,
      prerequest: ["pm.collectionVariables.set('runId', String(Date.now()));"],
      body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
      tests: [expect(200), save('accessToken', 'data.accessToken'), save('refreshToken', 'data.refreshToken')],
    }),
    step('A2 Pick a district (Ranchi)', 'GET', '/districts', {
      as: null,
      tests: [expect(200), "const d = data.find((x) => x.slug === 'ranchi') || data[0];", save('districtId', 'd.id')],
    }),
    step('A3 Pick a destination category', 'GET', '/destination-categories', { as: null, tests: [expect(200), save('destinationCategoryId', 'data[0].id')] }),
    step('A4 Admin: create destination (draft)', 'POST', '/admin/destinations', {
      body: {
        districtId: '{{districtId}}',
        name: 'Postman Falls {{runId}}',
        summary: 'A waterfall created by the Postman scenario.',
        description: 'Scenario data: safe to archive.',
        location: { latitude: 23.4256, longitude: 85.5964 },
      },
      tests: [expect(201), "pm.test('starts as draft', () => pm.expect(data.status).to.equal('draft'));", save('destinationId', 'data.id'), save('destinationSlug', 'data.slug')],
    }),
    step('A5 Admin: set categories', 'PUT', '/admin/destinations/{{destinationId}}/categories', { body: { categoryIds: ['{{destinationCategoryId}}'] }, tests: [expect(200)] }),
    step('A6 Admin: publish destination', 'PATCH', '/admin/destinations/{{destinationId}}/status', {
      body: { status: 'published' },
      tests: [expect(200), "pm.test('published', () => pm.expect(data.status).to.equal('published'));"],
    }),
    step('A7 Public: read the destination', 'GET', '/destinations/{{destinationSlug}}', { as: null, tests: [expect(200), "pm.test('same destination', () => pm.expect(data.id).to.equal(pm.collectionVariables.get('destinationId')));"] }),
  ];

  const partner = [
    ...onboard('partner', 'B1 Partner'),
    step('B2 Partner: apply', 'POST', '/partners/apply', {
      as: 'partner',
      body: { partnerType: 'accommodation', businessName: 'Postman Eco Stays {{runId}}', legalName: 'Postman Eco Stays Pvt Ltd', email: 'stays.{{runId}}@example.com' },
      tests: [expect(201), "pm.test('pending review', () => pm.expect(data.status).to.equal('pending'));", save('partnerId', 'data.id')],
    }),
    step('B3 Admin: approve partner', 'PATCH', '/admin/partners/{{partnerId}}/status', { body: { status: 'approved' }, tests: [expect(200)] }),
    step('B4 Partner: create property', 'POST', '/partners/me/properties', {
      as: 'partner',
      body: {
        districtId: '{{districtId}}',
        destinationId: '{{destinationId}}',
        name: 'Postman Eco Lodge {{runId}}',
        propertyType: 'eco_lodge',
        description: 'Scenario property.',
        address: 'Near the falls, Ranchi',
        location: { latitude: 23.42, longitude: 85.59 },
        bookingMode: 'instant',
      },
      tests: [expect(201), save('propertyId', 'data.id'), save('propertySlug', 'data.slug')],
    }),
    step('B5 Partner: add a room', 'POST', '/partners/me/properties/{{propertyId}}/rooms', {
      as: 'partner',
      body: { name: 'Forest cottage', maxAdults: 2, maxChildren: 1, totalUnits: 3, basePrice: '2500.00' },
      tests: [expect(201), save('roomId', 'data.id')],
    }),
    step('B6 Admin: publish property', 'PATCH', '/admin/properties/{{propertyId}}/status', { body: { status: 'published' }, tests: [expect(200)] }),
  ];

  const room = { itemType: 'property_room', resourceId: '{{roomId}}', checkIn: '{{dateIn10Days}}', checkOut: '{{dateIn12Days}}', rooms: 1, adults: 2 };
  const traveller = [
    ...onboard('traveller', 'C1 Traveller'),
    step('C2 Search', 'GET', '/search?q=Postman', { as: null, tests: [expect(200)] }),
    step('C3 Save destination to favorites', 'POST', '/favorites', { as: 'traveller', body: { subjectType: 'destination', subjectId: '{{destinationId}}' }, tests: [expect(201)] }),
    step('C4 Create a trip (one day per date)', 'POST', '/trips', {
      as: 'traveller',
      body: { title: 'Monsoon weekend', startDate: '{{dateIn10Days}}', endDate: '{{dateIn12Days}}', travelerCount: 2 },
      tests: [expect(201), "pm.test('3 days created', () => pm.expect(data.days.length).to.equal(3));", save('tripId', 'data.id'), save('dayId', 'data.days[0].id')],
    }),
    step('C5 Add the destination as a stop', 'POST', '/trips/{{tripId}}/days/{{dayId}}/stops', {
      as: 'traveller',
      body: { destinationId: '{{destinationId}}', startTime: '09:00', endTime: '11:00' },
      tests: [expect(201), save('stopId', 'data.days[0].stops[0].id')],
    }),
    step('C6 Quote the room (2 nights)', 'POST', '/bookings/quote', {
      as: 'traveller',
      body: room,
      tests: [expect(200), "pm.test('2 x 2500.00', () => pm.expect(data.totalAmount).to.equal('5000.00'));"],
    }),
    step('C7 Book (holds the room)', 'POST', '/bookings', {
      as: 'traveller',
      prerequest: ["pm.collectionVariables.set('bookingKey', 'postman-' + pm.collectionVariables.get('runId'));"],
      headers: [{ key: 'Idempotency-Key', value: '{{bookingKey}}' }],
      body: { ...room, travelers: [{ fullName: 'Asha Munda', isPrimary: true }, { fullName: 'Ravi Munda' }] },
      tests: [expect(201), "pm.test('awaiting payment', () => pm.expect(data.status).to.equal('pending_payment'));", save('bookingId', 'data.id')],
    }),
    step('C8 Retry with the same Idempotency-Key (no double booking)', 'POST', '/bookings', {
      as: 'traveller',
      headers: [{ key: 'Idempotency-Key', value: '{{bookingKey}}' }],
      body: { ...room, travelers: [{ fullName: 'Asha Munda', isPrimary: true }, { fullName: 'Ravi Munda' }] },
      tests: [
        expect(201),
        "pm.test('same booking returned', () => pm.expect(data.id).to.equal(pm.collectionVariables.get('bookingId')));",
        "pm.test('marked as replay', () => pm.expect(res.headers.get('Idempotent-Replay')).to.equal('true'));",
      ],
    }),
    step('C9 Create payment order (503 until Razorpay keys are set)', 'POST', '/bookings/{{bookingId}}/payment-order', {
      as: 'traveller',
      headers: [{ key: 'Idempotency-Key', value: '{{$guid}}' }],
      tests: [
        "pm.test('order created, or payments not configured', () => pm.expect([201, 503]).to.include(res.code));",
        "if (res.code === 503) pm.test('PAYMENTS_NOT_CONFIGURED', () => pm.expect(body.error.code).to.equal('PAYMENTS_NOT_CONFIGURED'));",
        "if (res.code === 201) { pm.collectionVariables.set('orderId', data.order.id); pm.collectionVariables.set('providerOrderId', data.checkout.orderId); }",
      ],
    }),
    step('C10 Partner sees the booking', 'GET', '/partners/me/bookings/{{bookingId}}', { as: 'partner', tests: [expect(200)] }),
    step('C11 Traveller cancels (unpaid: no fee)', 'POST', '/bookings/{{bookingId}}/cancel', {
      as: 'traveller',
      body: { reason: 'Change of travel plans' },
      tests: [expect(200), "pm.test('cancelled', () => pm.expect(data.status).to.equal('cancelled'));"],
    }),
  ];

  const reviews = [
    step('D1 Traveller reviews the destination', 'POST', '/reviews', {
      as: 'traveller',
      body: { subjectType: 'destination', subjectId: '{{destinationId}}', rating: 5, title: 'Unforgettable', comment: 'Beautiful falls, well organised visit.' },
      tests: [expect(201), "pm.test('waits for moderation', () => pm.expect(data.status).to.equal('pending'));", save('reviewId', 'data.id')],
    }),
    step('D2 Traveller: own reviews', 'GET', '/users/me/reviews', { as: 'traveller', tests: [expect(200), "pm.test('listed as pending', () => pm.expect(data[0].status).to.equal('pending'));"] }),
    step('D3 Admin: approve review', 'PATCH', '/admin/reviews/{{reviewId}}/status', { body: { status: 'approved' }, tests: [expect(200)] }),
    step('D4 Public: destination reviews with rating summary', 'GET', '/destinations/{{destinationSlug}}/reviews', {
      as: null,
      tests: [expect(200), "pm.test('review is public', () => pm.expect(data.map((r) => r.id)).to.include(pm.collectionVariables.get('reviewId')));", "pm.test('rating summary', () => pm.expect(body.meta.rating.count).to.equal(1));"],
    }),
  ];

  const oversight = [
    step('E1 Admin dashboard', 'GET', '/admin/dashboard', { tests: [expect(200), "pm.test('has attention queue', () => pm.expect(data).to.have.property('attention'));"] }),
    step('E2 Bookings report (last 30 days)', 'GET', '/admin/reports/bookings', { tests: [expect(200), "pm.test('counts the booking', () => pm.expect(data.totals.bookings).to.be.at.least(1));"] }),
    step('E3 Partner dashboard', 'GET', '/partners/me/dashboard', { as: 'partner', tests: [expect(200)] }),
    step('E4 Audit trail of the moderation', 'GET', '/admin/audit-logs?entityType=review&entityId={{reviewId}}', {
      tests: [expect(200), "pm.test('moderation audited', () => pm.expect(data[0].action).to.equal('reviews.moderated'));"],
    }),
    step('E5 Platform settings', 'GET', '/admin/settings', { tests: [expect(200)] }),
  ];

  const signOut = [
    step('F1 Traveller: log out', 'POST', '/auth/logout', { as: null, body: { refreshToken: '{{travellerRefreshToken}}' }, tests: [expect(204)] }),
    step('F2 Revoked refresh token is refused', 'POST', '/auth/refresh', { as: null, body: { refreshToken: '{{travellerRefreshToken}}' }, tests: [expect(401)] }),
  ];

  const folder = (name, description, item) => ({ name, description, item });
  return {
    name: '01 · Scenarios (run in order)',
    description: [
      'Chained end-to-end flows. Run the whole folder with the Collection Runner (or newman); every step asserts its result.',
      'Needs: the development stack (Mailpit + worker running), `adminEmail`/`adminPassword` and `mailpitUrl` in the environment.',
      'Each run uses fresh emails and names (`runId`), so it can be repeated.',
    ].join('\n\n'),
    item: [
      folder('A · Admin publishes a destination', 'Draft → categories → published → visible publicly.', admin),
      folder('B · Partner onboarding', 'Register + email verification, apply, admin approval, property + room, admin publishes.', partner),
      folder('C · Traveller plans and books', 'Register, search, favorite, trip, quote, idempotent booking, payment order, partner view, cancellation.', traveller),
      folder('D · Reviews and moderation', 'Pending review → admin approval → public with rating summary.', reviews),
      folder('E · Admin and partner oversight', 'Dashboards, reports, audit trail, settings.', oversight),
      folder('F · Sign out', 'Logout revokes the refresh token.', signOut),
    ],
  };
}

module.exports = { scenariosFolder };
