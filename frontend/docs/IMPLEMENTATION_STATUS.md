# Frontend Implementation Status

Read this first in every frontend session (agent rules: [../CLAUDE.md](../CLAUDE.md)). Routes:
[SITEMAP.md](SITEMAP.md) · design: [FRONTEND_HLD.md](FRONTEND_HLD.md) ·
[FRONTEND_LLD.md](FRONTEND_LLD.md) · decisions and open questions: [DECISIONS.md](DECISIONS.md) · contract
mapping: [API_MAPPING.md](API_MAPPING.md) · RBAC: [PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md) · CMS:
[CMS_CONTRACTS.md](CMS_CONTRACTS.md) · components: [COMPONENT_CATALOG.md](COMPONENT_CATALOG.md).
Backend status: [../../docs/IMPLEMENTATION_STATUS.md](../../docs/IMPLEMENTATION_STATUS.md) (all 10 backend phases verified).

**Rule:** one phase at a time; the next phase starts only after explicit owner approval. Commands run in Docker only.

| Phase | Scope | Exit gate | Status |
|-------|-------|-----------|--------|
| 0 | Architecture, requirements and API contract audit (documentation only) | All Phase 0 documents exist; every planned page maps to confirmed operations; gaps recorded; WO1–WO10 answered or defaults accepted | ✅ Approved (2026-10-17, by starting Phase 1; WO1/WO2 defaults applied) |
| 1 | Next.js scaffold, Docker (dev/prod/e2e targets, `compose.dev.yml`), env validation, Tailwind, ESLint, Vitest + Playwright foundation | Images build; dev server boots and renders; lint, unit and browser tests pass in Docker; no secret in client-visible output | ✅ Delivered (2026-10-17), **awaiting approval** |
| 2 | Design tokens and shared components (ui, forms, feedback, layout, navigation, data-display), public site shell | Every catalogued Phase 2 component built with tests and axe checks; COMPONENT_CATALOG updated | ⏳ |
| 3 | BFF core: backend client, cookies, middleware refresh single-flight, CSRF, allowlisted forwarder (+ Node contract generator, W24), auth handlers; auth pages (register, verify, login, forgot/reset, logout) | BFF integration tests (token never in responses, CSRF refusal, header stripping, parallel refresh → one backend call); auth journey E2E against the dev stack | ⏳ |
| 4 | Public discovery: CMS renderer, homepage, `/pages/[slug]`, destinations, districts, explore, search, SEO (metadata, sitemap, robots) | All public read routes used per API_MAPPING; CMS drafts not visible; unknown sections skipped; Lighthouse/axe checks recorded | ⏳ |
| 5 | Supply browsing: stays, guides, experiences, packages (lists, detail, availability, reviews) | Detail pages show live availability from the API; empty/error states; E2E browse flows | ⏳ |
| 6 | Booking and payments: quote, create (Idempotency-Key), checkout with Razorpay, verify, result, cancel | E2E quote → booking → checkout; `PAYMENTS_NOT_CONFIGURED` state verified; with test keys, sandbox payment confirmed via verify | ⏳ |
| 7 | Tourist account: profile, avatar upload, bookings, trips, favourites, own reviews, notifications | All `/account` routes; owner isolation visible as 404 states; E2E account journey | ⏳ |
| 8 | Partner portal: application, organisation, team, verification, all supply editors, calendars, bookings approve/reject, dashboard/reports | All 58 Phase 8 operations wired; partner E2E (onboard → supply → approve booking) | ⏳ |
| 9 | Admin console: users/roles, geography, destinations, moderation, partners, bookings/payments/refunds, reviews, CMS editor, templates, reports, audit, settings | All 87 admin operations wired; permission-filtered navigation; admin E2E smoke | ⏳ |
| 10 | Hardening and handover: a11y and performance pass, security review, production compose + nginx edge routing to `web`, docs | Production stack smoke test; final checklist signed off | ⏳ |

Operation counts per phase come from [API_MAPPING.md](API_MAPPING.md) and add up to all 242 contract operations.

## Phase 1 — delivered (2026-10-17)

- **App:** Next.js 16.3.8 App Router (JS/JSX), React 19.3.0, Tailwind 4.3.3 (`@theme` foundation tokens), `@/*` alias.
  Root layout with `AppProviders` client boundary, placeholder home page, `loading`/`error`/`not-found` boundaries,
  `GET /api/health` (container liveness, no backend call). No tourism features, BFF or auth.
- **Config:** `src/config/env.server.js` (`server-only`, zod 4): `BACKEND_INTERNAL_URL`, `INTERNAL_SERVICE_TOKEN`
  (≥32 chars), `APP_ORIGIN`, `BACKEND_TIMEOUT_MS`, `SESSION_COOKIE_SECURE`; production rejects placeholder token,
  non-https origin and insecure cookies. Validated at startup via `src/instrumentation.js` → process exits 1, naming
  keys only. `src/config/site.js` public identity. `.env.example` without secrets.
