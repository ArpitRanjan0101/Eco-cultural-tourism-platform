# Implementation Status

Read this first in every new session. Scope: [architecture/SCOPE_INVENTORY.md](architecture/SCOPE_INVENTORY.md) ·
design: [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) · decisions/open questions:
[architecture/DECISIONS.md](architecture/DECISIONS.md).

**Rule:** one phase at a time; the next phase starts only after explicit owner approval.

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Audit, inventories, architecture docs | ✅ Done (2026-10-15) |
| 1 | Docker, foundation, PostgreSQL/PostGIS, Redis, env validation, health, migrations | ✅ Verified (2026-10-15) |
| 2 | Auth, JWT, service token wiring, users, roles, permissions | ✅ Verified (2026-10-15) |
| 3 | Geography, destinations, CMS, media, search | ✅ Verified (2026-10-15) |
| 4 | Partners, hotels, inventory, guides, experiences, packages | ✅ Verified (2026-10-15) |
| 5 | Booking engine, concurrency, reservation lifecycle | ✅ Verified (2026-10-15) |
| 6 | Payments, webhooks, cancellations, refunds, reconciliation | ✅ Verified (2026-10-15) |
| 7 | BullMQ, outbox, notifications | ✅ Verified (2026-10-15) |
| 8 | Trips, favorites, reviews | ✅ Verified (2026-10-15) |
| 9 | Admin, analytics, audit, settings | ✅ Verified (2026-10-15) |
| 10 | Integration/security testing, API docs, production deployment | ✅ Verified (2026-10-16) — all phases complete |

## Phase 1 — delivered

- **Docker:** `backend/Dockerfile` (multi-stage `dev`/`prod`, non-root `node` user, `npm ci` from committed lockfile),
  `docker-compose.yml` (api, worker, postgres `postgis/postgis:16-3.5`, redis `7.4.2-alpine` AOF + `noeviction`,
  nginx `1.27.3-alpine`), named volumes `postgres_data`/`redis_data`, `internal` network with no egress and no published DB/Redis ports.
- **Nginx:** public listener `:80` (host `NGINX_PUBLIC_PORT`) exposes only `/health/live` and `/api/v1/webhooks/payments/*`
  (POST, rate-limited, inbound service-token header stripped); private listener `:8081` (host `127.0.0.1` only in dev) for the BFF.
- **Config:** zod-validated env (`src/config/env.js`), fails fast naming keys only; test runs refuse non-`_test` databases;
  production rejects placeholder secrets and non-https base URL; service-token rotation via `INTERNAL_SERVICE_TOKEN_PREVIOUS`.
- **Core:** request id, pino logging with secret redaction, `ApiError` + standard error envelope, body-parser / PostgreSQL
  error mapping, zod `validate()` middleware (`req.valid`), constant-time service-token guard, `withTransaction()` with
  isolation levels and serialization-retry, helmet, CORS allowlist, `Cache-Control: no-store` on API, graceful shutdown.
- **Database:** checksummed SQL migration runner with up/down pairs, advisory lock, atomic per-migration transactions;
  idempotent seed runner; migration `0001_baseline_extensions` (postgis, citext, btree_gist, `set_updated_at()`).
  DATE → string, NUMERIC → string, session TZ UTC.
- **Health:** `GET /health/live` (public), `GET /health/ready` and `GET /health/version` (service token). Readiness gates on
  PostgreSQL, Redis, zero pending migrations; reports worker heartbeat without gating.
- **Worker:** separate container, same image; Redis heartbeat (`workers:heartbeats` sorted set), graceful shutdown.
  Queue processors are added in Phases 5–7.
- **OpenAPI:** zod-to-openapi registry (`src/docs/openapi.js`), served at `GET /api/v1/openapi.json`, exported to `docs/api/openapi.json`.

### Phase 1 verification (executed 2026-10-15)

