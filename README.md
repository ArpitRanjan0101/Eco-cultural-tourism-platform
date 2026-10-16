# Jharkhand Eco & Cultural Tourism — Backend

Backend for a tourism platform for Jharkhand: destinations and cultural content, partner-run supply (stays, guides,
experiences, packages), bookings with real-time availability, Razorpay payments and refunds, trip planning, reviews,
notifications, and an admin/analytics console.

It is an **Express 5 modular monolith** (API + background worker from one image) on **PostgreSQL 16 + PostGIS**,
**Redis/BullMQ**, and **S3-compatible storage**, run entirely in **Docker**. A Next.js BFF (not in this repo) is the
intended client: it calls the API server-to-server with a service token plus the user's JWT.

**Status:** all 10 build phases are complete and verified — 239 routes, 16 migrations, 158 passing tests, 0 lint
problems, 0 `npm audit` findings. Details: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

---

## Features

| Area | What it does |
|------|--------------|
| Identity | Registration, email verification, login with lockout, rotating refresh tokens with reuse detection, password reset, RBAC (6 roles, 48 permissions) |
| Content | Regions/districts, destinations (gallery, FAQs, related, nearby via PostGIS), CMS pages/menus/redirects/announcements, unified + fuzzy search |
| Media | Presigned direct uploads with verification, private signed URLs, image processing, reference-safe deletes |
| Partners & supply | Partner onboarding and review, teams, properties/rooms with inventory and rate calendars, guides with availability windows, experiences with sessions, packages with departures |
| Bookings | Quotes, idempotent creation, instant holds and request-to-book, concurrency-safe capacity, cancellation policies, expiry/completion sweeps, PDF vouchers |
| Payments | Razorpay orders, signature verify, signed webhooks, late-payment handling, automatic and manual refunds, reconciliation |
| Engagement | Trips with days and stops, favorites, verified-booking reviews with moderation |
| Notifications | Transactional outbox → BullMQ → email (SMTP) and in-app inbox, editable templates |
| Administration | Platform and partner dashboards, booking/revenue/destination/partner reports, platform settings, audit log search |

## Architecture at a glance

```
(future) Next.js BFF ──service token + user JWT──> nginx :8081 (private) ─┐
Razorpay ─────────────HTTPS──────────────────────> nginx :80   (public)  ─┼─> api (Express :4000)
                                                                           │      │
                                         internal network (no egress) ─────┼──────┼─────────
                                                                           v      v
                                                           postgres (PostGIS)   redis (BullMQ, rate limits)
                                                                           ^      ^
                                                                           └ worker (same image) ┘
```

- The public edge exposes only `/health/live` and the payment webhook. Everything under `/api/v1` sits behind the
  private listener and requires `X-Internal-Service-Token`.
- Responses always use one envelope: `{ success: true, data, meta? }` or
  `{ success: false, error: { code, message, details?, requestId } }`.

More: [Architecture](docs/architecture/ARCHITECTURE.md) · [Runtime flows](docs/architecture/FLOW.md) ·
[Decisions](docs/architecture/DECISIONS.md) · [Scope inventory](docs/architecture/SCOPE_INVENTORY.md)

## Tech stack

Node.js 22 · Express 5 · zod + zod-to-openapi · pg · PostgreSQL 16 / PostGIS 3.5 · Redis 7.4 · BullMQ · AWS SDK v3 (S3) ·
SeaweedFS (dev S3) · Nodemailer + Mailpit (dev SMTP) · pdfkit · sharp · pino · nginx 1.27 · node:test + supertest ·
ESLint 9. Every version is pinned exactly — see `backend/package.json` and DECISIONS.md §5.

## Getting started

**Prerequisite:** Docker with Compose v2. Nothing else is installed on the host — Node, npm and every tool run in containers.

```bash
# 1. Configure — copy and replace every placeholder secret (use hex values; generator command is in the file)
cp .env.example .env

# 2. Build and start the stack
docker compose build
docker compose up -d

# 3. Prepare the database and storage
docker compose run --rm api npm run db:migrate
docker compose run --rm api npm run storage:init
docker compose run --rm api npm run db:seed      # set BOOTSTRAP_ADMIN_* in .env first to get a super admin
```

