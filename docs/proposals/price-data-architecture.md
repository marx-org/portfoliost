# Price Data Architecture Proposal

Date: 2026-08-28  
Status: Draft — agreed in discussion, pending implementation planning

---

## Problem

Portfolio analytics (value chart, performance metrics) require daily historical close prices for
each held symbol. Currently portfoliost-instruments fetches prices on demand from
cachest → openst → OpenBB providers (yfinance, fmp, etc.). This is:

- Rate-limited — providers block after N requests per day
- Fragile — non-US stocks (KRU.WA, RHM.DE) fail intermittently
- Ephemeral — cachest uses Redis with TTL; no persistent historical store exists
- Slow for bulk requests — fetching 365 daily bars for 6 symbols serially is seconds, not milliseconds

---

## Stooq as the primary historical data source

Stooq (stooq.pl) publishes bulk downloads of historical OHLCV data. A `stooq` Postgres database
already exists in the pfire cluster (same Postgres instance as `portfoliost`), populated by the
stooq-downloader + stooq-importer-pgloader jobs.

Stooq stores **split-adjusted prices** (verified: AAPL, TSLA, AMZN show continuous series across
known split dates with no price cliffs). This means stooq historical data and openst current data
(which also returns adjusted prices) are on the same scale — no adjustment needed at the boundary
for normal operation.

Available datasets and tables — daily stooq catalogue. Each zip maps to a separate table:

| Region | Timeframe | Stooq zip | Table |
|---|---|---|---|
| World | Daily | `d_world_txt.zip` | `daily_world` |
| U.S. | Daily | `d_us_txt.zip` | `daily_us` |
| U.K. | Daily | `d_uk_txt.zip` | `daily_uk` |
| Japan | Daily | `d_jp_txt.zip` | `daily_jp` |
| Hong Kong | Daily | `d_hk_txt.zip` | `daily_hk` |
| Poland | Daily | `d_pl_txt.zip` | `daily_pl` |
| Hungary | Daily | `d_hu_txt.zip` | `daily_hu` |
| Macroeconomy | Daily | `d_macro_txt.zip` | `daily_macro` |

The initial three tables (`daily_us`, `daily_pl`, `daily_world`) from the original design are
a subset. The `stooq_daily_us`, `stooq_daily_pl`, `stooq_daily_world` foreign tables and the
`price_bars_all` view cover **daily EOD data only** — only the daily datasets are imported.

A separate Kubernetes Job is created per dataset on import. See `admin-jobs-stooq-upload.md`
for the upload + import flow.

**Key infrastructure facts:**
- Both `stooq` and `portfoliost` DBs are on the same Postgres instance (`postgres-pfire-primary`)
- `postgres_fdw` extension is available but not yet installed
- The `(ticker, date)` composite primary key index exists on each stooq table —
  queries filtered by ticker are index-only scans, fast even on 27M rows
- Stooq import truncates and fully reloads tables on each run

Symbols in the current "Top 10" portfolio and their expected stooq coverage:

| Symbol | Exchange | Expected stooq table |
|---|---|---|
| AAPL, AMZN, GOOGL, TSLA | NASDAQ/NYSE | `daily_us` |
| KRU.WA | WSE (Poland) | `daily_pl` |
| RHM.DE | XETRA (Germany) | `daily_world` |

Exact ticker format in stooq for non-US symbols must be verified from actual imported data.
The `exchange_reference` table in `instruments` schema has `yahoo_suffix` per exchange
(WSE → `WA`, XETRA → `DE`); stooq is expected to use the same convention.

---

## Architecture

### Overview

