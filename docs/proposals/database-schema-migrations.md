# Proposal: Database Schema Migrations — main DB vs mock DB split

**Status**: accepted (2026-09-07)
**Builds on**: [backend-topology.md](backend-topology.md) (D6 schema-per-module), [testing-strategy.md](testing-strategy.md) (environment tiers), [database-postgres-drizzle.md](../../../portfoliost-users-auth/docs/database-postgres-drizzle.md) (Drizzle as the framework)
**Supersedes wiring assumptions**: `testing-strategy.md` "seed in container CMD" and `database-postgres-drizzle.md` "migrations + seeds run from the module image"

## Context / Problem

Every backend module currently mixes two kinds of state change in its container boot sequence:

- **Schema migrations** (`drizzle-kit generate/migrate`), and
- **Data seeds shipped inside the module image** — `users-auth` seeds test-user preferences, `wallets` seeds a demo FX table + parity cash wallet + Top10 portfolio (`seed/`, `db:seed`, `SEED_PORTFOLIOS`), `instruments` seeds `ticker_reference`/`exchange_reference` from bundled CSVs.

The module image is therefore not a clean artifact: the same image that runs in the cluster (no fixtures) contains mock-seeding code that only the local/E2E stack uses. Seeds punctured the separation between the **main DB** (persistent, no fixtures, users self-provision) and the **mock DB** (compose, volatile, deterministic fixtures). The migration chains also carry monolith-era history (cross-schema moves, dropped identity columns) and the journal table is shared between `users-auth` and `admin` (both default to drizzle's `drizzle` schema).

The whole `portfoliost` database can be reset today, so we are allowed to **rewrite migrations from scratch**: each module squashes its chain into a single baseline that recreates the current schema.

## Decision — migration kinds split by ownership, not by repository

| Kind | Purpose | Applies to | Owned by |
| --- | --- | --- | --- |
| **Schema migrations** | DDL — create/alter the module's tables + indexes, create module views | main **and** mock (identical) | each module container (`drizzle-kit migrate` on boot) |
| **Data migrations** (future) | DML/backfill that transforms rows as part of a schema change on a populated DB | main and mock (identical) | written inside the owning module's drizzle chain as a `--custom` migration |
| **Data seeds** | deterministic demo fixtures — test users, demo FX rates, parity wallet + Top10 portfolio, ticker/exchange reference CSVs | **mock only** | `portfoliost/mocks/db-seed/*` + one-shot `mock-db-seed` compose service |

Portfoliost module images ship **zero seeding code** after this change. Victory condition: deleting the `mock-db-seed` service + `mocks/db-seed/` is a cosmetic removal that touches no module repo.

At fresh start there is **no data backfill anywhere**: the baseline is pure DDL (verified — current chains contain only DDL: `CREATE TABLE/SCHEMA`, `ALTER TABLE`, `CREATE VIEW`, `CREATE INDEX`). The "future data migrations" kind exists only for when the main DB holds real data (section 8).

## Decision records

### D73 — kind-based ownership split

Schema DDL and data transforms belong to the module that owns the tables and run in every environment. Seeds are demo fixtures and live only under the mock. Nothing else exists. This replaces "migrations + seeds in the container CMD".

### D74 — per-module migration journal isolation

Each module declares its own journal schema so migration management is fully separated per module:

| Module | `migrations.schema` |
| --- | --- |
| users-auth | `drizzle_users_auth` *(new)* |
| wallets | `drizzle_wallets` *(already set)* |
| instruments | `drizzle_instruments` *(already set)* |
| admin | `drizzle_admin` *(new)* |

This removes the accidental sharing of the default `drizzle` journal between `users-auth` and `admin` and keeps drizzle's bookkeeping inside each module's ownership (D6).

### D75 — baseline squash (rewrite from scratch, allowed because the DB is resettable)

Each module deletes its `drizzle/` chain (keeping `drizzle.config.ts`) and regenerates a single `0000_<baseline>.sql` from `schema.ts` capturing the **current** schema. Fresh `CREATE SCHEMA` + `CREATE TABLE` land directly in the module schema — no cross-schema moves, no dropped-column archaeology. `instruments` additionally re-appends the `price_bars_all` view (not expressible in `schema.ts`). Requires a one-time reset of the DB (compose: tmpfs is already fresh; cluster: scheduled DB recreate, see Rollout).

### D76 — `mock-db-seed` one-shot service owns every seed

All seeding runs from `portfoliost/mocks/db-seed/` via a dedicated compose one-shot built on the portfoliost image. It depends on the module containers reporting healthy (their `/health` answers only after `db:migrate`, so every module schema exists before any seed runs). `reset-mock-state.sh` re-runs it instead of restart-reseeding module containers.

## Target architecture

```
                     main DB (cluster, persistent)              mock DB (compose, volatile tmpfs)
                     ┌─────────────────────────────┐            ┌────────────────────────────┐
                     │   shared Portfolio Postgres │            │   shared Portfolio Postgres │
                     └──────────────┬──────────────┘            └──────────────┬─────────────┘
       schema: each module applies its own at boot                        │
 users-auth ─► migrate ─► users_auth.user_preferences    users-auth ─► migrate ─► users_auth.user_preferences
 wallets ────► migrate ─► wallets.* + portfolios.*        wallets ────► migrate ─► wallets.* + portfolios.*
 instruments ► migrate ─► instruments.* + price_bars_all  instruments ► migrate ─► instruments.* (+ pricebars-sim)
 admin ──────► migrate ─► admin.job_run                   admin ──────► migrate ─► admin.job_run
                                                                                    ▲
                                                            mock-db-seed (one-shot) │ inserts demo fixtures
                                                            depends_on module health (schema guaranteed)
```

- The **same module containers** migrate both databases: schema stays byte-identical across main and mock.
- Seeds never run in the cluster. `mock-db-seed` exists only in compose.
- Main DB reference data (`ticker_reference`, `exchange_reference`) is populated by the production job (`tickerref-sync --url`) which is assumed to run **after a fresh database is created**; no static reference bootstrap runs in production.
- Module users self-provision on first auth (`onConflictDoNothing`), so no user fixture is needed in the main DB.

## Container ↔ schema ownership

| Schema / object | Owned tables | Owning container | Journal schema | Notes |
| --- | --- | --- | --- | --- |
| `users_auth` | `user_preferences` | `users-auth` | `drizzle_users_auth` | single table; identity lives in JWT |
| `wallets` | `fx_rates`, `fx_sync_state`, `wallet_transactions`, `wallets` | `wallets` | `drizzle_wallets` | demo FX rows are seed, not schema |
| `portfolios` | `portfolios`, `positions`, `transactions`, `shares`, `value_snapshots`, `portfolio_backfill_metadata`, `labels`, `position_labels`, `transaction_labels`, `wallet_transaction_labels` | `wallets` (module owns both schemas, D6) | `drizzle_wallets` | one journal covers both schemas |
| `instruments` | `ticker_reference`, `exchange_reference`, `logos`, `price_bars`, `price_bar_metadata`, `split_adjustments`, `split_candidates`, `price_bars_all` (view) | `instruments` | `drizzle_instruments` | view + stooq FDW refs are module DDL |
| `admin` | `job_run` | `admin` | `drizzle_admin` | |
| `stooq_daily_*` (8 foreign tables) | — | **none (infra)** | — | `postgres_fdw` foreign tables: cluster = `pfire-init-sql` ConfigMap; compose = `pricebars-sim` stand-in. Read-only for all modules |
| `drizzle_<module>` journals | `__drizzle_migrations` | respective module | — | auto-created by `drizzle-kit migrate` |
| — (owns no tables) | demo fixtures land in `users_auth.*`, `wallets.*`, `portfolios.*` | `mock-db-seed` | — | writes to module-owned tables only |

## Framework

- **Drizzle Kit `0.31.10`** (`drizzle-kit generate` / `migrate`) + **drizzle-orm `0.45.2`**, dialect `postgresql`.
- Schema is the contract: `src/db/schema.ts` → `pgSchema("<module>")` tables; migrations generated to `drizzle/<NNNN>_<name>.sql` with `drizzle/meta/_journal.json` + snapshots.
- Unit tests replay the real migrations on **PGlite** (`@electric-sql/pglite`) — the squashed baseline must be PGlite-clean, so statements are separated by `--> statement-breakpoint`.
- `DATABASE_URL` drives the target; `drizzle.config.ts` sets `out: "./drizzle"` and `migrations.schema: "drizzle_<module>"` in every module.
- Seeds in the mock run against the same Postgres via the `postgres` driver (raw SQL — the current module seed code already uses it, not drizzle).

## Baseline squash (step per module)

For `users-auth`, `wallets`, `instruments`, `admin`:

1. Remove everything under `drizzle/`; keep `drizzle.config.ts`.
2. `drizzle.config.ts`: add `migrations.schema: "drizzle_<module>"` (D74).
3. `npx drizzle-kit generate` → one fresh `0000_<baseline>.sql` recreating the current schema directly in the module schema.
4. `instruments`: append the `price_bars_all` view DDL (current body, byte-identical) to the baseline, after the generated DDL, separated by `--> statement-breakpoint` (the view is not in `schema.ts`).
5. Run module unit tests (PGlite applies the real journal) — must be green with the single baseline.
6. No DML anywhere: baseline is pure DDL (D73), so it reconstructs an empty but fully-shaped schema for both DBs.

## Seeds move to `mocks/db-seed` + `mock-db-seed` service

New in the `portfoliost` repo (the mock owns every seed — full separation):

```
mocks/db-seed/
  run.mjs                         # entry: FX + wallet → Top10 portfolio (FK) → user prefs → ticker reference
  constants.mjs                   # SEED_USER_ID, SEED_WALLET_ID, SEED_PORTFOLIO_ID, SEED_SHARE_ID, demo FX map, Top10 fixtures
  wallets.mjs                     # ported wallets/src/db/seed.ts (parity cash wallet + 5 transactions + demo FX)
  portfolios.mjs                  # ported wallets/src/db/portfolio-seed.ts (Top10 portfolio + share)
  user-preferences.mjs/.sql       # ported users-auth/seed/001_user_preferences.sql
  ticker-reference.mjs            # ported CSV parser + batched upsert from instruments tickerref-sync (--file mode)
  instruments/ticker_reference.csv
  instruments/venues.csv
  instruments/mic_yahoo_suffixes.csv
```

- Porting is a **copy** of the existing seed logic rewritten as plain ESM `.mjs` (the module code already uses raw `postgres` SQL).
- The `ticker_reference` CSV (~61.7k rows) is inserted in 500-row batches with `ON CONFLICT (listing_key) DO UPDATE`, gated by a row-count check (same semantics as `--if-empty`).
- Add `postgres` to the `portfoliost` repo `dependencies`; the SPA build is unaffected, and `Dockerfile.mock` already runs `npm ci --omit=dev`.

`docker-compose.yml`:

```yaml
mock-db-seed:
  build: { context: ".", dockerfile: Dockerfile.mock }
  command: ["node", "mocks/db-seed/run.mjs"]
  environment:
    DATABASE_URL: postgres://portfoliost:portfoliost@postgres:5432/portfoliost
    SEED_PORTFOLIOS: "true"
  depends_on:
    postgres:   { condition: service_healthy }
    users-auth: { condition: service_healthy }   # /health answers only after db:migrate → schema exists
    wallets:    { condition: service_healthy }
    instruments: { condition: service_healthy }  # needed for ticker_reference/exchange_reference schema
  restart: "no"
```

Rejected alternative: reuse the `instruments` image as the ticker loader (the `pricebars-sim` pattern). It couples the mock to a module image — against the full-separation requirement (D73/D76).

## Module container changes

| Module | Dockerfile CMD after | Removed |
| --- | --- | --- |
| users-auth | `db:migrate && node dist/server.js` | `COPY seed/ seed/`, `db:seed`, `src/db/seed.ts` |
| wallets | `db:migrate && node dist/server.js` | `COPY seed/ seed/`, `db:seed`, `src/db/seed.ts`, `src/db/portfolio-seed.ts`, `seed.test.ts`, `SEED_PORTFOLIOS`/`SEED_USER_ID` env handling |
| instruments | `db:migrate && node dist/server.js` | `COPY seed/ seed/`, the `--file` bootstrap from CMD; `tickerref-sync.ts` keeps `--url` mode only (prod CronJob); CSVs move to `mocks/db-seed/instruments/` |
| admin | `db:migrate && node dist/server.js` | — (adds `migrations.schema: drizzle_admin`) |

`scripts/reset-mock-state.sh`: keep the truncate of `wallets.*`/`portfolios.*` (clears residue from mutating E2E runs), drop the "restart `wallets` to reseed" step, then run `docker compose run --rm mock-db-seed`.

## Environment matrix

| Environment | Database | Volatility | Schema applied by | Seed |
| --- | --- | --- | --- | --- |
| Backend unit tests | PGlite, in-process | fresh per test | real `drizzle/` journal in test setup | none — tests create own data |
| Docker compose (dev/E2E) | `portfoliost-postgres` tmpfs | volatile — fresh every up | each module container at boot | `mock-db-seed` one-shot |
| Cluster (prod) | shared persistent Postgres | persistent | each module container at boot | none; `tickerref-sync --url` job after DB recreate |

## Migration-writing reference (going forward)

### 7a. Schema migrations

1. Touch `schema.ts`, run `npx drizzle-kit generate`, review the SQL, commit the migration with the code that uses it. One migration per step, one step = one commit (AGENTS.md).
2. DDL not expressible in `schema.ts` (views, triggers, extensions) → `npx drizzle-kit generate --custom`, hand-write the SQL, separate statements with `--> statement-breakpoint`.
3. Never touch another module's schema (D6) — a migration may only modify the owning module's tables.
4. Wire fields stay camelCase (D29).

### 7b. Future data migrations (this is how DML joins the chain later)

Once the main DB holds real data, a change that needs a transform is written as a **drizzle custom migration inside the owning module** — it applies to main and mock automatically and runs exactly once (journaled):

```sh
npx drizzle-kit generate --custom --name data_<module>_<what>
# → drizzle/0005_data_<module>_<what>.sql  (empty; fill it in)
```

Rules:

- **Pure DML is allowed here** — this is a data **migration**, distinct from a mock **seed**: it runs in every environment. Seeds still belong only in `mocks/db-seed/`; never backfill demo fixtures via a migration.
- A schema change + its data move may share one file (DDL block, `--> statement-breakpoint`, DML block) or land in a follow-up migration if the transform needs a previous migration's columns.
- Prefer idempotent/guarded DML (`ON CONFLICT DO NOTHING`, `WHERE NOT EXISTS`) so an interrupted boot cannot corrupt data; the journal already prevents double application on clean runs.
- Touch only the owning module's tables; no cross-schema DML.
- Statement-separate with `--> statement-breakpoint` (PGlite executes individually).
- No `--custom` migration may create a mock-only table or insert demo rows — separation is enforced at write time.

Verification before merge: unit test on PGlite runs the real journal and asserts the transform; if API output changes, the compose stack tests (`test:stack*`) and E2E on a fresh tmpfs DB see it too.

### 7c. Data seeds (mock only)

Demo/mock data is never a module migration. Only `mocks/db-seed/*.mjs`, idempotent (row-count check / `ON CONFLICT DO NOTHING`), fixed IDs + fixed ISO timestamps for stable E2E snapshots. When a schema change touches a seeded table, update `mocks/db-seed` in the same commit.

## Step plan (one step = one commit, verified before marking done)

| # | Step | Verifies with |
| --- | --- | --- |
| 1 | `wallets`: squash to baseline `0000` + `drizzle_wallets`; drop `seed.ts`/`portfolio-seed.ts`/`seed.test.ts` + `db:seed`; CMD `db:migrate && node dist/server.js` | build + unit (PGlite) |
| 2 | `users-auth`: squash to baseline + `drizzle_users_auth`; drop `seed/` + `db:seed` | build + unit |
| 3 | `instruments`: squash to baseline + `price_bars_all` view verbatim; drop `seed/` + `--file` bootstrap from CMD (keep `--url` mode) | build + unit; `pricebars-sim` |
| 4 | `admin`: squash to baseline + `drizzle_admin` | build + unit |
| 5 | `mocks/db-seed/` + `postgres` dep + `mock-db-seed` service (D76); port all fixtures incl. ticker reference | `docker compose up -d --build` on fresh tmpfs; `test:stack`, `test:stack:wallets`, `test:stack:portfolios` |
| 6 | `reset-mock-state.sh` → re-run `mock-db-seed`; drop wallet restart-reseed | `npm run test:e2e` (fresh tmpfs DB) |
| 7 | Docs sweep: `MODULARISATION.md` migration checklist, `testing-strategy.md` seed section, README "DB reset required" note | — |

Each module squashes on its own schedule; the compose stack only exercises the union, so steps 1–4 can land in any order.

## Rollout / caveats

- The squashed baseline assumes an **empty** database. Cluster prod Postgres must be recreated (or the module schemas dropped + journal reset) at rollout; the compose DB is tmpfs and needs only `docker compose down` (or `docker compose exec postgres` drop). Schedule the prod recreate with a low-risk window; `tickerref-sync --url` and FX/first-user self-provisioning repopulate data after.
- Module HelmReleases keep their CMD (no seed override needed — the image no longer contains seeds).
- Existing environments that ran the pre-squash chains must **not** run the new baseline on top of old tables — full reset only.