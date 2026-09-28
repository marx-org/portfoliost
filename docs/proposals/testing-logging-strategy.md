# Testing & Logging Strategy — Tiers, Database Environments, and Debug Logs

**Status**: Accepted (updated 2026-09-28: mock retired from prod; debug-log policy added)
**Date**: 2026-08-20
**Last substantive revision**: 2026-09-28
**Supersedes**: Parts of `portfoliost-users-auth/docs/database-postgres-drizzle.md` (environment behavior)
**Canonical copy**: this file. `portfoliost-instruments/docs/testing-logging-strategy.md`
and `portfoliost-users-auth/docs/testing-logging-strategy.md` are short cross-references
to it. (Renamed from `testing-strategy.md` on 2026-09-28, when the debug-log policy was
added.)

## Summary

1. **Three-tier testing** — backend unit tests (embedded Postgres via PGlite), frontend unit tests (mocked API), E2E tests (real backend + volatile seeded Postgres in docker compose)
2. **Database environment tiers** — volatile + seeded in docker compose, persistent in the cluster, fresh per-test with real migrations for unit tests
3. **Seed system** — `mocks/db-seed/` idempotent SQL/JS fixtures, run on container start if the DB is empty
4. **Mock status** — retired from production; survives in docker compose only as a stand-in for the handful of endpoints that have no real backend
5. **Debug logging** — every computation that feeds a user-visible number narrates itself under one env-gated prefix, so a production discrepancy is a log diff rather than a hand-written query

## Goals

- E2E tests exercise the real backend end-to-end (frontend → nginx gateway → backend → Postgres)
- No new mock code is ever written; the mock only shrinks
- Postgres is volatile in docker compose (fresh, seeded per start) and persistent in the cluster
- Seed data provides realistic test fixtures without touching production databases
- Backend unit tests remain fast and isolated with embedded Postgres (PGlite) — no external server needed
- A wrong number in production is diagnosable from `kubectl logs` alone

---

# Part 1 — Testing

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

### Commands

| Purpose | Command | Lives in |
|---|---|---|
| Backend unit tests | `npm run test` | each backend module repo |
| Frontend unit tests | `npm run test` | `portfoliost` |
| Mock contract tests | `npm run test:mock` | `portfoliost` |
| E2E | `npm run test:e2e` | `portfoliost` |
| Typecheck | `npm run build` (includes `vue-tsc --noEmit`) | `portfoliost` |
| Local stack | `docker compose up -d --build` | `portfoliost` |

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
- **Seed consistency**: Test fixtures come from `mocks/db-seed/`, not ad-hoc manual inserts
- **Fast iteration**: No need to manually reset or migrate — just rebuild

The tmpfs mount keeps the container lightweight while behaving exactly like the production engine.

### Why Persistent in the Cluster

- **Real user data**: Users expect their preferences, benchmarks, and settings to persist
- **No seed in production**: Auto-provisioning on first auth handles new users
- **Managed infrastructure**: The cluster already operates Postgres; each backend module is a client defined by credentials and network policy

## Seed System

Seeds are **compose-only** demo fixtures. Module images ship zero seeding code.

```
portfoliost/mocks/db-seed/
  run.mjs                          # entry: FX + portfolio → user prefs → ticker reference
  constants.mjs                    # fixed IDs and Top10 fixtures (deterministic E2E snapshots)
  portfolios.mjs                   # Top10 portfolio + shares + positions + transactions + snapshots
  user-preferences.mjs             # test user preferences
  ticker-reference.mjs             # CSV parser + batched upsert from bundled CSVs
  instruments/ticker_reference.csv
  instruments/venues.csv
  instruments/mic_yahoo_suffixes.csv
```

The `mock-db-seed` compose service runs as a one-shot after the module containers
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

- All seed files are idempotent (row-count check / `ON CONFLICT DO NOTHING`)
- Fixed IDs and ISO timestamps for stable E2E snapshots
- When a schema change touches a seeded table, update `mocks/db-seed/` in the same commit
- **Seeds never run in the cluster.** `tickerref-sync` and FX/first-user self-provisioning
  repopulate reference data after a fresh DB recreate
- Table names follow the schema-per-module layout (D6). Verify the current owner in
  `../<module>/src/db/schema.ts` before writing a seed — this list has moved before
  (`fx_rates` was `wallets.fx_rates`, now `instruments.fx_rates`)

### What Gets Seeded

| Table | Seed purpose | Notes |
|-------|-------------|-------|
| `instruments.fx_rates` | Demo FX rates so currency selectors work before first real import | EUR-based demo closes |
| `instruments.ticker_reference` | ~61 700 tickers from bundled CSV | Gated by row-count check |
| `instruments.exchange_reference` | ~87 exchanges | |
| `portfolios.portfolios` | Top10 portfolio | |
| `portfolios.positions` | 10 BUY positions (Top10 stocks) | |
| `portfolios.transactions` | 10 BUY transactions | |
| `portfolios.portfolio_cash_transactions` | Cash ledger rows backing the seeded cash balance | |
| `portfolios.value_snapshots` | Seeded snapshot series so charts render in E2E | |
| `portfolios.shares` | 1 public share link for Top10 | |
| `users_auth.user_preferences` | 2 test users | |

