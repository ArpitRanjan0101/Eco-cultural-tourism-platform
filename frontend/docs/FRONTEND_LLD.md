# Frontend Low-Level Design — Jharkhand Eco & Cultural Tourism

Implementation-level design for the foundation shared by every feature: environment, backend client, BFF,
session, CSRF, data fetching, forms, conventions and tests. Feature-specific sections are added to this file
in the phase that builds them. Architecture and rationale: [FRONTEND_HLD.md](FRONTEND_HLD.md),
[DECISIONS.md](DECISIONS.md).

Status: **design only (Phase 0).** File names below are the planned locations; none exist yet.

## 1. Conventions

| Topic | Rule |
|-------|------|
| Language | JavaScript (ES2022) + JSX, ES modules. No TypeScript (W1). |
| Files | Components `PascalCase.jsx`; everything else `camelCase.js`; Next special files as Next names them (`page.jsx`, `layout.jsx`, `route.js`, …). |
| Imports | `@/…` alias from `src/`. Features export a public surface from `features/<f>/index.js`. |
| Client boundary | `'use client'` only in files that need state, effects, browser APIs or event handlers. Server-only modules start with `import 'server-only'`. |
| Styling | Tailwind utilities over design tokens (W20); variant maps in the component file; no inline hex values. |
| Data | Never parse money to `Number` for arithmetic; dates stay `YYYY-MM-DD` strings (W12). |
| Comments | Sparse, explain *why*; cite decision ids (`// W6: single-flight refresh`). |

### Feature module anatomy

```
features/<feature>/
  api.js            server-side loaders (use lib/api) for Server Components
  client.js         browser calls via lib/bff/browserFetch → /api/v1/*
  queryKeys.js      TanStack Query key factory
  schemas.js        Zod schemas for forms (UX mirror of backend limits)
  hooks/            useXxxQuery / useXxxMutation
  components/       feature components (may fetch through hooks)
  index.js          public exports
```

### Feature ownership (module map) — Proposed

Each backend operation group has exactly one owning feature; other features reuse it through that feature's
`index.js` (e.g. destination pages render `reviews` and `favorites` components; they never call those routes
themselves). Operation groups are **confirmed** (API_MAPPING.md); feature boundaries are **proposed**.

| Feature | Owns pages (SITEMAP) | Owns operations | Exported to others |
|---------|----------------------|-----------------|--------------------|
| `auth` | `(auth)/*`, session handlers | `/auth/*` | `useSession`, `RequireSession`, sign-in prompts |
| `home` | `/` | — (renders `cms`) | — |
| `geography` | `/districts`, `/districts/[slug]`, `/explore` | `/regions`, `/districts*`, `/destination-categories` | district/region pickers, `DistrictGrid` |
| `destinations` | `/destinations`, `/destinations/[slug]` | `/destinations*` (except supply/review sub-routes) | `DestinationCard` data adapters |
| `search` | `/search`, header search box | `/search*` | `SearchBox` |
| `properties` | `/stays`, `/stays/[slug]` | `/properties*`, `/amenities`, `/destinations/{slug}/properties` | `PropertyCard`, room list |
| `guides` | `/guides`, `/guides/[id]` | `/guides*`, `/languages`, `/destinations/{slug}/guides` | `GuideCard` |
| `experiences` | `/experiences`, `/experiences/[slug]` | `/experiences*`, `/destinations/{slug}/experiences` | `ExperienceCard`, session picker |
| `packages` | `/packages`, `/packages/[slug]` | `/packages*` | `PackageCard`, departure picker |
| `bookings` | booking widgets, `/account/bookings*`, `/payments/result` | `/bookings*` | `BookingWidget`, `BookingStatus` |
| `payments` | `/checkout/[bookingId]` | `/payments/*`, `/refunds/{id}`, `POST /bookings/{id}/payment-order` | `RazorpayCheckout`, payment/refund panels |
| `tourist` | `/account`, `/account/profile` | `/users/me*` (except reviews) | account shell nav |
| `trips` | `/account/trips*` | `/trips*` | "add to trip" action |
| `favorites` | `/account/favorites` | `/favorites*` | `SaveButton` |
| `reviews` | review sections and forms | `/reviews*`, `/destinations/{slug}/reviews`, `/users/me/reviews` | `ReviewList`, `ReviewForm`, `RatingSummary` adapter |
| `notifications` | `/account/notifications`, header badge | `/notifications*` | `NotificationBell` |
| `partners` | `/partner/*` | `/partners/apply`, `/partners/me*` | `PartnerSwitcher` |
| `admin` | `/admin/*` | `/admin/*` | — |
| shared `media` (in `lib/` + `components/forms/FileUpload`) | — | `/media/*` | `FileUpload` |
| `cms` (`src/cms/`) | `/pages/[slug]`, homepage sections, menus, announcements | `/content/*` (admin CMS editor lives in `admin`, using `cms/editor`) | `SectionRenderer`, `MenuTree` data |

