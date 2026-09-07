# Module Extraction Playbook

How to carve one backend module out of the example-service-mock contract into its own
project, container, compose service, and cluster deployment — verified end-to
-end on the first module (`users-auth`, 2026-08-22).

Design rationale lives in [backend-topology.md](proposals/backend-topology.md).
This document is the **procedure**.

## Naming conventions (fixed — do not deviate)

| Dimension | Pattern | users-auth example |
| --- | --- | --- |
| Module name | proposal D1 terms | `users-auth` |
| GitHub repo | `Marx2/portfoliost-<module>` | `portfoliost-users-auth` |
| Container image | `ghcr.io/marx2/portfoliost-<module>` | auto-derived by CI from repo name |
| Compose service + container | `<module>` | `users-auth` |
| K8s Kustomization/HelmRelease/controller/service | `portfoliost-<module>` | `portfoliost-users-auth` |
| Env key (services.env / future ConfigMap) | `API_<MODULE>_URL` (upper snake, ONE key per module) | `API_USERS_AUTH_URL` |
| Postgres schema | module name, underscores | `users_auth` |
| Gateway routes owned | `/api/<area>/*` consumed via the single env key | `/api/auth`, `/api/users`, `/.well-known/` |

Reference implementation: `../portfoliost-users-auth` (Hono + Drizzle +
Postgres + PGlite tests + GitHub Actions release pipeline). Copy from it, don't
reinvent.

## What every module ships

- `GET /health` — liveness/readiness probe target
- `GET /__meta` — D4 identity: `{ "service": "<module>", "impl": "real", "version": "<tag>" }`
  (version: CI passes `APP_VERSION` build arg; fallback reads own `package.json`)
- `GET /internal/verify` — D9 edge-auth preflight: validates bearer JWT via
  issuer JWKS (jose), returns `204` / `401`
- Drizzle migrations scoped to the module schema (`migrations.schema: "drizzle_<module>"` in `drizzle.config.ts`);
  `db:migrate` runs at boot. No seeding in production — seeds live only in `mocks/db-seed/` (D73/D76).
- Unit tests on embedded Postgres (PGlite) running the real migrations (`migrationsSchema: "drizzle_<module>"` in `test-db.ts`)

## Checklist: extracting a new module `<module>`

### 1. Project scaffold
- [ ] New GitHub repo `Marx2/portfoliost-<module>` (or extract code from an
      existing monolith repo if it owns any — see git-history note below).
- [ ] Copy skeleton from `portfoliost-users-auth`: `package.json`, `tsconfig`,
      `drizzle.config.ts`, `src/{index,server,auth,meta}.ts`, `src/db/*`,
      `Dockerfile`, `.github/workflows/docker-image.yml`.
- [ ] Rebrand: package name, `/__meta` service string, server log line.
- [ ] Implement endpoints against the mock contract (`@marx2/contracts`);
      port handler logic from `mocks/` where applicable; unit tests green.
- [ ] **Enforce `@marx2/contracts` types** (mandatory — see AGENTS.md):
  - Add `openapi-typescript@7` to `devDependencies`
  - Add `"gen:types": "openapi-typescript node_modules/@marx2/contracts/openapi.yaml -o src/generated/api-types.d.ts"` script
  - Run `npm run gen:types` → commits `src/generated/api-types.d.ts`
  - In every route file: `import type { components } from "../generated/api-types.js"`
  - Annotate every `c.json(...)` success response: `c.json(payload satisfies components["schemas"]["Foo"])`
  - `tsc` must pass clean — shape drift is a build error, not a runtime surprise
- [ ] Push to main → CI creates `vX.Y.Z` release + image.

### 2. Database (schema-per-module, D6)
- [ ] `src/db/schema.ts`: `export const <module>Schema = pgSchema("<module>")`;
      tables via `<module>Schema.table(...)`.
- [ ] `drizzle.config.ts`: set `migrations.schema: "drizzle_<module>"` (D74 journal isolation).
- [ ] `src/db/test-db.ts`: pass `migrationsSchema: "drizzle_<module>"` to `migrate()`.
- [ ] Baseline migration: delete any existing `drizzle/` chain, run `npx drizzle-kit generate --name=baseline`
      against an empty DB. The single `0000_baseline.sql` recreates the full current schema (pure DDL).
      DDL not expressible in `schema.ts` (views, FDW references) → append after the generated DDL,
      separated by `--> statement-breakpoint`.
- [ ] **No seeds in the module repo.** Demo fixtures go in `portfoliost/mocks/db-seed/` (D76).
      Module CMD is simply `db:migrate && node dist/server.js`.
  ```sh
  npx drizzle-kit generate --custom --name <module>_schema_move
  ```
  then fill the file (note the mandatory `--> statement-breakpoint` separator —
  PGlite runs statements individually):
  ```sql
  CREATE SCHEMA IF NOT EXISTS <module>;
  --> statement-breakpoint
  ALTER TABLE IF EXISTS public.<table> SET SCHEMA <module>;
  ```
- [ ] Fix the snapshot chain so future generates stay clean: create
      `drizzle/meta/000N_snapshot.json` = copy of previous snapshot with new
      `id` (uuid) / `prevId` (previous id), table key moved to
      `"<module>"."<table>"` with entry `"schema": "<module>"`, and
      `"schemas": {"<module>": "<module>"}` added. Verify:
      `npx drizzle-kit generate` must print "No schema changes".
- [ ] If the module has seeded demo data, add it to `mocks/db-seed/` (D76) — never inside the module repo.