- `docker compose build` ✅ · `docker compose up -d` → api healthy, worker up, postgres/redis healthy, nginx up ✅
- `db:migrate` applied 1, re-run no-op ✅ · `db:seed` (no seeds yet) ✅ · `db:status` ✅
- `npm test` → **30 tests, 30 pass, 0 fail** (unit: env, service token, validation; integration: full rollback/re-apply of
  all migrations, atomic failed migration, checksum tamper detection, transaction commit/rollback, serializable retry with
  5 concurrent increments, DATE/NUMERIC parsing, PostGIS distance; API: health, 401/404 envelopes, request id, 400/413 bodies,
  security headers, CORS) ✅
- `npm run lint` → 0 problems ✅
- Host probes: public `:8080` → `/health/live` 200; `/health/ready`, `/api/v1/*` 404. Private `:8081` → `/health/ready` 200
  with token (db, redis, migrations, worker up); `/api/v1/openapi.json` 401 without token ✅
- PostgreSQL/Redis have no host port bindings ✅ · prod image runs as `node` without dev deps ✅ · SIGTERM graceful shutdown logged ✅

## Phase 2 — delivered

- **Migrations:** `0002_identity` (9 identity/RBAC tables), `0003_audit_outbox` (append-only `audit_logs`, `outbox_events`),
  `0004_rbac_catalog` (6 roles, 48 permissions, default grants; super_admin = all).
- **Auth module** (`modules/auth`): scrypt passwords, HS256 access JWT, opaque rotating refresh tokens (hashed, family reuse
  detection, absolute expiry), email verification + password reset tokens (hashed, single-use, outbox-queued emails),
  login lockout, `authenticate` + `requirePermissions` middleware, `sessions.service` for cross-module session revocation.
- **Users module** (`modules/users`): profile self-service, admin search/detail/status/roles, role/permission management,
  privileged-account policy, audit records on every admin change.
- **Audit module** (`modules/audit`): `record()` writer used inside the same transaction as the change.
- **Core additions:** route-definition helper (`core/http/routes.js`) driving both Express wiring and OpenAPI; Redis rate
  limiter; `X-Client-Ip` resolution; pagination/sort/LIKE-escape helpers; outbox writer; request context.
- **Seed:** `001_bootstrap_super_admin` from `BOOTSTRAP_ADMIN_*` (idempotent).
- **Infra:** nginx strips `X-Client-Ip` publicly and re-resolves the api upstream (`resolve`).
- Decisions A1–A15 in DECISIONS.md.

### Phase 2 verification (executed 2026-10-15)

- `db:migrate` applied 0002–0004 on the dev DB ✅ · `db:seed` twice (idempotent) ✅
- `npm test` → **64 tests, 64 pass, 0 fail** — includes register/verify/login/refresh/logout chain, refresh-reuse family
  revocation, enumeration-safe responses, lockout per account+IP, suspended login, logout vs logout-all, reset/change password
  session effects, JWT forgery (wrong aud/secret, alg=none, expired), service-token + bearer both required, profile update and
  phone conflict, 403 on admin routes for tourist/partner, search/filter/sort/pagination, suspension revoking sessions,
  privileged-target and self-modification protection, delegated roles.assign limits, immediate permission changes,
  super_admin immutability, audit contents and append-only enforcement, per-IP registration rate limit, and the full
  migration rollback/re-apply ✅
- `npm run lint` → 0 problems ✅
- Via nginx private listener: bootstrap super admin login, `GET /admin/roles` (super_admin 48 permissions), OpenAPI 23 paths /
  24 operations ✅; public listener returns 404 for `/api/v1/auth/login` ✅
- Recreating the api container no longer breaks nginx (502 fixed) ✅

## Phase 3 — delivered

- **Migrations:** `0005_media_assets` (+ `pg_trgm`, avatar FK), `0006_geography_destinations` (8 tables, GiST/GIN/FTS
  indexes, publish CHECK), `0007_cms` (6 CMS tables, single-homepage index).
- **Storage:** `config/storage.js` (internal + presign S3 clients), `npm run storage:init`, SeaweedFS `storage` service with
  anonymous read on public buckets only (B1, B13).
- **Modules:** `media` (two-step verified uploads, private signed URLs, reference-safe delete), `geography` (regions,
  districts), `destinations` (destinations, categories, gallery, FAQs, related, nearby, FTS), `cms` (allowlisted sections,
  public rendering, menus, redirects, announcements), `search` (unified, suggestions, nearby, filters). Users: `avatarMediaId`
  + `avatarUrl`.