```
portfoliost-instruments (Hono + Drizzle + Postgres)
  │
  ├── instruments schema (portfoliost DB)
  │     ├── price_bars           — overflow: prices NOT in stooq (recent tail, rare symbols)
  │     ├── price_bar_metadata   — per-symbol fetch circuit breaker
  │     ├── split_candidates     — detected split discontinuities pending admin review
  │     ├── split_adjustments    — admin-approved factors, applied in view until next import
  │     ├── stooq_import_log     — last import date per dataset (source of stooq floor date)
  │     ├── stooq_daily_us       — foreign table → stooq.public.daily_us
  │     ├── stooq_daily_pl       — foreign table → stooq.public.daily_pl
  │     ├── stooq_daily_world    — foreign table → stooq.public.daily_world
  │     └── price_bars_all       — VIEW unifying all sources
  │
  └── GET /api/instruments/:symbol/price-bars?from=&to=
        1. Query price_bars_all (one SQL call, covers everything)
        2. If gap near today: fetch missing days from cachest → openst
        3. Write fetched rows to price_bars (overflow)
        4. If first overflow write for this symbol: run split boundary check
        5. Return complete series
```

### Foreign tables via postgres_fdw

Since both databases are on the same Postgres instance, `postgres_fdw` provides zero-copy
cross-database access. No data duplication, no sync jobs. Stooq truncate-and-reload is
immediately visible through foreign tables.

The cluster is managed by Crunchy Data PGO (PostgresCluster CRD). PGO supports a
`databaseInitSQL` field that runs a SQL script **once at cluster creation time** — it does
**not** run on every pod startup. This lives in the homelab GitOps repo alongside the cluster
definition, is version-controlled, and configures extension management declaratively for any
new cluster built from this spec.

> Caveat: because `databaseInitSQL` runs only at init, the script alone does not re-apply to an
> existing live cluster. The SQL is written idempotent (`IF NOT EXISTS`, guarded `DO` blocks), so
> it can be applied manually to a pre-existing cluster with `kubectl cp + psql -f`, which is how
> the current production cluster was brought up to date.

The init SQL is packaged into a Kubernetes ConfigMap and referenced in
`postgrescluster-pfire.yaml`:

```yaml
spec:
  databaseInitSQL:
    name: pfire-init-sql
    key: init.sql
```

`init.sql` content (in the homelab repo, `cluster/apps/pfire/pfire-init-sql.yaml`):

```sql
\c portfoliost

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- CREATE SERVER / CREATE USER MAPPING have no IF NOT EXISTS in PostgreSQL;
-- guard them with DO blocks to stay idempotent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname='stooq_server') THEN
    CREATE SERVER stooq_server
      FOREIGN DATA WRAPPER postgres_fdw
      OPTIONS (dbname 'stooq', host '/tmp/postgres');
  END IF;
END $$;

-- Same Postgres instance: connect over the local socket and authenticate as the local
-- superuser via pg_hba `local all "postgres" "peer"`. No password in the repo. The
-- password_required=false user-mapping option opts postgres_fdw out of demanding a password
-- (peer auth already validated the OS user); cluster TCP auth (md5) is left untouched.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_user_mappings
                 WHERE srvname='stooq_server'
                   AND umuser = 'portfoliost'::regrole) THEN
    CREATE USER MAPPING FOR portfoliost
      SERVER stooq_server
      OPTIONS (user 'postgres', password_required 'false');
  END IF;
END $$;

CREATE FOREIGN TABLE IF NOT EXISTS instruments.stooq_daily_pl (
  ticker TEXT NOT NULL, period TEXT NOT NULL, date DATE NOT NULL,
  time TEXT NOT NULL DEFAULT '000000', open NUMERIC(20,8), high NUMERIC(20,8),
  low NUMERIC(20,8), close NUMERIC(20,8), volume NUMERIC(28,8), openint NUMERIC(28,8)
) SERVER stooq_server OPTIONS (schema_name 'public', table_name 'daily_pl');

-- Same for daily_us, daily_jp, daily_world, daily_uk, daily_hk, daily_hu, daily_macro
```

Note that `CREATE FOREIGN TABLE IF NOT EXISTS` is the only "IF NOT EXISTS" that PostgreSQL
actually supports here — `CREATE SERVER` and `CREATE USER MAPPING` require the `DO`-block guard
shown above. Because the source stooq tables already carry a primary-key btree index on
`(ticker, date, "time")`, postgres_fdw pushes `WHERE ticker = ...` quals down to the remote, so
per-ticker lookups over the 24M+ row tables hit the index (measured ~277 ms on `daily_pl`).
Full-market unqualified scans remain slow and should be avoided.

