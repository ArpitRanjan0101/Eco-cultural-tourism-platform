# Sitemap — frozen route map (Phase 0)

Every page of the Next.js app, its file, access gate, rendering mode and the **confirmed** backend operations
it depends on (paths without the `/api/v1` prefix; every operation listed exists in
`docs/api/openapi.json`, see [API_MAPPING.md](API_MAPPING.md)). The URL structure follows the agreed target
folder structure; changes after the Phase 0 gate need owner approval and a new DECISIONS entry.

Legend — **Gate:** `—` public · `anon` signed-out only · `S` session · `S+V` session with verified email
(backend A5) · `PM` partner membership (backend partnerGuard) · `perm` permission (see
[PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md)). **Render:** `R` server-rendered with revalidation (W9) ·
`D` dynamic, `no-store` · `+C` with client islands.

## 1. Public — `src/app/(public)/`

| URL | File | Gate | Render | Confirmed operations | Phase |
|-----|------|------|--------|----------------------|-------|
| `/` | `page.jsx` | — | R | `GET /content/homepage` | 4 |
| `/explore` | `explore/page.jsx` | — | R | `GET /destination-categories`, `GET /destinations/featured`, `GET /regions`, `GET /districts` | 4 |
| `/destinations` | `destinations/page.jsx` | — | D+C | `GET /destinations` (page, limit, district, region, category, featured, q, sort), `GET /search/filters` | 4 |
| `/destinations/[slug]` | `destinations/[slug]/page.jsx` | — | R+C | `GET /destinations/{slug}`, `…/nearby`, `…/reviews`, `…/properties`, `…/experiences`, `…/guides` | 4–5 |
| `/districts` | `districts/page.jsx` | — | R | `GET /regions`, `GET /districts` | 4 |
| `/districts/[slug]` | `districts/[slug]/page.jsx` | — | R | `GET /districts/{slug}`, `GET /districts/{slug}/destinations` | 4 |
| `/stays` | `stays/page.jsx` | — | D+C | `GET /properties`, `GET /amenities` | 5 |
| `/stays/[slug]` | `stays/[slug]/page.jsx` | — | R+C | `GET /properties/{slug}`, `GET /properties/{id}/rooms`, `GET /properties/{id}/availability`, `GET /reviews` | 5 |
| `/guides` | `guides/page.jsx` | — | D+C | `GET /guides`, `GET /languages` | 5 |
| `/guides/[id]` | `guides/[id]/page.jsx` | — | R+C | `GET /guides/{id}`, `…/services`, `…/availability`, `GET /reviews` | 5 |
| `/experiences` | `experiences/page.jsx` | — | D+C | `GET /experiences` | 5 |
| `/experiences/[slug]` | `experiences/[slug]/page.jsx` | — | R+C | `GET /experiences/{slug}`, `GET /experiences/{id}/sessions`, `…/availability`, `GET /reviews` | 5 |
| `/packages` | `packages/page.jsx` | — | D+C | `GET /packages` | 5 |
| `/packages/[slug]` | `packages/[slug]/page.jsx` | — | R+C | `GET /packages/{slug}`, `GET /packages/{id}/departures`, `…/availability`, `GET /reviews` | 5 |
| `/search` | `search/page.jsx` | — | D+C | `GET /search`, `GET /search/suggestions`, `GET /search/nearby`, `GET /search/filters` | 4 |
| `/pages/[slug]` | `pages/[slug]/page.jsx` | — | R | `GET /content/pages/{slug}` | 4 |

Shared by every public page (layout): `GET /content/menus/{code}`, `GET /content/announcements`; signed-in
header state from the BFF session (`GET /auth/me`). Booking widgets, save buttons and review forms on detail
pages call `POST /bookings/quote`, `POST /bookings`, `POST /favorites`, `POST /reviews` (session required).

## 2. Auth — `src/app/(auth)/`

