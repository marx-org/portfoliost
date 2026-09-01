# plan.md — pending work

Long-running plan. Each step is implemented, verified (build + unit + mock + e2e), committed, and then marked here.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

# General rules

## Testing strategy, mocking, and migration

### Endpoint migration approach

- [ ] Pick endpoint to migrate (for example: `GET /api/users/preferences`).
- [ ] Implement in respective module, for example `portfoliost-backend`.
- [ ] Write backend unit tests.
- [ ] Add seed data if needed.
- [ ] Switch gateway route to respective module, for example `deploy/services.env`:
  `API_USERS_URL` → `http://portfoliost-backend:3000`.
- [ ] Add E2E test for the endpoint.
- [ ] Delete mock handler.
- [ ] Verify: build + unit + mock + e2e. Commit.

### Subsequent endpoints

- [X] `/api/auth/*` + `/api/users/*`
- [X] `/api/portfolios/*`
- [X] `/api/wallets/*`
- [ ] `/api/watchlists/*`
- [X] `/api/instruments/*`
- [ ] `/api/charting/*`

### Final mock removal steps
- [ ] Delete `mocks/` directory.
- [ ] Remove `example-service-mock` service from `docker-compose.yml`.
- [ ] Remove `Dockerfile.mock`.
- [ ] Remove `npm run test:mock` script.
- [ ] Remove `scripts/regen-seed.mjs` and `discovery/raw/`.
- [ ] Update `AGENTS.md` to reflect new architecture.

---

# Plan

## 1. Portfolio analytics — price data warehouse + value snapshots (§15 Phase H)

Proposal: [price-data-architecture.md](proposals/price-data-architecture.md).

Architecture summary:
- `portfoliost-instruments` gains foreign tables (`stooq_daily_us/pl/world`) via `postgres_fdw` pointing at the existing `stooq` DB on the same Postgres instance.
- `instruments.price_bars` stores overflow prices (recent tail + symbols not in stooq).
- `instruments.price_bars_all` VIEW unifies stooq foreign tables + overflow in one SQL call.
- `instruments.price_bar_metadata` tracks circuit-breaker state per symbol.
- Split detection tables (`split_candidates`, `split_adjustments`) handle stooq/overflow boundary discontinuities.
- `value_snapshots` in `portfoliost-wallets` (migration already done — 0 rows) feeds the analytics endpoint.

Phase H execution order:

```
H2   price_bars schema + foreign tables + view (portfoliost-instruments)
H3   price history read endpoint with stooq + openst layering
H4   passive write-through from existing quote/history fetches
H5   snapshot-on-read in refreshQuotes (portfoliost-wallets)   ← chart shows today's dot
H6   backfill job: historical value_snapshots
H7   wire GET /:id/analytics                                   ← chart shows full history
H8   frontend polling + loading banner
H9   tests
H10  stooq post-import hook + admin Market Data tab
```

### 1.1 (H2) — price_bars schema, foreign tables, and unified view

In `portfoliost-instruments`, add to `instruments` schema via Drizzle migration:

**`instruments.price_bars`** — overflow table (recent tail + symbols not in stooq):
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
  PRIMARY KEY (symbol, date)
);
```

**`instruments.price_bar_metadata`** — circuit breaker per symbol:
```sql
CREATE TABLE instruments.price_bar_metadata (
  symbol          TEXT PRIMARY KEY,
  last_fetched_at TIMESTAMPTZ,
  fetch_status    TEXT NOT NULL DEFAULT 'ok'  -- 'ok' | 'failed'
);
```

**`instruments.split_candidates`** and **`instruments.split_adjustments`** — split detection workflow:
```sql
CREATE TABLE instruments.split_candidates (
  symbol               TEXT         NOT NULL,
  detected_at          DATE         NOT NULL,
  last_stooq_date      DATE,
  last_stooq_close     NUMERIC(20,8),
  first_overflow_date  DATE,
  first_overflow_close NUMERIC(20,8),
  ratio                NUMERIC(10,6),
  suggested_factor     NUMERIC(10,6),
  suggested_ratio      TEXT,
  status               TEXT         NOT NULL DEFAULT 'pending',
  reviewed_at          TIMESTAMPTZ,
  reviewed_by          TEXT,
  PRIMARY KEY (symbol, detected_at)
);