### Overflow table (instruments.price_bars)

Stores prices that stooq does not cover:
- Recent days since last stooq import (the "tail")
- Symbols not in stooq (rare foreign exchanges, ETFs, etc.)

```sql
CREATE TABLE instruments.price_bars (
  symbol   TEXT         NOT NULL,   -- system format: AAPL, KRU.WA, RHM.DE
  date     DATE         NOT NULL,
  open     NUMERIC(20,8),
  high     NUMERIC(20,8),
  low      NUMERIC(20,8),
  close    NUMERIC(20,8) NOT NULL,
  volume   BIGINT,
  currency CHAR(3),
  source   TEXT         NOT NULL DEFAULT 'openst',
  PRIMARY KEY (symbol, date)        -- covers MAX/MIN(date) WHERE symbol = ? efficiently
);
```

### Split adjustments tables

Two tables support the split detection and correction workflow:

```sql
-- Detected discontinuities pending admin review
CREATE TABLE instruments.split_candidates (
  symbol               TEXT         NOT NULL,
  detected_at          DATE         NOT NULL,
  last_stooq_date      DATE,
  last_stooq_close     NUMERIC(20,8),
  first_overflow_date  DATE,
  first_overflow_close NUMERIC(20,8),
  ratio                NUMERIC(10,6),
  suggested_factor     NUMERIC(10,6),  -- NULL if ambiguous (not a clean split ratio)
  suggested_ratio      TEXT,           -- '4:1', '2:1', etc. or NULL
  status               TEXT         NOT NULL DEFAULT 'pending',  -- 'pending'|'applied'|'dismissed'
  reviewed_at          TIMESTAMPTZ,
  reviewed_by          TEXT,
  PRIMARY KEY (symbol, detected_at)
);

-- Admin-approved adjustments, applied in the view until next stooq import heals the boundary
CREATE TABLE instruments.split_adjustments (
  symbol       TEXT         NOT NULL,
  detected_at  DATE         NOT NULL,
  factor       NUMERIC(10,6) NOT NULL,  -- e.g. 0.25 for a 4:1 split
  split_ratio  TEXT,                    -- human-readable: '4:1', '2:1', etc.
  PRIMARY KEY (symbol, detected_at)
);
```

### Unified view (instruments.price_bars_all)

A single view presenting stooq data and overflow data as one unified series. Admin-approved
split adjustments are applied to stooq prices where recorded. The overflow table is kept free
of rows covered by stooq (see "Overflow cleanup"), so the UNION ALL never produces duplicates.

```sql
CREATE VIEW instruments.price_bars_all AS
  -- Stooq US, with split adjustment applied where admin has approved one
  SELECT
    replace(s.ticker, '.US', '') AS symbol,
    s.date,
    s.close * COALESCE(adj.factor, 1) AS close,
    s.open  * COALESCE(adj.factor, 1) AS open,
    s.high  * COALESCE(adj.factor, 1) AS high,
    s.low   * COALESCE(adj.factor, 1) AS low,
    s.volume,
    'stooq' AS source
  FROM instruments.stooq_daily_us s
  LEFT JOIN instruments.split_adjustments adj ON replace(s.ticker, '.US', '') = adj.symbol
  UNION ALL
  -- Stooq PL (ticker format TBC after import)
  SELECT <mapping> AS symbol, date, open, high, low, close, volume, 'stooq' AS source
  FROM instruments.stooq_daily_pl
  UNION ALL
  -- Stooq world (ticker format TBC after import)
  SELECT <mapping> AS symbol, date, open, high, low, close, volume, 'stooq' AS source
  FROM instruments.stooq_daily_world
  UNION ALL
  -- Overflow: recent tail and symbols not in stooq
  SELECT symbol, date, open, high, low, close, volume, source
  FROM instruments.price_bars;
```

---

## Fill-on-the-go

Overflow is filled **on demand**, only when a query for a specific symbol reveals a gap.
No background jobs, no proactive fills, no polling. Data is fetched only for symbols that
are actually queried.

On a `GET /api/instruments/:symbol/price-bars?from=&to=` request:

1. Query `price_bars_all` for the requested range.
2. Find the last date in the result for this symbol.
3. If `today - last_date > 3 days` (tolerates weekends/holidays): gap exists.
4. Check `price_bar_metadata.last_fetched_at` — if a fetch failed within the last hour,
   return what we have with `{ stale: true }` rather than hammering openst.
5. Fetch the missing days from cachest → openst. Write rows to `price_bars`.
6. Update `price_bar_metadata`.
7. If this is the **first overflow write for this symbol**: run split boundary check.
8. Return the complete series.

The "first overflow write" guard (step 7) is a single indexed query:
`SELECT MIN(date) FROM price_bars WHERE symbol = ?`. If `MIN(date) = today`, this is the
first write — run the check. If overflow already existed before today, the boundary is
already established and no re-check is needed.

```sql
CREATE TABLE instruments.price_bar_metadata (
  symbol          TEXT PRIMARY KEY,
  last_fetched_at TIMESTAMPTZ,
  fetch_status    TEXT NOT NULL DEFAULT 'ok'  -- 'ok' | 'failed'
);
```

---

## Split detection

### The problem

Between stooq imports, a stock split can create a price scale discontinuity at the
stooq/overflow boundary:

```
stooq (adjusted to last import date):   ... | last_stooq_date: $200
overflow (filled after split):               | first_overflow_date: $50
                                                ↑ false 75% drop in the unified view
```

Stooq stores adjusted prices, so after the next import stooq will retroactively show $50
for the pre-split period and the boundary heals automatically. The discontinuity window
lasts at most until the next monthly import.

### Detection (on first overflow write for a symbol)

When new overflow rows are written for a symbol that also has stooq data, and this is the
first overflow write for that symbol, compare the boundary prices:

```
last_stooq_close  = close WHERE ticker = stooq_ticker ORDER BY date DESC LIMIT 1
first_overflow_close = close WHERE symbol = symbol ORDER BY date ASC LIMIT 1

ratio = first_overflow_close / last_stooq_close

known_split_factors = [1/2, 1/3, 1/4, 1/5, 1/7, 1/10, 1/20,
                       2, 3, 4, 5, 7, 10, 20]   ← forward and reverse splits
tolerance = ±3%
```

Both queries use the primary key index — fast regardless of table size.

If `ratio` matches a known split factor within tolerance:
→ `INSERT INTO split_candidates` with `status='pending'`, `suggested_factor`, `suggested_ratio`

If `ratio` is outside 0.85–1.15 but does not match a clean split factor:
→ `INSERT INTO split_candidates` with `status='pending'`, `suggested_factor=NULL`
   (ambiguous — could be an extreme price movement; shown to admin for manual review)

If `ratio` is within 0.85–1.15: no discontinuity, no action.

### Admin review and application

The admin reviews pending candidates in the Market Data panel (see below). For each candidate:

- **Apply**: `INSERT INTO split_adjustments (symbol, factor, split_ratio)` — the view
  immediately applies the correction to all stooq historical prices for that symbol.
  Update `split_candidates.status = 'applied'`.
- **Dismiss**: mark `status = 'dismissed'` — no adjustment applied. Used when the
  discontinuity is a genuine price movement, not a split.

The admin panel shows enough context to make the decision: last stooq close, first overflow
close, ratio, suggested split ratio, and a link to the symbol's research page.

### Healing on stooq import

When a new stooq import runs and the cleanup hook fires, for each covered symbol:

1. Delete overflow rows up to `latestDate` (they are now covered by stooq).
2. Delete `split_adjustments` rows — stooq has re-adjusted its own data retroactively,
   the factor is no longer needed, the view returns to its simple form.
3. Auto-dismiss any `split_candidates` with `status='pending'` for covered symbols —
   the import has healed the boundary.

---

## Overflow cleanup on stooq import

When a new stooq import runs, overflow rows now covered by stooq are redundant and must be
removed to prevent UNION ALL duplicates.

The pgloader k8s Job adds a post-load step that calls portfoliost-instruments with no payload:

```
POST /api/instruments/internal/stooq-imported
```

