# Runtime Flows — Jharkhand Eco & Cultural Tourism Backend

How a request, a booking, a payment and an event actually move through the system. Each flow names the module,
the guarantees it gives and the decision that explains it (IDs refer to [DECISIONS.md](DECISIONS.md)).
Structure and module boundaries: [ARCHITECTURE.md](ARCHITECTURE.md). Diagrams are Mermaid (rendered by GitHub
and VS Code).

**Contents**
1. [System context](#1-system-context)
2. [Request lifecycle](#2-request-lifecycle)
3. [Authentication](#3-authentication)
4. [Authorisation and partner context](#4-authorisation-and-partner-context)
5. [Partner onboarding and supply moderation](#5-partner-onboarding-and-supply-moderation)
6. [Media upload](#6-media-upload)
7. [Booking](#7-booking)
8. [Payment](#8-payment)
9. [Cancellation and refunds](#9-cancellation-and-refunds)
10. [Events, outbox and background jobs](#10-events-outbox-and-background-jobs)
11. [Notifications](#11-notifications)
12. [Trips, favorites and reviews](#12-trips-favorites-and-reviews)
13. [Reporting, settings and audit](#13-reporting-settings-and-audit)
14. [Errors](#14-errors)
15. [Deployment topology](#15-deployment-topology)

---

## 1. System context

```mermaid
flowchart LR
  browser([Browser]) -->|HTTPS| bff[Next.js BFF<br/>holds service token + user session]
  bff -->|X-Internal-Service-Token<br/>+ Bearer access token| nginx8081[nginx :8081<br/>private listener]
  razorpay([Razorpay]) -->|signed webhooks| nginx443[nginx :443<br/>public edge]
  browser -->|presigned PUT / public GET| s3[(S3-compatible storage)]
  nginx8081 --> api[API<br/>Express modular monolith]
  nginx443 -->|/health/live, POST /webhooks/payments/* only| api
  api --> pg[(PostgreSQL 16 + PostGIS)]
  api --> redis[(Redis 7)]
  api -->|presign, HEAD, GET| s3
  api -->|Orders / Payments / Refunds| razorpay
  worker[Worker<br/>BullMQ processors] --> pg
  worker --> redis
  worker -->|SMTP| smtp([Email provider / Mailpit])
  worker -->|vouchers, image processing| s3
  worker -->|reconciliation, refunds| razorpay
```

- Browsers never call the API directly. The BFF is the only client; it keeps the service token server-side (C12, P10).
- The public edge exposes only liveness and payment webhooks (C1, J3). Everything else goes through the private
  listener, reachable only from the BFF's Docker network in production (J2).
- The API and the worker run the same image. The API writes outbox rows; only the worker talks to BullMQ (G1).

---

## 2. Request lifecycle

Every route is a declarative definition (`modules/*/**.routes.js`) that `core/http/routes.js` turns into the Express
middleware chain below, and into OpenAPI and the Postman collection (P2, K1).

```mermaid
flowchart TD
  A[Request] --> B[helmet · CORS allow-list · request id · pino-http · JSON body 1 MB<br/>raw body kept for webhook HMAC]
  B --> H{/health/*?}
  H -->|yes| HR[live: public · ready/version: service token]
  H -->|no, /api/v1| W{auth = webhook?}
  W -->|yes| WS[provider signature check → handler]
  W -->|no| T[service-token gate<br/>constant-time compare, current + previous token]
  T --> IP[X-Client-Ip trusted only now · Cache-Control: no-store]
  IP --> RL1[IP rate limit, if configured]
  RL1 --> AU{auth = user?}
  AU -->|yes| AUTH[verify JWT → reload session, status,<br/>roles, permissions from DB]
  AUTH --> PERM[requirePermissions / requireAnyPermission]
  PERM --> RL2[per-user rate limit, if configured]
  AU -->|no| VAL
  RL2 --> VAL[zod validation of params/query/body/headers<br/>strict objects → req.valid]
  VAL --> MW[route middleware, e.g. partnerGuard]
  MW --> CTL[controller → service → repository]
  CTL --> OK[success envelope]
  CTL -. throws .-> ERR[error handler → error envelope]
```

- Validation failures stop the request before any service code runs (422, P3).
- A service runs its writes in one transaction (`withTransaction`, with retry on serialisation/deadlock). Admin
  mutations use `auditedTransaction`, so the audit row commits with the change or not at all (A12).
- `requestContext(req)` gives services the actor, roles, permissions, partner context, client IP and request id.

---

## 3. Authentication

### Registration and email verification

```mermaid
sequenceDiagram
  participant C as Client (via BFF)
  participant A as API (auth)
  participant DB as PostgreSQL
  participant Wk as Worker
  participant M as SMTP / Mailpit
  C->>A: POST /auth/register {fullName, email, password}
  A->>DB: create user (scrypt hash) + hashed verification token + outbox event (one tx)
  A-->>C: 202 (same answer for existing emails — no enumeration, A6)
  Wk->>DB: claim outbox event (SKIP LOCKED)
  Wk->>M: email with /verify-email?token=… (raw token only inside the job, A9/G3)
  C->>A: POST /auth/verify-email {token}
  A->>DB: match token hash, single use → email_verified_at
  A-->>C: 200
```

### Login, refresh rotation and reuse detection

```mermaid
sequenceDiagram
  participant C as Client (via BFF)
  participant A as API (auth)
  participant DB as PostgreSQL
  C->>A: POST /auth/login {email, password}
  A->>DB: lockout check (5/account+IP, 20/account per 15 min, A7) · verify scrypt
  A->>DB: new refresh family (opaque token, SHA-256 at rest, absolute expiry A4)
  A-->>C: 200 {accessToken (JWT 15 min), refreshToken, user}
  C->>A: POST /auth/refresh {refreshToken}
  alt token is the current one of its family
    A->>DB: rotate: mark used, issue next token in the same family
    A-->>C: 200 new pair
  else token was already rotated (stolen/replayed)
    A->>DB: revoke the whole family (all sessions from that login)
    A-->>C: 401
  end
  C->>A: POST /auth/logout {refreshToken}
  A->>DB: revoke this session → 204 (logout-all revokes every session)
```

- Every authenticated request reloads session and permissions, so logout, suspension and role changes apply at
  once without a token blocklist (A3).
- Password reset (`forgot-password` → email → `reset-password`) revokes all sessions; change-password keeps the
  current session and revokes the others.

---

## 4. Authorisation and partner context

1. **Role permissions** — 6 roles, permissions granted per role (migration 0004, A10). Routes declare
   `permissions` (all required) or `anyPermissions`.
2. **Ownership** — `*.own` routes filter by the caller; another user's resource answers **404**, not 403, so ids
   cannot be probed (H1).
3. **Partner context** — every `/partners/me/*` route runs `partnerGuard`:

```mermaid
flowchart LR
  R[request] --> M{memberships of the user}
  M -->|none| F1[403 NOT_A_PARTNER]
  M -->|one| P[that organisation]
  M -->|several| X{X-Partner-Id header?}
  X -->|missing| F2[400 PARTNER_CONTEXT_REQUIRED]
  X -->|not a member| F4[403 NOT_A_MEMBER]
  X -->|member| P
  P --> A{organisation approved?}
  A -->|no| F5[403 PARTNER_NOT_APPROVED<br/>except application/team routes]
  A -->|yes| S{organisation type allows this supply?<br/>D2}
  S -->|no| F3[403 SUPPLY_NOT_ALLOWED]
  S -->|yes| OK[req.partner = partnerId, role, type → service checks row ownership D4]
```

---

## 5. Partner onboarding and supply moderation

```mermaid
stateDiagram-v2
  direction LR
  state "Partner organisation" as P {
    [*] --> pending: POST /partners/apply
    pending --> approved: admin
    pending --> rejected: admin (notes required)
    rejected --> pending: applicant edits (resubmits)
    rejected --> approved: admin
    approved --> suspended: admin (roles revoked)
    suspended --> approved: admin
  }
```

- Approval grants every member the global role for the organisation's type (hotel_partner / guide /
  package_provider); every status or membership change re-syncs roles (D2). Identity fields lock after approval (D3).
- Admins cannot review their own organisation (`SELF_REVIEW_FORBIDDEN`, D5).

```mermaid
stateDiagram-v2
  direction LR
  state "Property / experience / package" as S {
    [*] --> pending_review: partner creates
    pending_review --> published: admin
    pending_review --> rejected: admin
    rejected --> pending_review: partner edits
    rejected --> published: admin
    published --> suspended: admin
    published --> rejected: admin
    suspended --> published: admin
  }
```

- **Public** means published **and** the partner organisation is approved (D5). Suspending a partner hides all
  of its supply at once.
- Guides follow verification instead: unverified → pending (document submitted) → verified/rejected; public =
  active + verified + approved partner (D6).

---

## 6. Media upload

```mermaid
sequenceDiagram
  participant B as Browser
  participant F as BFF
  participant A as API (media)
  participant S as S3 storage
  participant Wk as Worker
  F->>A: POST /media/upload-init {purpose, mimeType, fileSize}
  A->>A: purpose rules: permission, MIME allowlist, size limit, visibility (B3)
  A-->>F: 201 {media (pending), upload: presigned PUT, 10 min, signed type+length}
  B->>S: PUT file (cannot change type or size)
  F->>A: POST /media/upload-complete {mediaId}
  A->>S: HEAD size + read first bytes (magic-number check, B2)
  alt matches
    A-->>F: 200 media ready (+ outbox media.uploaded)
    Wk->>S: EXIF-orient, strip metadata (no GPS), record width/height (G9)
  else mismatch
    A->>S: delete object
    A-->>F: 422 rejected
  end
```

Public images are served directly from the bucket/CDN URL; private documents only through 5-minute signed URLs
to the uploader or `media.manage` (B3). Media referenced anywhere cannot be deleted (409 `MEDIA_IN_USE`, B4).

---

## 7. Booking

### Quote and create

```mermaid
sequenceDiagram
  participant C as Traveller (via BFF)
  participant B as API (bookings)
  participant Sup as Supply module (properties/guides/experiences/packages)
  participant DB as PostgreSQL
  C->>B: POST /bookings/quote {itemType, resourceId, dates/party}
  B->>Sup: price + indicative availability (no reservation)
  B-->>C: 200 quote (decimal strings, snapshot of policy)
  C->>B: POST /bookings + Idempotency-Key
  B->>DB: idempotency record (scope bookings.create:userId, E7)
  B->>DB: BEGIN
  B->>Sup: prepareBooking(lock: supply row FOR UPDATE, E5)
  Sup->>DB: capacity − active allocations (confirmed + unexpired held)
  alt instant mode and capacity available
    B->>DB: booking pending_payment + inventory_hold held (expires in 15 min)
  else request mode
    B->>DB: booking requested (no hold; partner has 24 h)
  else no capacity
    B-->>C: 409 INSUFFICIENT_AVAILABILITY
  end
  B->>DB: snapshot (prices, policy, request) + outbox booking.created/requested · COMMIT
  B-->>C: 201 booking (replay with same key → same booking, Idempotent-Replay: true)
```

Concurrency guarantee: six buyers racing for the last room produce exactly one booking. Guide time ranges are
additionally protected by a GiST exclusion constraint on holds (E5, verified in tests).

### Booking states

```mermaid
stateDiagram-v2
  [*] --> requested: request-to-book
  [*] --> pending_payment: instant (hold 15 min)
  requested --> pending_payment: partner approves (capacity re-checked, 24 h to pay)
  requested --> rejected: partner rejects
  requested --> expired: no answer in 24 h
  requested --> cancelled: guest cancels
  pending_payment --> confirmed: payment settled while hold active
  pending_payment --> expired: hold/payment window lapsed (sweep)
  pending_payment --> cancelled: guest cancels (free)
  expired --> confirmed: late payment, capacity re-acquired (F5)
  confirmed --> completed: service end passed (sweep)
  confirmed --> cancelled: guest/admin cancels (policy refund)
  completed --> [*]
```

- Transitions are enforced by one table in `bookings.service.js`; anything else is 409 `INVALID_BOOKING_STATE`.
- A lapsed hold stops counting towards capacity immediately; the 30 s sweep only records the state change and
  emits events (E4).
- Every transition is written to `booking_status_history` and emits an outbox event.

---

## 8. Payment

```mermaid
sequenceDiagram
  participant C as Traveller (via BFF)
  participant A as API (payments)
  participant R as Razorpay
  participant Wk as Worker
  C->>A: POST /bookings/:id/payment-order + Idempotency-Key
  A->>R: create order (amount in paise, receipt = order id)
  A-->>C: 201 {checkout: keyId, orderId, amount}
  C->>R: Razorpay Checkout (card/UPI)
  R-->>C: {order_id, payment_id, signature}
  C->>A: POST /payments/verify
  A->>A: HMAC(order_id|payment_id) must match (F2)
  A->>R: fetch payment → order, amount, currency must match; capture if authorized
  A->>A: settlePayment (order row lock, idempotent, F3)
  A-->>C: 200 {outcome: confirmed, bookingStatus, paymentStatus}
  R->>A: webhook payment.captured / order.paid (signed, persisted, deduped by event id, F4)
  A->>A: same settlePayment → no second confirmation
  Wk->>R: reconciliation for orders with no callback/webhook (F8)
```

`settlePayment` outcomes (exactly one captured transaction per payment):

| Situation | Result |
|-----------|--------|
| Booking `pending_payment`, hold active | `confirmed`, payment `paid`, outbox `booking.confirmed` |
| Hold already lapsed, capacity still free | re-acquired under the supply lock → `confirmed` at the paid price (F5) |
| Hold lapsed, capacity gone | full `late_payment` refund — never overbooks (F5) |
| Booking already confirmed by another payment | `duplicate_payment` refund; booking stays paid (F5) |
| Same payment seen again (callback + webhook + reconciliation) | acknowledged, no side effects (F3) |

Without Razorpay keys (development default) payment routes answer `503 PAYMENTS_NOT_CONFIGURED` (F1).

---

## 9. Cancellation and refunds

```mermaid
flowchart TD
  C[POST /bookings/:id/cancel] --> S{paid?}
  S -->|no| FREE[cancelled · holds released · no fee]
  S -->|yes| POL[refund = snapshotted policy tier<br/>by hours before service start E9/C11]
  POL --> BC[booking_cancellations refund_pending<br/>+ outbox booking.cancelled]
  BC --> J[worker: refund-processing job G7<br/>60 s sweep as safety net]
  J --> RP[refund row · receipt = refund id]
  RP --> CHK{provider already has a refund<br/>with this receipt? F6}
  CHK -->|yes| ADOPT[adopt it — no second refund]
  CHK -->|no| CALL[Razorpay refund]
  CALL -->|ok| SUC[succeeded · booking partially_refunded/refunded<br/>· outbox refund.succeeded → email]
  CALL -->|error| RETRY[failed → exponential backoff ×5<br/>→ admin POST /admin/refunds/:id/retry]
```

Admins can also issue manual partial refunds (`refunds.initiate`, Idempotency-Key, audited); total refunds can never
exceed the captured amount because refunds lock the captured transaction (F6).

---

## 10. Events, outbox and background jobs

```mermaid
flowchart LR
  subgraph tx [Business transaction — API or worker]
    W1[state change] --- W2[INSERT outbox_events]
  end
  tx -->|COMMIT| D[outbox-dispatch every 2 s<br/>claim pending FOR UPDATE SKIP LOCKED]
  D -->|jobId = eventId-name<br/>BullMQ de-duplicates| Q1[notification-delivery]
  D --> Q2[booking-confirmation → voucher PDF]
  D --> Q3[refund-processing]
  D --> Q4[media-processing]
  D -->|mark processed in same tx;<br/>Redis down → retry with backoff| D
```

| Event | Jobs |
|-------|------|
| `auth.*`, `booking.*`, `refund.*`, `partner.status_changed` | `notification-delivery` → in-app + email |
| `booking.confirmed` | also `booking-confirmation` → voucher PDF (G8) |
| `booking.cancelled` with a refund due | also `refund-processing` (G7) |
| `media.uploaded` | `media-processing` (G9) |

Scheduled jobs (one firing per interval across all worker replicas, G2):

| Every | Job |
|-------|-----|
| 2 s | outbox dispatch |
| 30 s | booking sweep: expire lapsed holds/requests, complete finished services |
| 60 s | payment reconciliation · refund sweep |
| 1 h | housekeeping: stale uploads, old login attempts/tokens/idempotency records/outbox rows (G10) |

Guarantees: an event committed while the worker or Redis is down is delivered after restart (verified); every
consumer is idempotent, so at-least-once delivery never duplicates an email, voucher or refund (P9).

---

## 11. Notifications

1. The notifier maps the event to templates per channel (`in_app`, `email`) and recipients (guest, partner
   members, admins).
2. Each message gets a `dedupe_key` (event, template, channel, recipient) — a re-run cannot send it twice (G4).
3. Templates are plain text with `{{placeholders}}`; values are HTML-escaped for email; inactive templates are
   skipped; admins edit them via `/admin/notification-templates` (audited, G5).
4. Email bodies are never stored (they may contain one-time links); deliveries record status and attempts.
5. Users read their inbox via `/notifications` (unread count, mark read, read-all).

---

## 12. Trips, favorites and reviews

- **Trips** are private plans — never reservations (H1). Creating a dated trip creates one day per date; changing
  dates re-dates days; stops can be reordered across days in one atomic request (deferred unique order, H3).
- **Favorites** save any publicly listed destination, property, guide, experience or package; saving twice is a
  no-op (200), and an item that later goes private stays listed as `available: false` (H4).
- **Reviews**:

```mermaid
stateDiagram-v2
  direction LR
  [*] --> pending: author writes<br/>(bookable item: own completed booking required, H5)
  pending --> approved: moderator
  pending --> hidden: moderator + note
  pending --> rejected: moderator + note
  approved --> hidden: moderator + note
  approved --> pending: author edits
  hidden --> pending: author edits
  rejected --> pending: author edits
```

An author may delete their own review in any state; any edit sends it back to `pending`.

Only approved reviews are public, with the rating summary in `meta.rating`; authors see every status and the
moderator's note in `GET /users/me/reviews` (H6, I9).

---

## 13. Reporting, settings and audit

- **Reports** (`modules/analytics`) are read-only SQL projections over the transactional tables (I1). Ranges are
  local dates (default last 30 days, max 366), with empty buckets filled (I2). Revenue = captured − refunded by the
  date money moved; gross until O2 (I3). Partner reports are always scoped to the caller's organisation (I5).
- **Settings** (`/admin/settings`): approved keys only, validated per key, atomic, audited per changed key; the
  API's 30 s settings cache is cleared at once on this instance (I6). New values apply to bookings created afterwards.
- **Audit**: every admin mutation writes `audit_logs` in the same transaction; the table is append-only by trigger
  and by privilege (A12, J1). `/admin/audit-logs` searches by actor, entity, action prefix and date (I7).

---

## 14. Errors

| Status | When | Example codes |
|--------|------|---------------|
| 400 | malformed JSON / input type, missing partner context | `INVALID_JSON`, `INVALID_INPUT`, `PARTNER_CONTEXT_REQUIRED` |
| 401 | missing/invalid service token or user token, revoked session | `SERVICE_TOKEN_MISSING`, `SERVICE_TOKEN_INVALID`, `AUTH_REQUIRED`, `INVALID_TOKEN`, `SESSION_REVOKED` |
| 403 | authenticated but not permitted | `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED`, `NOT_A_PARTNER`, `SUPPLY_NOT_ALLOWED` |
| 404 | not found **or not yours** | `NOT_FOUND`, `BOOKING_NOT_FOUND`, `TRIP_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | state, inventory or idempotency conflict | `INSUFFICIENT_AVAILABILITY`, `INVALID_BOOKING_STATE`, `HOLD_EXPIRED`, `REVIEW_EXISTS` |
| 413 | body too large | `PAYLOAD_TOO_LARGE` |
| 422 | validation / business rule on input | `VALIDATION_ERROR` (with `details[]`), `PUBLISH_REQUIREMENTS`, `BOOKING_NOT_REVIEWABLE` |
| 429 | rate limit / login lockout | `RATE_LIMITED`, `LOGIN_LOCKED` (with `Retry-After`) |
| 503 | dependency not configured / timeout | `PAYMENTS_NOT_CONFIGURED`, `TIMEOUT` |
| 500 | unexpected — logged with the request id, never exposes internals | `INTERNAL_ERROR` |

Every error carries `requestId`; the same id is in the `X-Request-Id` response header and in every log line,
so one id traces a request across nginx, API and worker logs.

---

## 15. Deployment topology

| | Development (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
|-|-------------------------------------|----------------------------------------|
| Public edge | nginx :8080 → `/health/live`, webhooks | nginx :443 TLS (+ :80 ACME/redirect) |
| BFF / API access | nginx :8081 on `127.0.0.1` | nginx :8081 on the `bff` Docker network only |
| Database role | schema owner | least-privilege runtime role (J1) |
| Storage / email | SeaweedFS, Mailpit (localhost UIs) | managed S3, SMTP provider |
| API docs | Swagger UI at `/docs/` on :8081 | not served |
| Hardening | — | read-only FS, non-root, no capabilities, CPU/memory limits, log rotation (J2) |

Operations — releases, backups, restore drill, secret rotation — are in
[../operations/DEPLOYMENT.md](../operations/DEPLOYMENT.md). Testing every route by hand or as runnable scenarios:
[../api/POSTMAN.md](../api/POSTMAN.md).