- **Core:** `fields.js` (shared validators), `sql.js` (allowlisted UPDATE builder, PostGIS point, audit diff),
  `dbErrors.js`, `slug.js`; `audit.auditedTransaction()` used by all admin mutations.
- **Seeds:** `002_jharkhand_geography`, `003_destination_categories`, `900_demo_destinations` (non-production, unverified).
- Decisions B1–B13; open O8 (public redirects read route).

### Phase 3 verification (executed 2026-10-15)

- `db:migrate` applied 0005–0007 ✅ · `storage:init` created buckets ✅ · `db:seed` (4 files) ✅
- `npm test` → **86 tests, 86 pass, 0 fail** — adds: purpose permission/type/size limits; real presigned upload to SeaweedFS
  and anonymous public read; signature-mismatch rejection; size-tampered PUT refused; private document signed URL (owner/
  admin only, unsigned denied); avatar set + in-use delete 409; 24 seeded districts/5 regions; inactive district hidden;
  audited admin geography with 409 slug conflicts; draft→publish requirements→archive; gallery/cover/FAQ/related (drafts
  hidden); list filters/sort/pagination; PostGIS nearby ordering; permission splits (read/manage/publish, cms.publish);
  section allowlist rejecting HTML/`javascript:`/protocol-relative links/unknown ids; draft pages hidden; homepage render
  with resolved media and published-only cards; CMS-referenced media protected; menu tree with disabled branch hidden;
  redirects; announcement windows; unified/typed/fuzzy search, suggestions, nearby, facets; full 7-migration rollback ✅
- `npm run lint` → 0 problems ✅ · OpenAPI: 70 paths / 85 operations ✅
- Host E2E via nginx `:8081`: admin login → upload-init (URL signed for `localhost:8333`) → `curl` PUT 200 → complete
  `ready` → anonymous public GET 200 → delete 204; demo destinations list/nearby/search ✅

## Phase 4 — delivered

- **Migrations:** `0008_partners` (4), `0009_accommodation` (10), `0010_guides` (7, GiST no-overlap availability),
  `0011_experiences_packages` (10). `booking_mode` columns (O3).
- **Modules:** `partners` (apply, org self-service, team roles, documents, admin review/status with history, role sync,
  partner-context guard), `properties` (properties, rooms, amenities, policies, galleries, inventory/rate calendars,
  availability), `guides` (profiles, languages, destinations, services, availability windows, verification), `experiences`
  (sessions, seats), `packages` (destinations, itinerary, inclusions, departures, derived end dates, starting price).
  Deferred destination routes (`/experiences`, `/properties`, `/guides`) delivered. Search: property/guide/experience/package
  + nearby properties.
- **Core:** `mediaLinks.js`, `moderation.js`, `money.js` (paise arithmetic), `dates.js` (Asia/Kolkata), shared `fields`
  (money/date/time/bookingMode), route `anyPermissions`/`middleware`/`headers`. Users: `syncManagedRoles`, `findAccountByEmail`;
  media: `buildGalleries`, `getForAuthorizedReview`.
- **Seed:** `004_amenities_languages`. Decisions D1–D12.

### Phase 4 verification (executed 2026-10-15)

- `db:migrate` applied 0008–0011 ✅ · `db:seed` (5 files) ✅ · 175 routes / OpenAPI 178 operations ✅ · lint 0 ✅
- `npm test` → **98 tests, 98 pass, 0 fail**, run twice (repeatable) — adds: application → restricted until approval →
  supply role granted; documents with signed review URLs; invalid transitions 409; reject needs notes; FIELD_LOCKED after
  approval; suspension revokes roles; resubmission; self-review blocked; team rules (verified users only, manager limits,
  last owner, self-role), role sync on join/leave; X-Partner-Id selection and refusal; property lifecycle with ownership
  isolation (rival 404), publish requirements, room name conflict, amenities, policies, inventory/rate calendars with
  validation (over-physical, blocked>total, past), indicative availability (tightest night, decimal-safe totals, occupancy),
  destination-radius properties, reject→resubmit; suspended partner hides supply; partner-type supply restrictions; guide
  overlap rejection, verification flow, language/destination filters, blocked windows hidden, suspension; experiences
  publish requirements, session time/capacity rules, seat availability, delete; packages nights rule, itinerary bounds,
  derived departure end dates, duplicate start 409, starting price, publish; search by property name and nearby properties ✅
