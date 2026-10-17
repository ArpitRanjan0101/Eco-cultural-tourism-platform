// Generates the two contract artefacts from the backend OpenAPI document (DECISIONS W5, W24):
//   src/lib/bff/allowlist.generated.js — operations the BFF forwarder may call
//   docs/API_MAPPING.md                — every operation mapped to its frontend consumer and phase
// Run in Docker: docker compose -f frontend/compose.dev.yml run --rm --no-deps web npm run contract:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const specPath = process.argv[2] ?? '/contract/openapi.json';
const root = fileURLToPath(new URL('..', import.meta.url));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Never forwarded by the generic BFF route: health is server-only, webhooks come from the provider, and the
// session routes return or need tokens, so dedicated handlers own them (W3).
const FORWARD_EXCLUDED = [/^\/health\//, /^\/api\/v1\/webhooks\//, /^POST \/api\/v1\/auth\/(login|refresh|logout|logout-all)$/];

// First matching rule wins: [method regex, path regex, consumer, frontend phase]. Case-insensitive.
const RULES = [
  ['.*', '^/health/', 'BFF server only (readiness probe)', '1'],
  ['.*', '^/api/v1/webhooks/', 'Not called by frontend (Razorpay to public edge)', '-'],
  ['POST', '^/api/v1/auth/(login|refresh|logout|logout-all)$', 'Dedicated BFF auth handler (sets/clears cookies)', '3'],
  ['.*', '^/api/v1/auth/', '(auth) pages, session', '3'],
  ['.*', '^/api/v1/users/me/reviews', '/account (reviews)', '7'],
  ['.*', '^/api/v1/users/me', '/account/profile', '7'],
  ['.*', '^/api/v1/admin/(users|roles|permissions)', '/admin/users, /admin/roles', '9'],
  ['.*', '^/api/v1/admin/(regions|districts|destination-categories)', '/admin/geography', '9'],
  ['.*', '^/api/v1/admin/destinations', '/admin/destinations', '9'],
  ['.*', '^/api/v1/admin/experiences', '/admin/experiences', '9'],
  ['.*', '^/api/v1/admin/(properties|amenities)', '/admin/properties', '9'],
  ['.*', '^/api/v1/admin/(guides|languages)', '/admin/guides', '9'],
  ['.*', '^/api/v1/admin/packages', '/admin/packages', '9'],
  ['.*', '^/api/v1/admin/partners', '/admin/partners', '9'],
  ['.*', '^/api/v1/admin/bookings', '/admin/bookings', '9'],
  ['.*', '^/api/v1/admin/payments', '/admin/payments', '9'],
  ['.*', '^/api/v1/admin/refunds', '/admin/refunds', '9'],
  ['.*', '^/api/v1/admin/reviews', '/admin/reviews', '9'],
  ['.*', '^/api/v1/admin/cms', '/admin/cms', '9'],
  ['.*', '^/api/v1/admin/notification-templates', '/admin/notifications', '9'],
  ['.*', '^/api/v1/admin/(dashboard|reports)', '/admin, /admin/reports', '9'],
  ['.*', '^/api/v1/admin/settings', '/admin/settings', '9'],
  ['.*', '^/api/v1/admin/audit-logs', '/admin/audit-logs', '9'],
  ['.*', '^/api/v1/partners/apply', '/partner (application)', '8'],
  ['.*', '^/api/v1/partners/me/(dashboard|reports)', '/partner, /partner/reports', '8'],
  ['.*', '^/api/v1/partners/me/(properties|rooms)', '/partner/properties, /partner/rooms', '8'],
  ['.*', '^/api/v1/partners/me/guides', '/partner/guides', '8'],
  ['.*', '^/api/v1/partners/me/experiences', '/partner/experiences', '8'],
  ['.*', '^/api/v1/partners/me/packages', '/partner/packages', '8'],
  ['.*', '^/api/v1/partners/me/bookings', '/partner/bookings', '8'],
  ['.*', '^/api/v1/partners/me/users', '/partner/team', '8'],
  ['.*', '^/api/v1/partners/me/documents', '/partner/verification', '8'],
  ['.*', '^/api/v1/partners/me$', '/partner/organization', '8'],
  ['.*', '^/api/v1/content/', 'CMS renderer: /, /pages/[slug], header/footer, announcements', '4'],
  ['.*', '^/api/v1/media/', 'Shared upload component (account, partner, admin)', '7-9'],
  ['.*', '^/api/v1/(regions|districts)', '/districts, /districts/[slug], filters', '4'],
  ['.*', '^/api/v1/destination-categories', '/explore, /destinations filters', '4'],
  ['.*', '^/api/v1/destinations/\\{slug\\}/(experiences|properties|guides)', '/destinations/[slug] (related supply)', '5'],
  ['.*', '^/api/v1/destinations/\\{slug\\}/reviews', '/destinations/[slug] (reviews)', '4'],
  ['.*', '^/api/v1/destinations', '/destinations, /destinations/[slug], home', '4'],
  ['.*', '^/api/v1/search', '/search, global search box', '4'],
  ['.*', '^/api/v1/(properties|amenities)', '/stays, /stays/[slug]', '5'],
  ['.*', '^/api/v1/(guides|languages)', '/guides, /guides/[id]', '5'],
  ['.*', '^/api/v1/experiences', '/experiences, /experiences/[slug]', '5'],
  ['.*', '^/api/v1/packages', '/packages, /packages/[slug]', '5'],
  ['.*', '^/api/v1/bookings/quote', 'Booking widget on supply detail pages', '6'],
  ['.*', '^/api/v1/bookings/\\{id\\}/payment-order', '/checkout/[bookingId]', '6'],
  ['POST', '^/api/v1/bookings$', 'Booking widget -> /checkout/[bookingId]', '6'],
  ['.*', '^/api/v1/bookings', '/account/bookings, /account/bookings/[id], /checkout', '6-7'],
  ['.*', '^/api/v1/payments/verify', '/checkout -> /payments/result', '6'],
  ['.*', '^/api/v1/(payments|refunds)', '/account/bookings/[id] (payments, refunds)', '6-7'],
  ['.*', '^/api/v1/trips', '/account/trips', '7'],
  ['.*', '^/api/v1/favorites', '/account/favorites, save buttons', '7'],
  ['.*', '^/api/v1/reviews', 'Review list/forms on detail pages, /account', '5-7'],
  ['.*', '^/api/v1/notifications', '/account/notifications, header badge', '7'],
].map(([method, path, consumer, phase]) => ({ method: new RegExp(`^${method}$`, 'i'), path: new RegExp(path, 'i'), consumer, phase }));

function consumerOf(method, path) {
  return RULES.find((rule) => rule.method.test(method) && rule.path.test(path)) ?? { consumer: 'UNMAPPED', phase: '?' };
}

function authOf(path, operation) {
  const schemes = (operation.security ?? []).flatMap((entry) => Object.keys(entry));
  if (path.startsWith('/api/v1/webhooks/')) return 'WEBHOOK';
  if (path.startsWith('/health/')) return schemes.includes('ServiceToken') ? 'S' : 'none';
  if (schemes.includes('BearerAuth')) {
    if (path.startsWith('/api/v1/admin/')) return 'ADMIN';
    if (path.startsWith('/api/v1/partners/me')) return 'PARTNER';
    return 'U';
  }
  return 'P';
}

function permissionsOf(description = '') {
  let match = description.match(/Requires permission\(s\): (.+?)\.(\s|$)/);
  if (match) return match[1].split(/,\s*/).map((code) => `\`${code}\``).join(', ');
  match = description.match(/Requires one of: (.+?)\.(\s|$)/);
  if (match) return `any of ${match[1].split(/,\s*/).map((code) => `\`${code}\``).join(', ')}`;
  return '';
}

const titleCase = (name) => name.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase());

const rows = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const operation = item[method];
    if (!operation) continue;
    const upper = method.toUpperCase();
    const { consumer, phase } = consumerOf(upper, path);
    const headers = (operation.parameters ?? [])
      .filter((p) => p.in === 'header' && !p.name.toLowerCase().startsWith('x-razorpay'))
      .map((p) => (p.required ? `${titleCase(p.name)} (required)` : titleCase(p.name)));
    rows.push({
      tag: (operation.tags ?? []).join(', '),
      method: upper,
      path,
      auth: authOf(path, operation),
      permissions: permissionsOf(operation.description),
      headers: headers.join(', '),
      summary: operation.summary ?? '',
      consumer,
      phase,
      forwarded: !FORWARD_EXCLUDED.some((rule) => rule.test(path) || rule.test(`${upper} ${path}`)),
    });
  }
}

const unmapped = rows.filter((row) => row.consumer === 'UNMAPPED');
if (unmapped.length) {
  console.error(`Unmapped operations:\n${unmapped.map((row) => `${row.method} ${row.path}`).join('\n')}`);
  process.exit(1);
}

// ---- allowlist ----
const allowed = rows.filter((row) => row.forwarded).map((row) => [row.method, row.path]);
const allowlist = `// GENERATED by scripts/generate-contract.mjs from docs/api/openapi.json - do not edit (DECISIONS W5, W24).
// Operations the generic BFF forwarder may call. ${allowed.length} of ${rows.length} contract operations.
export const FORWARDED_OPERATIONS = Object.freeze(${JSON.stringify(allowed, null, 0).replace(/\],\[/g, '],\n  [').replace(/^\[\[/, '[\n  [').replace(/\]\]$/, '],\n]')});
`;
writeFileSync(`${root}src/lib/bff/allowlist.generated.js`, allowlist);

// ---- CMS section types (W15, B14): the frontend registry must cover exactly these ----
const sectionTypes = spec.components.schemas.PublicCmsPage.properties.sections.items.properties.type.enum;
writeFileSync(
  `${root}src/cms/sectionTypes.generated.js`,
  `// GENERATED by scripts/generate-contract.mjs from docs/api/openapi.json (PublicCmsPage.sections[].type) - do not edit.\nexport const BACKEND_SECTION_TYPES = Object.freeze(${JSON.stringify(sectionTypes)});\n`,
);

