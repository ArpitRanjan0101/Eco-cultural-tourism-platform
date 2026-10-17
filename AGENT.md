# AGENT.md — Working on this repository

Instructions for AI coding agents (and human contributors) changing this codebase. Read this file fully before
editing anything. Project overview and setup are in [README.md](README.md).

## 1. Orient first

1. Read [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md): what exists, how it was verified, what is pending.
2. Check [docs/architecture/DECISIONS.md](docs/architecture/DECISIONS.md) before changing behaviour — many rules that
   look arbitrary are recorded decisions (ids like `E7`, `F3`, `P5`). Cite the id when you rely on or change one.
3. Behaviour flows (auth, booking, payment, outbox) are in [FLOW.md](docs/architecture/FLOW.md); the full route and
   feature register is [SCOPE_INVENTORY.md](docs/architecture/SCOPE_INVENTORY.md).

The original scope (all 10 phases) is complete. New work is additions or fixes on top of a verified baseline: keep
it passing.

## 2. Hard rules

- **Docker only.** Never install Node, npm packages or tools on the host. Run everything via `docker compose run --rm api …`.
- **Never** run `docker compose down -v`, drop the dev database, or truncate tables outside the test suite.
- **Never** commit `.env`, real secrets, tokens or keys. Do not print secrets in logs, test output or generated docs.
- **Pin exact versions.** No `^`/`~` in `package.json`, no floating Docker tags. After dependency changes, regenerate
  the lockfile inside Docker (command in §6).
- **Ask before** scope changes, new modules, schema redesigns, deleting migrations, or anything touching open owner
  decisions (O2, O6–O8 in DECISIONS.md).
- **Do not edit generated files by hand:** `docs/api/openapi.json`, `docs/api/postman_collection.json`,
  `docs/api/postman_environment.json`. Regenerate them.
- **Migrations are append-only.** Never edit an applied migration (they are checksummed). Add a new
  `NNNN_name.up.sql` + matching `.down.sql` pair.
- On Windows, edit files with the editor/Edit tool, not PowerShell `Set-Content` (it mangles UTF-8).

## 3. Architecture rules (DECISIONS.md P1–P12)

**Modular monolith.** Each module in `backend/src/modules/<name>/` owns its tables. Another module may call only its
exported **service** (or react to its outbox events) — never import another module's repository.

**Layering:**

| File | Responsibility |
|------|----------------|
| `<m>.routes.js` | Declarative route definitions (method, path, auth, permissions, zod request/response, errors, handler). Drives Express wiring, validation, OpenAPI **and** the Postman collection. |
| `<m>.controller.js` | HTTP only: `req.valid.*` → service → `sendSuccess` / `sendCreated` / `sendNoContent`. No business logic. |
| `<m>.service.js` | Business rules, permissions beyond the route gate, transaction boundaries. Throws `ApiError`. |
| `<m>.repository.js` | Parameterised SQL only. First argument is an executor (`pool` or a transaction `client`). |
| `<m>.schema.js` | zod schemas for params/query/body/responses. Objects are `strict` — unknown fields are rejected. |
| `<m>.policy.js` | Optional: reusable authorisation checks. |

New module → add its routes to `backend/src/modules/index.js` (static paths before parameterised ones).

**Route definition** (see `core/http/routes.js` for every option):

```js
{
  method: 'post', path: '/favorites', tags: ['Favorites'], summary: 'Save item',
  auth: 'user',                          // 'service' (token only) | 'user' (token + JWT) | 'webhook'
  permissions: ['favorites.manage.own'], // all required; or anyPermissions: [...]
  rateLimit: { name, windowSeconds, max, by: 'ip' | 'user' }, // optional
  request: { params, query, body },      // zod
  response: { status: 201, schema: successEnvelope(schema.favoriteSchema) },
  errors: [404, 409],
  handler: controller.add,
}
```

## 4. Coding conventions

- CommonJS, `'use strict';` at the top of every file, Node 22. Match the surrounding style; ESLint must pass.
- **Responses:** `{ success: true, data, meta? }` / `{ success: false, error: { code, message, details?, requestId } }`.
  Error codes are stable `UPPER_SNAKE` strings (`ApiError.notFound('Favorite not found', 'FAVORITE_NOT_FOUND')`).
  422 = validation, 409 = state / inventory / idempotency conflict.
- **Money:** `NUMERIC(12,2)` in SQL, decimal **string** in the API (`"2500.00"`). Do arithmetic in integer paise with
  `core/utils/money.js` (`toMinor`, `fromMinor`, `sum`, `multiply`). Never use floats.
- **Time:** instants are UTC `timestamptz` / ISO-8601. Calendar dates are `YYYY-MM-DD` strings in Asia/Kolkata —
  use `core/utils/dates.js`; never convert dates through `Date` with a time zone.
- **Transactions:** `withTransaction(fn, options)` from `core/database/transaction.js` (isolation levels,
  serialisation retry). Anything that sells capacity locks the owning row `FOR UPDATE` inside one transaction.