portfoliost-instruments determines the actual coverage dates itself by querying the foreign
tables — the pgloader job is not the authority on what data was loaded:

```sql
SELECT MAX(date) FROM instruments.stooq_daily_us;    -- e.g. 2026-08-28
SELECT MAX(date) FROM instruments.stooq_daily_pl;
SELECT MAX(date) FROM instruments.stooq_daily_world;
```

Then for each table, using its actual `MAX(date)`:

1. Delete overflow rows up to that date for symbols covered by that stooq table
2. Delete now-redundant `split_adjustments` rows for those symbols up to that date
3. Auto-dismiss pending `split_candidates` for those symbols
4. Update `stooq_import_log` with the confirmed latest date per dataset and cleanup stats
5. Refresh the in-memory stooq floor date cache

```sql
-- Example for daily_us after confirming MAX(date) = 2026-08-28:
DELETE FROM instruments.price_bars
WHERE date <= '2026-08-28'
  AND symbol IN (SELECT replace(ticker, '.US', '') FROM instruments.stooq_daily_us);
```

This way the cleanup is always consistent with what stooq actually contains, regardless of
what the import job thought it loaded.

> **Superseded (2026-08-31)**: `instruments.stooq_import_log` was never implemented.
> Its columns (`latest_date`, `imported_at`, `rows_deleted`) are now part of
> `admin.job_run` (D53 in `admin-module.md`). The `/log` endpoint reads from
> `admin.job_run` directly — no instruments table or cross-module call needed.
> The post-import hook, when wired, will write to `admin.job_run` instead.

```sql
-- SUPERSEDED — not implemented; replaced by admin.job_run columns (D53)
-- CREATE TABLE instruments.stooq_import_log (
--   dataset      TEXT PRIMARY KEY,
--   latest_date  DATE,
--   imported_at  TIMESTAMPTZ,
--   rows_deleted INTEGER
-- );
```

## Ticker mapping

The `exchange_reference` and `ticker_reference` tables in `instruments` schema provide stooq
table routing without any hardcoded mapping:

```
symbol KRU.WA
  → ticker_reference: exchange = WSE
  → exchange_reference: country_code = PL  →  stooq table: daily_pl
  → stooq ticker: KRU.WA (yahoo_suffix = WA, TBC from actual imported data)

symbol RHM.DE
  → ticker_reference: exchange = XETRA
  → exchange_reference: country_code = DE  →  stooq table: daily_world
  → stooq ticker: RHM.DE (yahoo_suffix = DE, TBC from actual imported data)

symbol AAPL
  → ticker_reference: exchange = NASDAQ
  → exchange_reference: country_code = US  →  stooq table: daily_us
  → stooq ticker: AAPL.US
```

---

## Admin section — Market Data tab

A new "Market Data" tab is added to the existing admin section
(`/en/admin/market-data`, alongside System / Currency Rates / Users).

**Status panel — Stooq datasets:**

One row per dataset (daily_us, daily_pl, daily_world):

| Dataset | Latest date | Imported at | Overflow rows cleaned |
|---|---|---|---|
| daily_us | 2026-08-28 | 2026-08-28 14:32 | 142 |
| daily_pl | — | — | — |
| daily_world | — | — | — |

Latest date is read from `stooq_import_log` (populated by the post-import hook, not by
the job itself). This is historical information only — the actual cleanup is always driven
by querying `MAX(date)` from the foreign tables at cleanup time.

**Split candidates panel:**

Lists all `split_candidates` rows with `status = 'pending'`, ordered by `detected_at DESC`:

| Symbol | Detected | Last stooq date | Last stooq close | First overflow date | First overflow close | Ratio | Suggested | Actions |
|---|---|---|---|---|---|---|---|---|
| AAPL | 2026-10-01 | 2026-09-30 | $200.00 | 2026-10-01 | $50.00 | 0.250 | 4:1 | Apply / Dismiss |
| XYZ | 2026-10-05 | 2026-10-04 | $100.00 | 2026-10-05 | $47.50 | 0.475 | — (ambiguous) | Apply custom / Dismiss |

