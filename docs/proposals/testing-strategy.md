# Proposal: Testing Strategy — Mock Phase-Out and Database Environment Tiers

**Status**: Accepted (updated 2026-08-22: nginx gateway replaces KrakenD; query-string blocker resolved)
**Date**: 2026-08-20
**Supersedes**: Parts of `portfoliost-users-auth/docs/database-postgres-drizzle.md` (environment behavior)

## Problem

The project is migrating from a mock backend (`example-service-mock`) to real backend modules (`portfoliost-users-auth`, …) endpoint by endpoint. Two risks must be addressed:

1. **Mock drift**: If E2E tests keep hitting the mock, the mock must be maintained for every new feature — effectively maintaining two codebases indefinitely.
2. **Database environment mismatch**: If development used a different database engine than production, tests would never exercise the dialect that actually runs in production. Solved by running **Postgres everywhere** (see `portfoliost-users-auth/docs/database-postgres-drizzle.md`): only the volatility/persistence profile differs per environment.

Without a clear strategy, the team risks:
- Mock becoming a maintenance burden that slows feature development
- Test environments diverging from production (tests pass against mock, break against real backend)
- Seed data inconsistencies between test and development environments

## Goals

- E2E tests exercise the real backend end-to-end (frontend → nginx gateway → backend → Postgres)
- Mock is retired incrementally as endpoints are migrated — no new mock code is ever written
- Postgres is volatile in docker compose (fresh, seeded state on each startup) and persistent in the cluster
- Seed data provides realistic test fixtures without touching production databases
- Backend unit tests remain fast and isolated with embedded Postgres (PGlite) — no external server needed

## Architecture: Three-Tier Testing

```
┌─────────────────────────────────────────────────────────────────┐
│                        TEST PYRAMID                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tier 1: Backend Unit Tests                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Vitest + embedded Postgres (PGlite, in-process WASM)   │    │
│  │  Real migrations applied per test                       │    │
│  │  Tests: handlers, schema, auth, business logic          │    │
│  │  Scope: Single function / route handler                 │    │
│  │  Speed: < 5s                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Tier 2: Frontend Unit Tests                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Vitest + happy-dom, mocked API calls                   │    │
│  │  Tests: Vue components, Pinia stores, formatting        │    │
│  │  Scope: Component rendering, user interactions          │    │
│  │  Speed: < 5s                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Tier 3: E2E Integration Tests                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Playwright + docker compose stack                      │    │
│  │  Tests: full user flows through nginx gateway → real backend  │    │
│  │  Scope: Cross-service integration, real HTTP            │    │
│  │  Speed: 30-120s                                         │    │
│  │  DB: Volatile Postgres, seeded on startup               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What Each Tier Catches

| Bug class | Backend unit | Frontend unit | E2E |
|-----------|:---:|:---:|:---:|
| Incorrect DB queries / schema | Yes | - | Yes |
| Handler business logic | Yes | - | Yes |
| SQL dialect issues | Yes | - | Yes (same dialect as prod) |
| Vue component rendering | - | Yes | Yes |
| Pinia store state management | - | Yes | Yes |
| Gateway routing misconfiguration | - | - | Yes |
| Frontend↔backend contract mismatch | - | - | Yes |
| CORS / auth middleware issues | - | - | Yes |
| Request/response shape drift | - | - | Yes |

## Database Behavior Per Environment

### Configuration

The backend reads `DATABASE_URL` env var with a local default:

```ts
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const url = process.env.DATABASE_URL || "postgres://portfoliost:portfoliost@localhost:5432/portfoliost"
```

### Environment Matrix

| Environment | `DATABASE_URL` | Database | Volatility | Seeding |
|-------------|---------------|----------|------------|---------|
| Backend unit tests | n/a (hardcoded) | Embedded Postgres (PGlite), in-process | Fresh per test; real migrations from `drizzle/` | No — each test creates its own data |
| Frontend unit tests | n/a (mocked API) | No database | - | No |
| Docker Compose (dev/E2E) | `postgres://...@postgres:5432/portfoliost` | `postgres:17-alpine`, tmpfs data dir | Volatile — fresh database on every start | Yes — `mock-db-seed` one-shot service (D76) |
| Cluster (production) | secret referencing existing cluster Postgres | Existing cluster instance | Persistent — survives restarts | No — auto-provisions per user on first auth |

### Why Volatile in Docker Compose

- **Reproducibility**: Every `docker compose up --build` starts from a known state
- **No stale data**: Development databases accumulate cruft; volatile means fresh start
- **Seed consistency**: Test fixtures are loaded from `mocks/db-seed/` (D76), not ad-hoc manual inserts
- **Fast iteration**: No need to manually reset or migrate — just rebuild