## 2. Environment (`src/config/`)

Validated with Zod when the server starts; failure exits naming keys only (W19).

| Variable | Scope | Purpose |
|----------|-------|---------|
| `BACKEND_INTERNAL_URL` | server | Base URL of the private listener, e.g. `http://nginx:8081` |
| `INTERNAL_SERVICE_TOKEN` | server, secret | Same value as the backend's; never logged |
| `APP_ORIGIN` | server | Public origin of the site (`http://localhost:3000` in dev) for CSRF origin checks and absolute URLs; must equal backend `APP_WEB_URL` |
| `SESSION_COOKIE_SECURE` | server | `true` in production (enables `Secure` + `__Host-` prefix) |
| `TRUSTED_PROXY_HOPS` | server | How many forwarding hops to trust when deriving the client IP (W8) |
| `BACKEND_TIMEOUT_MS` | server | Per-request timeout to Express (default 10000) |
| `STORAGE_PUBLIC_ORIGIN` | server | Storage origin for CSP and `next/image` (`http://localhost:8333` in dev) |
| `NEXT_PUBLIC_SITE_NAME` | public | Display name only. **No secrets in `NEXT_PUBLIC_*`.** |

Files: `config/server-env.js` (server-only), `config/public-env.js`, `config/site.js`.

## 3. Server-only backend client (`src/lib/api/`)

```
lib/api/backendClient.js   request(method, path, { body, query, session, headers, signal, cache, revalidate })
lib/api/errors.js          BackendError (status, code, message, details, requestId)
lib/api/envelope.js        unwraps { success, data, meta } / throws BackendError
```

- Builds `BACKEND_INTERNAL_URL + path`; path parameters are encoded with `encodeURIComponent`.
- Always sends `X-Internal-Service-Token`; sends `Authorization: Bearer <access>` only when a session is
  passed; propagates `X-Request-Id` and `X-Client-Ip` from the incoming request context.
- `AbortSignal.timeout(BACKEND_TIMEOUT_MS)`; timeout → `BackendError` 504 `UPSTREAM_TIMEOUT`.
  Network failure → 502 `UPSTREAM_UNAVAILABLE`. These two codes are BFF-generated and documented in §8.
- No automatic retries (most mutations are not idempotent; idempotent ones carry `Idempotency-Key`).
- Default `cache: 'no-store'`; public loaders opt into `next: { revalidate }` explicitly (W9). Requests with a
  session are always `no-store`.
- Logs method, path template, status, duration and request id; never headers or bodies.

## 4. Session cookies (W6)

| Cookie (dev name / prod name) | Content | HttpOnly | SameSite | Max-Age |
|-------------------------------|---------|----------|----------|---------|
| `jt_at` / `__Host-jt_at` | access JWT | yes | Lax | until `accessTokenExpiresAt` |
| `jt_rt` / `__Host-jt_rt` | opaque refresh token | yes | Lax | until `refreshTokenExpiresAt` (absolute, backend A4) |
| `jt_csrf` / `__Host-jt_csrf` | random 32-byte token | **no** (read by the fetch helper) | Strict | session lifetime |
| `jt_partner` / `__Host-jt_partner` | selected partner id (W14) | yes | Lax | refresh lifetime |

All `Path=/`, no `Domain`. `Secure` when `SESSION_COOKIE_SECURE=true`. `Lax` (not `Strict`) on the session so
links from emails open signed in.

### Refresh in middleware

```
middleware(request):
  if path is static asset → next()
  at = cookie(jt_at); rt = cookie(jt_rt)
  if rt and (no at or exp(at) - now < 60 s):        # exp read from JWT payload, not trusted for auth
      result = singleFlight(sha256(rt), () => backend POST /auth/refresh {refreshToken: rt})
      ok   → set jt_at/jt_rt on response; rewrite request Cookie header with new values
      401  → clear session cookies; continue anonymous
      5xx  → keep cookies; continue (the page's own call will 401 if the token is unusable)
  ensure jt_csrf exists
  next()
```

`singleFlight` keeps an in-process map on `globalThis` from refresh-token hash → promise; settled results stay
for 30 s so parallel requests carrying the same old token reuse the same new pair instead of replaying a
rotated token (which backend A4 treats as theft). Valid for a single `web` instance (WO7). Phase 3 must verify
that middleware and route handlers share the map in the standalone server, and test N parallel requests with
an expiring token → exactly one backend refresh.