- Host via nginx: amenities 19, languages 11, admin partner review, `/partners/me` 403 for non-members ✅
- Test infra: role-permission edits in tests now restore themselves (`withoutPermissions`); test DB rebuilt once from
  migrations to repair grants modified by earlier runs.

## Phase 5 — delivered

- **Migration:** `0012_bookings` — 7 booking tables (GiST guide no-overlap on holds), `platform_settings` (seeded O4 timings,
  0% tax, default cancellation policy), `idempotency_records`.
- **Bookings module:** quote; idempotent create (instant hold / request-to-book); own list/detail/status/documents/cancel;
  partner list/detail/approve/reject; admin search/detail/audited cancel; `confirmAfterPayment` (for Phase 6);
  `runMaintenance` (expiry + completion) run by the worker every 30 s. `allocations.service` for supply modules.
- **Supply modules:** `prepareBooking` per type with row locks; availability subtracts reservations; change guards
  (inventory/capacity below reservations, session/departure changes, guide windows) → 409.
- **Core/settings:** `core/database/idempotency.js`, `settings` service (code defaults + DB overrides), `localDateTime`,
  `actorEmailVerified` in request context, `TEST_LOG_LEVEL`. Decisions E1–E11.

### Phase 5 verification (executed 2026-10-15)

- `db:migrate` applied 0012 ✅ · 189 routes / 192 OpenAPI operations ✅ · lint 0 ✅ · worker restarted with sweep ✅
- `npm test` → **109 tests, 109 pass, 0 fail**, three consecutive runs — adds: quote without reservation, decimal-exact
  totals, Idempotency-Key required/replay/reuse-conflict, verified-email requirement, 15-min hold, price snapshot unaffected
  by later rate changes, inventory reduction below reservations refused; **6 concurrent buyers for the last room → exactly 1
  booking**; **4 concurrent buyers for one guide slot → exactly 1**, overlap/out-of-window/group-size refusals, free-time
  calculation, booked windows protected; experience seats counted once under concurrency, session delete/capacity guards;
  request-to-book reserves nothing until approval, 24 h windows, foreign partner 404, approval capacity re-check, rejection,
  departure move blocked; free cancellation releases capacity; confirmation after payment, refund from snapshotted policy
  (80% → 3200.00) despite later policy edit, refund event, admin fee waiver + audit; refund tier maths; lapsed hold frees
  capacity before the sweep, late confirmation refused (`HOLD_EXPIRED`, `BOOKING_EXPIRED`), expiry history; completion
  sweep; tourist/partner/admin isolation ✅

## Phase 6 — delivered

- **Migration:** `0013_payments` (payment_orders, payment_transactions, payment_webhook_events, refunds; unique provider ids,
  one automatic refund per booking/kind).
- **Payments module:** Razorpay adapter; payment-order (idempotent, order reuse); verify (signature + provider fetch +
  capture); webhook ingress (public, signed, persisted, idempotent); settlement with late-payment re-acquisition or
  refund and duplicate-payment refunds; refunds (cancellation sweep, receipt-based duplicate protection, retries,
  manual partial refunds); reconciliation; admin search. Worker runs payment maintenance with the booking sweep.
- **Bookings interfaces:** `reconfirmLatePayment`, `setPaymentStatus`, `applyRefundOutcome`,
  `listCancellationsAwaitingRefund`; transition `expired → confirmed` (late payment only).
- **App/config:** raw body capture for webhook HMAC; `auth: 'webhook'` routes before the service-token gate;
  `PAYMENT_*` env (Report §10.2). Decisions F1–F10.

### Phase 6 verification (executed 2026-10-15)

