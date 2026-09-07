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

## 0. Database preparation

- [x] enable `postgres_fdw` extension
- [x] make sure all stooq tables are available in the `stooq` DB on the same Postgres instance
- [x] mapp all stooq tables as foreign tables in `portfoliost-instruments` DB

## 1. Portfolio analytics — price data warehouse + value snapshots

Proposal: [price-data-architecture.md](proposals/price-data-architecture.md).

Architecture summary:

- `portfoliost-instruments` gains multiple foreign tables (`stooq_daily_us/pl/world`) via
  `postgres_fdw` pointing at the existing `stooq` DB on the same Postgres instance.
- `instruments.price_bars` stores overflow prices (recent tail + symbols not in stooq).
- `instruments.price_bars_all` VIEW unifies stooq foreign tables + overflow in one SQL call.
- `instruments.price_bar_metadata` tracks circuit-breaker state per symbol.
- Split detection tables (`split_candidates`, `split_adjustments`) handle stooq/overflow boundary discontinuities.
- `value_snapshots` in `portfoliost-wallets` (migration already done — 0 rows) feeds the analytics endpoint.

### 1.1 — price_bars schema, foreign tables, and unified view — [x] DONE

In `portfoliost-instruments`, add to `instruments` schema via Drizzle migration:

- [x] Migration 0003: `price_bars`, `price_bar_metadata`, `split_candidates`, `split_adjustments`.
- [x] Guarded `price_bars_all` view over all eight stooq daily datasets + overflow.
- [x] homelab `pfire-init-sql` ConfigMap wired into `postgrescluster-pfire.yaml` (8 FDW foreign tables).
- [x] docker-compose `pricebars-sim` one-shot (post_fdw stand-in, self-verifies the view).
- [x] Unit tests (`src/db/price-bars.test.ts`) + build + 91 tests green.
- [x] Released to prod: `portfoliost-instruments` v1.0.17 (CI → ghcr + tag/release), helmrelease v1.0.16→v1.0.17, Flux reconciled, rollout complete.
- [x] Prod verified: migration 0003 applied, view created over foreign tables, FDW pushdown query returns rows (AAPL 10,577).

In the `instruments` schema:

**`instruments.price_bars`** — overflow table (recent tail + symbols not in stooq):
```sql
CREATE TABLE instruments.price_bars (
  symbol   TEXT         NOT NULL,   -- system format: AAPL, KRU.WA, RHM.DE
  date     DATE         NOT NULL,
  close    NUMERIC(28,8) NOT NULL,
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
  last_stooq_close     NUMERIC(28,8),
  first_overflow_date  DATE,
  first_overflow_close NUMERIC(28,8),
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

**postgres_fdw setup** — homelab `databaseInitSQL` ConfigMap (`pfire-init-sql`) wired into `postgrescluster-pfire.yaml`:
- Install `postgres_fdw` extension in `portfoliost` DB.
- Create `stooq_server` pointing at `stooq` DB on `localhost`.
- Create user mapping for `portfoliost` role.
- Create foreign tables for **all eight stooq daily datasets**: `daily_us`, `daily_pl`, `daily_jp`, `daily_world`, `daily_uk`, `daily_hk`, `daily_hu`, `daily_macro` (as `instruments.stooq_daily_*`).
- All `IF NOT EXISTS` — idempotent on cluster bootstrap / pod restart.

**`instruments.price_bars_all`** VIEW — unifies all sources (created *guarded* in migration 0003, so no plain local stooq tables are created in prod to collide with the FDW foreign tables):
- `stooq_daily_us`: `replace(ticker, '.US', '')` as symbol, split adjustment applied via LEFT JOIN on `split_adjustments`.
- `stooq_daily_pl`, `stooq_daily_uk`, `stooq_daily_jp`, `stooq_daily_hk`, `stooq_daily_hu`, `stooq_daily_world`, `stooq_daily_macro`: ticker passthrough (exact mapping TBC after import).
- `price_bars` overflow: direct.

**docker-compose simulation** — postgres_fdw is unavailable locally, so the `pricebars-sim` one-shot service (idempotent, post-migration) creates plain stand-in `stooq_daily_*` tables + the same view, seeds a few rows, and self-verifies the view unifies US (split-adjusted), world (passthrough) and overflow rows. PGlite unit tests use the same stand-in DDL (`src/db/price-bars.ts`).

Unit test (`src/db/price-bars.test.ts`): schema compiles, upsert into `price_bars` is idempotent, VIEW returns rows from both stooq + overflow sources, split-adjusted close applied.

**Performance note** — the single-view read approach is kept (no per-ticker table routing yet); a candidate optimization (ticker-routed single-table reads) is documented at the end of `docs/proposals/price-data-architecture.md` to re-evaluate if the real imported data is too slow.

### 1.2 — price history read endpoint — [x] DONE

`GET /api/instruments/:symbol/price-bars?from=YYYY-MM-DD&to=YYYY-MM-DD`

- [x] Wire route `GET /api/instruments/:symbol/price-bars`.
- [x] Query `price_bars_all` for range; detect gap (`MAX(date)` vs today > 3 days).
- [x] Circuit breaker via `price_bar_metadata` (failed + >1h → serve stale with `{ stale: true }`).
- [x] Fetch missing days from cachest → openst via `fetchOhlcv`, upsert into `price_bars`, update `price_bar_metadata`.
- [x] Split boundary check on first overflow write.
- [x] Return complete series incl. `stale` flag.
- [x] Contract-typed response against `@marx2/contracts` (`PriceBarSeries` schema, `@marx2/contracts@1.6.3`).
- [x] Unit tests: `src/services/price-bars.test.ts` — 8 tests (queryView, hasGap, recentlyFailed, fresh series, gap fill + upsert, circuit breaker, split detection, no-action on continuous boundary). 99 instruments tests green.
- [x] docker-compose verification: endpoint verified live (AAPL split-adjusted series returned, stale=true on cachest miss). e2e spec `tests/e2e/price-bars.spec.ts` (3 tests: valid series, 401 no auth, 400 bad params). Full playwright suite 27 passed, 1 skipped.

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

### 1.3 — passive write-through from existing quote/history fetches — [x] DONE

- [x] `backgroundUpsertBars(db, symbol, rows)` added to `src/services/price-bars.ts` — fire-and-forget, errors swallowed, invalid rows filtered.
- [x] Hooked into `/:symbol/history` after `fetchOhlcv` returns rows (11-year daily window).
- [x] Hooked into `/:symbol/price?date=` after `fetchOhlcv` returns rows.
- [x] 3 unit tests: persists bars, idempotent update, silently skips invalid rows. 102 instruments tests green.

### 1.4 — snapshot-on-read in refreshQuotes — [x] DONE

- [x] `snapshotPortfolioValue(db, portfolioId, liveValues, now)` added to `src/services/quotes.ts` — computes `Σ marketValue × fx` and `Σ (avg × qty) × fx`; upserts into `value_snapshots` ON CONFLICT DO UPDATE.
- [x] Called fire-and-forget (`void ... .catch(() => undefined)`) at the end of `refreshQuotes`, using live `marketValue` collected during the per-position loop (not stale DB rows).
- [x] Falls back to `rate=1` when FX table unavailable or pair missing.
- [x] 3 unit tests: correct sums, idempotent upsert, full `refreshQuotes` integration (snapshot row written after quote persist). 144 wallets tests green.

### 1.5 — backfill job: historical value_snapshots — [x] DONE

- [x] `portfolio_backfill_metadata` table added to schema + migration `0002_square_sunspot.sql`.
- [x] `src/services/backfill.ts`: `runBackfill()` — queries MIN(executed_at), builds daily qty_held from BUY/SELL, fetches price series per symbol via instruments `GET /price-bars`, carry-forward on gaps, bulk-upserts `value_snapshots` in chunks of 100; `getBackfillStatus()`; `toDateStr()` normalises PGlite Date/string timestamps.
- [x] `GET /:id/analytics` replaced stub: < 2 snapshot rows → trigger backfill void + return `{backfillStatus:"pending"}`; otherwise read snapshots filtered by timeframe (6M/1Y/2Y/ALL), compute totalValue/totalReturn/monthlyReturns, return full series.
- [x] 10 unit tests: calendarDays, buildPriceMap carry-forward, single-symbol upsert, weekend carry, idempotency, status transitions. 154 wallets tests green.

### 1.6 — wire GET /:id/analytics — [x] DONE

- [x] Analytics stub replaced in `portfoliost-wallets/src/routes/portfolios.ts`: backfill trigger + snapshot read + timeframe filter (6M/1Y/2Y/ALL) + monthlyReturns + backfillStatus. (Implemented as part of step 1.5.)

### 1.7 — frontend: polling + loading banner — [x] DONE

- [x] `@marx2/contracts@1.6.4`: `backfillStatus` + `timeframe` added to `PortfolioAnalytics`; SPA types regenerated.
- [x] `PortfolioCard.vue`: `backfillPending` ref + `startPolling()`/`stopPolling()` — polls every 5s, stops on `complete` or after 5 min; banner shown while pending; `onUnmounted` cleanup.
- [x] `PortfolioPerformanceTab.vue`: same polling via `getPortfolioAnalytics` → `store.analytics`; banner below Performance Chart.
- [x] Both render existing `timeSeries` immediately; build green; 164 mock tests pass.

### 1.8 — tests — [x] DONE

`portfoliost-instruments`:
- [x] `src/services/price-bars.test.ts` extended: `stooqTickerFor` (bare, suffix, lowercase), `ohlcvToClose` (valid, index fallback, bad date, NaN close), `matchSplitFactor` (2:1, 4:1, reverse, ambiguous, continuous), `checkSplitBoundary` ambiguous ratio → `suggested_factor=NULL`, continuous → no candidate, carry-forward view gap behaviour. 123 tests total green.
- [x] `src/services/price-bars-stooq.test.ts` (new): VIEW routing — US `.US` suffix stripped, PL/world passthrough, split_adjustments factor applied, overflow unified, split NOT applied to overflow rows. 10 test files, 123 tests green.

`portfoliost-wallets`:
- [x] `src/services/snapshots.test.ts` (new): today snapshot 2 USD positions, multi-currency PLN/EUR via EUR-base fxRates, empty portfolio → value=0, backfill 3 positions × 10 days correct daily values, empty transactions → 0 snapshots, 6M timeframe filter. 17 test files, 160 tests green.

### 1.9 — post-import hook + admin Market Data tab — [x] DONE

**Post-import hook** `POST /internal/stooq-imported` on instruments:
- [x] `src/services/stooq-import-hook.ts`: `runPostImportHook()` — MAX(date) from stooq table, deletes superseded `price_bars` overflow rows, deletes `split_adjustments`, auto-dismisses `split_candidates`, writes `latestDate`/`rowsDeleted` to `admin.job_run`.
- [x] Route registered in `src/index.ts`; called fire-and-forget from admin job poller on `Succeeded` transition.
- [x] 6 unit tests: dataset/table mapping, US rows deleted + kept, split_candidates dismissed, empty table returns null, PL passthrough. 129 instruments tests green.

**Admin market-data endpoints** (new `src/market-data.ts` in portfoliost-admin):
- [x] `GET /api/admin/market-data/split-candidates` — pending first, history collapsed.
- [x] `POST /api/admin/market-data/split-candidates/:symbol/apply` — inserts `split_adjustments`, marks applied.
- [x] `POST /api/admin/market-data/split-candidates/:symbol/dismiss` — marks dismissed.
- [x] `GET /api/admin/market-data/overflow-summary` — total + top-10 symbols.
- [x] Wired via `registerMarketDataRoutes(admin)` + `setMarketDataDb(db)` in server.ts.

**SPA: Admin Market Data tab**:
- [x] `@marx2/contracts@1.6.5`: `SplitCandidate`, `OverflowSummary` schemas + 4 market-data paths + stooq-imported hook path.
- [x] `src/api/admin.ts`: `fetchSplitCandidates`, `applySplitCandidate`, `dismissSplitCandidate`, `fetchOverflowSummary`, `fetchStooqImportLog`.
- [x] `src/modules/admin/MarketDataView.vue`: Stooq datasets panel, split candidates panel (Apply/Dismiss actions + custom factor input + history section), overflow summary table.
- [x] Route `admin-market-data` + nav link "Market Data" in AdminLayout. Build green; 164 mock tests pass.

---

## 2. Portfolio analytics — performance, risk, derived content, cluster

Proposal: [benchmarks.md](proposals/benchmarks.md) (D46–D50).

### 2.1 — Shared series/returns service — [x] DONE

- [x] `returnColumns.ts` (`buildTwr`, `buildMwr`, `buildSimple`, `buildMonthlyReturns`) — flow-aware TWR chain-link, XIRR/MWR, simple indexed return.
- [x] `cashFlows.ts` (`dailyNetCashFlows`) — BUY/SELL daily net flow with FX conversion; DIVIDEND excluded.
- [x] Annualized daily log-return volatility (√252 × stddev) computed per benchmark series in `buildBenchmarkSeries`.
- [x] `recomputeReturnColumns` called after every snapshot write / recalc.

### 2.2 — Enhanced analytics endpoint — [x] DONE

- [x] `GET /:id/analytics` serves contract-typed `cumulativeTwr` / `cumulativeMwr` / `cumulativeSimple` per snapshot point + `benchmarks[]` (D47/D48).
- [x] Benchmark lines: **transaction-mirroring** (D50) — portfolio cash flows replayed into the benchmark instrument; `buildBenchmarkSeries` in `services/backfill.ts`.
- [x] `benchmarkCalcType` query param threaded through; unknown tickers dropped (never 4xx).
- [x] `timeframeCutoff` exported; handles `1W` (days), `1M`/`3M`/`6M`/`1Y`/`2Y` (calendar), `ALL`.
- [x] Contract updated (`@marx2/contracts` v1.6.7–1.6.9): `returnPercent`/`volatility` on benchmark items, `cumulativeMwr`/`cumulativeTwr` on perf points, `1W` added to timeframe enum.
- [x] Unit tests in `src/routes/analytics.test.ts` (10 tests).

### 2.3 — SPA: Customize dialog + return-type selector — [x] DONE

- [x] `PortfolioPerformanceTab.vue`: **Customize** (Chart controls) dialog — standard benchmark picker (SPY/QQQ/DIA/IWM/VTI/EFA/AGG) + **Add Custom Benchmark** via instrument search component; **Return Type** selector (MWR/TWR/Simple); `setReturnType` refetches on change; backfill-poll refetch keeps `benchmarks` param.
- [x] Phantom "Benchmark" legend line removed.
- [x] `PortfolioAnalyticsTimeframe` union extended to `"1W"|"1M"|"3M"|"6M"|"1Y"|"2Y"|"ALL"` (7 buttons in `PortfolioPerformanceTab.vue` + `PortfolioCard.vue`).
- [x] Y-axis labelled `"Index (start = 100)"` with `v.toFixed(2)` formatter; tooltip updated.
- [x] Monthly Returns bar chart: flow-adjusted month-over-month TWR, `%`-formatted axes.
- [x] Chart heights pinned (equity 300 / Returns 220).
- [x] Mock: `ANALYTICS_BY_TIMEFRAME` + `EMPTY_BY_TIMEFRAME` extended for 1W/1M/3M; mock-test loop covers all 7 timeframes (169 tests).

### 2.4 — Background history recalc queue — [x] DONE

- [x] `services/recalc-queue.ts`: per-portfolio debounce+coalescing queue (`RECALC_GRACE_MS` 3000 ms), AbortController kill+restart, livelock valve (MAX_RESTARTS=10 → fallback timer), `__resetRecalcQueueForTests`.
- [x] `recalcPortfolioHistory` + `computeSnapshotBatch` in `services/backfill.ts`: abort-aware, atomic DELETE+INSERT (replace semantics — clears on no BUY/SELL).
- [x] `notifyTransactionsChanged` wired into POST/PATCH/DELETE `/:id/transactions` + POST/DELETE `/:id/positions`.
- [x] Tests: `services/recalc-queue.test.ts` (coalescing, kill+restart, per-portfolio independence), `services/backfill.test.ts` (replace/clear/abort-never-writes). Full suite 178 pass.

### 2.5 — Tests — [x] DONE

- [x] `analytics.test.ts` (10 tests: timeframe cutoffs 1W/1M/3M/6M/1Y/2Y/ALL, benchmark series, no-ticker returns `[]`, drop unknown ticker).
- [x] `recalc-queue.test.ts` + `backfill.test.ts` (see 2.4 above).
- [x] SPA 125 unit + 169 mock tests green; wallets 178 tests green.

### 2.6 — Risk metrics endpoint — [x] DONE

- [x] `GET /:id/risk-metrics`: maxDrawdown / sharpe / sortino / calmar / win-rate (volatility already computed in benchmark series — reuse).
- [x] `src/services/riskMetrics.ts`: pure functions — `maxDrawdown`, `annualizedVolatility`, `sharpeRatio`, `sortinoRatio` (fallback to Sharpe on all-positive days), `calmarRatio`, `winRate`, `annualizedReturn`, `periodReturnPercent`, `annualizedReturnWithheldReason`, `computeRiskMetrics`.
- [x] Route in `portfoliost-wallets/src/routes/portfolios.ts`: ownership check, timeframe-filtered snapshot query, contract-typed response (`PortfolioRiskMetrics`).
- [x] `src/services/riskMetrics.test.ts` (40 tests) + `src/routes/risk-metrics.test.ts` (9 tests). 227 wallets tests green; build green.

### 2.7 — Risk tests
- [ ] Withholding-rule and empty-history tests.

### 2.8 — Dividends composition
- [ ] Dividends composition within holding windows.

### 2.9 — Calendar composition
- [ ] Calendar composition.

### 2.10 — Compare enrichment
- [ ] Compare enrichment from instruments metrics.

### 2.11 — Summary-metrics / income source switch
- [ ] Wire "Based on" sub-option (External Capital vs Cost Basis) for non-TWR modes (deferred per D49).
- [ ] Positions selector narrowing — pass position subset to backend analytic series (deferred per D49).

### 2.12 — Cluster cutover
- [ ] Homelab ingress paths → `portfoliost-wallets:3000`.
- [ ] Separated snapshot Kubernetes Jobs (D11 job-pod pattern, not in-process scheduler).

### 2.13 — Live verification
- [ ] `/__meta`, CRUD + analytics through host; e2e green.

### 2.14 — Closeout
- [ ] plan/proposal status marks; retire `mocks/portfolios/index.js`; docs sweep.

---

# 3. Labels (proposal `docs/proposals/labels.md`, D65–D72)

- [x] **3.1 Contract** — `Label`/`LabelInput`/`SetLabelsRequest` schemas + `labels` arrays on `Position`/`Transaction`/`CashTransaction`/`RecentCashTransaction` + 7 endpoints (GET/POST `/labels`, PATCH/DELETE `/labels/{id}`, POST set-labels for position/portfolio-tx/wallet-tx) + `labels` query param on 4 listing endpoints in `openapi.yaml`. Published `@marx2/contracts@1.6.10` (commit `cedfbd8`). Installed in wallets + regenerated `api-types.d.ts`.
- [x] **3.2 Backend: migration** — `labels`, `position_labels`, `transaction_labels`, `wallet_transaction_labels` tables + indexes in `src/db/schema.ts`; `drizzle/0004_silky_gorgon.sql`; fixed stale snapshot chain (commit `48c8017`).
- [x] **3.3 Backend: labels CRUD** — `src/routes/labels.ts` GET/POST/PATCH/DELETE `/labels` with zod validation, 409 on duplicate name, 404 on foreign label (D24 scoping), `nextPaletteColor()` auto-assign (D66).
- [x] **3.4 Backend: set-labels + serialization** — `src/routes/position-labels.ts`, `transaction-labels.ts`, `wallet-transaction-labels.ts` (replace semantics, D67/D68); shared `src/services/labels.ts`; serialize `labels` in `positionWire`/`serializeTx` (portfolio-transactions), `history.ts` wallet-tx/recent-transactions serializers, `transactions.ts` `serializeTx` (`labels: []`).
- [x] **3.5 Backend: filtering** — `?labels=` comma-separated AND filter (entity must have all labels) wired into portfolio-transactions (positions + tx + cross-portfolio), history.ts (wallet-tx + recent-transactions) via shared `attachLabelCondition`/`entityIdsWithAllLabels`.
- [x] **3.6 Backend: tests** — `src/routes/labels.test.ts` (19 tests): CRUD + palette wrapping, unique-name 409 (fixed PGlite `err.cause` detection), D24 scoping 404s, replace semantics on all three entity types, alphabetical sorting, AND filtering. 246 wallets tests green.
- [x] **3.7 SPA: contract types** — install bumped `@marx2/contracts`, run `gen:types`.
- [x] **3.8 SPA: labelColors utility** — shared palette mapping (hex to Tailwind class pairs).
- [x] **3.9 SPA: LabelBadge component** — shared badge component with `+N` overflow.
- [x] **3.10 SPA: LabelManager dialog** — CRUD UI for labels.
- [x] **3.11 SPA: set-label popover** — per-row label assignment in holdings + transactions + cash-transactions tables.
- [x] **3.12 SPA: label filter** — multi-select chip filter in `PortfolioHoldingsTab` + `TransactionsTable` + `CashTransactionsView`.
- [x] **3.13 SPA: tests** — vitest unit tests for components + Playwright e2e for full flow.
- [x] **3.14 Integration test** — docker-compose end-to-end: create label → assign to position/transaction/cash-transaction → verify filter.

---

# 4. Portfolio-card sparkline: period buttons "don't work" (investigation)

## Symptom

The small performance chart on the main page (`src/modules/portfolios/PortfolioCard.vue`) never renders — it stays on "Loading chart... / Historical data is loading" regardless of the period button clicked (`1W/1M/3M/6M/1Y/2Y/ALL`). The full chart in `PortfolioPerformanceTab.vue` is affected the same way (shows "No analytics available") — it only appears to "work" because its buttons/state react; the chart itself is empty too.

## What the buttons actually do (verified live)

- The card's `@click.stop` on the button row (line 257) does prevent the click from bubbling to the card's `goToDetail` — no navigation happens.
- `changeTimeframe()` (line 92) sets the local `timeframe` ref and calls `loadChart()` → `getPortfolioAnalytics(id, timeframe)`.
- Network shows the correct per-period requests fire, e.g. `?timeframe=6M` then after clicking `1W` → `?timeframe=1W`. The active-button highlight (`bg-blue-50 text-blue-700`) also updates.
- So the frontend is fine; the chart is empty because the backend always returns:
  `{"timeframe":"1W","backfillStatus":"pending","performance":{"timeSeries":[]},...}`.

## Backend root cause

`/api/portfolios/:id/analytics` is served by **`portfoliost-wallets`** (gateway `API_PORTFOLIOS_URL=http://wallets:3000`), not the example-service-mock. In `src/routes/portfolios.ts` the endpoint returns "pending + empty" when `value_snapshots` has < 2 rows and triggers a fire-and-forget backfill (`src/services/backfill.ts` `runBackfill`).

