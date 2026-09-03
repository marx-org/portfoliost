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

## 1. Portfolio analytics — price data warehouse + value snapshots (§15 Phase H)

Proposal: [price-data-architecture.md](proposals/price-data-architecture.md).

Architecture summary:

- `portfoliost-instruments` gains multiple foreign tables (`stooq_daily_us/pl/world`) via
  `postgres_fdw` pointing at the existing `stooq` DB on the same Postgres instance.
- `instruments.price_bars` stores overflow prices (recent tail + symbols not in stooq).
- `instruments.price_bars_all` VIEW unifies stooq foreign tables + overflow in one SQL call.
- `instruments.price_bar_metadata` tracks circuit-breaker state per symbol.
- Split detection tables (`split_candidates`, `split_adjustments`) handle stooq/overflow boundary discontinuities.
- `value_snapshots` in `portfoliost-wallets` (migration already done — 0 rows) feeds the analytics endpoint.

Phase H execution order:

```
H2   price_bars schema + foreign tables + view (portfoliost-instruments) [x]
H3   price history read endpoint with stooq + openst layering
H4   passive write-through from existing quote/history fetches
H5   snapshot-on-read in refreshQuotes (portfoliost-wallets)   ← chart shows today's dot
H6   backfill job: historical value_snapshots
H7   wire GET /:id/analytics                                   ← chart shows full history
H8   frontend polling + loading banner
H9   tests
H10  stooq post-import hook + admin Market Data tab
```

### 1.1 (H2) — price_bars schema, foreign tables, and unified view — [x] DONE

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

### 1.2 (H3) — price history read endpoint — [x] DONE

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

### 1.3 (H4) — passive write-through from existing quote/history fetches — [x] DONE

- [x] `backgroundUpsertBars(db, symbol, rows)` added to `src/services/price-bars.ts` — fire-and-forget, errors swallowed, invalid rows filtered.
- [x] Hooked into `/:symbol/history` after `fetchOhlcv` returns rows (11-year daily window).
- [x] Hooked into `/:symbol/price?date=` after `fetchOhlcv` returns rows.
- [x] 3 unit tests: persists bars, idempotent update, silently skips invalid rows. 102 instruments tests green.

### 1.4 (H5) — snapshot-on-read in refreshQuotes — [x] DONE

- [x] `snapshotPortfolioValue(db, portfolioId, liveValues, now)` added to `src/services/quotes.ts` — computes `Σ marketValue × fx` and `Σ (avg × qty) × fx`; upserts into `value_snapshots` ON CONFLICT DO UPDATE.
- [x] Called fire-and-forget (`void ... .catch(() => undefined)`) at the end of `refreshQuotes`, using live `marketValue` collected during the per-position loop (not stale DB rows).
- [x] Falls back to `rate=1` when FX table unavailable or pair missing.
- [x] 3 unit tests: correct sums, idempotent upsert, full `refreshQuotes` integration (snapshot row written after quote persist). 144 wallets tests green.

### 1.5 (H6) — backfill job: historical value_snapshots — [x] DONE

- [x] `portfolio_backfill_metadata` table added to schema + migration `0002_square_sunspot.sql`.
- [x] `src/services/backfill.ts`: `runBackfill()` — queries MIN(executed_at), builds daily qty_held from BUY/SELL, fetches price series per symbol via instruments `GET /price-bars`, carry-forward on gaps, bulk-upserts `value_snapshots` in chunks of 100; `getBackfillStatus()`; `toDateStr()` normalises PGlite Date/string timestamps.
- [x] `GET /:id/analytics` replaced stub: < 2 snapshot rows → trigger backfill void + return `{backfillStatus:"pending"}`; otherwise read snapshots filtered by timeframe (6M/1Y/2Y/ALL), compute totalValue/totalReturn/monthlyReturns, return full series.
- [x] 10 unit tests: calendarDays, buildPriceMap carry-forward, single-symbol upsert, weekend carry, idempotency, status transitions. 154 wallets tests green.

### 1.6 (H7) — wire GET /:id/analytics — [x] DONE

- [x] Analytics stub replaced in `portfoliost-wallets/src/routes/portfolios.ts`: backfill trigger + snapshot read + timeframe filter (6M/1Y/2Y/ALL) + monthlyReturns + backfillStatus. (Implemented as part of step 1.5/H6.)

### 1.7 (H8) — frontend: polling + loading banner — [x] DONE

- [x] `@marx2/contracts@1.6.4`: `backfillStatus` + `timeframe` added to `PortfolioAnalytics`; SPA types regenerated.
- [x] `PortfolioCard.vue`: `backfillPending` ref + `startPolling()`/`stopPolling()` — polls every 5s, stops on `complete` or after 5 min; banner shown while pending; `onUnmounted` cleanup.
- [x] `PortfolioPerformanceTab.vue`: same polling via `getPortfolioAnalytics` → `store.analytics`; banner below Performance Chart.
- [x] Both render existing `timeSeries` immediately; build green; 164 mock tests pass.

### 1.8 (H9) — tests — [x] DONE

`portfoliost-instruments`:
- [x] `src/services/price-bars.test.ts` extended: `stooqTickerFor` (bare, suffix, lowercase), `ohlcvToClose` (valid, index fallback, bad date, NaN close), `matchSplitFactor` (2:1, 4:1, reverse, ambiguous, continuous), `checkSplitBoundary` ambiguous ratio → `suggested_factor=NULL`, continuous → no candidate, carry-forward view gap behaviour. 123 tests total green.
- [x] `src/services/price-bars-stooq.test.ts` (new): VIEW routing — US `.US` suffix stripped, PL/world passthrough, split_adjustments factor applied, overflow unified, split NOT applied to overflow rows. 10 test files, 123 tests green.

`portfoliost-wallets`:
- [x] `src/services/snapshots.test.ts` (new): today snapshot 2 USD positions, multi-currency PLN/EUR via EUR-base fxRates, empty portfolio → value=0, backfill 3 positions × 10 days correct daily values, empty transactions → 0 snapshots, 6M timeframe filter. 17 test files, 160 tests green.

### 1.9 (H10) — post-import hook + admin Market Data tab — [x] DONE

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
