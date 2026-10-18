# CLAUDE.md — Jharkhand Eco & Cultural Tourism frontend

Instructions for AI agents (and contributors) working in `frontend/`. Read fully before changing anything.
The repository-wide rules in [../AGENT.md](../AGENT.md) also apply (Docker only, no secrets, pinned versions,
work on a branch, commit only when asked).

## 1. Orient first

1. [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md): current phase, what is approved, what is pending.
2. [docs/DECISIONS.md](docs/DECISIONS.md): W decisions, WO open questions, G backend gaps. Cite ids in code comments.
3. Only the docs relevant to the task: [SITEMAP](docs/SITEMAP.md), [API_MAPPING](docs/API_MAPPING.md),
   [PERMISSIONS_MATRIX](docs/PERMISSIONS_MATRIX.md), [CMS_CONTRACTS](docs/CMS_CONTRACTS.md),
   [COMPONENT_CATALOG](docs/COMPONENT_CATALOG.md), [FRONTEND_HLD](docs/FRONTEND_HLD.md), [FRONTEND_LLD](docs/FRONTEND_LLD.md).
4. Backend contract: `../docs/api/openapi.json` (generated, authoritative). Backend report:
   `../docs/backend/Jharkhand_Tourism_Complete_Backend_Technical_Report.pdf`. Backend flows: `../docs/architecture/FLOW.md`.

## 2. Stack (fixed)

Next.js App Router · JavaScript/JSX only · Tailwind CSS · React Hook Form · Zod · TanStack Query · Docker.
**Not allowed without owner approval:** TypeScript, Redux, GraphQL, microfrontends, new dependencies,
unrelated functionality.

## 3. Mandatory architecture

- Feature-first modules (`src/features/<f>/`); props-driven presentational components in `src/components/`.
- Centralised design tokens and documented variants (W20); no ad-hoc colours or spacing.
- Server Components by default; `'use client'` only for interactive behaviour.
- Browser API calls go through the Next.js BFF (`/api/*`) only; server-rendered data uses the server-only
  backend client (`src/lib/api`, `import 'server-only'`).
- Internal service token from server environment only; never in `NEXT_PUBLIC_*`, client code, logs or responses.
- User JWT and refresh token in secure HttpOnly cookies only; refresh only in middleware, single-flight (W6).
- Express owns business rules, RBAC, booking, pricing, availability and payments. The UI reflects them (W4, W13).
- CMS renders only the approved section registry with validated JSON (W15, CMS_CONTRACTS).
- No database or Redis connection from Next.js.

## 4. Workflow per task

1. Read IMPLEMENTATION_STATUS and confirm the task belongs to the current, approved phase.
2. Inspect only the relevant files and contracts.
3. Implement one approved component/task group at a time.
4. Add tests and validation (unit/component; BFF integration for anything touching tokens, cookies or forwarding).
5. Run commands in Docker only (`docker compose run --rm web …`, defined in Phase 1).
6. Fix actual errors; do not suppress or skip failing checks.
7. Update COMPONENT_CATALOG and IMPLEMENTATION_STATUS (dated entry with the real verification output).
8. Stop at the phase gate and wait for explicit approval.

## 5. Never

- Rewrite unrelated completed files, or change backend files from frontend work.
- Expose internal service tokens or user tokens to the browser.
- Hardcode real prices, ratings, availability or other business data.
- Invent backend endpoints, fields or DTO shapes. If a page needs something the contract lacks, record a
  G gap in DECISIONS.md and stop for a decision.
- Claim tests pass without running them.
- Fill missing integrations with fake success responses (for example payments without keys → show the
  backend's `PAYMENTS_NOT_CONFIGURED` state).
- Advance phases without explicit approval.
- Edit generated files by hand: `docs/API_MAPPING.md`, `src/lib/bff/allowlist.generated.js`. Regenerate them.
- Call Express from anywhere but `src/lib/bff/backendClient.js`, or forward a path that is not in the allowlist.

## 6. Commands (repository root, Docker only)

```powershell
docker compose up -d                                                     # backend stack first (shared network)
Copy-Item frontend\.env.example frontend\.env                            # then set INTERNAL_SERVICE_TOKEN from root .env
docker compose -f frontend/compose.dev.yml up -d --build web             # dev server → http://127.0.0.1:3000
docker compose -f frontend/compose.dev.yml run --rm --no-deps web npm run lint
docker compose -f frontend/compose.dev.yml run --rm --no-deps web npm test
docker compose -f frontend/compose.dev.yml --profile e2e up -d --build web-e2e   # prod build as test target (W30)
docker compose -f frontend/compose.dev.yml --profile e2e run --rm --build e2e    # browser tests incl. axe
# CMS and supply suites need an existing admin, passed from the shell only (W39, W47):
#   $env:E2E_ADMIN_EMAIL='…'; $env:E2E_ADMIN_PASSWORD='…'; docker compose -f frontend/compose.dev.yml --profile e2e run --rm e2e
# Backend tests: ONLY `docker compose run --rm api npm test` — never `node --test <file>` (it targets the dev DB).
# Shared components: usage examples at http://127.0.0.1:3000/design-system (dev only); catalog in docs/COMPONENT_CATALOG.md
docker build --target prod -t jharkhand-tourism-web:prod frontend        # prod image (fails on client-bundle leaks)

# After dependency changes: regenerate the lockfile with the image's pinned npm, then recreate the dev volumes
docker build --target base -t jharkhand-tourism-web:base frontend
docker run --rm -v "${PWD}\frontend:/app" -w /app jharkhand-tourism-web:base npm install --package-lock-only --ignore-scripts
docker compose -f frontend/compose.dev.yml up -d --build -V web
```

Dev uses webpack with polling for hot reload on the Windows bind mount (W26). Exact pins only; no `^`/`~`.

## 7. Generated artefacts

```powershell
# Writes docs/API_MAPPING.md AND src/lib/bff/allowlist.generated.js from ../docs/api/openapi.json (W5, W24)
docker compose -f frontend/compose.dev.yml run --rm --no-deps web npm run contract:generate
```

Regenerate whenever `../docs/api/openapi.json` changes. On Windows, edit text files with the Edit tool, not
PowerShell `Set-Content` (UTF-8 mangling).

## 8. Report after every task

```
Changed files:
Components/routes:
APIs/contracts:
Tests executed:
Result:
Blockers:
Next task:
```