### 3. Compose wiring (portfoliost repo)
- [ ] `deploy/services.env`: add `API_<MODULE>_URL=http://example-service-mock:4010`
      (default stays mock — e2e determinism).
- [ ] `docker-compose.yml`: service `<module>` (build context
      `../portfoliost-<module>`), container_name `<module>`; gateway
      `depends_on` includes it.
- [ ] `gateway/default.conf.template`: route each owned path through the ONE
      key: `location /api/<area> { proxy_pass ${API_<MODULE>_URL}; }`.
- [ ] Docs sweep: README service/env tables, mocks/README flip examples.
- [ ] Full suite green: `npm run build && npm run test && npm run test:mock`
      and `npm run test:e2e` against `docker compose up -d --build`.
- [ ] Flip test: set `API_<MODULE>_URL=http://<module>:3000` in services.env,
      `docker compose up -d gateway`, verify a distinguishing response (real
      vs mock error copy / `__meta`), revert.

### 4. Cluster wiring (homelab repo)
- [ ] New dir `cluster/apps/pfire/portfoliost-<module>/` copying
      `portfoliost-users-auth/{ks.yaml,app/}`; rename `&app` anchors, image
      repo/tag. Controller name == HelmRelease name (this is what makes
      Deployment/Service render as `portfoliost-<module>`).
- [ ] `cluster/apps/pfire/kustomization.yaml`: add `- portfoliost-<module>/ks.yaml`.
- [ ] `cluster/apps/pfire/portfoliost/app/helmrelease.yaml`: repoint the
      module's ingress paths to `portfoliost-<module>:3000`.
- [ ] Shared Postgres: reuse the existing least-privilege user/db unless the
      module needs isolation; the boot migration creates/moves its schema.
- [ ] Commit + push; Flux reconciles. Verify before/after:

### 5. Live verification (cluster)
```sh
kubectl -n pfire get deploy portfoliost-<module>            # image tag correct?
kubectl -n pfire logs deploy/portfoliost-<module>           # migrations applied?
# __meta internally:
kubectl -n pfire run m --rm -i --restart=Never --image=curlimages/curl:latest -- \
  -s http://portfoliost-<module>:3000/__meta
# through the host (distinguish real vs mock by error copy):
curl -sk https://portfoliost.k.homylab.com/api/<area>/...
```

## Switching a module mock ↔ real (D3)

| Environment | Action |
| --- | --- |
| compose | edit `deploy/services.env` value → `docker compose up -d gateway <consumers>` |
| cluster | edit the ingress path target in `portfoliost/app/helmrelease.yaml` (git) — backend-to-backend switches later use the ConfigMap via `envFrom` |

Verify either way with `GET /__meta` on the module and a real-vs-mock
distinguishing request through the gateway/host.

## Contract enforcement status

All backend modules generate types from `@marx2/contracts` and annotate route
responses with `satisfies`. Shape drift is a **build error**.

| Module | `src/generated/api-types.d.ts` | `satisfies` annotations |
| --- | --- | --- |
| `portfoliost-users-auth` | ✓ | `AuthResponse`, `MeResponse`, `UserProfile`, `UserPreferences`, `AdminUserListResponse` |
| `portfoliost-wallets` | ✓ | `CashWallet`, `WalletsTotalBalance`, `CurrenciesResponse`, `Portfolio`, `PortfolioTotalMetrics`, `HeldStocks`, `CashTransaction` |
| `portfoliost-admin` | ✓ | admin route responses |
| `portfoliost-instruments` | ✓ | instrument route responses |

**Pattern** (copy from any of the above modules):

```ts
// src/routes/foo.ts
import type { components } from "../generated/api-types.js"
type Foo = components["schemas"]["Foo"]

routes.get("/foo", async (c) => {
  const payload = buildPayload()
  return c.json(payload satisfies Foo)
})
```

Rules:
- Never hand-write a type that duplicates a contract schema — use `components["schemas"]["X"]` directly.
- Use `satisfies`, not `as` — `as` suppresses errors, `satisfies` surfaces them.
- Regenerate after every `@marx2/contracts` version bump: `npm run gen:types`.

## Ops lessons learned (first extraction)

1. **GHCR tag race**: the release workflow can execute its release job twice
   for one commit (retry/pass overlap) — creating release `vA.B.C` whose image
   never lands, then publishing `vA.B.(C+1)`. Before pinning a tag in the
   cluster HelmRelease, confirm the tag exists on the *image*:
   ```sh
   gh api user/packages/container/<repo>/versions --jq '.[].metadata.container.tags'
   ```
2. **Wedged pending-install**: if helm-controller hangs in `pending-install`
   with stale values, recovery order that worked: `helm uninstall <rel>`;
   delete HR object (strip finalizers if deletion hangs); delete leftover
   Deployment **and Service**; purge `sh.helm.release.v1.*` secrets; annotate
   parent kustomization `reconcile.fluxcd.io/requestedAt` to rebuild everything
   from git. Watch for kubectl multi-resource `get` calls aborting early on a
   bad resource type — leftovers hide behind those errors.
3. **Renovate races your manual bumps** on the homelab repo — rebase before
   push, and expect image-tag bumps to arrive automatically once the first
   GHCR tag exists.

## History note

`portfoliost-backend` was renamed (not recreated) into
`portfoliost-users-auth` — GitHub redirects old URLs, CI image follows the
repo name. Future modules will be greenfield repos implementing their slice of
the mock contract; monolith code extraction applies only if a shared deployable
accumulates cross-module code first.
