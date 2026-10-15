# Decisions, Clarifications and Open Questions

Items marked **OPEN** need project-owner confirmation before the phase noted. Everything else is a
technical clarification applied without changing the report's scope.

## Open (owner decision required)

| ID | Topic | Needed by | Proposed default |
|----|-------|-----------|------------------|
| O2 | Merchant-of-record / partner settlement, GST, invoice issuer (Report §1.3, §13 Critical) | Production payments | Sandbox only until decided; tax rate from `platform_settings`, default 0 |
O1 (Razorpay), O3 (booking mode), O4 (timings) and O5 (partner types → supply) were accepted on 2026-10-15; see F1/D1/D2/E2.
O9 (`GET /users/me/reviews`, outside the route register) was approved on 2026-10-15; see I9.
| O6 | Email provider | Phase 7 | SMTP (any provider); Mailpit container in development |
| O7 | Object storage provider (production) | Production | Any S3-compatible service (AWS S3, Cloudflare R2, Wasabi…) via `STORAGE_*`; dev uses SeaweedFS (B1) |
| O8 | Redirects have only admin routes in Report §5.13, so the BFF cannot read them without admin rights | Phase 10 (frontend) | Add public `GET /content/redirects` (service token only) — needs approval as a route outside the register |

## Clarifications applied

| ID | Report issue | Resolution |
|----|--------------|------------|
| C1 | `/webhooks/payments/:provider` is listed under the `/api/v1` table but described as special ingress | Mounted at `/api/v1/webhooks/payments/:provider`, before the service-token gate; only this path + `/health/live` exposed on the public nginx listener |
| C2 | `/health/ready` is "restricted"; `/health/version` is unspecified | Both require the service token (version data is deployment-sensitive). `/health/live` is public |
| C3 | `/admin/destination-categories/:id/status` exists but the table has no `status` column | Add `status` to `destination_categories` |
| C4 | Bookings need an expiry/payment deadline for scans but `bookings` has no such column | Add `expires_at` to `bookings` (mirrors the active hold/payment deadline) |
| C5 | Idempotency must bind to user, but `idempotency_records` has no user column | The `scope` value embeds the user id, e.g. `bookings.create:<userId>`; unique `(scope, idempotency_key)` |
| C6 | `/partners/me/*` assumes one organisation, but `partner_users` allows many | Use the sole approved membership; if a user has several, require `X-Partner-Id` header (validated against membership) |
| C7 | Route collisions `/destinations/featured` vs `/:slug`, `/trips/:id/stops/reorder` vs `/:stopId` | Static routes registered first; `:id`-style params validated as UUID |
| C8 | Public routes mix `:slug` and `:id` (e.g. `/experiences/:slug` vs `/experiences/:id/sessions`) | Kept as specified; detail responses include both `id` and `slug` |
| C9 | `inventory_holds` is the allocation ledger for all supply types | Rows stay with status `held → confirmed / released / expired`; capacity = confirmed + unexpired held, checked under row locks. Guide overlap enforced by a `btree_gist` exclusion constraint |
| C10 | Booking may contain several items but has a single `booking_type` | v1: one booking = one resource type and one item; schema keeps multi-item support |
| C11 | Cancellation must use the policy in force at purchase | Policy snapshot stored in `booking_items.booking_details` |
| C12 | CSRF (Report §6.3) | Applies to the BFF's cookie routes. Express accepts bearer + service token only (no cookies), so CSRF does not apply there |
| C13 | Report says `Dockerfile` at repo root and also "built from backend/Dockerfile" | `backend/Dockerfile`; compose, `.env.example`, nginx config at repo root/`infrastructure` |
| C14 | Migration bookkeeping needs a table outside the 78 | `schema_migrations` (infrastructure only) |
| C15 | Refresh token design | Opaque random tokens, SHA-256 hashed at rest, rotation within `token_family_id`, reuse of a rotated token revokes the family |
| C16 | Report text numbering (e.g. "section 2" means scope §1; §6.1/§8.1 lists start at 5/11) | Cosmetic; ignored |
| C17 | DB superuser used by app in development | Phase 10 splits a migration owner role from a least-privilege runtime role |