- `db:migrate` applied 0013 ✅ · 199 routes ✅ · lint 0 ✅ · api/worker restarted ✅
- `npm test` → **120 tests, 120 pass, 0 fail**, two consecutive runs — adds (against the in-process fake Razorpay):
  order creation in paise + reuse; forged signature 400; foreign user 404; verify confirms once (repeat verify no-op);
  amount mismatch refused; failed then authorized→captured payments; webhook forged signature 400, unknown provider 404,
  duplicate event id acknowledged, webhook+order.paid+callback → one transaction and one confirmation, payload redaction,
  ignored events; webhook processing failure retried by maintenance; late payment re-confirmed when capacity free and
  fully refunded (no overbooking) when not; duplicate capture refunded with booking still paid; lost callback/webhook
  reconciled; paid cancellation → exactly one provider refund, refund status visible, refund.failed webhook cannot regress
  a succeeded refund; failed refund + lost-response retry adopts the existing provider refund (no second refund);
  partial admin refund with idempotency, over-refund 409, permissions, audit ✅
- nginx public edge: `POST /api/v1/webhooks/payments/razorpay` reaches the API (503 until keys are set), GET denied,
  other API paths 404 ✅
- To exercise real Razorpay test mode: set `PAYMENT_KEY_ID/SECRET` (rzp_test_…) and `PAYMENT_WEBHOOK_SECRET`, expose
  the public edge, and register `<PUBLIC_BASE_URL>/api/v1/webhooks/payments/razorpay` in the Razorpay dashboard.

## Phase 7 — delivered

- **Migration:** `0014_notifications_outbox` — notification_templates (25 seeded), notifications, notification_deliveries;
  outbox retry columns; `booking_document` media purpose.
- **Jobs:** `jobs/queues.js` (8 queues, retry/backoff/retention), `jobs/dispatcher.js` (outbox → queues, token scrub),
  `jobs/runtime.js` (workers + job schedulers), `worker.js` now BullMQ-only. Processors: outbox dispatch, booking sweep,
  vouchers, payment reconciliation, cancellation refunds + refund sweep, notify/send-email, image processing, housekeeping.
- **Modules:** `notifications` (event fan-out, SMTP sending, inbox, admin templates), media processing/generated documents/
  stale-upload purge, voucher PDFs, payments split into `refundCancellation`/`sweepRefunds`/`reconcile`, retention purges.
- **Infra/config:** Mailpit service, `SMTP_*`, `EMAIL_FROM`, `APP_WEB_URL`; readiness `jobs` check. Decisions G1–G10.

### Phase 7 verification (executed 2026-10-15)

- `db:migrate` applied 0014 ✅ · 205 routes ✅ · lint 0 ✅
- `npm test` → **129 tests, 129 pass, 0 fail**, two consecutive runs — adds (real BullMQ runtime + Mailpit + fake Razorpay):
  verification email delivered once with a working link, token scrubbed from the stored event, re-dispatch does not email
  twice; dispatch failure → pending with backoff; confirmation → one voucher PDF (downloadable, idempotent) + guest and
  partner notifications + email; paid cancellation refunded via refund-processing queue + refund notification;
  request-to-book emails partner members; inbox list/unread/mark read/read-all with owner scoping; template edit changes
  the subject, inactive template suppresses email, audited; uploaded image dimensions recorded and metadata stripped;
  stale uploads purged ✅
- Dev stack: worker starts 8 queues with schedules; register via nginx → email in Mailpit within seconds; readiness
  `jobs: up, outboxPending: 0` ✅
- Restart resilience: worker stopped → registration event stays pending (readiness shows backlog 1) → worker started →
  email delivered ✅
- Test infra: test reset restores migration-seeded templates (TRUNCATE users CASCADE empties them via `updated_by`).

## Phase 8 — delivered

- **Migration:** `0015_trips_reviews_favorites` — trips, trip_days (derived dates), trip_stops (deferred unique order),
  favorites, reviews (verified-booking CHECK, partial unique indexes, moderation trail).
- **Modules:** `trips` (12 routes: trips, days, stops, cross-day reorder), `favorites` (3), `reviews` (6 + deferred
  `GET /destinations/:slug/reviews`), `subjects` (polymorphic subject → public card resolution via owning modules).
- **Interfaces added:** supply `getPublicCardsByIds`, `bookingsService.getReviewableBooking`, `usersService.getDisplayNames`.
- Decisions H1–H8; open O9 (own-reviews list route).

