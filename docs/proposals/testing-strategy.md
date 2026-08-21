# Proposal: Testing Strategy — Mock Phase-Out and Database Environment Tiers

**Status**: Accepted (updated 2026-08-21 for the Postgres migration)
**Date**: 2026-08-20
**Supersedes**: Parts of `portfoliost-backend/docs/database-postgres-drizzle.md` (environment behavior)

## Problem

The project is migrating from a mock backend (`example-service-mock`) to a real backend (`portfoliost-backend`) endpoint by endpoint. Two risks must be addressed:

1. **Mock drift**: If E2E tests keep hitting the mock, the mock must be maintained for every new feature — effectively maintaining two codebases indefinitely.
2. **Database environment mismatch**: If development used a different database engine than production, tests would never exercise the dialect that actually runs in production. Solved by running **Postgres everywhere** (see `portfoliost-backend/docs/database-postgres-drizzle.md`): only the volatility/persistence profile differs per environment.

Without a clear strategy, the team risks:
- Mock becoming a maintenance burden that slows feature development
- Test environments diverging from production (tests pass against mock, break against real backend)
- Seed data inconsistencies between test and development environments

## Goals

- E2E tests exercise the real backend end-to-end (frontend → KrakenD → backend → Postgres)
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
│  │  Tests: full user flows through KrakenD → real backend  │    │
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
| KrakenD routing misconfiguration | - | - | Yes |
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
| Docker Compose (dev/E2E) | `postgres://...@postgres:5432/portfoliost` | `postgres:17-alpine`, tmpfs data dir | Volatile — fresh database on every start | Yes — `db:migrate && db:seed` in container CMD |
| Cluster (production) | secret referencing existing cluster Postgres | Existing cluster instance | Persistent — survives restarts | No — auto-provisions per user on first auth |

### Why Volatile in Docker Compose

- **Reproducibility**: Every `docker compose up --build` starts from a known state
- **No stale data**: Development databases accumulate cruft; volatile means fresh start
- **Seed consistency**: Test fixtures are loaded from `seed/` files, not ad-hoc manual inserts
- **Fast iteration**: No need to manually reset or migrate — just rebuild

The tmpfs mount keeps the container lightweight while behaving exactly like the production engine.

### Why Persistent in the Cluster

- **Real user data**: Users expect their preferences, benchmarks, and settings to persist
- **No seed in production**: Auto-provisioning on first auth (`onConflictDoNothing()`) handles new users
- **Managed infrastructure**: The cluster already operates a Postgres instance; the backend is just another client defined by credentials and network policy (rollout discussed separately — see plan Step G5)

## Seed System

### Design

```
portfoliost-backend/
  seed/
    001_user_preferences.sql
    002_*.sql                         # future tables
    run.mjs                           # runner script
```

### Seed Runner

A lightweight script (`src/db/seed.ts`) that:
1. Checks if `user_preferences` already has rows (`SELECT COUNT(*)`)
2. If empty, applies all `.sql` files in `seed/` in order
3. If not empty, skips seeding entirely

```ts
import postgres from "postgres"

export async function seed(dbUrl: string, seedDir: string) {
  const sql = postgres(dbUrl, { max: 1 })
  const rows = await sql`SELECT COUNT(*)::int AS count FROM user_preferences`
  if (rows[0].count > 0) return false // skip
  const files = (await readdir(seedDir)).filter((f) => f.endsWith(".sql")).sort()
  for (const file of files) {
    await sql.unsafe(await readFile(join(seedDir, file), "utf-8"))
  }
  await sql.end()
  return true
}
```

### npm Script

```json
"db:seed": "node seed/run.mjs"
```

### Docker Compose Integration

The backend Dockerfile CMD runs migrations then seeds before starting the server:

```dockerfile
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && node dist/server.js"]
```

Seeding is safe everywhere because:
- The seed check skips when data exists (persistent environments)
- All seed SQL is idempotent (`ON CONFLICT (user_id) DO NOTHING`)
- In compose the database is empty on every start, so fixtures load deterministically — this is intentional and required by E2E tests

### Seed File Format

All seed files use idempotent Postgres SQL:

```sql
-- seed/001_user_preferences.sql
INSERT INTO user_preferences (user_id, language, ui_preferences, created_at, updated_at)
VALUES
  ('test-user-001', 'en', '{"chartTimeframe":"1M","tableColumns":["name","value"]}'::jsonb, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('test-user-002', 'de', '{"chartTimeframe":"1Y","tableColumns":["name","value","gain"]}'::jsonb, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (user_id) DO NOTHING;
```

Timestamps are fixed ISO literals — deterministic fixtures, stable snapshots.

### What Gets Seeded

| Table | Seed purpose | Notes |
|-------|-------------|-------|
| `user_preferences` | Default prefs for test users | Sufficient for settings/onboarding E2E tests |
| Future tables | Realistic fixtures per endpoint | Added as new endpoints are migrated |

Seed data should mirror what a real user would have — not exhaustive edge cases (those belong in unit tests).

## Mock Phase-Out Process

### Current State

All KrakenD routes point to `example-service-mock`. The real backend runs in compose against the volatile Postgres but is not yet wired into the gateway.

> **Known blocker**: KrakenD CE strips query strings even when `querystring_params` is configured (verified against `krakend:2.13`). This causes the long-standing charting e2e failure (`/api/charting/compare?symbols=`) and must be solved before routing real endpoints through the gateway (Phase 2).

### Migration Flow Per Endpoint

```
┌──────────────────────────────────────────────────────────────┐
│                   ENDPOINT MIGRATION                         │
│                                                              │
│  1. Implement endpoint in portfoliost-backend                │
│  2. Write backend unit tests (embedded Postgres / PGlite)    │
│  3. Add seed data for the endpoint's tables                  │
│  4. Switch KrakenD route:                                    │
│     API_<MODULE>_URL: http://example-service-mock:4010                │
│                    → http://portfoliost-backend:3000          │
│  5. Add/update E2E tests against the real endpoint           │
│  6. Delete the mock endpoint handler                         │
│  7. Run full test suite: build + unit + mock + e2e           │
│  8. Commit                                                  │
└──────────────────────────────────────────────────────────────┘
```

### KrakenD Route Switching

The only change per endpoint is an environment variable in `docker-compose.yml`:

```yaml
# Before: mock serves this endpoint
API_AUTH_URL: http://example-service-mock:4010

# After: real backend serves this endpoint
API_AUTH_URL: http://portfoliost-backend:3000
```

The frontend never changes — it talks to KrakenD, which routes transparently.

### When to Remove Mock Contract Tests

The mock contract tests (`npm run test:mock`) validate that mock endpoints match expected API shapes. These become redundant once:
- All endpoints are served by the real backend
- E2E tests cover the same endpoints

Until then, keep both test suites. The mock contract tests catch regressions in mock behavior during the transition.

### End State

```
Current:                          Target:
┌──────────┐                      ┌──────────┐
│ KrakenD  │                      │ KrakenD  │
└────┬─────┘                      └────┬─────┘
     │                                 │
     ├─→ example-service-mock (all)             ├─→ portfoliost-backend (all)
     └─→ portfoliost-backend (none)    │
                                        └─→ example-service-mock (DELETED)
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

Blocked until the KrakenD query-string issue is resolved.

1. Pick one endpoint to migrate (suggestion: `GET /api/users/preferences`)
2. Implement in `portfoliost-backend`
3. Write unit tests
4. Add seed data if needed
5. Switch KrakenD route
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
- **Transition period**: During migration, some E2E tests hit mock, some hit real backend. This is fine — KrakenD handles routing, and tests don't care which backend responds.
- **KrakenD query-string stripping**: Verified gateway-level issue (see blocker note above). Must be fixed before Phase 2; otherwise endpoints taking query params (`?symbols=`, `?page=`, filters) silently receive defaults.
- **Single Postgres instance**: Dev/E2E share one compose Postgres; tests assume isolated, freshly-seeded state. Connection pool defaults (`max: 10`) are fine at homelab scale.
- **Seed data for non-user tables**: Tables like portfolios, positions, and watchlists are user-scoped. Seed data for these should use known test user IDs that E2E tests authenticate as.