Seed data should mirror what a real user would have — not exhaustive edge cases (those belong in unit tests).

## Mock Status: Retired From Production

**The mock is not deployed in the cluster.** In the Flux repo (`Marx2/homelab`), the
`portfoliost` ingress routes every migrated path to a real module by explicit
`path:` entry — there is no `/api` catch-all to a mock, and the `mocks` HelmRelease
is deleted. Anything not listed falls through to the SPA.

Currently routed in prod:

| Path | Module |
|---|---|
| `/api/auth`, `/api/users` | `portfoliost-users-auth` |
| `/api/instruments`, `/api/logos`, `/api/news`, `/api/currencies`, `/api/fx` | `portfoliost-instruments` |
| `/api/wallets`, `/api/portfolios`, `/api/labels`, `/api/positions` | `portfoliost-wallets` |
| `/api/admin` | `portfoliost-admin` |

**In docker compose only**, `example-service-mock:4010` remains a stand-in for the endpoints
that have no real backend yet — watchlists, charting compare, notifications, billing,
copilot, snaptrade, public-share viewing, exchange-rates. `deploy/services.env` is the
single place that decides, per environment, which of these still point at the mock.
Removing the last mock endpoint is therefore a matter of pointing one value at a real
module, not of untangling routing.

### Migrating an Endpoint Off the Mock

```
1. Implement the endpoint in the owning module
2. Write backend unit tests (embedded Postgres / PGlite)
3. Add seed data for the endpoint's tables
4. Point the env var at the module (compose: deploy/services.env;
   prod: add the path to the ingress HelmRelease)
5. Add/update E2E tests against the real endpoint
6. Delete the mock endpoint handler
7. Run the full suite: build + unit + mock + e2e
8. Commit
```

### When Mock Contract Tests Go

`npm run test:mock` validates mock endpoints against expected API shapes. It becomes
redundant once every endpoint is served by a real backend and E2E covers the same
paths. Until then both suites run: the contract tests catch drift in mock behavior
during the transition.

### End State

```
Prod (today):
┌──────────┐
│ ingress  │── explicit paths ──→ real modules
└──────────┘
                     (unmigrated paths → SPA, no API handler)
example-service-mock NOT deployed

Docker compose (tests):
┌──────────┐
│  nginx   │──→ real modules (most paths)
└──────────┘   ──→ example-service-mock (only the unmigrated remainder)
```

## Risks / Considerations

- **Seed data staleness**: Seed files must be updated when schemas change. CI should verify `db:seed` runs clean on a fresh database (covered by E2E).
- **Seed table names drift**: Migrations move tables between modules. A seed that writes `wallets.fx_rates` after the move fails loudly at startup, which is the intended behavior — fix the seed, don't add a compatibility view.
- **E2E test speed**: Playwright against docker compose is slower than mock-only tests. Acceptable — real integration coverage is worth more.
- **Mixed backends during transition**: Some E2E tests hit the mock, some the real backend. Fine — the gateway handles routing and tests don't care which responds.
- **Single Postgres instance**: Dev/E2E share one compose Postgres; tests assume isolated, freshly-seeded state. Pool defaults (`max: 10`) are fine at homelab scale.
- **Seed data for user-scoped tables**: Portfolios, positions, and watchlists are user-scoped. Seeds must use the test user IDs that E2E authenticates as.

---

# Part 2 — Debug Logging

## Why This Is Part of the Testing Strategy

Tests assert on **known** inputs. Production surprises come from **unknown** inputs,
and until recently the only way to see what a valuation actually did was to re-derive
it by hand.

That cost is concrete. Investigating an IKE Marek chart spike meant writing throwaway
SQL against the cluster, re-deriving the FX arithmetic outside the process, and
guessing at which of two code paths produced the number. The queries were lossy, the
arithmetic was wrong twice, and nothing survived for the next investigation.

The fix is that every step feeding a user-visible number **narrates itself** when asked.
`RECALC_DEBUG=1` on the pod turns on a log you can diff directly.

## Policy

1. **One prefix, one env var.** `RECALC_DEBUG=1` gates valuation debug output. All
   lines use the `[recalc-debug]` prefix. No second mechanism, no per-module flag.
2. **Off by default, and explicitly so in prod.** Every container that can emit these
   lines sets `RECALC_DEBUG: "0"` in its HelmRelease. Silent means the default, and
   the default is silent.
3. **Log the inputs and the decision, not just the answer.** A total with no visible
   components cannot be reconciled with anything. Each line carries the per-unit
   amounts, the rate each was converted at, and the resulting total.
4. **Deterministic ordering.** Currency maps are sorted, never iterated in insertion
   order, so two runs of the same data produce byte-identical lines and `diff` works.
5. **Bound the volume.** Per-row detail is capped (e.g. positions log only the last
   day of a window), so enabling debug on a backfill does not produce megabytes.