- **Apply**: inserts into `split_adjustments`, view corrects immediately
- **Dismiss**: marks as dismissed, no adjustment applied
- **Apply custom**: for ambiguous cases, admin enters the factor manually
- Each row has a link to the symbol's research page for verification

Reviewed candidates (applied/dismissed) are shown in a collapsed history section below.

**Overflow summary:**

- Total overflow rows currently in `price_bars`
- Breakdown by symbol (top 10 by row count)

---

## Admin section — Jobs tab

A new "Jobs" tab is added to the admin section (`/en/admin/jobs`).

Displays one card per stooq dataset. Each card has:
- Name and description
- Last run timestamp and status (success / failed / never run) — from `stooq_import_log`
- **Run import** — admin selects a `.zip` downloaded from stooq.pl, uploads the file and triggers a
  Kubernetes Job via jobshot

Initial job list for the pfire namespace:

| Job | Description | Target table |
|---|---|---|
| USA daily import | Import `d_us_txt.zip` via pgloader | `daily_us` |
| Poland daily import | Import `d_pl_txt.zip` via pgloader | `daily_pl` |
| World daily import | Import `d_world_txt.zip` via pgloader | `daily_world` |

see `admin-jobs-stooq-upload.md` for the full list of daily datasets.

The "Run Import" button is **enabled** when a file is selected and no import job is currently
running for that dataset. Status is polled every 5 seconds while a job is active. After a
successful import, the post-import hook in portfoliost-instruments fires automatically to
clean up overflow rows and update `stooq_import_log`.

Full design for this tab (upload flow, jobshot integration, volume strategy, cluster changes)
is in `admin-jobs-stooq-upload.md`.

---

## Stooq import cadence

Imports run **on demand only**, triggered manually from the Jobs tab in the admin panel.
There is no scheduled CronJob. The admin decides when to refresh stooq data.

---

## Persistent instrument data store

Beyond price history, portfoliost-instruments will permanently store all financial data
fetched from openst. Currently everything except ticker/exchange reference and logos is
fetched on demand and cached only in Redis (cachest) with TTL — nothing persists to Postgres.

### Data types, storage model and staleness

All data follows the same **read-through** pattern: read from DB first; if absent or stale,
fetch from openst, write to DB, return. A single `instrument_fetch_metadata` table tracks
the last successful fetch per symbol per data type and acts as a circuit breaker on failure.

| Data type | Table | Storage model | Re-fetch cadence |
|---|---|---|---|
| Profile | `instrument_profiles` | One row per symbol, upsert in place | Once a week |
| Fundamentals | `fundamentals` | One row per (symbol, period, fiscal_year, fiscal_quarter), upsert | Once a day |
| Financial statements | `financial_statements` | One row per (symbol, statement, period, fiscal_year, fiscal_quarter), append-only for past periods | Once a day |
| Dividends | `dividends` | One row per (symbol, ex_date), append-only — historical rows never overwritten | Once a day |
| Earnings calendar | `earnings_calendar` | One row per (symbol, report_date), upsert — estimates change until reported | Once a day |

"Once a day / once a week" means: if `last_fetched_at < today` (or `< 7 days ago` for
profile), re-fetch from openst. If the fetch fails, do not retry until the next day —
return the stale DB row with `{ stale: true }`. This is enforced via
`instrument_fetch_metadata.fetch_status = 'failed'` set on failure, cleared on next
successful fetch.

### Schema