- **Admin mutations** go through `audit.auditedTransaction()` so the audit row commits with the change.
- **Side effects** (email, vouchers, refunds, notifications) are written with `appendOutboxEvent()` inside the same
  transaction, then delivered by the worker. Consumers must be idempotent (at-least-once delivery).
- **Retryable client operations** (booking create, payment order, manual refund) require `Idempotency-Key` —
  use `core/database/idempotency.js` (`requireKey`, `runOnce`).
- **Dynamic UPDATEs** use the allowlisted builder in `core/database/sql.js` (`buildUpdate`). No string-built SQL from input.
- **Pagination/sorting/search** use `core/utils/pagination.js` (`paginationQuery`, `sortQuery`, `orderBy`,
  `pageMeta`, `likePattern`).
- **Validation helpers** live in `core/validation/fields.js` and `common.js` — reuse them rather than redefining
  money/date/slug/uuid fields.
- Permissions are re-read from the database on each request; do not cache them in JWTs.
- Comments are sparse and explain *why*; JSDoc one-liners on non-obvious service functions.

## 5. Database

- Migrations: `backend/src/database/migrations/NNNN_name.up.sql` + `.down.sql`. Run with `npm run db:migrate`
  (advisory lock, one transaction each). The down script must fully reverse the up script; the test suite rolls back
  and re-applies every migration.
- UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` with the `set_updated_at()` trigger, `citext` emails,
  `geography(Point,4326)` + GiST for locations.
- Repeat critical rules as `CHECK` / `UNIQUE` / `EXCLUDE` constraints — validate at the edge **and** in the database.
- New tables must work for the least-privilege runtime role (`database/roles.js`; re-synced on `db:migrate`).
- Seeds in `database/seeds/NNN_name.js` must be idempotent. `9xx_` seeds are demo data and skipped in production.

## 6. Commands

```bash
docker compose up -d
docker compose run --rm api npm run db:migrate
docker compose run --rm api npm run db:rollback              # [steps|all]
docker compose run --rm api npm run db:seed
docker compose run --rm api npm test                         # all tests, *_test DB, serial
docker compose run --rm --no-deps api npm run lint
docker compose logs -f api worker

# Regenerate API artefacts after any route/schema change
docker compose run --rm --no-deps -T api node src/docs/generate.js > docs/api/openapi.json
docker compose run --rm --no-deps -T api npm run --silent postman:collection  > docs/api/postman_collection.json
docker compose run --rm --no-deps -T api npm run --silent postman:environment > docs/api/postman_environment.json

# Lockfile after dependency changes (no host npm)
docker run --rm -v "$PWD/backend:/app" -w /app node:22.12.0-bookworm-slim npm install --package-lock-only
```

Restart `api` and `worker` (`docker compose restart api worker`) after code changes the running stack should pick up.

## 7. Testing

- Framework: `node:test` + `supertest`, run serially against real PostgreSQL, Redis, SeaweedFS and Mailpit, with an
  in-process fake Razorpay (`tests/fakeRazorpay.js`). Tests use the `_test` database and Redis DB 1 only.
- **Always run tests through `npm test`.** Never `node --test <file>` directly: without the script's environment a
  test file targets the development database (this reset the dev DB on 2026-10-17). `tests/helpers.js` now
  refuses to load outside a `_test` database / non-zero Redis db.
- Layout: `tests/unit`, `tests/integration`, `tests/api`, `tests/e2e`. Shared setup in `tests/helpers.js`
  (`resetData`, `seedReference`, user/login helpers) and `tests/fixtures.js`.
- Every behaviour change needs a test, including the failure paths (403/404/409/422) and owner isolation
  (another user/partner gets 404).
- Tests that change role grants or settings must restore them.
- Concurrency- or time-dependent changes: run the full suite **twice** and confirm both pass.
- `tests/api/security.test.js` audits the whole route registry. New routes must: have `summary`, `tags` and
  `response.status`; validate every `:param`; use strict body schemas; be `auth: 'user'` with permissions under
  `/admin/*`, `auth: 'user'` with partner middleware under `/partners/me*`, and `auth: 'user'` for per-user paths.
  Non-GET routes without a user session must be on its `PUBLIC_MUTATIONS` list. It also asserts the exact route
  count (currently **239**) — update that number deliberately when adding or removing routes.
- `tests/unit/postman.test.js` checks the generated collection; regenerate it when routes change.

## 8. Definition of done

A change is complete only when all of these hold, run in Docker:

1. `npm run db:migrate` succeeds (and rollback + re-apply works for new migrations).
2. `npm run lint` → 0 problems.
3. `npm test` → all pass (twice for concurrency/time work).
4. OpenAPI and Postman artefacts regenerated if routes or schemas changed.
5. Docs updated: new decisions in DECISIONS.md, new flows in FLOW.md, and a dated entry with the verification
   results in IMPLEMENTATION_STATUS.md.

Report results honestly — include failing output rather than summarising it away, and say which steps you did not run.

## 9. Commits

- Work on a branch, not `main`, unless told otherwise. Commit only when asked.
- Conventional style used in history: `feat(trips): …`, `fix: …`, `docs: …`, `test: …`.
- Never skip hooks or force-push shared branches.
