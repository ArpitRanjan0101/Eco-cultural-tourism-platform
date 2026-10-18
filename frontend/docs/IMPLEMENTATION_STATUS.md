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
| 4 | Public layout, CMS renderer and dynamic homepage (redefined by the owner's Phase 4 spec): header/navigation/footer/announcements, 16-section registry (+ backend B14), homepage, `/pages/[slug]`, SEO metadata, robots | Every section validated and rendered from real CMS data; drafts private; unsafe content never rendered; axe clean; tests in Docker | ✅ Approved (2026-10-18, owner) — `cms.spec.js` run and passed after the dev DB recovery |
| 5 | Geography, destinations, search and maps (owner's Phase 5 spec): regions/districts, destination list/detail, unified search + autocomplete, Leaflet/OSM maps, explore + near me, SEO | URL-driven filters per contract; real data only; maps lazy and coordinate-honest; tests in Docker | ✅ Approved (2026-10-18, owner) |
| 5b | Supply browsing: stays, guides, experiences, packages (lists, detail, availability, reviews) — cards already link to these routes | Detail pages show live availability from the API; empty/error states; E2E browse flows | ✅ Delivered (2026-10-18), **awaiting approval** |
| 6 | Booking and payments: quote, create (Idempotency-Key), checkout with Razorpay, verify, result, cancel | E2E quote → booking → checkout; `PAYMENTS_NOT_CONFIGURED` state verified; with test keys, sandbox payment confirmed via verify | ⏳ |
| 7 | Tourist account: profile, avatar upload, bookings, trips, favourites, own reviews, notifications | All `/account` routes; owner isolation visible as 404 states; E2E account journey | ⏳ |
| 8 | Partner portal: application, organisation, team, verification, all supply editors, calendars, bookings approve/reject, dashboard/reports | All 58 Phase 8 operations wired; partner E2E (onboard → supply → approve booking) | ⏳ |
| 9 | Admin console: users/roles, geography, destinations, moderation, partners, bookings/payments/refunds, reviews, CMS editor, templates, reports, audit, settings | All 87 admin operations wired; permission-filtered navigation; admin E2E smoke | ⏳ |
| 10 | Hardening and handover: a11y and performance pass, security review, production compose + nginx edge routing to `web`, docs | Production stack smoke test; final checklist signed off | ⏳ |

Operation counts per phase come from [API_MAPPING.md](API_MAPPING.md) and add up to all 242 contract operations.

## Phase 5b — delivered (2026-10-18)

- **Pages:** `/stays` (search, district, type of stay, destination via URL; API sorts; list/map; pagination),
  `/stays/[slug]` (hero, about, facts, live availability, rooms, amenities, policies, gallery, location map,
  reviews), `/guides` (search, language, destination; sorts), `/guides/[id]` (profile, facts, services, open
  dates, reviews), `/experiences` and `/experiences/[slug]` (facts, sessions with seats for a party size, gallery,
  reviews), `/packages` and `/packages/[slug]` (facts, itinerary, inclusions, departures with seats, gallery,
  reviews). Filtered lists are `noindex`; detail pages have canonical URLs and Open Graph images; the sitemap now
  lists the four sections and every published stay, guide, experience and package.
- **Modules (W44):** `features/supply` (shared presentational layer + `useAvailability`), per-type `schemas/`,
  `server/`, `services/` and components in `features/{properties,guides,experiences,packages}`,
  `features/reviews/server/reviews.server.js` + `ReviewsSection`; helpers `lib/url/listQuery.js`,
  `lib/bff/catalogue.js`, `lib/formatting/plural.js`, date helpers in `lib/formatting/dates.js`;
  `components/data-display/{AboutSection,GallerySection,PlainText}`; `filterChips`.
- **De-duplication of Phase 5 code (no behaviour change, all Phase 5 tests unchanged and passing):** destination
  query parsing now uses `parseListQuery`; destination/search/district chips use `filterChips`; destination
  filters and chip labels use the existing `geography.adapter` (it was committed but unused);
  `DestinationOverview`, `DestinationGallery`, `DestinationReviews` delegate to the shared sections; the booking
  badge, plurals and package duration have one implementation each; the e2e suites share `src/tests/e2e/helpers.js`
  (axe, Mailpit token, BFF client) instead of four copies.
- **Destination pages:** "See all N experiences/guides" links to the filtered lists; stays link to the district's
  stays without a count because the destination's stay section also includes stays within 25 km (W46).
- **Contracts used:** `GET /properties`, `/properties/{slug}`, `/properties/{id}/availability`, `/guides`,
  `/guides/{id}`, `/guides/{id}/availability`, `/languages`, `/experiences`, `/experiences/{slug}`,
  `/experiences/{id}/availability`, `/packages`, `/packages/{slug}`, `/packages/{id}/availability`, `/reviews`.
  Not used (data already in the detail DTO, or no matching filter): `/properties/{id}/rooms`, `/amenities`,
  `/guides/{id}/services`, `/experiences/{id}/sessions`, `/packages/{id}/departures` (W45). No new BFF routes; no
  backend file changed.
- **Decisions:** W44–W47. Booking widgets are Phase 6; the detail pages show availability only.

### Phase 5b verification (executed 2026-10-18, Docker)

- `npm run lint` → 0 ✅ · `npm test` → **22 files, 296 tests, 296 pass** ✅ (adds 38: list URL parsing for all four
  types with every out-of-contract value dropped; offered sorts and stay types checked against
  `docs/api/openapi.json`; stay/guide/session/departure form rules mirroring backend limits; Jharkhand-time
  dates across midnight and month/year ends; cancellation tier text; seat status from API flags only; guide slot
  grouping; 422/404/429 error text without internals; server fetchers cached, 404 → null, malformed slugs/ids
  never sent, 503 propagated; review subject validation; sitemap entries; filter form fields and kept URL-only
  filters; filtered vs unfiltered empty states; listing count/chips/pagination; stay availability request on
  load, rooms with API totals, no price on unbookable rooms, local validation before any request, Retry-After
  message; guide window request, day grouping, blocked windows, > 92-day refusal; session request with
  Jharkhand-midnight window, seat states, group-limit warning; departure request and re-check; rooms/amenities/
  policies/facts/services/itinerary/inclusions show only API data; destination "see all" links; axe on every
  interactive component).
- Production build ✅ (all 8 new routes dynamic); bundle check **84 client-visible files clean** ✅
- Playwright on the production build against the real backend → **41 passed** ✅ — the full set: Phase 1–4 suites,
  `cms.spec.js` (first run since the incident), Phase 5 discovery, and the new `supply.spec.js` (7): real supply
  created through partner and admin APIs (W47); stays search → type filter → empty state → chip removal → map
  marker, `noindex` on filtered lists, axe clean; stay detail facts/rooms/amenities/policies, live availability
  from `/properties/:id/availability` (3 rooms left, ₹2,000), 4 rooms → "Not available", "No reviews yet", axe
  clean, unknown slug 404; guides language filter → profile → services → the published window on its date, axe
  clean, malformed id 404; experiences destination chip → 4 seats for 2 people, "Only 4 seats left" for 5, 9
  people refused locally, axe clean; packages sort in the URL → itinerary with destination link, inclusions,
  departure dates and seats, re-check for 7, axe clean; 375 px stay page without horizontal scroll; sitemap
  lists the new pages. Afterwards the stay, guide, experience, package and partner were confirmed `suspended` in
  the database.
- Issues found and fixed: the e2e sign-in helper sent the whole account object (strict login schema → 422);
  `₹2,000` matched both the room total and the collapsed nightly table (locator narrowed); the itinerary heading's
  hidden separator produced "Day 1 · : …" for screen readers (simplified); unit workers timed out while the dev
  server's polling watcher used 1.1 GB/45 % CPU of the Docker VM (dev server stopped during test runs).

## Development database recovery (2026-10-18)

- Removed the four backend-test fixture destinations left by the 2026-10-17 incident (`hundru-falls`,
  `dassam-falls`, `ranchi-lake`, `draft-falls`, identified by their fixture text; no dependent supply existed),
  then ran the documented `docker compose run --rm api npm run db:seed`: bootstrap super admin restored, eight
  demo destinations re-created, reference data unchanged (idempotent seeds).
- `cms.spec.js` then ran with `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` taken from the root `.env` in the shell → **2
  passed**, closing Phase 4 verification.
- Not restored (gone since the incident, not re-creatable from seeds): audit history before 2026-10-17 09:32 and
  any pre-incident partner/booking/CMS/media rows. The 15 Oct backup is still available if those are needed.

## Phase 5 — delivered (2026-10-17)

- **Pages:** `/explore` (search, types of place with live counts, regions, featured, near me), `/districts`
  (region filter, list/map), `/districts/[slug]` (hero, places with filters/sort/list-map/pagination),
  `/destinations` (filters, supported sorts, chips, list/map, pagination), `/destinations/[slug]` (hero,
  overview, visiting info, gallery, FAQ, related; streamed: nearby + map, stays/experiences/guides nearby,
  reviews + rating summary), `/search` (combobox autocomplete, type tabs, sidebar/drawer filters, chips, empty
  states, capped pagination), `/sitemap.xml`, `robots.txt` with absolute sitemap; `(public)/error.jsx` and
  `(public)/not-found.jsx` inside the site chrome.
- **Modules:** `features/geography`, `features/destinations`, `features/search`, `features/reviews` (components,
  `server/` fetchers, `schemas/`, `services/`, `hooks/`); `components/maps` (W40); `components/navigation`
  `SortSelector`, `ActiveFilterChips`, `ResultsPagination`; `Rating`; `lib/url/query.js`;
  `lib/bff/publicApi.js` (`getCatalogue` cached, `getLive` per request with client IP, W41).
- **Contracts used:** `/regions`, `/districts`, `/districts/:slug`, `/districts/:slug/destinations`,
  `/destination-categories`, `/destinations`, `/destinations/featured`, `/destinations/:slug` (+ `/nearby`,
  `/experiences`, `/properties`, `/guides`, `/reviews`), `/search`, `/search/suggestions`, `/search/nearby`,
  `/search/filters`. No new BFF routes (W41); browser calls use the allowlisted forwarder.
- **Dependency:** `leaflet` 1.9.4 (WO4 resolved). `HomeSearchSection` now uses the shared `GlobalSearch`.

### Phase 5 verification (executed 2026-10-17, Docker)

- `npm run lint` → 0 ✅ · `npm test` → **19 files, 258 tests, 258 pass** ✅ — adds: URL state (`hrefWith` keeps
  filters, resets page), destination/search query parsing drops every out-of-contract value, sort options =
  advertised sorts, search window cap (page ≤ 41 at 12/page), suggestion links; map places only from valid API
  coordinates, popup built from text (markup in names inert), OSM link; region filter `aria-current`;
  destination filters = supported fields only, GET, sort kept; distance display; opening hours open / Closed /
  "No hours published"; rating summary never invents a score; sort selector keeps filters and submits on change;
  pagination keeps filters and respects the cap; chips; map/list toggle (map loaded only on demand, hidden
  without coordinates); search tabs (filter-limited types unavailable); typed results (unknown skipped);
  combobox autocomplete via BFF (↓/↑/Enter/Escape, Escape keeps the query); near me requests nothing until
  asked, explains refusal, sends real coordinates; server fetchers (cached catalogue without headers, 404 →
  null, invalid slugs never sent, 503 propagates, search uncached with client IP).
- Production build ✅; bundle check **73 client-visible files clean** ✅
- Playwright on the production build against the real backend → **32 passed** ✅ (Phase 1–4 suites + 8
  discovery tests: destination filters/sort/chips through the URL with invalid params ignored and axe clean;
  Leaflet map loaded on demand with a keyboard-focusable marker opening a popup link and OSM attribution;
  destination detail h1/breadcrumbs/visiting info/reviews/nearby map, axe clean, unknown slug → 404 page;
  districts region filter + district page; search autocomplete by keyboard, results, type tab and district
  filter in the URL, no-results state, axe clean; mobile filter drawer, no horizontal scroll; explore near me →
  `/search/nearby` 200 → cards + map (device position stubbed, W43); sitemap/robots absolute URLs). OSM tile
  requests are answered locally in tests.
- **Still not run (at the time):** `cms.spec.js` (Phase 4) — the dev database had no admin account (incident
  below). Run and passed on 2026-10-18 after the recovery.
- Issues found and fixed: stale dev `node_modules` after adding Leaflet (container recreated with fresh
  volumes); Escape in the search box also cleared the query (Chrome search-field default) — now only closes the
  suggestions; the Phase 4 CMS test needed the app providers for the shared search; an import cycle between the
  geography and destinations features; half-star glyph unsupported in common fonts.
- Data note: the dev database currently holds only the test-created destinations left by the incident (Dassam
  Falls, Hundru Falls, Ranchi Lake); the e2e suite discovers its sample through the API and does not assume names.

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
- **Not run at delivery:** `cms.spec.js` (admin creates, publishes, renders and archives a landing page with live
  sections) — the dev database had lost its admin account in the incident below. **Run on 2026-10-18 after the
  recovery → 2 passed** (see "Development database recovery").
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

- Approve Phase 5b (decisions W44–W47). Phases 4 and 5 were approved on 2026-10-18.
- Before launch: replace the OpenStreetMap tile URL with a dedicated provider (`src/config/maps.js`, OSM tile
  usage policy).
- Full browser runs (CMS and supply suites) need the admin credentials in the shell:
  `$env:E2E_ADMIN_EMAIL='…'; $env:E2E_ADMIN_PASSWORD='…'` before the `e2e` run (W39, W47).
- Before production (Phase 10): set `TRUSTED_PROXY_HOPS` for the edge topology; multiple `web` instances would
  need shared refresh coordination (WO7).
- Logo artwork (WO5 otherwise resolved).
- Answer or accept defaults for **WO3, WO4, WO6–WO10** (Markdown renderer, maps/tiles, languages, instance
  count, CMS redirects, `/admin/media`, multi-membership partners).
- Backend dependencies: O2 (live payments), O8 (redirects), G3 (memberships list) — none blocks Phases 1–7.