The tmpfs mount keeps the container lightweight while behaving exactly like the production engine.

### Why Persistent in the Cluster

- **Real user data**: Users expect their preferences, benchmarks, and settings to persist
- **No seed in production**: Auto-provisioning on first auth (`onConflictDoNothing()`) handles new users
- **Managed infrastructure**: The cluster already operates a Postgres instance; the backend is just another client defined by credentials and network policy (rollout discussed separately — see plan Step G5)

## Seed System

### Design (D73/D76)

Seeds are **mock-only** demo fixtures. Module images ship zero seeding code.

```
portfoliost/mocks/db-seed/
  run.mjs                          # entry: FX + wallet → portfolio → user prefs → ticker reference
  constants.mjs                    # fixed IDs and Top10 fixtures (deterministic E2E snapshots)
  wallets.mjs                      # parity cash wallet + demo FX rates
  portfolios.mjs                   # Top10 portfolio + share + positions + transactions
  user-preferences.mjs             # test user preferences
  ticker-reference.mjs             # CSV parser + batched upsert from bundled CSVs
  instruments/ticker_reference.csv
  instruments/venues.csv
  instruments/mic_yahoo_suffixes.csv
```

The `mock-db-seed` compose service runs as a one-shot after all module containers
report healthy (their `/health` answers only after `db:migrate` — schema guaranteed).

### Docker Compose Integration

```yaml
mock-db-seed:
  build: { context: ".", dockerfile: Dockerfile.mock }
  command: ["node", "mocks/db-seed/run.mjs"]
  environment:
    DATABASE_URL: postgres://portfoliost:portfoliost@postgres:5432/portfoliost
    SEED_PORTFOLIOS: "true"
  depends_on:
    postgres:    { condition: service_healthy }
    users-auth:  { condition: service_healthy }
    wallets:     { condition: service_healthy }
    instruments: { condition: service_healthy }
  restart: "no"
```

Module container CMD is simply:

```dockerfile
CMD ["sh", "-c", "npm run db:migrate && node dist/server.js"]
```

### Seed Rules

- All seed files are idempotent (row-count check / `ON CONFLICT DO NOTHING`).
- Fixed IDs and ISO timestamps for stable E2E snapshots.
- When a schema change touches a seeded table, update `mocks/db-seed/` in the same commit.
- **Seeds never run in the cluster.** `tickerref-sync --url` and FX/first-user
  self-provisioning repopulate reference data after a fresh DB recreate.

### What Gets Seeded

| Table | Seed purpose | Notes |
|-------|-------------|-------|
| `wallets.fx_rates` | Demo FX rates so currency selectors work before first real import | EUR-based demo closes |
| `wallets.wallets` | Parity cash wallet (Portfel USD 1, $10 000 balance) | Required FK for portfolio |
| `wallets.wallet_transactions` | 5 transactions that sum to the seeded balance | |
| `portfolios.portfolios` | Top10 portfolio | |
| `portfolios.positions` | 10 BUY positions (Top10 stocks) | |
| `portfolios.transactions` | 10 BUY transactions | |
| `portfolios.shares` | 1 public share link for Top10 | |
| `users_auth.user_preferences` | 2 test users | |
| `instruments.ticker_reference` | ~61 700 tickers from bundled CSV | Gated by row-count check |
| `instruments.exchange_reference` | ~87 exchanges | |

Seed data should mirror what a real user would have — not exhaustive edge cases (those belong in unit tests).

## Mock Phase-Out Process

### Current State

`example-service-mock` is **retired from production**. In the cluster (Flux repo `Marx2/homelab`), the `portfoliost` ingress routes every live endpoint to real backend modules (`users-auth`, `wallets`, `instruments`, `admin`) via explicit paths, and the `/api` catch-all to `example-service-mock:4010` has been removed. The `mocks` HelmRelease is deleted.

`example-service-mock` now exists **only in docker-compose** as test/dev tooling:

- Local dev + E2E in the `portfoliost` repo (`docker-compose.yml` `example-service-mock` service, `Dockerfile.mock`), backed by `deploy/services.env` route mappings.
- Mock contract tests (`npm run test:mock`).

Endpoints that were previously served by the mock and have **no real backend yet** — watchlists, research-compare charting, per-symbol news (`/api/news/*`), public-share viewing (`/api/public/portfolios/*`), and notifications — are deliberately **unmigrated and return 404 in prod**. They are not routed to any module until a real backend is built.

Migration of the remaining paths to real modules is picked up later (watchlists/charting per the endpoint groups below); no new mock code is written.