Then check:

| URL | What |
|-----|------|
| http://localhost:8080/health/live | Public edge liveness |
| http://localhost:8081/docs/ | Swagger UI (API reference) |
| http://localhost:8081/api/v1/… | API (needs `X-Internal-Service-Token`) |
| http://localhost:8025 | Mailpit — every email the system sends in development |
| http://localhost:8333 | SeaweedFS S3 endpoint (presigned uploads, public images) |

Payment routes return `503 PAYMENTS_NOT_CONFIGURED` until `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET` and
`PAYMENT_WEBHOOK_SECRET` (Razorpay test-mode keys) are set in `.env`.

## Common commands

```bash
docker compose run --rm api npm test                   # full suite (uses the separate *_test database)
docker compose run --rm --no-deps api npm run lint
docker compose run --rm api npm run db:status
docker compose run --rm api npm run db:rollback        # [steps|all]
docker compose run --rm api npm run storage:verify     # every referenced media object exists
docker compose logs -f api worker

# Regenerate API artefacts after changing routes or schemas
docker compose run --rm --no-deps -T api node src/docs/generate.js > docs/api/openapi.json
docker compose run --rm --no-deps -T api npm run --silent postman:collection > docs/api/postman_collection.json

# Backups (on demand)
docker compose --profile ops run --rm backup                              # dump to ./backups
docker compose --profile ops run --rm backup restore.sh <file> <new_db>
docker compose --profile ops run --rm backup verify-restore.sh <db> <new_db>
```

> **Warning:** never run `docker compose down -v` against real data — it deletes the database volume.

## Testing the API

- **Automated:** `npm test` runs unit, integration, API and an end-to-end traveller journey against real PostgreSQL,
  Redis, SeaweedFS, Mailpit and an in-process fake Razorpay.
- **Postman:** import `docs/api/postman_collection.json` and `postman_environment.json`. The collection covers every
  route with ready bodies and example responses, and a chained **Scenarios** folder walks through the main business
  flows. Guide: [docs/api/POSTMAN.md](docs/api/POSTMAN.md).

## Project layout

```
backend/
  src/
    app.js, server.js        Express app and HTTP server
    config/                  zod-validated env, database, redis, storage, mailer
    core/                    errors, middleware, logging, validation, db helpers, outbox, utils, health
    modules/<name>/          routes · controller · service · repository · schema (21 modules)
    jobs/                    BullMQ queues, outbox dispatcher, worker entry point
    database/                migration/seed CLI, migrations/NNNN_*.{up,down}.sql, seeds/
    docs/                    OpenAPI and Postman generators
  tests/                     unit/ integration/ api/ e2e/
docs/                        architecture, API reference, Postman, operations runbook
infrastructure/              nginx, postgres init, storage, backup scripts
docker-compose.yml           development stack
docker-compose.prod.yml      production stack
```

## Production

Use `docker-compose.prod.yml` with `.env.production.example`. It adds a TLS edge, read-only containers, a
least-privilege database role, resource limits and log rotation. Follow the runbook:
[docs/operations/DEPLOYMENT.md](docs/operations/DEPLOYMENT.md).

Still needed before launch: a real TLS certificate, managed S3 buckets, an SMTP provider, Razorpay live keys and
webhook registration, scheduled off-site backups, and the open owner decisions (O2, O6–O8) in DECISIONS.md.

## Documentation index

| Document | Purpose |
|----------|---------|
| [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) | What was built and how it was verified, per phase |
| [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | Runtime shape, request pipeline, module rules, data conventions |
| [FLOW.md](docs/architecture/FLOW.md) | Auth, booking, payment and event flows with diagrams |
| [DECISIONS.md](docs/architecture/DECISIONS.md) | Owner decisions, principles P1–P12, per-phase decisions, technology pins |
| [SCOPE_INVENTORY.md](docs/architecture/SCOPE_INVENTORY.md) | Full route and feature register |
| [POSTMAN.md](docs/api/POSTMAN.md) | Manual API testing |
| [DEPLOYMENT.md](docs/operations/DEPLOYMENT.md) | Production deployment, rotation, backup/restore |
| [AGENT.md](AGENT.md) | Working rules for AI coding agents and contributors |