- **Docker:** `frontend/Dockerfile` targets `dev`, `prod` (standalone, non-root, healthcheck), `e2e` (Playwright
  image); `build` stage runs `check:bundle` with a canary token. `frontend/compose.dev.yml` (W25). Toolchain W26–W27.
- **Tests:** Vitest + RTL (`smoke.test.js`, `env.server.test.js`, `check-client-bundle.test.js`), Playwright
  (`src/tests/e2e/smoke.spec.js` + warm-up global setup). ESLint 9 flat config with `eslint-config-next/core-web-vitals`,
  `--max-warnings 0`.
- **Backend:** untouched. Root `docker-compose.yml` untouched.

### Phase 1 verification (executed 2026-10-17, all in Docker)

- `docker compose -f frontend/compose.dev.yml build web` ✅ · `docker build --target prod` ✅ (build + bundle check:
  37 client-visible files, no server-only values or names) · e2e image ✅. Sizes: prod 398 MB, dev 1.07 GB, e2e 3.57 GB.
- Dev server `up` → healthy; host `GET /` 200 with the h1, `GET /nope` 404, no `X-Powered-By` ✅
- Network: from `web`, `http://nginx:8081/health/live` 200 and `/api/v1/regions` 401 without token (private listener
  reachable, service-token gate intact) ✅
- Fail-fast: dev server with a 8-char token / empty `APP_ORIGIN` → exits 1 with
  `Invalid server configuration: INTERNAL_SERVICE_TOKEN must be at least 32 characters; APP_ORIGIN Invalid URL` ✅
- `npm run lint` → 0 problems over 22 files (22 `@next`, 6 `jsx-a11y`, 16 `react-hooks` rules active) ✅
- `npm test` → **3 files, 16 tests, 16 pass** (shell smoke incl. error boundary hiding error text, env rules,
  bundle checker catching a planted token and variable name) ✅
- Playwright → **4 passed** (root in Chromium, 404 + link home, health no-store, no `X-Powered-By`) ✅
- Prod image: with the dev `.env` → exits 1 (`APP_ORIGIN must use https…; SESSION_COOKIE_SECURE must be true…`);
  with a production-valid config → Docker health `healthy`, `GET /` 200; runs as `node` on Node 22.23.2; 12 runtime
  packages, none of eslint/vitest/jsdom/playwright/braces; no `.env` file in the image ✅
- Hot reload through the Windows bind mount: Turbopack never picked up a change; webpack + polling within ~2 s → W26 ✅
- Issues found and fixed during verification: root-owned `.next` volume (EACCES), npm 10.9 lockfile crash (W27),
  Next 16 blocking dev HMR from `127.0.0.1`/`web` (`allowedDevOrigins`), e2e timeouts on cold dev compiles (warm-up
  + timeouts), bundle checker crash on a missing output folder.
- Known and accepted: W28 dev-only `npm audit` finding.

## Phase 0 — delivered (2026-10-17)

- **Inputs placed:** backend report copied to `docs/backend/Jharkhand_Tourism_Complete_Backend_Technical_Report.pdf`.
  Backend contract read from `docs/api/openapi.json` (OpenAPI 3.0.3, 242 operations).