| URL | File | Gate | Render | Confirmed operations | Phase |
|-----|------|------|--------|----------------------|-------|
| `/login` | `login/page.jsx` | anon | D+C | BFF `POST /api/auth/login` → `POST /auth/login` | 3 |
| `/register` | `register/page.jsx` | anon | D+C | `POST /auth/register` | 3 |
| `/forgot-password` | `forgot-password/page.jsx` | — | D+C | `POST /auth/forgot-password` | 3 |
| `/reset-password` | `reset-password/page.jsx` | — | D+C | `POST /auth/reset-password` (token from email link) | 3 |
| `/verify-email` | `verify-email/page.jsx` | — | D+C | `POST /auth/verify-email` (token from email link), `POST /auth/resend-verification` | 3 |

## 3. Tourist account — `src/app/(tourist)/account/`

| URL | File | Gate | Render | Confirmed operations | Phase |
|-----|------|------|--------|----------------------|-------|
| `/account` | `page.jsx` | S | D | `GET /users/me`, `GET /bookings`, `GET /notifications/unread-count`, `GET /users/me/reviews` | 7 |
| `/account/profile` | `profile/page.jsx` | S | D+C | `GET/PATCH /users/me`, `GET /users/me/roles`, `POST /auth/change-password`, BFF logout-all, `POST /media/upload-init`, `…/upload-complete` | 7 |
| `/account/bookings` | `bookings/page.jsx` | S | D+C | `GET /bookings` | 7 |
| `/account/bookings/[id]` | `bookings/[id]/page.jsx` | S | D+C | `GET /bookings/{id}`, `…/status`, `…/documents`, `POST /bookings/{id}/cancel`, `GET /payments/booking/{bookingId}`, `GET /refunds/{id}`, `POST /reviews` | 7 |
| `/account/favorites` | `favorites/page.jsx` | S | D+C | `GET /favorites`, `DELETE /favorites/{type}/{id}` | 7 |
| `/account/trips` | `trips/page.jsx` | S | D+C | `GET /trips` | 7 |
| `/account/trips/new` | `trips/new/page.jsx` | S | D+C | `POST /trips` | 7 |
| `/account/trips/[id]` | `trips/[id]/page.jsx` | S | D+C | `GET/PATCH/DELETE /trips/{id}`, days and stops routes, `PATCH /trips/{id}/stops/reorder` | 7 |
| `/account/notifications` | `notifications/page.jsx` | S | D+C | `GET /notifications`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all` | 7 |

## 4. Booking — `src/app/(booking)/`

| URL | File | Gate | Render | Confirmed operations | Phase |
|-----|------|------|--------|----------------------|-------|
| `/checkout/[bookingId]` | `checkout/[bookingId]/page.jsx` | S+V | D+C | `GET /bookings/{id}`, `POST /bookings/{id}/payment-order` (Idempotency-Key), Razorpay Checkout, `POST /payments/verify` | 6 |
| `/payments/result` | `payments/result/page.jsx` | S | D | `GET /bookings/{id}/status`, `GET /payments/orders/{id}` | 6 |

## 5. Partner portal — `src/app/(partner)/partner/`

All pages: gate `S + PM` plus the page permission, render `D+C`, `X-Partner-Id` forwarded (W14).

| URL | Confirmed operations | Phase |
|-----|----------------------|-------|
| `/partner` | no membership → application form `POST /partners/apply`; else `GET /partners/me/dashboard` | 8 |
| `/partner/organization` | `GET/PATCH /partners/me` | 8 |
| `/partner/verification` | `POST /partners/me/documents`, media upload | 8 |
| `/partner/team` | `GET/POST /partners/me/users`, `PATCH/DELETE /partners/me/users/{userId}` | 8 |
| `/partner/properties` (+ nested pages) | `/partners/me/properties*` (create, edit, amenities, policies, media, rooms, room status/media) | 8 |
| `/partner/rooms` (+ `[roomId]` calendar) | `PUT /partners/me/rooms/{roomId}/inventory`, `…/rates`, `GET …/calendar` | 8 |
| `/partner/guides` (+ nested) | `/partners/me/guides*` (profile, languages, destinations, services, availability, documents) | 8 |
| `/partner/experiences` (+ nested) | `/partners/me/experiences*` (sessions, media) | 8 |
| `/partner/packages` (+ nested) | `/partners/me/packages*` (destinations, itinerary, inclusions, media, departures) | 8 |
| `/partner/bookings` (+ `[id]`) | `GET /partners/me/bookings`, `…/{id}`, `POST …/{id}/approve`, `…/reject` | 8 |
| `/partner/reports` | `GET /partners/me/reports/bookings`, `…/revenue` | 8 |

Nested page files (`new`, `[id]`, `[id]/rooms`, …) under each folder are designed in the Phase 8 LLD section;
the URL prefixes above are frozen.

## 6. Admin console — `src/app/(admin)/admin/`

All pages: gate `S + perm`, render `D+C`. Exact operations per page: API_MAPPING.md, Phase 9 rows.

| URL | Operation group | Phase |
|-----|-----------------|-------|
| `/admin` | `GET /admin/dashboard` | 9 |
| `/admin/users`, `/admin/roles` | `/admin/users*`, `/admin/roles*`, `/admin/permissions` | 9 |
| `/admin/geography` | `/admin/regions*`, `/admin/districts*`, `/admin/destination-categories*` | 9 |
| `/admin/destinations` | `/admin/destinations*` | 9 |
| `/admin/properties` | `/admin/properties*`, `/admin/amenities*` | 9 |
| `/admin/guides` | `/admin/guides*`, `/admin/languages*` | 9 |
| `/admin/experiences`, `/admin/packages` | `/admin/experiences*`, `/admin/packages*` | 9 |
| `/admin/partners` | `/admin/partners*` | 9 |
| `/admin/bookings`, `/admin/payments`, `/admin/refunds` | `/admin/bookings*`, `/admin/payments`, `/admin/refunds*` | 9 |
| `/admin/reviews` | `/admin/reviews*` | 9 |
| `/admin/cms` | `/admin/cms/*` (pages, sections, menus, redirects, announcements) | 9 |
| `/admin/notifications` | `/admin/notification-templates*` | 9 |
| `/admin/reports` | `/admin/reports/*` | 9 |
| `/admin/audit-logs` | `GET /admin/audit-logs` | 9 |
| `/admin/settings` | `GET/PATCH /admin/settings` | 9 |
| `/admin/media` | **no listing operation** (gap G2): proposed to drop (WO9) | — |

## 7. BFF and system routes — `src/app/`

| URL | File | Purpose | Phase |
|-----|------|---------|-------|
| `/api/auth/login`, `/logout`, `/logout-all`, `/session` | `api/auth/*/route.js` | Session handlers (W3, LLD §5) | 3 |
| `/api/v1/*` | `api/v1/[...path]/route.js` | Allowlisted forwarder (W5) | 3 |
| `/api/health` | `api/health/route.js` | Container healthcheck of `web` itself (does not call the backend) | 1 |
| `/bookings/:id` | `next.config.mjs` redirect | → `/account/bookings/:id` for backend email links (W18) | 3 |
| `/sitemap.xml` | `sitemap.js` | Published destinations, districts, supply, CMS pages, built from the public list operations above | 4 |
| `/robots.txt` | `robots.js` | Disallows `/account`, `/partner`, `/admin`, `/checkout`, `/api` | 4 |
| not found / error | `not-found.jsx`, `error.jsx`, `loading.jsx` | Shared states (W22) | 2 |

## 8. Email deep links (confirmed in backend `notifications.service.js`)

`/verify-email?token=…` · `/reset-password?token=…` · `/login` · `/forgot-password` · `/partner` ·
`/partner/bookings/:id` · `/bookings/:id` (redirected) · `/` — every one resolves to a route above.