CREATE TABLE instruments.split_adjustments (
  symbol       TEXT         NOT NULL,
  detected_at  DATE         NOT NULL,
  factor       NUMERIC(10,6) NOT NULL,
  split_ratio  TEXT,
  PRIMARY KEY (symbol, detected_at)
);
```

**postgres_fdw setup** — homelab `databaseInitSQL` ConfigMap (`pfire-init-sql`) added to `postgrescluster-pfire.yaml`:
- Install `postgres_fdw` extension in `portfoliost` DB.
- Create `stooq_server` pointing at `stooq` DB on `localhost`.
- Create user mapping for `portfoliost` role.
- Create foreign tables `instruments.stooq_daily_us`, `instruments.stooq_daily_pl`, `instruments.stooq_daily_world`.
- All `IF NOT EXISTS` — idempotent on pod restart.

**`instruments.price_bars_all`** VIEW — unifies all sources:
- `stooq_daily_us`: `replace(ticker, '.US', '')` as symbol, split adjustment applied via LEFT JOIN on `split_adjustments`.
- `stooq_daily_pl`, `stooq_daily_world`: ticker mapping TBC after import (exact format verified from data).
- `price_bars` overflow: direct.

Unit test: schema compiles, upsert into `price_bars` is idempotent, VIEW returns rows from both sources.

### 1.2 (H3) — price history read endpoint

`GET /api/instruments/:symbol/price-bars?from=YYYY-MM-DD&to=YYYY-MM-DD`

Logic:
1. Query `price_bars_all` for requested range (one SQL call — covers stooq + overflow).
2. Find `MAX(date)` for symbol in result. If `today - MAX(date) > 3 days`: gap exists.
3. Check `price_bar_metadata.fetch_status` — if `'failed'` and `last_fetched_at > 1h ago`: return what we have with `{ stale: true }`.
4. Fetch missing days from cachest → openst via existing `fetchOhlcv(symbol, start, end)`.
5. Upsert fetched rows into `price_bars`. Update `price_bar_metadata`.
6. If this is the **first overflow write for this symbol** (`SELECT MIN(date) FROM price_bars WHERE symbol = ?` = today): run split boundary check (compare last stooq close vs first overflow close, insert into `split_candidates` if ratio matches a known split factor ±3% or is outside 0.85–1.15).
7. Return complete series. Include `{ stale: boolean }`.

Ticker routing (via `exchange_reference` + `ticker_reference` — no hardcoded mapping):
- US symbol (NASDAQ/NYSE) → stooq `daily_us`, ticker format `AAPL.US`
- Polish symbol (WSE) → stooq `daily_pl`, format TBC
- German/other → stooq `daily_world`, format TBC

### 1.3 (H4) — passive write-through from existing quote/history fetches

In `portfoliost-instruments`, when a `/quote` or `/history` response is served from openst, also upsert the returned daily bars to `price_bars` as a background write. Cheap: data already fetched. Accumulates price_bars organically for well-queried symbols.

### 1.4 (H5) — snapshot-on-read in refreshQuotes

In `portfoliost-wallets`, inside `refreshQuotes()` (called on every `GET /positions`), after persisting quote fields, compute and upsert today's value snapshot:

```
portfolioValue = Σ pos.marketValue × fx(pos.instrumentCurrency → portfolio.baseCurrency)
invested       = Σ pos.totalCostBasis × fx(pos.instrumentCurrency → portfolio.baseCurrency)
```

`INSERT INTO value_snapshots ... ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE`

Uses existing `latestRates()`. No scheduler needed. Makes chart show today's single data point.

### 1.5 (H6) — backfill job: historical value_snapshots

Triggered asynchronously from `GET /:id/analytics` when `value_snapshots` has < 2 rows for a portfolio.

1. Query `MIN(executed_at)` from `portfolioTransactions` → `firstTxDate`.
2. For each calendar day from `firstTxDate` to yesterday, compute `qty_held(symbol, date)` from cumulative BUY/SELL.
3. Call portfoliost-instruments `GET /price-bars?from=firstTxDate&to=yesterday` per symbol (H3 serves from `price_bars_all`, filling from stooq + openst if needed).
4. For each day: `value = Σ qty_held × price(day) × fx(instrCcy → baseCurrency)`. Price carry-forward on weekends/holidays (last known close). FX via `latestRates()`.
5. Bulk upsert into `value_snapshots`. Idempotent.
6. Track status in a `portfolio_backfill_metadata` table (or inline in analytics response flag).

Job triggered async from analytics endpoint; returns `{ backfillStatus: "pending" }` immediately while job runs.

### 1.6 (H7) — wire GET /:id/analytics

Replace permanent stub in `portfoliost-wallets routes/portfolios.ts`:

1. Check `value_snapshots` row count for portfolio.
2. If < 2 rows: trigger backfill job async, return `{ backfillStatus: "pending", performance: { timeSeries: [] }, benchmarks: [] }`.
3. Otherwise: read `value_snapshots` ordered by `snapshot_date ASC`, filter by timeframe (`6M`/`1Y`/`2Y`/`ALL`).
4. Return:
   ```json
   {
     "timeframe": "6M",
     "backfillStatus": "complete",
     "performance": {
       "timeSeries":         [{ "date": "YYYY-MM-DD", "value": 12345.67 }],
       "totalValue":         12345.67,
       "totalInvested":      11000.00,
       "totalReturn":        1345.67,
       "totalReturnPercent": 12.23,
       "monthlyReturns":     [{ "month": "YYYY-MM", "returnPercent": 3.2 }]
     },
     "benchmarks": []
   }
   ```
   `monthlyReturns`: group by `YYYY-MM`, `(last_value / first_value - 1) × 100` per month.
5. Feeds `PortfolioCard` sparkline + `PortfolioPerformanceTab` equity/monthly bar charts.

### 1.7 (H8) — frontend: polling + loading banner

In `PortfolioCard.vue` and `PortfolioPerformanceTab.vue`:
- If `analytics.backfillStatus === "pending"`: show subtle banner "Historical data is loading, chart will update in a moment".
- Poll `GET /:id/analytics` every 5s while `backfillStatus !== "complete"`.
- Stop polling on `"complete"` or after 5 minutes (failure guard).
- Render whatever `timeSeries` points exist immediately — even 1 point beats "Loading chart...".

### 1.8 (H9) — tests

`portfoliost-instruments`:
- `price-bars.test.ts`: stooq ticker mapping, gap detection, upsert idempotence, circuit breaker (no retry within 1h on failure), weekend carry-forward, split boundary detection (clean ratio → `split_candidates`, ambiguous → `split_candidates` with `suggested_factor=NULL`, within 0.85–1.15 → no action).
- `price-bars-stooq.test.ts`: mock PostgREST / foreign table response → correct rows in `price_bars`.

`portfoliost-wallets`:
- `snapshots.test.ts`: today snapshot with 2 USD positions; multi-currency (PLN, EUR); backfill with 3 positions over 10 days; timeframe filter; empty portfolio → `timeSeries: []`.

### 1.9 (H10) — post-import hook + admin Market Data tab

**Post-import hook** `POST /api/instruments/internal/stooq-imported`:
- Query `MAX(date)` from each foreign table (`stooq_daily_us`, `stooq_daily_pl`, `stooq_daily_world`).
- For each table, delete `price_bars` overflow rows up to `MAX(date)` for covered symbols.
- Delete now-redundant `split_adjustments` rows for those symbols up to `MAX(date)`.
- Auto-dismiss pending `split_candidates` for those symbols.
- Write to `admin.job_run` (import log — supersedes the originally planned `stooq_import_log`; see architecture doc note).
- Refresh in-memory stooq floor date cache.

**Admin Market Data tab** (`/en/admin/market-data`):

*Stooq datasets panel* — one row per dataset (daily_us, daily_pl, daily_world): Dataset / Latest date / Imported at / Overflow rows cleaned. Data from `admin.job_run`.

*Split candidates panel* — all `split_candidates` rows with `status='pending'`, ordered by `detected_at DESC`: Symbol / Detected / Last stooq close / First overflow close / Ratio / Suggested / Actions (Apply / Dismiss / Apply custom). Reviewed candidates in collapsed history section.

*Overflow summary* — total `price_bars` rows + breakdown by symbol (top 10 by count).

---

## 2. Portfolio analytics — performance, risk, derived content, cluster (§15 Phases I–L)

### 2.1 (I1) Shared series/returns service
- [ ] TWR, XIRR/MWR, annualization + withhold rules.

### 2.2 (I2) Enhanced analytics endpoint
- [ ] `GET /:id/analytics` with TWR/MWR/sharpe/benchmark overlay (on top of H7 basic chart).
- [ ] Benchmark normalization via instruments `/history`.

### 2.3 (I3) Stubs promotion
- [ ] `/merged`, `externalCapital*` wallet-deposit basis.

### 2.4 (I4) Tests
- [ ] Fixture + property tests; stack-test.

### 2.5 (J1) Risk metrics endpoint
- [ ] `GET /:id/risk-metrics`: volatility / maxDrawdown / sharpe / sortino / calmar / win-rate.

### 2.6 (J2) Risk tests
- [ ] Withholding-rule and empty-history tests.

### 2.7 (K1) Dividends composition
- [ ] Dividends composition within holding windows.

### 2.8 (K2) Calendar composition
- [ ] Calendar composition.

### 2.9 (K3) Compare enrichment
- [ ] Compare enrichment from instruments metrics.

### 2.10 (K4) Summary-metrics income source switch

### 2.11 (L1) Cluster cutover
- [ ] Homelab ingress paths → `portfoliost-wallets:3000`.
- [ ] Separated snapshot Kubernetes Jobs (D11 job-pod pattern, not in-process scheduler).

### 2.12 (L2) Live verification
- [ ] `/__meta`, CRUD + analytics through host; e2e green.

### 2.13 (L3) Closeout
- [ ] plan/proposal status marks; retire `mocks/portfolios/index.js`; docs sweep.
