# Production Deployment Runbook

Audience: the operator deploying and running the backend on a Linux host with Docker Engine ≥ 24 and the
Compose plugin ≥ 2.24. Nothing else is installed on the host. Design background: `docs/architecture/DECISIONS.md`
(J-series), architecture: `docs/architecture/ARCHITECTURE.md`.

## 1. What runs where

| Service | Image | Networks | Exposed |
|---------|-------|----------|---------|
| `nginx` | nginx 1.27.3 | edge, app, bff | 80 (ACME + redirect), 443 (TLS: `/health/live`, payment webhooks only) |
| `api` | backend `prod` target | internal, egress, app | none (nginx → api:4000) |
| `worker` | backend `prod` target | internal, egress | none |
| `postgres` | postgis 16-3.5 | internal | none |
| `redis` | redis 7.4.2 | internal | none |
| `migrate`, `backup` | on demand (`--profile ops`) | internal (+egress for migrate) | none |

- `internal` and `app` have no outside route. `egress` gives the API/worker outbound access to S3, Razorpay and SMTP.
- The Next.js BFF reaches the API at `http://nginx:8081` by joining the `bff` network (`BFF_NETWORK`, declared
  `external: true` in the BFF's compose file). Port 8081 is never published.
- Object storage (S3-compatible) and SMTP are managed services; there is no SeaweedFS or Mailpit in production.
- Containers run read-only (tmpfs `/tmp`), as non-root, with all Linux capabilities dropped, `no-new-privileges`,
  CPU/memory limits and rotated JSON logs (10 MB × 5).

## 2. One-time setup

1. **Configuration.** Copy `.env.production.example` to `.env.production`, set `chmod 600`, and replace every value
   (hex secrets: `docker run --rm alpine sh -c "head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'"`).
   The API refuses to start in production with placeholder secrets, missing Razorpay keys or a non-https
   `PUBLIC_BASE_URL`.
2. **Object storage.** Create a public bucket (anonymous read, served through the CDN in
   `STORAGE_PUBLIC_BASE_URL`) and a private bucket (no public access). Enable **versioning** on both and a lifecycle
   rule for old versions. Allow CORS `PUT` from the web origin on both buckets (browsers upload with presigned URLs).
   The access key needs `GetObject`, `PutObject`, `DeleteObject`, `HeadBucket` on the two buckets only.
3. **TLS.** Put `fullchain.pem` and `privkey.pem` in `TLS_CERT_DIR` (default `infrastructure/nginx/certs`, git-ignored).
   With Let's Encrypt: start nginx once on port 80 and use the webroot `ACME_WEBROOT`
   (`certbot certonly --webroot -w <ACME_WEBROOT> -d api.example.org`), then copy/symlink the certificates and
   reload nginx (`docker compose ... exec nginx nginx -s reload`) after each renewal.
4. **Database, roles and reference data.**
   ```sh
   C="docker compose -f docker-compose.prod.yml --env-file .env.production"
   $C build                                   # or pull IMAGE_REPOSITORY:IMAGE_TAG from your registry
   $C up -d postgres redis
   $C run --rm migrate                        # migrations as the owner + creates the runtime role
   $C run --rm migrate node src/database/cli.js seed   # reference data + BOOTSTRAP_ADMIN_* super admin
   ```
   Then clear `BOOTSTRAP_ADMIN_PASSWORD` from `.env.production` and change that password after the first login.
   The demo seed (`900_demo_destinations`) never runs in production.
5. **Start.** `$C up -d` and check `curl -fsS https://<host>/health/live`, then from the BFF network
   `curl -H "X-Internal-Service-Token: …" http://nginx:8081/health/ready` (`ready: true`).
6. **Razorpay.** Register `<PUBLIC_BASE_URL>/api/v1/webhooks/payments/razorpay` in the Razorpay dashboard with the
   secret in `PAYMENT_WEBHOOK_SECRET` (events: `payment.authorized`, `payment.captured`, `payment.failed`,
   `order.paid`, `refund.created`, `refund.processed`, `refund.failed`).

## 3. Releasing a new version

```sh
export IMAGE_TAG=<git commit>             # also set in .env.production
$C build api                              # builds the prod target once; worker/migrate share the image
$C --profile ops run --rm backup          # safety backup before schema changes
$C run --rm migrate                       # forward-only, transactional, re-syncs runtime grants
$C up -d api worker                       # rolling restart; readiness gates on zero pending migrations
```

- Migrations are written to be backward compatible with the running version (add first, remove in a later release).
- Rollback of code: redeploy the previous `IMAGE_TAG`. Rollback of schema: `run --rm migrate node src/database/cli.js
  rollback 1` only for a migration released with the bad code and only after a fresh backup.
- `migrate` holds a PostgreSQL advisory lock, so two concurrent runs cannot interleave.

## 4. Database roles

- `POSTGRES_USER` owns the schema and is used only by `migrate`, `backup` and `seed`.
- `DATABASE_APP_USER` is used by the API and worker: `SELECT/INSERT/UPDATE/DELETE` on tables, no DDL, no `TRUNCATE`,
  `audit_logs` insert/read only, `schema_migrations` read only. `db:migrate` re-applies these grants every time
  (`npm run db:roles` does it alone). Rotate its password by changing `DATABASE_APP_PASSWORD`, running
  `$C run --rm migrate`, then `$C up -d api worker`.

## 5. Backups and restore

- **Schedule** a daily backup from the host (cron/systemd), and copy `BACKUP_HOST_DIR` off-site (encrypted):
  `0 2 * * * cd /srv/jharkhand-tourism && docker compose -f docker-compose.prod.yml --env-file .env.production --profile ops run --rm backup`
- Each run writes `<db>-<UTC timestamp>.dump` (custom format) + `.sha256`, verifies it with `pg_restore --list`, and
  prunes files older than `BACKUP_RETENTION_DAYS`.
- Media files live in object storage, not in the dump: bucket versioning (step 2) is the media backup.
- **Restore** (never over the live database):
  ```sh
  $C --profile ops run --rm backup restore.sh <file.dump> tourism_restore      # new database, single transaction
  $C --profile ops run --rm backup verify-restore.sh tourism tourism_restore   # only meaningful against a quiesced source
  $C run --rm -e DATABASE_URL=postgres://<owner>:<pw>@postgres:5432/tourism_restore api npm run storage:verify
  ```
  `storage:verify` confirms that every ready media record still has its object in storage. To switch over, stop
  `api`/`worker`, point `POSTGRES_DB` at the restored database, run `$C run --rm migrate` (re-grants the runtime
  role), then start `api`/`worker`.
- **Drill:** run the restore + verify steps quarterly; the procedure was executed on 2026-10-15 (see
  `docs/IMPLEMENTATION_STATUS.md`, Phase 10).

## 6. Secrets rotation

| Secret | Procedure |
|--------|-----------|
| `INTERNAL_SERVICE_TOKEN` | Move the current value to `INTERNAL_SERVICE_TOKEN_PREVIOUS`, set a new value, restart api; update the BFF; then clear `_PREVIOUS` and restart again. |
| `JWT_ACCESS_SECRET` | Change and restart api: access tokens (15 min) become invalid; refresh tokens keep working, so users stay signed in. |
| `DATABASE_APP_PASSWORD` | See §4. |
| `POSTGRES_PASSWORD` | `ALTER ROLE` inside postgres, then update `.env.production` (used by migrate/backup only). |
| `REDIS_PASSWORD` | Change, then `$C up -d redis api worker` (queued jobs persist in the AOF volume). |
| Razorpay / SMTP / S3 keys | Create the new key at the provider, update `.env.production`, `$C up -d api worker`, revoke the old key. |

## 7. Operations

- **Health:** `/health/live` (public), `/health/ready` and `/health/version` (service token) report database, Redis,
  migrations, worker heartbeat, storage and queue backlog/failures.
- **Logs:** `$C logs -f api worker` (JSON, secrets redacted, every line carries the request id).
- **Scaling:** the worker can run as several replicas (`$C up -d --scale worker=2`); schedules fire once across
  replicas. The API is stateless; scale behind nginx by adding replicas the same way.
- **API reference:** `docs/api/openapi.json` (regenerate per release) and the Swagger UI page `docs/api/index.html`,
  served in development at `http://localhost:8081/docs/`. It is not exposed on the production edge.

## 8. Before going live (owner decisions still open)

- **O2** merchant of record, GST, partner settlement/payouts — required before live payments (tax rate stays 0).
- **O6/O7** choose the SMTP and S3 providers (any standard provider works).
- **O8** a public read route for CMS redirects, if the frontend needs it.