The backfill **computes** a full daily series but the bulk INSERT **fails**. From `portfolios.portfolio_backfill_metadata.error_message`:

```
Failed query: insert into "portfolios"."value_snapshots"
("portfolio_id","snapshot_date","value","invested","net_flow",
 "cumulative_twr","cumulative_mwr","cumulative_simple") ...
```

The running DB's `value_snapshots` table has only 5 columns (`portfolio_id, snapshot_date, value, invested, net_flow`) — the 3 return-type columns from migration `0003_return_columns.sql` are missing:

```sql
ALTER TABLE "portfolios"."value_snapshots" ADD COLUMN "cumulative_twr" numeric(20, 8);
ALTER TABLE "portfolios"."value_snapshots" ADD COLUMN "cumulative_mwr" numeric(20, 8);
ALTER TABLE "portfolios"."value_snapshots" ADD COLUMN "cumulative_simple" numeric(20, 8);
```

## Why migration 0003 was skipped (drizzle ordering bug)

`drizzle/meta/_journal.json` entry `idx: 3` (`0003_return_columns`) has `when: 1757060000000` (≈ Sep 2025) while `0004_silky_gorgon` has `when: 1788717226995`. In `drizzle-orm/pg-core/dialect.cjs` the migrator applies a migration only when:

```js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { ... }
```

