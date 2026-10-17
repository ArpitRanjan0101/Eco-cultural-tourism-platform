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
| 1 | Next.js scaffold, Docker (dev/prod/e2e targets, `compose.dev.yml`), env validation, Tailwind, ESLint, Vitest + Playwright foundation | Images build; dev server boots and renders; lint, unit and browser tests pass in Docker; no secret in client-visible output | ✅ Approved (2026-10-17, by starting Phase 2) |
| 2 | Design tokens and shared components, groups A–F (layout, actions, forms, navigation/overlays, data/feedback, rich components) | Every catalogued Phase 2 component built with usage example, documented props/variants, keyboard behaviour and tests; axe clean; lint/build/tests pass in Docker | ✅ Approved (2026-10-17, by starting Phase 3) |
| 3 | Secure BFF + JWT auth: backend client, cookies, proxy refresh single-flight, CSRF, allowlisted forwarder (+ Node contract generator, W24), session handlers, browser client + TanStack Query, auth pages, route guards, PermissionGate | BFF integration tests (token never in responses, CSRF refusal, header stripping, parallel refresh → one backend call); auth journey E2E against the real stack | ✅ Approved (2026-10-17, by starting Phase 4) |
| 4 | Public layout, CMS renderer and dynamic homepage (redefined by the owner's Phase 4 spec): header/navigation/footer/announcements, 16-section registry (+ backend B14), homepage, `/pages/[slug]`, SEO metadata, robots | Every section validated and rendered from real CMS data; drafts private; unsafe content never rendered; axe clean; tests in Docker | ✅ Delivered (2026-10-17), **awaiting approval** — CMS e2e blocked by the dev DB incident (see below) |
| 5 | Discovery and supply browsing: destinations, districts, explore, search, sitemap; stays, guides, experiences, packages (lists, detail, availability, reviews) | Detail pages show live availability from the API; empty/error states; E2E browse flows | ⏳ |
| 6 | Booking and payments: quote, create (Idempotency-Key), checkout with Razorpay, verify, result, cancel | E2E quote → booking → checkout; `PAYMENTS_NOT_CONFIGURED` state verified; with test keys, sandbox payment confirmed via verify | ⏳ |
| 7 | Tourist account: profile, avatar upload, bookings, trips, favourites, own reviews, notifications | All `/account` routes; owner isolation visible as 404 states; E2E account journey | ⏳ |
| 8 | Partner portal: application, organisation, team, verification, all supply editors, calendars, bookings approve/reject, dashboard/reports | All 58 Phase 8 operations wired; partner E2E (onboard → supply → approve booking) | ⏳ |
| 9 | Admin console: users/roles, geography, destinations, moderation, partners, bookings/payments/refunds, reviews, CMS editor, templates, reports, audit, settings | All 87 admin operations wired; permission-filtered navigation; admin E2E smoke | ⏳ |
| 10 | Hardening and handover: a11y and performance pass, security review, production compose + nginx edge routing to `web`, docs | Production stack smoke test; final checklist signed off | ⏳ |

Operation counts per phase come from [API_MAPPING.md](API_MAPPING.md) and add up to all 242 contract operations.

## Phase 4 — delivered (2026-10-17)

- **Owner decisions:** extend the backend CMS instead of hardcoding sections (W37, backend B14); react-markdown for
  rich text (WO3).
- **Backend (B14):** 8 section types (`home_search`, `featured_stays`, `experience_grid`, `guide_spotlight`,
  `package_showcase`, `image_text`, `statistics_strip`, `cultural_highlights`), migration `0017`, tests,
  regenerated OpenAPI. See the backend IMPLEMENTATION_STATUS.
- **A. Layout:** `(public)/layout.jsx` (dynamic, W38) with `SiteAnnouncement`, `PublicHeader` (`DesktopNavigation`,
  `MobileNavigation`), `PublicFooter`; CMS menus `main`/`footer` with fallback to the site's sections (G5).
- **B. CMS core:** `src/cms/` — generated type list, rendered-shape schemas, registry, `SectionRenderer`, `links`,
  `Markdown`, `adapters/cms.adapter.js` (server-only, cached public reads).
- **C/D. Sections:** all 16 (`HeroSection`, `HomeSearchSection`, `DestinationGridSection`, `CategoryGridSection`,
  `DistrictExplorerSection`, `ImageGallerySection`, `FeaturedStaysSection`, `ExperienceGridSection`,
  `GuideSpotlightSection`, `PackageShowcaseSection`, `CulturalHighlightsSection`, `ImageTextSection`,
  `StatisticsStripSection`, `CTABannerSection`, `FAQSection`, `RichTextSection`) + feature cards for
  destinations, stays, experiences, guides, packages, districts; `Money`, `ImageFrame`, `CardGrid`, `LinkCard`.
- **E. Pages:** `/` (`features/home`: CMS homepage or content-free fallback), `/pages/[slug]`
  (`DynamicPageRenderer`), metadata/Open Graph per page, `metadataBase`, `robots.txt`. The old placeholder
  `app/page.jsx` was removed.
- **Not in scope / deferred:** card and search links point to the Phase 5 listing/detail routes; sitemap (needs
  those listings); CMS editor (Phase 9).

### Phase 4 verification (executed 2026-10-17, Docker)

- Backend: `db:migrate` 0017, rollback + re-apply ✅ · lint 0 ✅ · `npm test` **166/166** (adds all 8 new types
  rendered with real published supply, suspended stay removed, invalid input refused) ✅
- Frontend: lint 0 ✅ · `npm test` → **16 files, 232 tests, 232 pass** ✅ — adds: registry = backend types (no
  missing/unused entry), fixture per type validates, unsafe/malformed data rejected (script and
  protocol-relative links, `data:` images, bad enums, empty FAQ); renderer skips unknown types, prototype keys
  and invalid data with a log; all 16 sections render with axe clean; empty live sections render nothing; cards
  show API prices and honest fallbacks; statistics as entered; Markdown never renders HTML/script/data URLs/
  images; menu link building and depth cap; desktop submenu keyboard + `aria-current`; mobile drawer; footer
  columns; announcement link safety; adapter caching without per-request headers, 404 → fallback, malformed →
  error, degraded menus/announcements; money/date formatting.
- Production build ✅ (`/` and `/pages/[slug]` dynamic, `robots.txt` static); bundle check 60 files clean ✅
- Playwright on the production build against the real backend → **24 passed** (Phase 1–3 suites + new public
  suite: homepage one h1/header/footer/skip link and axe WCAG 2.2 AA; desktop nav with account actions; mobile
  no horizontal scroll, drawer, Escape returns focus; CMS 404; robots) ✅
- **Not run:** `cms.spec.js` (admin creates, publishes, renders and archives a landing page with live sections).
  The dev database lost its admin account in the incident below; the owner is handling recovery. Run it with
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` once an admin exists.
- Issues found and fixed: missing spaces in accessible names (external nav/Markdown links, category tiles);
  build failures from build-time prerendering reading runtime config (robots, root metadata, homepage — the
  layout's catch-all hid Next's dynamic signal; now only `BffError` is caught); `ImageFrame` aspect-ratio
  conflicts (`fill` ratio added); a Vitest timeout under load (20 s).

### Incident — dev database reset (2026-10-17)

While verifying the backend change, a backend test file was run directly (`node --test …`) instead of
`npm test`; it targeted the development database and truncated it (accounts incl. the bootstrap admin, demo
data, audit history) and flushed dev Redis. Details, recovery options and the new guard in
`backend/tests/helpers.js` are in the backend IMPLEMENTATION_STATUS. The owner chose to handle recovery.

## Phase 3 — delivered (2026-10-17)

| Step | Delivered as |
|------|--------------|
| 3.1 backendClient | `src/lib/bff/backendClient.js` (server-only; fixed base URL, path guard, no retries, 10 s timeout) |
| 3.2 apiErrors | `src/lib/bff/errors.js` (`BffError`, envelopes); browser `ApiError` in `src/lib/api/client.js`; `applyApiErrors` in `src/lib/api/formErrors.js` |
| 3.3 session | `src/lib/bff/session.js`, `cookies.js` (HttpOnly, SameSite=Lax, `__Host-` + Secure in production) |
| 3.4 tokenRefresh | `src/lib/bff/tokenRefresh.js` + `src/proxy.js` (W36); `/api/auth/refresh` |
| 3.5 csrf | `src/lib/bff/csrf.js` (Origin/Referer + double-submit, constant-time compare; cookie issued by the proxy) |
| 3.6 routeHandler | `src/lib/bff/routeHandler.js`; generic forwarder `src/app/api/v1/[...path]/route.js` + generated allowlist (W5, W34) |
| 3.7 apiClient | `src/lib/api/client.js` (`apiFetch`, `api`), `queryKeys.js` |
| 3.8 QueryProvider | `src/providers/QueryProvider.jsx` (no 4xx retries), mounted in `AppProviders` |
| 3.9–3.13 screens | `src/features/auth/components/{LoginForm,RegisterForm,ForgotPasswordForm,ResetPasswordForm,EmailVerification,EmailRequestForm,AuthCard,FormMessage,SignOutButtons}.jsx`; schemas, service, hooks; pages under `src/app/(auth)/` |
| 3.14 PermissionGate | `src/features/auth/components/PermissionGate.jsx` + `src/lib/permissions/permissionGate.js` (`hasPermissions`, `ADMIN_AREA_PERMISSIONS`) |
| 3.15 route guards | `src/lib/auth/{getCurrentUser,requireSession,requirePermission,safeRedirect}.js`; guarded layouts `(tourist)/account` and `(admin)/admin` with placeholder pages (real areas: Phases 7 and 9); `ForbiddenState` |
| 3.16 tests | `src/tests/bff/{core,routes}.test.js`, `src/tests/auth/{auth-ui.test.jsx,guards.test.js}`, `src/tests/e2e/auth.spec.js` |

- **Session handlers:** `POST /api/auth/login|logout|logout-all|refresh`, `GET /api/session`. Other auth
  operations go through the forwarder (`/api/v1/auth/*`).
- **Contract generator:** `scripts/generate-contract.mjs` (Node, Docker) replaces the PowerShell script; same 242
  rows; 234 forwardable operations. `/bookings/:id` → `/account/bookings/:id` redirect added (W18).
- **Dependencies:** `@tanstack/react-query` 5.104.1, `react-hook-form` 7.89.0, `@hookform/resolvers` 5.9.1.
- **Config:** `TRUSTED_PROXY_HOPS`, `E2E_INSECURE_HTTP` (test target only, W33); `web-e2e` now runs with a real
  http test origin and the e2e container reads Mailpit.
- Decisions W32–W36. No backend file changed.

### Phase 3 verification (executed 2026-10-17, all in Docker, against the real backend stack)

- `npm run lint` → 0 problems ✅ · `npm test` → **13 files, 177 tests, 177 pass** ✅ — adds BFF and auth tests:
  service token always sent, user JWT only from the cookie, spoofed `X-Internal-Service-Token`/`Authorization`/
  `X-Client-Ip`/`Host` ignored, unsafe backend paths refused, timeout 504 / unreachable 502 without retries;
  cookie names/flags/lifetimes; CSRF (foreign origin, no origin, missing/mismatched token); client IP by hops;
  allowlist (234 ops, session/health/webhook excluded, dot segments and encoded slashes 404 without calling
  Express); login strips tokens and sets cookies; logout clears even when Express is down; 415/413; **6 parallel
  refreshes → 1 backend call**; terminal vs transient refresh failures; proxy refresh + request-cookie override +
  inbound header stripping; server guards (redirect with safe `next`, 401 → anonymous, 503 surfaced); forms
  (validation, 422 field mapping, lockout retry time, neutral register/forgot messages, single verify under
  Strict Mode); PermissionGate.
- Production build: bundle check **60 client-visible files, no server-only values or names** ✅
- Playwright on the production build against nginx → Express → PostgreSQL/Redis/Mailpit → **20 passed** ✅:
  register in the UI + **real verification email** link; anonymous `/account` → `/login?next=%2Faccount` → back
  after sign-in; wrong password message, no cookie; HttpOnly/SameSite cookies, tokens absent from the login body,
  page HTML, `document.cookie` and storage; access cookie deleted → 5 parallel calls all signed in, refresh token
  rotated once, session still valid; **replayed rotated refresh token → session ended and the whole family
  revoked** (backend reuse detection); tourist `/admin` → forbidden page and Express `403 FORBIDDEN`; anonymous
  API 401 with `requestId`; CSRF rejections; sign out; sign out everywhere ends a second browser; Phase 1–2
  suites ✅
- Probe against the dev server: Redis rate-limit keys used the calling container's IP (W32); request ids match
  between BFF and API logs ✅
- Issues found and fixed: logout-all writing cookies to a detached response; Next.js replaying cleared cookies
  without `Max-Age` (W35); e2e locator/test-order bugs (exact text, live-region ambiguity, refresh test leaving a
  fresh access cookie); test helper overriding a deliberately wrong CSRF token.

## Phase 2 — delivered (2026-10-17)

- **Tokens (A):** semantic colour, type, radius, shadow, motion and motif tokens in `src/app/globals.css`, mirrored
  in `src/config/theme.js`; Noto Sans / Noto Serif via `src/config/fonts.js` (`next/font`, self-hosted); variant
  maps and `pickVariant` validation in `src/config/componentVariants.js`; `src/lib/cx.js`.
- **Components (all listed in COMPONENT_CATALOG.md):** layout `Container`, `Section`, `PageHeader`,
  `DashboardShell`; actions `Button`/`ButtonLink`, `IconButton`, `TextLink`; forms `FormField`, `Input`,
  `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `DatePicker`, `DateRangePicker`; navigation/overlays
  `Tabs`, `Breadcrumbs`, `Pagination`, `DropdownMenu`, `Dialog`, `Drawer`, `Popover`, `Tooltip`; data/feedback
  `BaseCard`, `Badge`, `StatusBadge`, `Avatar`, `StatCard`, `DataTable`, `FilterToolbar`, `Alert`,
  `ToastProvider`/`useToast`, `Spinner`, `Skeleton`, `PageLoading`, `EmptyState`, `ErrorState`,
  `ConfirmationDialog`; rich `Accordion`, `ImageGallery`, `Carousel`, `Timeline`; plus `VisuallyHidden`,
  internal icons and `useDismiss`. No tourism logic, no UI library (W31). Toasts mounted in `AppProviders`.
- **Usage examples:** `/design-system` (W30). **No public feature pages** were built.
- **Changed from Phase 1:** root `app/loading.jsx` removed (W29); e2e now targets the production build
  (`web-e2e` service, W30); `AppProviders` hosts the toast provider; root layout loads fonts and `themeColor`.
- **Deferred by design:** maps (Phase 5, WO4), `FileUpload` (Phase 7, needs BFF), `MoneyInput`/`NumberStepper`
  and domain cards (with their features).

### Phase 2 verification (executed 2026-10-17, all in Docker)

- `npm run lint` (`--max-warnings 0`) → 0 problems ✅
- `npm test` → **9 files, 103 tests, 103 pass**: token mirror + 21 WCAG contrast pairs; variant validation
  (throws in dev, falls back in production); every component's states, variants and ARIA wiring; keyboard models
  (tabs roving focus, menu button, popover/tooltip Escape, dialog Tab wrap and focus return, switch Space);
  axe-core on every group ✅
- `docker build --target prod` → build OK, `/design-system` dynamic; bundle check: 39 client-visible files, no
  server-only values or names ✅
- Playwright on the production build → **10 passed**: full-page axe WCAG 2.2 AA incl. colour contrast; dialog
  focus containment + Esc + focus return in real Chromium; open drawer axe-clean; menu and tabs keyboard;
  confirmation starts on Cancel and shows a toast; 375 px viewport with no horizontal scroll and drawer
  navigation; Phase 1 smoke tests ✅
- Production gate: `/design-system` without `ENABLE_DESIGN_SYSTEM` → **404** ✅
- Issues found and fixed during verification: external link accessible name lost its space; `aria-invalid` on
  radios (lint); Chromium Tab escaping the modal to browser UI (added wrap); carousel dots below the 24 px target
  size (axe `target-size`); e2e page crashes/timeouts against the dev server (W30); notFound() answering 200
  under the root loading boundary (W29).

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

- Approve Phase 4 (decisions W37–W39, backend B14).
- Recover the development database (incident 2026-10-17), then run `cms.spec.js` to close Phase 4 verification.
- Before production (Phase 10): set `TRUSTED_PROXY_HOPS` for the edge topology; multiple `web` instances would
  need shared refresh coordination (WO7).
- Logo artwork (WO5 otherwise resolved).
- Answer or accept defaults for **WO3, WO4, WO6–WO10** (Markdown renderer, maps/tiles, languages, instance
  count, CMS redirects, `/admin/media`, multi-membership partners).
- Backend dependencies: O2 (live payments), O8 (redirects), G3 (memberships list) — none blocks Phases 1–7.