- **Audit sources:** backend `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, `FLOW.md`, `AGENT.md`, `docker-compose.yml`,
  `infrastructure/nginx/default.conf`, RBAC migration `0004`, CMS `cms.sections.js` / `cms.service.js` / `cms.schema.js`,
  notification link builder.
- **Tool:** `frontend/scripts/gen-api-mapping.ps1` (interim generator, replaced by a Node script in Phase 1, W24).
- **No application code** was written, nothing installed, no database or backend file changed.

| Step | Task | Deliverable |
|------|------|-------------|
| 0.1 | Inspect repository and backend report | Inventory in this section (audit sources) and HLD §2, §9 |
| 0.2 | Inspect implemented OpenAPI | API_MAPPING.md (242 operations, generated); readiness: all backend phases verified, contract complete for the target routes except gaps G1–G7 |
| 0.3 | Define roles and workflows | FRONTEND_HLD §5a user-flow diagrams (visitor/tourist booking, account, partner onboarding, admin) |
| 0.4 | Freeze Next.js route map | SITEMAP.md |
| 0.5 | Define feature ownership | FRONTEND_LLD §1 module map |
| 0.6 | Define reusable component catalog | COMPONENT_CATALOG.md |
| 0.7 | Define API-to-page mapping | API_MAPPING.md (operation → page) + SITEMAP.md (page → operations) |
| 0.8 | Define CMS section registry/schema | CMS_CONTRACTS.md |
| 0.9 | Define authentication/BFF boundary | FRONTEND_HLD §3, §7 (trust boundaries, session flows); FRONTEND_LLD §4–5, §8 |
| 0.10 | Record unresolved backend dependencies | DECISIONS.md §3 (G1–G7) and §1 (WO1–WO10) |

Files: `frontend/CLAUDE.md`, `frontend/docs/{FRONTEND_HLD,FRONTEND_LLD,SITEMAP,API_MAPPING,COMPONENT_CATALOG,
CMS_CONTRACTS,PERMISSIONS_MATRIX,DECISIONS,IMPLEMENTATION_STATUS}.md`, `frontend/scripts/gen-api-mapping.ps1`,
`docs/backend/Jharkhand_Tourism_Complete_Backend_Technical_Report.pdf`.

### Findings from the audit

| # | Finding | Handling |
|---|---------|----------|
| 1 | `POST /auth/login` and `/auth/refresh` return access and refresh tokens in the response body | Dedicated BFF handlers; tokens go to HttpOnly cookies only; forwarder refuses these routes (W3, W5) |
| 2 | Backend A4 revokes the whole session family when a rotated refresh token is reused | Refresh only in middleware, single-flight per token; one `web` instance in v1 (W6, WO7) |
| 3 | Backend rate limits and login lockout key on `X-Client-Ip` (A7, A8) | BFF must forward the real client IP or every user shares one lockout bucket (W8) |
| 4 | Backend emails link to `/bookings/:id`; target structure uses `/account/bookings/[id]` | Frontend redirect, no backend change (W18) |
| 5 | Rendered CMS section `data` is an untyped object in OpenAPI | Rendered shapes documented from `renderSections()` and enforced with frontend Zod schemas (CMS_CONTRACTS) |
| 6 | No public route for CMS redirects (backend O8 open) | Not implemented until O8 is decided (WO8) |
| 7 | No media listing route, but the target structure has `/admin/media` | Proposed: no standalone page; media handled in owning editors (WO9, G2) |
| 7a | No route lists a user's partner memberships; with several, the backend requires `X-Partner-Id` the UI cannot discover | One-membership users fully supported; multi-membership needs a backend addition (WO10, G3) |
| 8 | Payments answer `503 PAYMENTS_NOT_CONFIGURED` without Razorpay keys (development default) | Real "unavailable" state, never a simulated success (W17) |
| 9 | Only three operations take browser-relevant special headers: `Idempotency-Key` (required) on `POST /bookings`, `POST /bookings/:id/payment-order`, `POST /admin/bookings/:id/refund`; `X-Partner-Id` on all `/partners/me*` routes | Forwarder passes exactly these two headers (W8, W14) |

### Phase 0 verification (executed 2026-10-17)

- `gen-api-mapping.ps1` over `docs/api/openapi.json` → **242 operations, 0 unmapped**; auth split P 48, U 46,
  PARTNER 57, ADMIN 87, server-only health 3, webhook 1 (sum 242) ✅
- Token-bearing responses searched across all operations (`AuthSession` schema): only `POST /auth/login` and
  `POST /auth/refresh` ✅
- Header parameters searched across all operations: only `Idempotency-Key`, `X-Partner-Id` and the Razorpay
  webhook headers ✅
- Permission codes in PERMISSIONS_MATRIX checked against migration `0004` (48 permissions, 6 roles) and against
  the per-route permissions in API_MAPPING ✅
- Every operation cited in SITEMAP.md checked against the list of non-admin, non-partner operations exported
  from `openapi.json`; partner/admin pages cite operation groups that API_MAPPING shows in full ✅
- Partner-membership discovery checked in `partners.service.js` (`PARTNER_CONTEXT_REQUIRED`) and the
  `AuthenticatedUser` / `MyPartner` schemas → gap G3 ✅
- Seeds checked: no CMS menus or pages are seeded → gap G5 ✅

### Phase 0 exit gate

| Criterion | Result |
|-----------|--------|
| All Phase 0 documents created | ✅ 10 files (CLAUDE.md + 9 docs) |
| Every planned page maps to confirmed operations | ✅ except `/admin/media` (G2, proposed to drop) |
| Every contract operation has a consumer | ✅ 242/242 (webhook and health marked non-browser) |
| Confirmed vs proposed separated | ✅ labels in HLD §5b, API_MAPPING, CMS_CONTRACTS, DECISIONS |
| Backend gaps recorded, none filled with invented endpoints | ✅ G1–G7 |
| No installation, UI code or database change | ✅ |
| Owner approval and WO answers | ⏳ pending |

- Not run: Docker, lint, tests or builds. There is no frontend code yet, and Docker Desktop was not running
  during this session. Phase 1 needs Docker Desktop started.

## Pending / needs owner input

- Approve Phase 1 (decisions W25–W28).
- Answer or accept defaults for **WO3–WO10** (Markdown renderer, maps/tiles, brand
  identity, languages, instance count, CMS redirects, `/admin/media`, multi-membership partners).
- Backend dependencies: O2 (live payments), O8 (redirects), G3 (memberships list) — none blocks Phases 1–7.
