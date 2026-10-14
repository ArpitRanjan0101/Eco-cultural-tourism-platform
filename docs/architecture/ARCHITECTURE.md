# Backend Architecture

Implements the Technical Report v1.0. This file records **how** it is built; scope lives in
[SCOPE_INVENTORY.md](SCOPE_INVENTORY.md) and deviations/clarifications in [DECISIONS.md](DECISIONS.md).

## Runtime shape

```
(future) Browser ──HTTPS──> Next.js BFF ──X-Internal-Service-Token + user JWT──┐
                                                                              v
Payment provider ──HTTPS──> nginx :80 (public edge: webhooks, /health/live)   nginx :8081 (private: /api, /health)
                                   │                                          │
                                   └──────────────> api (Express :4000) <─────┘
                                                     │        │
                              internal network ──────┼────────┼───────────────
                                                     v        v
                                         postgres (PostGIS)  redis (BullMQ, rate limits)
                                                     ^        ^
                                                     └─ worker ┘  (same image, src/jobs/worker.js)
```

- `internal` Docker network is `internal: true` (no egress, no published ports): postgres, redis, api, worker.
- `edge` network: nginx, api, worker (api/worker need egress for payment gateway, SMTP, object storage).
- Dev only: the private nginx listener is published on `127.0.0.1:8081` so developers can call the API with
  the service token. Production compose (Phase 10) does not publish it; the BFF joins the network instead.

## Request pipeline (Express)

`helmet → cors(allowlist) → requestId → pino-http (redacted) → json(1mb) → routes → 404 → errorHandler`

- `/health/live` public; `/health/ready`, `/health/version` and everything under `/api/v1` require
  `X-Internal-Service-Token` (constant-time compare, current + previous token for rotation).
- `/api/v1/webhooks/payments/:provider` (Phase 6) is mounted **before** the service-token gate and is
  authenticated by provider signature over the raw body.
- Response envelopes: `{success:true,data,meta?}` / `{success:false,error:{code,message,details?,requestId}}`.

## Module layout

```
backend/src/
  app.js server.js
  config/      env.js (zod-validated) index.js database.js redis.js [storage.js P3]
  core/        errors/ middleware/ logging/ database/ validation/ health/ utils/ [events/ P5]
  modules/<m>/ <m>.routes.js .controller.js .service.js .repository.js .schema.js .policy.js .openapi.js
  jobs/        worker.js [queues.js processors/ P5-7]
  database/    cli.js migrator.js migrations/NNNN_name.{up,down}.sql seeds/NNN_name.js
  docs/        openapi.js generate.js
backend/tests/{unit,integration,api}/
```

Rules (Report §2.2): controllers only translate HTTP ↔ service calls; business rules live in services;
a module never imports another module's repository — only its exported service or domain events.
Repositories take an executor (`pool` or transaction `client`) so services own transaction boundaries.

## Implementation order and dependencies

| Phase | Delivers | Depends on |
|-------|----------|-----------|
| 1 | Docker, config, logging, errors, validation, DB/Redis, migrations runner, health, worker process, OpenAPI base | — |
| 2 | Auth, users, RBAC, service token wiring, rate limiting, audit writer | 1 |
| 3 | Geography, destinations, media (S3/MinIO), CMS, search | 2 (admin permissions), media before destinations gallery |
| 4 | Partners, properties/rooms/inventory/rates, guides, experiences, packages | 2, 3 (districts, destinations, media) |
| 5 | Quote, bookings, holds, request-to-book, cancellation, idempotency, outbox, expiry job | 4 |
| 6 | Payment provider adapter, orders, verify, webhooks, refunds, reconciliation | 5 + gateway decision |
| 7 | BullMQ queues, outbox dispatch, notifications, vouchers, media processing | 5, 6 |
| 8 | Trips, favorites, reviews | 3, 4, 5 |
| 9 | Admin dashboard, reports, settings, audit search | all |
| 10 | Full integration/security/perf tests, prod compose, backup/restore drill, OpenAPI handoff | all |

## Data conventions

- UUID PKs via `gen_random_uuid()`; `created_at`/`updated_at TIMESTAMPTZ` with `set_updated_at()` trigger.
- Money `NUMERIC(12,2)` returned as strings; `DATE` columns returned as `YYYY-MM-DD` strings (no TZ shift).
- Sessions run in UTC. Emails use `citext`. Geography uses `geography(Point,4326)` + GiST.
- Guide overlap protection: `btree_gist` exclusion constraint on active guide holds (Phase 5).
- Migrations: forward-only SQL with paired down scripts, checksummed, run under an advisory lock as a
  separate job (`npm run db:migrate`), never on API start.