## Phase 2 decisions (authentication & RBAC)

| ID | Decision |
|----|----------|
| A1 | Passwords: Node built-in **scrypt** (N=2^15, r=8, p=1, 16-byte salt, 64-byte key), self-describing hash string with transparent rehash on login when parameters change. Policy: 8–128 chars, must not equal the email. |
| A2 | Access JWT: HS256, 15 min, claims `sub`, `sid` (session = refresh family), `jti`, `iss`, `aud`; algorithm allowlist. `JWT_REFRESH_SECRET` from Report §10.2 is not used because refresh tokens are opaque (C15). |
| A3 | Every authenticated request re-reads session state, account status, roles and permissions (one query each), so logout, suspension and role/permission edits take effect immediately without a token blocklist. |
| A4 | Refresh sessions have an **absolute** lifetime (`REFRESH_TOKEN_TTL_DAYS` from login); rotation does not extend it. Reuse of a rotated token revokes the family; the BFF must single-flight refresh per session. |
| A5 | Login is allowed before email verification (`emailVerified` exposed); booking/payment (Phase 5/6) will require a verified email. Password reset also marks the email verified. |
| A6 | Register, forgot-password and resend-verification always return the same 202 (no account enumeration); unknown accounts still incur password-hashing work at login. |
| A7 | Brute force: Redis IP rate limits per route (fail open) + DB lockout: 5 failures per account+IP or 20 per account within 15 min since last success → 429 `LOGIN_LOCKED`. |
| A8 | End-user IP comes from `X-Client-Ip`, trusted only after the service-token check; nginx strips it on the public listener. |
| A9 | Verification/reset emails are queued as outbox events carrying the raw single-use token (DB stores only its hash). Phase 7 delivers them and must scrub `payload.token` after dispatch. Until Phase 7, developers read tokens from `outbox_events`. |
| A10 | RBAC catalog (6 roles, 48 permissions) is a migration (`0004`), not a re-runnable seed, so admin edits are never reverted. Later phases add permissions in new migrations and **must grant them to super_admin**. `super_admin` role is immutable via API. |
| A11 | Privileged-role protection: only a super admin may change the status of, or grant/revoke `admin`/`super_admin` on, any account; nobody may change their own status or roles. `admin` lacks `roles.assign`, `roles.manage`, `settings.write`, `refunds.*` by default ("financial actions require elevated permission"). |
| A12 | `audit_logs` gains `request_id` (correlation, Report §6.3) and is append-only via trigger. |
| A13 | `PATCH /users/me` does not accept `avatarMediaId` until the media module exists (Phase 3 adds the FK and field). Registration does not take a phone (avoids enumeration via phone uniqueness); phone is set via `PATCH /users/me` (409 `PHONE_IN_USE`). |
| A14 | Partner ownership primitives (organisation membership checks) ship with the partner tables in Phase 4. |
| A15 | nginx re-resolves the `api` upstream via Docker DNS (`resolve`), so recreated containers don't cause 502s. |

## Phase 3 decisions (geography, destinations, CMS, media, search)