## 5. BFF route handlers (`src/app/api/`)

| Handler | Behaviour |
|---------|-----------|
| `api/auth/login/route.js` | CSRF + origin → backend `POST /auth/login` → set cookies → respond `{ success, data: { user } }` (tokens stripped) |
| `api/auth/logout/route.js` | backend `POST /auth/logout` with refresh token → clear cookies → 204 (cookies cleared even if backend fails) |
| `api/auth/logout-all/route.js` | backend `POST /auth/logout-all` (Bearer) → clear cookies → 204 |
| `api/auth/session/route.js` | `GET` → backend `GET /auth/me` when a session exists, else `{ data: null }`; used by client providers |
| `api/v1/[...path]/route.js` | allowlisted forwarder for every other contract operation (W5) |

Forwarder steps: (1) match `(method, /api/v1/<path>)` against `allowlist.generated.js` → else 404
`ROUTE_NOT_FOUND`; (2) for non-GET: origin + CSRF check (W7); (3) build headers per W8; (4) stream the request
body through unchanged (JSON only; size limit equal to nginx private listener `2m`); (5) return backend status,
body and `X-Request-Id`, plus `Idempotent-Replay` and `Retry-After` when present; nothing else is copied.

`lib/bff/` modules: `cookies.js`, `csrf.js`, `clientIp.js`, `refresh.js` (single-flight), `allowlist.generated.js`,
`forward.js`, `browserFetch.js` (the only client-side fetch helper: adds `X-CSRF-Token`, parses envelopes,
throws `ApiError` with `code`/`details`/`requestId`).

## 6. Data fetching (W9, W10)

- Server: `features/<f>/api.js` loaders call `lib/api`. Pages pass plain data to components as props.
- Client: hooks in `features/<f>/hooks/` call `features/<f>/client.js` through `browserFetch`.
- Query keys: `destinationKeys.all = ['destinations']`, `.list(filters)`, `.detail(slug)`; mutations
  invalidate by prefix.
- `QueryClient` defaults: `staleTime` 30 s, `retry` (failureCount < 2 and not a 4xx), mutations `retry: false`,
  `refetchOnWindowFocus` false for admin tables with unsaved state.
- Pagination follows the API: `page` (≥1), `limit` (≤100), `meta.{page,limit,total}`; list state lives in URL
  search params so pages are shareable and server-renderable.

## 7. Forms (W11)

- `useForm({ resolver: zodResolver(schema) })`; schema limits copied from the OpenAPI request schema of the
  target route (lengths, enums, formats), noted with the operation id in a comment.
- `applyApiErrors(error, setError)`: `VALIDATION_ERROR` → field errors from `details[]` (path → field name);
  any other code → form-level alert with the backend message; 5xx → generic message + `requestId`.
- Submit buttons disable while pending; idempotent operations (create booking, payment order, admin refund)
  generate one `Idempotency-Key` per user intent (kept across retries of the same submit, backend E7).

## 8. BFF-generated errors

The BFF answers in the backend envelope shape so the UI handles one format:

| Status | Code | When |
|--------|------|------|
| 403 | `CSRF_FAILED` | origin mismatch or missing/invalid CSRF token |
| 404 | `ROUTE_NOT_FOUND` | operation not in the contract allowlist |
| 413 | `PAYLOAD_TOO_LARGE` | body above the forwarding limit |
| 502 | `UPSTREAM_UNAVAILABLE` | Express/nginx unreachable |
| 504 | `UPSTREAM_TIMEOUT` | backend did not answer within `BACKEND_TIMEOUT_MS` |

`requestId` is always present (generated by the BFF when no upstream id exists).

## 9. Testing strategy (proposed, WO2)

| Layer | Tool | Covers |
|-------|------|--------|
| Unit | Vitest | formatters (money/date), error mapping, allowlist matching, CSRF, cookie options, single-flight |
| Component | Vitest + React Testing Library + axe | every catalogued component and variant; keyboard and labels |
| BFF integration | Vitest against a local fake backend | header injection/stripping, token never in responses, CSRF refusal, refresh single-flight, 401 handling |
| E2E | Playwright (Docker image) against the real dev stack | auth journey, browse → quote → book, account, partner and admin smoke flows |
| Static | ESLint (`next/core-web-vitals`), build check that no server env name appears in client chunks | |

All commands run in Docker (`docker compose run --rm web …`), defined in Phase 1.