### Phase 8 verification (executed 2026-10-15)

- `db:migrate` applied 0015; rollback of 0015 + re-apply on the dev DB ✅ · 227 routes / 230 OpenAPI operations ✅ · lint 0 ✅
- `npm test` → **135 tests, 135 pass, 0 fail**, two consecutive runs — adds: dated trip creates days; stop title from
  destination, unknown destination/time-order refusals; cross-day reorder with completeness check; renumbering after delete;
  owner isolation (404 for others); re-dating days, DAYS_OUTSIDE_RANGE, DAY_EXISTS, undated trips, draft-only delete with
  cascade; permission 403; favorites idempotent 201/200, non-public 404, type filter, suspended item shown unavailable,
  remove 404 for others; verified reviews only from the author's completed booking of that item, one per booking, pending
  until approved, public view without moderation fields, rating summary, edit returns to pending; one destination review
  per user, moderation queue order, note required, audit row, `/destinations/:slug/reviews`, admin-only moderation ✅
- Via nginx `:8081`: `/reviews` 422 without subject, `/trips` `/favorites` `/admin/reviews` 401 without user, unknown
  destination reviews 404 ✅
- Test fix: the Phase 7 request-to-book email test now waits for the specific subject (the operator also receives the
  partner-approval email, which made it order-dependent).

## Phase 9 — delivered

- **Migration:** `0016_reporting_indexes` (bookings created/upcoming, captured payments by `paid_at`, succeeded refunds by
  `processed_at`).
- **Modules:** `analytics` (platform dashboard, bookings/revenue/destination/partner reports; partner dashboard and own
  bookings/revenue reports), `settings` routes (list with defaults, validated atomic audited update, `null` = reset),
  `audit` search route (`audit-search.service.js`), `GET /users/me/reviews` (approved addition O9).
- **Interfaces added:** `usersService.getUserRefMap`. Test reset clears the settings cache.
- Decisions I1–I9. All 241 register routes + 1 approved addition implemented.

### Phase 9 verification (executed 2026-10-15)

- `db:migrate` applied 0016; rollback + re-apply on the dev DB ✅ · 239 routes / 242 OpenAPI operations ✅ · lint 0 ✅
- `npm test` → **141 tests, 141 pass, 0 fail**, two consecutive runs — adds (real payment via fake Razorpay + admin refund):
  bookings report totals/average/by type, 30 daily buckets with today's figures, monthly grouping, type filter; revenue
  1000.00 captured − 200.00 refunded = 800.00 by type/period/partner, empty past range with filled buckets, invalid
  ranges/groupBy 422; destination ranking with attributed booking value, favorites, trip stops; partner ranking and
  type filter; platform dashboard figures and attention queue; admin-only 403; partner dashboard/reports scoped to the
  organisation (no `partnerId` override), non-partner 403; settings list/defaults, super-admin-only write, per-key
  validation, new hold window applied to the next booking, reset to default, per-key audit rows; audit search by
  action prefix, entity, actor, local date range, invalid input 422, permission 403; own reviews with moderation note and
  item card, status filter, owner scoping ✅
- Dev stack via nginx `:8081` as the bootstrap super admin: dashboard, all four reports, settings, audit logs, own
  reviews → 200 ✅

## Phase 10 — delivered

- **Database roles:** `src/database/roles.js`, `npm run db:roles`, automatic re-sync after `db:migrate`;
  `DATABASE_APP_USER`/`DATABASE_APP_PASSWORD` env (paired, validated; placeholder checks extended to connection URLs).
- **Production deployment:** `docker-compose.prod.yml`, `infrastructure/nginx/prod.conf` (TLS edge, ACME webroot, private
  BFF listener on the `bff` network), `.env.production.example`, runbook `docs/operations/DEPLOYMENT.md`.
- **Backups:** `infrastructure/backup/{backup,restore,verify-restore}.sh`, `backup` service (`--profile ops`) in both
  compose files, `npm run storage:verify`.
- **API docs:** Swagger UI `docs/api/index.html`, served at `http://localhost:8081/docs/` in development.
- **Security:** dependency upgrades clearing every `npm audit` finding (J5), S3 checksum compatibility (J6),
  `tests/api/security.test.js` (route-registry audit + HTTP hardening), `tests/integration/roles.test.js`,
  `tests/e2e/journey.test.js`, env tests for the new rules.