| ID | Decision |
|----|----------|
| B1 | Dev object storage is **SeaweedFS 3.80** (S3 gateway): MinIO images are no longer pullable from Docker Hub/quay.io. The app speaks generic S3 (AWS SDK v3 pinned 3.723.0, path-style), so production can use any S3 provider. Anonymous identity may only read the public bucket. |
| B2 | Two-step uploads: `upload-init` reserves a `pending` asset and returns a 10-minute presigned PUT with signed `Content-Type` + `Content-Length`; `upload-complete` checks object size and the **real file signature** (JPEG/PNG/WebP/PDF magic bytes) before marking `ready`; mismatches are rejected and the object deleted. Width/height/resizing are filled by the media-processing job (Phase 7, `media.uploaded` outbox event). |
| B3 | `media_assets.purpose` (avatar, content_image, supply_image, verification_document) added to the report's field list; purpose fixes visibility, MIME allowlist, size limit and uploader permissions. Public objects are served by URL (CDN-able); private objects only via 5-minute signed URLs to the uploader or `media.manage`. |
| B4 | Media in use cannot be deleted: link tables use FK `RESTRICT`; CMS JSON references are checked through a registered reference check (409 `MEDIA_IN_USE`). Objects are deleted after the DB commit (orphans are possible, never dangling rows). |
| B5 | `destinations.published_at` added; `entry_fee` is the standard adult fee in INR (NUMERIC, decimal string in API); `opening_hours` is a strict JSON shape (per-day HH:MM ranges + notes). Publishing requires summary, description, location and ≥1 category (DB CHECK + 422 `PUBLISH_REQUIREMENTS`). Delete = archive. |
| B6 | Deferred to the owning modules (not stubbed): `/destinations/:slug/experiences`, `/properties`, `/guides` → Phase 4; `/destinations/:slug/reviews` → Phase 8. |
| B7 | Public destination visibility depends on destination status only; district/region `inactive` hides them from geography listings, not their destinations. |
| B8 | Search uses PostgreSQL full-text (`search_vector` generated column: name 'simple' A, summary B, description C) + `pg_trgm` fuzzy name matching; no Elasticsearch (Report §1.2). Unified search merges ranked lists over a 500-result window; `type=` pages directly. Searchable types grow with Phase 4 supply. |
| B9 | CMS sections are an allowlisted registry (hero, rich_text, featured_destinations, category_grid, district_grid, image_gallery, cta_banner, faq). Text is plain/restricted Markdown: HTML tags and `javascript:`/`data:`/`vbscript:` URLs are rejected; links must be `/path` or `https://`. Public rendering resolves media to images and references to live **published** cards only. One homepage document (unique index). |
| B10 | Reference lists (regions, districts, categories, menus, redirects, announcements) are bounded and returned unpaginated; destinations and CMS pages are paginated. |
| B11 | Seeds: `002` 5 Jharkhand divisions + 24 districts (approx. HQ coordinates), `003` 10 categories — insert-only. `900_demo_destinations` loads 8 **unverified demo** destinations in non-production only. |
| B12 | Readiness reports object storage but does not gate on it (like the worker). |
| B13 | Dev only: SeaweedFS uses `-volume.max=0 -master.volumeSizeLimitMB=256` because each bucket reserves its own volumes. |

## Phase 4 decisions (partners and supply)