6. **`console.log`, not a logger library.** These functions run in the API pod, in
   `snapshots-sync`, in `snapshots-sync-postfx`, and in `kubectl exec` one-offs. A
   logger dependency that only works in one of those is worse than `console.log`.
7. **Tests assert on the log content.** A debug line that is never asserted on is a
   line that silently rots. Every log-emitting function gets a test that the flag
   gates it and that the line contains the numbers it claims to report.

## Naming Convention

Lines are `<what>-<variant> pf=<id> <key>=<value> …`, all in base currency where a
total is involved:

| Line | Emitted by | Answers |
|---|---|---|
| `cash-balances` | `cashBalances` | live/as-of path — per-currency balances, row counts, the `asOf` cut |
| `cash-balance-series` | `cashBalanceSeries` | backfill path — per-day, per-currency amount **and the FX rate used** |
| `cash-invested` | `externalCashInvested` | "money actually put in", grouped per currency at each leg's own historical rate |
| `total-metrics` | `GET /api/portfolios/total-metrics` | which cash figure joined which instrument figure |
| `recalc-debug` | `backfill` | stored-snapshot composition: instruments, cash, invested, gap symbols |
| `recalc-debug-quote` | `quotes` | live recalc composition: per-position MV, its currency, its contribution |

The first three are the two cash replays side by side. The point of
`cash-balance-series` carrying its rate per leg is that `cash-balances` converts at
the **latest** rate while the series converts at the **day's** rate — a total with no
visible FX inputs cannot be reconciled against a total computed a different way.

## Reference Implementation

`portfoliost-wallets/src/services/debug.ts`:

```ts
export function debugEnabled(): boolean        // process.env.RECALC_DEBUG === "1"
export function debugLog(line: string): void   // prefixes, no-ops when off
export function debugObserver(): ((line: string) => void) | undefined
export function fmtCcyMap(map: Map<string, number>, digits?: number): string
export function fmtCcyRateMap(map: Map<string, { amount: number; rate: number }>, digits?: number): string
```

Read from the environment on every call rather than cached, so tests can flip it per
case. Call sites are once-per-portfolio or once-per-day, not once-per-row, so the
repeated read is off any hot path.

`fmtCcyRateMap` exists because `fx` is `1.000000` for the base currency and `0` for an
absent one is invisible in a plain amount list:

```
cash-balance-series pf=<id> day=2026-09-27 base=PLN | CAD 9451.00@1.612700 EUR 6113.33@1.000000 GBP -3154.49@0.860450 PLN 43325.30@1.000000 USD -3592.67@1.140300 | total=96357.11
```

## Enabling Debug in the Cluster

The app container in
`homelab/cluster/apps/pfire/portfoliost-wallets/app/helmrelease.yaml`:

```yaml
env:
  RECALC_DEBUG: "0"   # flip to "1" while investigating, then back
```

```sh
export KUBECONFIG=$HOME/.kube/homylab
kubectl rollout restart deploy/portfoliost-wallets -n pfire
kubectl logs -n pfire deploy/portfoliost-wallets -f | grep recalc-debug
```

For the backfill path, add the same var to the `snapshotsync` or `snapshotssync-postfx`
cronjob and trigger the pass from Admin → Jobs, or run it directly:

```sh
kubectl exec -n pfire deploy/portfoliost-wallets -- \
  env RECALC_DEBUG=1 node dist/scripts/snapshots-sync.js
```

**Set it back to `"0"` and commit that.** Debug left on in a synced manifest is the
default state of every future incident.

## Anti-Patterns

- **Debug on in prod, permanently.** The flag exists to be flipped, read, and flipped
  back. If a log line is worth having always-on, it belongs in metrics or a route
  response field, not under this flag.
- **Logging secrets or tokens.** Log identifiers, counts, rates, and amounts. Never
  `Authorization` headers, service tokens, or connection strings — this output is read
  over shared terminals and pasted into issues.
- **Logging PII beyond what the number needs.** A portfolio id and a base currency are
  enough to reconcile a total. Don't dump whole row objects; a debug line is meant to
  be greppable and diffable, not complete.
- **Unbounded per-row logging.** A backfill over 90 days × 13 symbols is thousands of
  lines. Cap per-row detail to the window's last day.
- **Duplicating arithmetic to log it.** Log what the function computed, via an optional
  observer callback. A second copy of the loop in the logging path is how the
  debug output and the real answer drift apart.
- **Asserting only that "something was logged".** A test that checks a line exists but
  not its numbers locks in nothing. Assert the amounts and rates.

## What This Replaces

Hand-written `psql` against the cluster for production investigations. The cluster is
the right place to *read* data; it is the wrong place to *re-derive* an application's
arithmetic, because a query can only ever approximate the code path that actually ran.
The log narrates the code path itself.

## Related

- Plan `§71` — debug logging for the cash/valuation replays (this policy's origin)
- `portfoliost-wallets/src/services/debug.ts` — the helper
- `portfoliost-wallets/src/services/cashLedger.test.ts` — the gating + content tests
