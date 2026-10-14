# Decisions, Clarifications and Open Questions

Items marked **OPEN** need project-owner confirmation before the phase noted. Everything else is a
technical clarification applied without changing the report's scope.

## Open (owner decision required)

| ID | Topic | Needed by | Proposed default |
|----|-------|-----------|------------------|
| O1 | Payment gateway (Report §8.4) | Phase 6 | Razorpay (INR, orders + signed webhooks + refunds API) behind a provider-neutral adapter |
| O2 | Merchant-of-record / partner settlement, GST, invoice issuer (Report §1.3, §13 Critical) | Production payments | Sandbox only until decided; tax rate from `platform_settings`, default 0 |
| O3 | Booking mode per resource: instant vs request-to-book. The report allows both but no table holds it | Phase 4 | Add `booking_mode` (`instant`/`request`) column to properties, guide_services, experiences, packages |
| O4 | Hold duration, partner approval window, payment deadline | Phase 5 | `platform_settings`: hold 15 min, approval 24 h, payment after approval 24 h |
| O5 | Which supply types each `partner_type` may create | Phase 4 | `accommodation`→properties, `guide`→guides, `operator`→experiences + packages, `multi`→all |
| O6 | Email provider | Phase 7 | SMTP (any provider); Mailpit container in development |
| O7 | Object storage provider | Phase 3 | Any S3-compatible service; MinIO container in development |

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

## Technology choices (pinned in package.json / compose)

- Node 22 LTS (`node:22.12.0-bookworm-slim`), Express 5 (native async error propagation).
- `pg` (no ORM; parameterised SQL), `ioredis`, `zod` + `@asteasolutions/zod-to-openapi` (one schema
  source for validation and OpenAPI), `pino`/`pino-http`, `helmet`, `cors`.
- Tests: Node built-in `node:test` + `supertest`, against real PostgreSQL/Redis in Docker.
- Images: `postgis/postgis:16-3.5`, `redis:7.4.2-alpine` (AOF, `noeviction` for BullMQ), `nginx:1.27.3-alpine`.