### Migration Flow Per Endpoint

```
┌──────────────────────────────────────────────────────────────┐
│                   ENDPOINT MIGRATION                         │
│                                                              │
│  1. Implement endpoint in the owning module (e.g. portfoliost-users-auth)                │
│  2. Write backend unit tests (embedded Postgres / PGlite)    │
│  3. Add seed data for the endpoint's tables                  │
│  4. Switch gateway route (deploy/services.env):               │
│     API_<MODULE>_URL: http://example-service-mock:4010                │
│                    → http://<module-service>:3000             │
│  5. Add/update E2E tests against the real endpoint           │
│  6. Delete the mock endpoint handler                         │
│  7. Run full test suite: build + unit + mock + e2e           │
│  8. Commit                                                  │
└──────────────────────────────────────────────────────────────┘
```

### Gateway Route Switching

The only change per endpoint is one value in `deploy/services.env`:

```yaml
# Before: mock serves this module
API_USERS_AUTH_URL: http://example-service-mock:4010

# After: real users-auth module serves this module
API_USERS_AUTH_URL: http://users-auth:3000
```

The frontend never changes — it talks to the gateway, which routes transparently.

### When to Remove Mock Contract Tests

The mock contract tests (`npm run test:mock`) validate that mock endpoints match expected API shapes. These become redundant once:
- All endpoints are served by the real backend
- E2E tests cover the same endpoints

Until then, keep both test suites. The mock contract tests catch regressions in mock behavior during the transition.

### End State

```
Current (prod):
┌──────────┐
│  gateway │
└────┬─────┘
     ├─→ real modules (auth/users, wallets, instruments, admin)
     └─→ (unmigrated watchlists/charting/news/public/notifications → 404)
example-service-mock NOT deployed in cluster (docker-compose only, tests-only)

Target (docker-compose, for tests):
┌──────────┐
│  gateway │
└────┬─────┘
     ├─→ real modules (all)
     └─→ example-service-mock (tests-only stand-in until last endpoint migrates)
```

## Implementation Status

### Phase 1: Environment-Aware Database + Seed System (done — since migrated to Postgres)

1. ✅ `DATABASE_URL` env var in `src/db/index.ts`
2. ✅ Docker compose: volatile database, seeded on startup (now `postgres:17-alpine` on tmpfs)
3. ✅ Backend Dockerfile CMD runs `db:migrate && db:seed`
4. ✅ Seed runner with empty-database check
5. ✅ `seed/001_user_preferences.sql` with test user data
6. ✅ `"db:seed"` script in `package.json`

### Phase 2: First Endpoint Migration (prove the pattern)

Unblocked (gateway query-string issue resolved by the nginx swap).

1. Pick one endpoint to migrate (suggestion: `GET /api/users/preferences`)
2. Implement in the owning module repo
3. Write unit tests
4. Add seed data if needed
5. Switch gateway route in deploy/services.env
6. Add E2E test
7. Delete mock handler
8. Run full test suite, commit

### Phase 3: Subsequent Endpoints

Repeat Phase 2 for each endpoint group:
- `/api/auth/*` + `/api/users/*` (already partially done)
- `/api/portfolios/*`
- `/api/wallets/*`
- `/api/watchlists/*`
- `/api/instruments/*`
- `/api/charting/*`

### Phase 4: Mock Removal

Once all endpoints are migrated:
1. Delete `mocks/` directory (or archive it)
2. Remove `example-service-mock` service from `docker-compose.yml`
3. Remove `Dockerfile.mock`
4. Remove `npm run test:mock` script
5. Remove `scripts/regen-seed.mjs` and `discovery/raw/`
6. Update `AGENTS.md` to reflect new architecture

## Risks / Considerations

- **Seed data staleness**: Seed files must be updated when schemas change. CI should verify that `db:seed` runs without errors on a fresh database (covered by E2E tests).
- **E2E test speed**: Playwright tests against docker compose are slower than mock-only tests. This is acceptable — the value of real integration coverage outweighs the speed cost.
- **Transition period**: During migration, some E2E tests hit mock, some hit real backend. This is fine — the gateway handles routing, and tests don't care which backend responds.
- ~~**KrakenD query-string stripping**~~: Resolved — the nginx gateway forwards query strings natively (verified: charting e2e passes).
- **Single Postgres instance**: Dev/E2E share one compose Postgres; tests assume isolated, freshly-seeded state. Connection pool defaults (`max: 10`) are fine at homelab scale.
- **Seed data for non-user tables**: Tables like portfolios, positions, and watchlists are user-scoped. Seed data for these should use known test user IDs that E2E tests authenticate as.