| ID | Decision |
|----|----------|
| D1 | (O3) `booking_mode` (`instant`/`request`, default instant) on properties, guide_services, experiences and packages. |
| D2 | (O5) `partner_type` → supply: accommodation→properties, guide→guides, operator→experiences+packages, multi→all. Approval grants every member the matching global role (hotel_partner / guide / package_provider); roles are re-synced from approved memberships on every approval/suspension/membership change, so suspension or leaving revokes them. |
| D3 | Organisation roles: owner, manager, staff. Owners manage everyone; managers manage staff only; staff manage supply but not the organisation/team; nobody edits their own role; the last owner cannot be removed or demoted. Applicants (`partners.apply`) can manage their pending organisation, team and documents. `partnerType`, `legalName`, `taxIdentifier` lock after approval; editing a rejected application resubmits it. |
| D4 | Partner supply requests require: role permission (e.g. `properties.manage.own`) + approved organisation whose type allows the supply + row ownership (`partner_id`); foreign rows return 404. Membership is resolved per request (C6, `X-Partner-Id`). |
| D5 | Supply moderation (properties, experiences, packages): created `pending_review`; admin → `published`/`rejected`; `published` ↔ `suspended`; a partner edit of a rejected item resubmits it. Public visibility also requires the partner to be approved, expressed as a read-only `EXISTS` predicate on `partners` inside supply queries (accepted cross-module read). Reviewers cannot review their own organisation or its guides (`SELF_REVIEW_FORBIDDEN`). |
| D6 | Guides: `display_name` and `photo_media_id` added to the report's field list. Verification: unverified → pending (on document submission) → verified/rejected. Public = active + verified + approved partner. Availability windows cannot overlap (GiST exclusion constraint). |
| D7 | Room inventory: no row = room type's physical units, nothing blocked; no rate row = `base_price`. Date overrides ≤ physical units, no past dates, ≤ 366 days per request; shrinking physical units clamps overrides. Cancellation policy is structured JSON tiers (hours before check-in → refund %); default when unset: ≥72 h 100%, ≥24 h 50%, else 0 (to be snapshotted per booking in Phase 5). |
| D8 | Availability endpoints (properties, guides, experiences, packages) are indicative; Phase 5 subtracts held/booked allocations from `inventory_holds` and re-checks under row locks. Deleting sessions / moving departures will also be blocked once reservations exist (Phase 5). |
| D9 | Package departures: `end_date = start_date + duration_days - 1` (derived), one departure per start date, future dates only; `packages.starting_price` is maintained as the lowest upcoming scheduled departure price. |
| D10 | Search adds property, guide, experience and package (name + trigram ranking); nearby supports destination and property. District/region/category filters apply to destinations only. |
| D11 | Seed `004_amenities_languages`: 19 amenities, 11 guide languages including Santali, Mundari, Kurukh, Ho, Kharia and Nagpuri (Sadri). |
| D12 | Route definitions gained `anyPermissions`, per-route `middleware` (partner-context guard) and documented `headers` (X-Partner-Id). |

## Phase 5 decisions (booking engine)

| ID | Decision |
|----|----------|
| E1 | `platform_settings` and `idempotency_records` (Report 4.13) are created in Phase 5 because bookings depend on them. Settings have code defaults overridden by DB rows (migration seeds the same values); admin routes arrive in Phase 9. |
| E2 | (O4) Instant booking holds capacity 15 min (`booking.hold_minutes`); request-to-book reserves nothing until approval, partners have 24 h to respond, then the guest has 24 h to pay. Tax rate 0% until finance sign-off (O2). |
| E3 | `bookings` additions: `partner_id`, `booking_mode`, `service_start_at`/`service_end_at`, `expires_at` (C4). One booking = one item (C10). `booking_items.booking_details` snapshots supply names, dates, nightly prices, the cancellation policy and the original request (used to re-check capacity on approval). |
| E4 | Capacity ledger = `inventory_holds`; active = confirmed, or held with `expires_at > now()`. Lapsed holds stop counting immediately; the worker sweep (every 30 s) only moves bookings to expired/completed and emits events. |
| E5 | Concurrency: each supply module's `prepareBooking` locks its own row (`room_types`, `guides`, `experience_sessions`, `package_departures`) FOR UPDATE inside the booking transaction, then checks allocations, so the last unit is sold once. Guides additionally have a GiST exclusion constraint on held/confirmed holds (`23P01` → 409). Transactions retry on deadlock/serialisation. |
| E6 | Supply modules read allocations through `bookings/allocations.service` (no dependency on the booking service, so no cycle). Availability endpoints now subtract reservations; partners cannot reduce inventory/capacity below reservations, delete/move/cancel sessions or departures with reservations, or remove guide windows covering booked time (409). |
| E7 | `POST /bookings` requires `Idempotency-Key`; scope `bookings.create:<userId>`; replays return the original booking with `Idempotent-Replay: true`; a different body with the same key → 409. Booking requires a verified email (A5). |
| E8 | The package booking item uses `travelerCount` (not `travelers`, which is the list of people). |
| E9 | Cancellation: unpaid bookings cancel free; paid bookings refund from the snapshotted policy tiers by hours before service start (admin may waive fees and cancel after start; audited). `booking.cancelled` outbox events carry the refund amount for the payments module (Phase 6). Users cannot cancel after service start. |
| E10 | `confirmAfterPayment(client, bookingId)` is the payments-module interface: confirms only while holds are active, otherwise returns `HOLD_EXPIRED`/`BOOKING_<STATUS>` for reconciliation (Phase 6). |
| E11 | Booking references `JHT-YYMMDD-XXXXXX` (unambiguous alphabet), retried on collision. `TEST_LOG_LEVEL` env enables logs during tests. |

