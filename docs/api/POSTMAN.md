# Testing the API with Postman

Files (both generated, do not hand-edit — see [Regenerating](#regenerating)):

| File | What it is |
|------|------------|
| `postman_collection.json` | Every API route (239 + 3 health checks) with ready JSON bodies, saved example responses, auth, and runnable end-to-end scenarios |
| `postman_environment.json` | The variables you fill in once (URLs, service token, admin login) |

## 1. One-time setup (2 minutes)

1. Start the stack: `docker compose up -d` (from the project root). Check `http://localhost:8081/docs/` loads.
2. Postman → **Import** → select both files from `docs/api/`.
3. Top-right environment selector → **Jharkhand Tourism · Local (Docker)** → edit it and fill the *Current value*
   column from your `.env` (keep them out of shared workspaces — they are secrets):

   | Variable | Value from `.env` |
   |----------|-------------------|
   | `serviceToken` | `INTERNAL_SERVICE_TOKEN` |
   | `adminEmail` | `BOOTSTRAP_ADMIN_EMAIL` |
   | `adminPassword` | `BOOTSTRAP_ADMIN_PASSWORD` |
   | `paymentWebhookSecret` | `PAYMENT_WEBHOOK_SECRET` (only for the webhook request) |

   `baseUrl` (`http://localhost:8081/api/v1`), `healthUrl` and `mailpitUrl` (`http://localhost:8025`) are preset.
4. Open **00 · Start here** and send the requests top to bottom. *Log in as the admin* stores `accessToken` and
   `refreshToken` automatically; every user route then works.

## 2. How the collection works

- **JSON is always ready.** Every POST/PUT/PATCH opens with a valid example body (each one is checked against the
  API's own validation in the test suite). Open **Examples** (right side of a request, or the request's
  dropdown in the sidebar) to see the exact success JSON and the error JSON the route returns.
- **Auth is automatic.** The collection adds `X-Internal-Service-Token` to API requests (and only API requests).
  User routes use `Bearer {{accessToken}}`; public routes are marked *No Auth*.
- **Find any route** by its method and path: every request is named `<summary> · <METHOD> <path>`, so typing
  `POST /bookings` in Postman's sidebar search finds it.
- **Ids flow between requests.** A successful create (e.g. `POST /admin/destinations`) stores `destinationId` /
  `destinationSlug`; list requests fill an empty id with their first item. Detail/update requests use those
  variables, so you can run *create → get → update* without copying ids. See the values under the collection's
  **Variables** tab.
- **Dates are always in the future.** Bodies use `{{dateIn10Days}}`, `{{dateIn12Days}}`, … computed before each send.
- **Idempotency.** Booking, payment-order and refund requests send `Idempotency-Key: {{$guid}}` (a fresh key each
  send). To test a replay, replace it with a fixed value and send twice — the second answer has
  `Idempotent-Replay: true` and the same booking.
- **Request descriptions** list the required permissions, rate limits and documented error codes.
- **Every response is checked**: no unexpected 5xx and the standard `{ success, … }` envelope (see *Tests* tab).

## 3. Run the end-to-end scenarios (recommended first)

Folder **01 · Scenarios (run in order)** is a chained test of the main business flows. Right-click it →
**Run folder** → *Run*. Each step asserts its result and passes ids to the next step:

| Part | What it proves |
|------|----------------|
| A · Admin publishes a destination | draft → categories → published → publicly visible |
| B · Partner onboarding | register → verification email read from Mailpit → verify → login → apply → admin approval → property + room → admin publishes |
| C · Traveller plans and books | register/verify/login, search, favorite, dated trip with a stop, quote (2 × 2500.00), booking with idempotent replay, payment order, partner sees booking, free cancellation |
| D · Reviews and moderation | pending review → admin approves → public with rating summary, author's own list |
| E · Oversight | admin dashboard, bookings report, partner dashboard, audit trail of the moderation, settings |
| F · Sign out | logout, and the revoked refresh token is refused |

Notes: needs the worker and Mailpit running (they are in the dev stack). Each run uses new emails, so it is
repeatable. Without Razorpay keys the payment-order step correctly receives `503 PAYMENTS_NOT_CONFIGURED` and
the scenario continues.

From the command line (no install — runs newman in Docker against the dev stack):

```bash
# copy the environment, fill serviceToken/adminEmail/adminPassword, and use Docker-network URLs:
#   baseUrl=http://nginx:8081/api/v1  healthUrl=http://nginx:8081  mailpitUrl=http://mailpit:8025
docker run --rm --network jharkhand-tourism_edge -v "$PWD/docs/api:/work" -w /work node:22.12.0-bookworm-slim \
  npx -y newman@6.2.1 run postman_collection.json -e my-env.json \
  --folder "00 · Start here" --folder "01 · Scenarios (run in order)"
```

Last verified 2026-10-16: 51 requests, 146 assertions, 0 failures (two consecutive runs); plus every GET route of
the reference folders: 112 requests, 224 assertions, 0 failures.

## 4. Testing by area (reference folders 02 …)

One folder per API area, in the same order as the OpenAPI document (*Auth, Users, Media, Geography, Destinations,
CMS, Search, Partners, Accommodation, Guides, Experiences, Packages, Bookings, Payments, Webhooks, Notifications,
Trip planner, Favorites, Reviews, Reports, Settings, Audit* — with `Admin:` and `Partner:` folders for the
privileged routes).

Typical manual sessions:

- **Content admin:** `POST /admin/destinations` → `PUT /admin/destinations/:id/categories` →
  `PATCH /admin/destinations/:id/status` (`published`) → `GET /destinations/:slug`.
- **Partner:** log in as a partner user (copy their `accessToken` into the variable, or run scenario B first and
  set `accessToken` to `partnerAccessToken`) → *Partner: Accommodation* requests. Members of several
  organisations enable the `X-Partner-Id` header (disabled by default).
- **Traveller booking:** needs a published room (`roomId`) — run scenario B, or use your own.
  `POST /bookings/quote` → `POST /bookings` → `GET /bookings/:id`.
- **Reports / settings / audit:** *Admin: Reports*, *Admin: Settings*, *Admin: Audit* with the admin token.
  `PATCH /admin/settings` requires a super admin (the bootstrap admin is one).

Useful tips:

- **Verification and reset emails** arrive in Mailpit: <http://localhost:8025>. Copy the `token=` value from the
  link into `POST /auth/verify-email` / `POST /auth/reset-password`.
- **Uploads:** `POST /media/upload-init` returns a presigned `upload.url` (stored as `uploadUrl`). PUT the file
  there (Postman: new request, method PUT, URL `{{uploadUrl}}`, Body → *binary*, and the `Content-Type` /
  `Content-Length` from `upload.headers`), then send `POST /media/upload-complete`.
- **Real payments (test mode):** set `PAYMENT_KEY_ID/SECRET/WEBHOOK_SECRET` (rzp_test_…) in `.env`, recreate
  `api worker`, create a payment order, pay in Razorpay Checkout with test credentials, then send
  `POST /payments/verify` with the `providerPaymentId` and `signature` from Checkout's success handler.
- **Webhook** (`POST /webhooks/payments/:provider`): the pre-request script signs the body with
  `paymentWebhookSecret` exactly as Razorpay does. It must match `PAYMENT_WEBHOOK_SECRET` in `.env`; edit the
  payload ids to refer to a real order/payment.
- **Destructive requests** (`POST /auth/logout-all`, `POST /auth/change-password`, `DELETE …`, role/permission edits) do what
  they say on your local data. Change-password uses `{{adminPassword}}` as the current password; update the
  environment after running it.
- **Rate limits** (e.g. login 20/min per IP) return `429` with `Retry-After` — wait, or restart Redis in dev.

## 5. Regenerating

The collection is generated from the route definitions, so it always matches the code:

```bash
docker compose run --rm --no-deps -T api npm run --silent postman:collection  > docs/api/postman_collection.json
docker compose run --rm --no-deps -T api npm run --silent postman:environment > docs/api/postman_environment.json
docker compose run --rm --no-deps -T api node src/docs/generate.js > docs/api/openapi.json
```

Re-import the collection in Postman after regenerating (*Replace* keeps your environment values). The unit test
`tests/unit/postman.test.js` fails the build if a body, example, path variable or variable declaration is wrong.