// ---- API_MAPPING.md ----
const today = new Date().toISOString().slice(0, 10);
const lines = [
  '# API Mapping: backend contract to frontend consumers',
  '',
  `**Generated** from \`docs/api/openapi.json\` (OpenAPI ${spec.openapi}, API ${spec.info.version}, **${rows.length} operations**) on ${today}`,
  'by `frontend/scripts/generate-contract.mjs`, together with the BFF forwarding allowlist. Do not edit by hand:',
  'change the consumer rules in the generator and regenerate (DECISIONS W24).',
  '',
  '**Auth:** `P` = service token only (public data via BFF); `U` = service token + user JWT; `PARTNER` = U + approved',
  'partner membership (backend `partnerGuard`); `ADMIN` = U + admin permission; `S` = service token, server-only;',
  '`WEBHOOK` = provider signature, never called by the frontend. **Phase** = frontend phase that first consumes it',
  '(see IMPLEMENTATION_STATUS.md). **BFF** = forwarded by `/api/v1/*` (✓) or handled elsewhere (—). Paths use',
  'OpenAPI `{param}` syntax.',
  '',
  '**Browser access rule:** the browser calls only `/api/*` on the Next.js origin. The generic forwarder accepts',
  `only the ${allowed.length} ✓ operations (W5); health and webhook rows are never forwarded, and the four session routes`,
  '(`login`, `refresh`, `logout`, `logout-all`) are served by `/api/auth/*` handlers because `login`/`refresh` return',
  'tokens in the response body (W3).',
  '',
  '## Operations per frontend phase',
  '',
  '| Phase | Operations |',
  '|-------|-----------:|',
];
const byPhase = new Map();
for (const row of rows) byPhase.set(row.phase, (byPhase.get(row.phase) ?? 0) + 1);
for (const phase of [...byPhase.keys()].sort()) lines.push(`| ${phase} | ${byPhase.get(phase)} |`);
lines.push('');

const byTag = new Map();
for (const row of rows) {
  if (!byTag.has(row.tag)) byTag.set(row.tag, []);
  byTag.get(row.tag).push(row);
}
for (const [tag, group] of byTag) {
  lines.push(`## ${tag} (${group.length})`, '');
  lines.push('| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase | BFF |');
  lines.push('|--------|------|------|---------------|---------|---------|-------------------|-------|-----|');
  for (const row of group) {
    lines.push(`| ${row.method} | \`${row.path}\` | ${row.auth} | ${row.permissions} | ${row.headers} | ${row.summary} | ${row.consumer} | ${row.phase} | ${row.forwarded ? '✓' : '—'} |`);
  }
  lines.push('');
}
writeFileSync(`${root}docs/API_MAPPING.md`, lines.join('\n'));

const auth = {};
for (const row of rows) auth[row.auth] = (auth[row.auth] ?? 0) + 1;
console.log(`operations=${rows.length} forwarded=${allowed.length} unmapped=0 sectionTypes=${sectionTypes.length} auth=${JSON.stringify(auth)}`);