## Phase 6 decisions (payments and refunds)

| ID | Decision |
|----|----------|
| F1 | (O1) Razorpay via a single adapter (`payments/providers/razorpay.js`: Orders, Payments, Capture, Refunds REST APIs with Basic auth). Env names follow Report §10.2 (`PAYMENT_PROVIDER`, `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`) plus `PAYMENT_API_BASE_URL`. Keys are optional in development (routes return 503 `PAYMENTS_NOT_CONFIGURED`) and required in production. |
| F2 | Never trust the browser: `POST /payments/verify` checks the Checkout HMAC (order_id|payment_id), then fetches the payment from Razorpay and matches order, amount (paise) and currency before confirming; authorized payments are captured server-side. |
| F3 | Callback, webhook and reconciliation all converge on one idempotent `settlePayment` under the order row lock; a capture already settled is acknowledged without side effects. Exactly one captured transaction and one confirmation per payment. |
| F4 | Webhooks: mounted before the service-token gate (route `auth: 'webhook'`), verified by HMAC over the raw body, persisted (redacted to ids/amounts/statuses) before processing, unique per `X-Razorpay-Event-Id`. Failed processing returns 200 and is retried by the worker (≤10 attempts). |
| F5 | A captured payment that cannot confirm its booking is refunded in full: late payment after hold expiry first re-acquires capacity under the supply lock (expired → confirmed, at the paid price); if capacity is gone → `late_payment` refund (no overbooking). A second capture for an already confirmed booking → `duplicate_payment` refund (booking stays paid). |
| F6 | Refunds: `refunds.kind` (cancellation / late_payment / duplicate_payment / manual) is an addition; automatic kinds are unique per booking (or payment). The refund id is sent as the Razorpay `receipt`; before every (re)submission existing provider refunds are checked for that receipt, so a lost response never causes a second refund. Refund rows lock the captured transaction so totals can never exceed the capture. Succeeded is terminal. |
| F7 | Paid cancellations (`booking_cancellations.status = refund_pending`) become refunds via the worker sweep (every 30 s; event-driven via the outbox in Phase 7). Failed automatic refunds retry with exponential backoff (max 5); admins retry via `POST /admin/refunds/:id/retry` (`refunds.retry`). Manual refunds need `refunds.initiate` + Idempotency-Key and are audited. |
| F8 | Reconciliation: unpaid orders older than 2 minutes are re-checked against Razorpay at most every 5 minutes for 3 days; captured payments settle, unpaid lapsed orders become `expired`. |
| F9 | `payment_orders.reconciled_at`, `payment_transactions.provider/method`, `payment_webhook_events.event_type/attempts/last_error` and `refunds.attempts/last_error/requested_by/updated_at` are additions to the report's field lists. |
| F10 | Tests run the real adapter against an in-process fake Razorpay HTTP server (`tests/fakeRazorpay.js`); no keys or network needed. |

## Phase 7 decisions (queues, outbox, notifications)