`lastDbMigration` is picked by `order by created_at desc limit 1` = 0004. Since `0003.folderMillis < 0004.created_at`, 0003 is **never applied** on any DB that already has 0004. A fresh DB applies everything in idx order so it would work there — only existing/already-migrated DBs hit this.

`drizzle_wallets.__drizzle_migrations` confirms: hashes for 0000 (`811e90e9`), 0001 (`308f9a83`), 0002 (`df934ed4`), 0004 (`19e7157b`) are present; 0003 (`e942fb64`) is absent.

## How to fix

- [ ] Fix `drizzle/meta/_journal.json`: set `0003_return_columns`.`when` to a value **greater** than `0004_silky_gorgon` (`1788717226995`) so the migrator picks it up (e.g. `1789000000000`).
- [ ] Re-apply migrations: `docker exec portfoliost-wallets npm run db:migrate` (wallets entrypoint runs this on every start, so `docker compose restart wallets` also works). Verify `\d portfolios.value_snapshots` then includes `cumulative_twr/mwr/simple`.
- [ ] Re-trigger backfill: backend fires it automatically on the next `/analytics` call because the stored status is `failed` (not `pending`) and still `n < 2`; a page reload suffices. Confirm `value_snapshots` is populated and `portfolio_backfill_metadata.status = complete`.
- [ ] Verify in browser: the sparkline renders on `/en/investments` and period buttons switch the series; `PortfolioPerformanceTab` chart populates too.
- Note: no mock seeding needed — the example-service-mock `portfolio_analytics_*.json` files are not used by this endpoint; data comes from transactions → backfill → `value_snapshots`.

