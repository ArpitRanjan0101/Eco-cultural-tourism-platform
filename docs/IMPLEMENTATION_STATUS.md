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
| 5 | Booking engine, concurrency, reservation lifecycle | ✅ Verified (2026-10-15) — awaiting approval for Phase 6 |
| 6 | Payments, webhooks, cancellations, refunds, reconciliation | ⏳ (blocked on O1 gateway choice) |
| 7 | BullMQ, outbox, notifications | ⏳ |
| 8 | Trips, favorites, reviews | ⏳ |
| 9 | Admin, analytics, audit, settings | ⏳ |
| 10 | Integration/security testing, API docs, production deployment | ⏳ |

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

## Pending / carried forward

- Phase 10: separate migration-owner and least-privilege runtime DB roles (C17); production compose (no private port publish,
  TLS, resource limits, log rotation, secrets); backups/restore drill; Swagger UI hosting.
- Open owner decisions O1–O7 in DECISIONS.md (O1 gateway blocks Phase 6).
- Phase 6: `POST /bookings/:id/payment-order`, `POST /admin/bookings/:id/refund`; consume `booking.cancelled` refunds;
  late-payment reconciliation (re-acquire capacity if free, else refund); gateway choice O1 still open.
- Phase 7: move the 30 s booking sweep onto the BullMQ `booking-expiration` queue; idempotency/auth-attempt retention cleanup.
- Phase 7: media-processing job (dimensions, resizing) on `media.uploaded`; cleanup of stale `pending` uploads.
- Phase 8: `/destinations/:slug/reviews`.
- Phase 7: email delivery for `auth.*` outbox events; scrub `payload.token` after dispatch; retention cleanup job for
  `auth_login_attempts`, expired refresh/verification tokens.
- Phase 9: `GET /admin/audit-logs` search over the existing `audit_logs`.

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
```

Regenerating the lockfile after dependency changes (no host npm):
`docker run --rm -v "$PWD/backend:/app" -w /app node:22.12.0-bookworm-slim npm install --package-lock-only`

Never run `docker compose down -v` against real data (deletes the database volume).
The `_test` database is created by `infrastructure/postgres/init` only when the volume is first initialised.