| ID | Decision |
|----|----------|
| G1 | BullMQ 5.34 on Redis runs the Report §9 queues (outbox-dispatch, booking-expiration, booking-confirmation, payment-reconciliation, refund-processing, notification-delivery, media-processing) plus `housekeeping` (retention clean-up). Only the worker uses BullMQ; the API writes outbox rows only. Defaults: 5 attempts, exponential backoff from 2 s, completed jobs kept 1 h, failed jobs kept 7 days (dead-letter visibility). |
| G2 | Schedules via BullMQ job schedulers (one firing per interval across all worker replicas): outbox dispatch 2 s, booking sweep 30 s, payment reconciliation 60 s, refund sweep 60 s, housekeeping hourly. The Phase 5/6 `setInterval` sweeps were removed. |
| G3 | Outbox dispatch claims pending rows with `FOR UPDATE SKIP LOCKED`, enqueues jobs with ids derived from the event id (BullMQ de-duplicates), then marks the row processed in the same transaction. Enqueue failures leave the row pending with exponential backoff (max 10 attempts → `failed`). Columns `attempts`, `last_error`, `available_at` added to `outbox_events`. One-time tokens are removed from stored payloads once dispatched (A9); they travel only inside the queue job. |
| G4 | Notifications: events map to templates per channel (`in_app`, `email`); each message is idempotent via a `dedupe_key` (event, template, channel, recipient) on `notifications`/`notification_deliveries` (additions). Email bodies are never stored (they can contain one-time links); deliveries record status, attempts, provider message id, last error. Final failures mark the delivery `failed`. |
| G5 | Templates are plain text with `{{placeholders}}`; values and text are HTML-escaped when rendered to email (links become anchors). 25 default templates are seeded by migration 0014; admins edit subject/body/status (audited); inactive templates are skipped. |
| G6 | SMTP via nodemailer (`SMTP_*`, `EMAIL_FROM`); Mailpit (`axllent/mailpit:v1.21.8`) in development with its UI on `127.0.0.1:8025`. `APP_WEB_URL` builds links in messages. |
| G7 | Paid cancellations are refunded event-driven (`booking.cancelled` → refund-processing job); the 60 s refund sweep remains the safety net. |
| G8 | Vouchers: `booking.confirmed` → PDF (pdfkit, built-in fonts) stored as a private `booking_document` media asset (new purpose, never user-uploadable) and linked in `booking_documents`; generation is idempotent under the booking row lock. |
| G9 | Media processing (sharp 0.33): uploaded images get EXIF orientation applied, all metadata stripped (no GPS leakage) and width/height recorded; housekeeping deletes uploads left pending/rejected for 24 h. |
| G10 | Retention (housekeeping): login attempts 90 days, refresh tokens 30 days after expiry, verification tokens 7 days, expired idempotency records, processed outbox rows after 30 days. Readiness reports outbox backlog and per-queue counts, flagging failed jobs/events (non-gating). |

## Phase 8 decisions (trips, favorites, reviews)

| ID | Decision |
|----|----------|
| H1 | Trips are private to their owner (`trips.manage.own`); another user's trip answers 404. A trip never reserves capacity. Dates are optional but set together; a trip lasts 1–60 days. Creating a dated trip creates one empty day per date; `trip_days.trip_date` is derived from the trip start date and recomputed on every change. Shortening dates below an existing day is refused (409 `DAYS_OUTSIDE_RANGE`). |
| H2 | Only `draft` trips are deleted (409 `TRIP_NOT_DRAFT` otherwise; archive via status). Mutations lock the trip row, bump `updated_at` and return the full trip. |
| H3 | Stops are appended at the end of a day (max 30); a stop needs a title or a published destination (title defaults to its name). Unpublished destinations stay on existing plans but lose their card. `PATCH /trips/:id/stops/reorder` takes `{days:[{dayId, stopIds}]}`, must list every stop of the listed days exactly once and may move stops between them; the `(day, sort_order)` unique constraint is deferred so permutations commit atomically. Deleting a stop renumbers the day. |
| H4 | Favorites and reviews reference subjects polymorphically (`destination`, `property`, `guide`, `experience`, `package`), resolved through `modules/subjects` → each owning module's public-card interface. Only publicly visible items can be saved; saved items that later go private are listed with `available: false`. `POST /favorites` is idempotent (201 new, 200 existing). |
| H5 | Reviews of bookable supply are verified: they need `bookingId` of the author's own **completed** booking of that exact item (422 `BOOKING_NOT_REVIEWABLE`), one per booking. Destinations (not bookable) take one unverified review per user. Database: `booking_id` required unless the subject is a destination; partial unique indexes enforce both rules. |
| H6 | Every new or edited review is `pending` until a moderator (`reviews.moderate`) sets `approved`, `hidden` or `rejected` (note required for the last two); moderation is audited and records moderator + note (additions). Authors may delete their own review. Public lists show approved reviews only, newest first, with a rating summary (count, average to one decimal, 1–5 distribution) in `meta.rating`; authors appear as "First L." (no user ids or emails). |
| H7 | `GET /reviews` is the public listing for one item (`subjectType` + `subjectId` required); `GET /destinations/:slug/reviews` serves destinations by slug. Authors list their own reviews via `GET /users/me/reviews` (I9). |
| H8 | `POST /reviews` is rate limited (20 per user per hour). |