- **Fixes found by verification:** PostgreSQL TCP healthcheck (first-boot race), truthful `skipped` seed reporting,
  single HSTS header at the edge. Decisions J1–J9.

### Phase 10 verification (executed 2026-10-15/16)

- `npm test` → **158 tests, 158 pass, 0 fail**, two consecutive runs on the upgraded dependencies; lint 0 ✅
  (adds: runtime role can read/write rows but gets `42501` for DDL, `TRUNCATE`, audit rewrite/delete, migration-history
  writes and role creation; password rotation; unsafe names refused; default privileges on new tables; route-registry
  audit over all 239 routes; security headers, CORS, service-token gate, injection-shaped input, mass assignment,
  prototype pollution, credential leakage, pagination caps, parser errors; full traveller journey through the API)
- `npm audit` → **0 vulnerabilities** (was 1 critical, 2 high, 20 moderate, 2 low) ✅
- **Restore drill (dev):** backup → `restore.sh` into a new database → `verify-restore.sh`: 80 tables, 16 migrations,
  media counts identical; `storage:verify` against the restored DB: 1 checked, 0 missing; after deliberately breaking
  the reference: 1 missing, exit 1 ✅
- **Production stack smoke test** (`docker-compose.prod.yml`, fresh volumes, throwaway self-signed cert and secrets):
  first-boot migrate (16) + runtime role created + seeds (demo seed skipped, 0 demo rows); api healthy, worker up;
  HTTPS `/health/live` 200 with one HSTS header; HTTP → 301 HTTPS; TLS 1.0/1.1 refused; `/api/v1/regions` 404 on the
  edge; unsigned webhook 400, GET webhook 403; BFF network: readiness all checks up, no token 401, admin login and
  dashboard/settings/audit/revenue 200; API connects as `tourism_app` (not superuser), uid 1000, read-only root FS,
  no capabilities; memory/CPU limits and 10 MB log rotation applied; only 80/443 published; prod backup written ✅
- OpenAPI regenerated: 242 operations (unchanged route set) ✅

## Pending / carried forward

- Open owner decisions O2, O6–O8 in DECISIONS.md.
- Before launch: real TLS certificate, managed S3 buckets (versioning + CORS), SMTP provider, Razorpay live keys and
  webhook registration, scheduled off-site backups — steps in `docs/operations/DEPLOYMENT.md`.
- Production payment launch still gated by O2 (merchant of record, GST, settlement/payouts — Report §13 Critical).
- SMTP credentials: `.env` has empty `SMTP_USER`/`SMTP_PASSWORD` slots (dev uses Mailpit); fill and recreate api/worker.

## Commands (host needs Docker only)

```
cp .env.example .env            # then replace every secret (hex values)
docker compose build
docker compose up -d
docker compose run --rm api npm run db:migrate
docker compose run --rm api npm run storage:init        # create media buckets (idempotent)
docker compose run --rm api npm run db:seed
docker compose run --rm api npm run db:status
docker compose run --rm api npm run db:rollback        # [steps|all]
docker compose run --rm api npm test
docker compose run --rm --no-deps api npm run lint
docker compose run --rm --no-deps -T api node src/docs/generate.js > docs/api/openapi.json   # bash
docker compose logs -f api worker
docker compose --profile ops run --rm backup                            # dump to ./backups
docker compose --profile ops run --rm backup restore.sh <file> <new_db> # restore drill
docker compose --profile ops run --rm backup verify-restore.sh <db> <new_db>
docker compose run --rm api npm run storage:verify                     # media objects exist
# API reference: http://localhost:8081/docs/   ·   production: docs/operations/DEPLOYMENT.md
```

Regenerating the lockfile after dependency changes (no host npm):
`docker run --rm -v "$PWD/backend:/app" -w /app node:22.12.0-bookworm-slim npm install --package-lock-only`

Never run `docker compose down -v` against real data (deletes the database volume).
The `_test` database is created by `infrastructure/postgres/init` only when the volume is first initialised.