```sql
-- One row per symbol, upserted in place
CREATE TABLE instruments.instrument_profiles (
  symbol       TEXT PRIMARY KEY,
  name         TEXT,
  sector       TEXT,
  industry     TEXT,
  country      TEXT,
  currency     CHAR(3),
  exchange     TEXT,
  description  TEXT,
  website      TEXT,
  employees    INTEGER,
  fetched_at   TIMESTAMPTZ NOT NULL
);

-- Fundamentals snapshot per period — upsert by PK
CREATE TABLE instruments.fundamentals (
  symbol         TEXT    NOT NULL,
  period         TEXT    NOT NULL,   -- 'annual' | 'quarter'
  fiscal_year    INTEGER NOT NULL,
  fiscal_quarter INTEGER,            -- NULL for annual
  pe_ratio       NUMERIC,
  eps            NUMERIC,
  revenue        NUMERIC,
  net_income     NUMERIC,
  gross_margin   NUMERIC,
  extra          JSONB,              -- provider-specific fields
  fetched_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, period, fiscal_year, COALESCE(fiscal_quarter, 0))
);

-- Full statement data as returned by openst — append-only for past periods
CREATE TABLE instruments.financial_statements (
  symbol         TEXT    NOT NULL,
  statement      TEXT    NOT NULL,   -- 'income' | 'balance' | 'cash'
  period         TEXT    NOT NULL,   -- 'annual' | 'quarter'
  fiscal_year    INTEGER NOT NULL,
  fiscal_quarter INTEGER,
  data           JSONB   NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, statement, period, fiscal_year, COALESCE(fiscal_quarter, 0))
);

-- Historical dividends — append-only, historical rows never overwritten
CREATE TABLE instruments.dividends (
  symbol     TEXT    NOT NULL,
  ex_date    DATE    NOT NULL,
  amount     NUMERIC NOT NULL,
  currency   CHAR(3),
  type       TEXT,                   -- 'regular' | 'special'
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, ex_date)
);

-- Earnings calendar — upsert by (symbol, report_date); estimates update until reported
CREATE TABLE instruments.earnings_calendar (
  symbol            TEXT    NOT NULL,
  report_date       DATE    NOT NULL,
  fiscal_year       INTEGER,
  fiscal_quarter    INTEGER,
  eps_estimate      NUMERIC,
  eps_actual        NUMERIC,         -- NULL until reported
  revenue_estimate  NUMERIC,
  revenue_actual    NUMERIC,         -- NULL until reported
  is_confirmed      BOOLEAN NOT NULL DEFAULT false,
  fetched_at        TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, report_date)
);

-- Staleness tracking and circuit breaker per symbol per data type
CREATE TABLE instruments.instrument_fetch_metadata (
  symbol          TEXT NOT NULL,
  data_type       TEXT NOT NULL,   -- 'profile'|'fundamentals'|'statements'|'dividends'|'calendar'
  last_fetched_at TIMESTAMPTZ,
  fetch_status    TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'failed'
  PRIMARY KEY (symbol, data_type)
);
```

### Read-through logic (all data types)

```
GET /api/instruments/:symbol/<data-type>

1. Check instrument_fetch_metadata for (symbol, data_type)
2. Determine if stale:
     profile   → last_fetched_at < now - 7 days
     all others → last_fetched_at < today (midnight boundary)
3. If not stale: read from DB, return
4. If stale and fetch_status = 'failed' today: read from DB, return { stale: true }
5. If stale and fetch_status ok: fetch from openst
     success → upsert/append to DB, update metadata (status='ok'), return fresh data
     failure → update metadata (status='failed'), return stale DB data with { stale: true }
```

Dividends: on fetch, insert rows where `ex_date` not already in DB — never touch existing rows.
Financial statements: same — only insert periods not already stored.
Calendar: upsert by `(symbol, report_date)` — estimates overwrite until `eps_actual` is set,
after which the row is treated as final and not overwritten.

- **Live/intraday quotes**: stooq is daily EOD only. `refreshQuotes` is unchanged.
- **FX rates**: `fx_rates` table in portfoliost-wallets remains the source for currency
  conversion. Stooq macro data is not used for FX at this stage.
- **Fundamentals, profiles, dividends**: openst/cachest remain the source.

---

## Open items (verify after full import)

1. Exact ticker format in `daily_pl` — is KRU stored as `KRU`, `KRU.WA`, or `KRU.PL`?
2. Exact ticker format in `daily_world` — is RHM stored as `RHM.DE`, `RHM.XETRA`, or something else?
3. Does `daily_world` cover German Xetra stocks, or is Germany in a separate dataset?
4. Date coverage and row counts in `daily_pl` and `daily_world`.
5. `postgres_fdw` user mapping: verify whether local connections between `portfoliost` and
   `stooq` databases use trust/peer auth (no password needed) or require the postgres
   superuser password. Affects the `databaseInitSQL` content in the homelab repo.