## Phase 9 decisions (administration, reporting, settings, audit)

| ID | Decision |
|----|----------|
| I1 | Reporting (`modules/analytics`) is a read-only projection: its repository runs aggregate SQL across other modules' tables and never writes. This is the one deliberate exception to "modules use each other's services": routing every aggregate through transactional services would mean N+1 queries or duplicated report SQL in each module. Supporting indexes in migration 0016. |
| I2 | Ranges are local (Asia/Kolkata) calendar dates, `to` inclusive; default the last 30 days; at most 366 days; series buckets by day/week (Monday)/month with empty buckets filled. |
| I3 | Booking figures count bookings **created** in the range by their current status; "booked value" = total of confirmed/completed bookings. Revenue counts money by the date it moved: captured payments (`paid_at`) minus succeeded refunds (`processed_at`); amounts are gross (no commission/GST split until O2). |
| I4 | Destination attribution: property and experience bookings count towards their destination; guide and package bookings count towards every linked destination (so per-destination sums can exceed the platform total). Favorites, trip stops and approved reviews count by creation date. |
| I5 | Partner reports/dashboard are forced to the caller's organisation (partner guard; `partnerId` is not accepted). Platform reports accept `partnerId`/`bookingType` filters. |
| I6 | Settings: only the approved keys, each with its own validation; `null` restores the code default; changes are atomic, audited per changed key (`settings.updated`), apply to bookings created afterwards, invalidate the local cache at once and reach other instances within 30 s. `settings.write` stays super_admin-only (A-series default). |
| I7 | Audit search (`audit.read`): filters actor, entity type/id, action (exact or prefix, e.g. `reviews.`), local date range; newest first; actor email/name resolved through the users service. The search lives in `audit-search.service.js` so the audit writer used by every module keeps no users dependency (no require cycle). |
| I8 | Dashboards: platform = users, last-30-day bookings/revenue, today/upcoming, and an "attention" list (pending partner applications, supply awaiting review, guide verification, pending reviews, failed refunds/webhooks/outbox events). Partner = own last-30-day figures, approvals waiting, next 10 confirmed services, supply status counts, approved-review rating. |
| I9 | `GET /users/me/reviews` (approved addition, O9): the author's reviews in every status with moderation note and the reviewed item's card (`available: false` once unlisted). |

## Technology choices (pinned in package.json / compose)

- Node 22 LTS (`node:22.12.0-bookworm-slim`), Express 5 (native async error propagation).
- `pg` (no ORM; parameterised SQL), `ioredis`, `zod` + `@asteasolutions/zod-to-openapi` (one schema
  source for validation and OpenAPI), `pino`/`pino-http`, `helmet`, `cors`.
- Tests: Node built-in `node:test` + `supertest`, against real PostgreSQL/Redis in Docker.
- Images: `postgis/postgis:16-3.5`, `redis:7.4.2-alpine` (AOF, `noeviction` for BullMQ), `nginx:1.27.3-alpine`.
