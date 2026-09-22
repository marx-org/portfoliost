# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---


## 48. FX ownership → instruments; currency-converted price endpoints + chart selector (2026-09-26)

Deferred from §47 Q1; architecture settled (2026-09-26). FX rates and price bars are both daily
market data, so they belong in the **same** module: `portfoliost-instruments`. This moves
`fx_rates` + the import job out of `portfoliost-wallets` **entirely** (no duplication — user
decision a/b/c: move the table and importer, remove them from wallets), adds a `?currency=`
parameter to the price endpoints that converts closes server-side via a **parameterized query
join** (no per-currency views, no per-currency columns, no new indexes), and turns the SPA chart
currency label into a selector.

**Design (agreed):**
- `fx_rates` (EUR-quoted daily closes, PK `(rate_date, currency)`) + `fx_sync_state` move to the
  `instruments` schema; the daily frankfurter/ECB importer CronJob moves to instruments. A one-off
  deep import extends coverage to ~1999 (ECB/frankfurter already supports it — today's floor is
  2018-12-31 because the *first* import started there, not a source limit).
- Conversion is a **single parameterized read** `price_bars_as(symbol, from, to, baseCcy, targetCcy)`:
  `close × (rate(target)/rate(base))`, both EUR-quoted (the D27 formula, expressed in SQL). One
  query, no materialization. Existing PKs are sufficient: `price_bars(symbol,date)` is
  equality+range on the composite key; the two `fx_rates` joins are equality on the composite
  PK / its leading column — both exact B-tree probes. A ≤~2.5k-bar probe against a ~62k-row fx
  build side is a trivial hash join; **no new indexes required** (verified by EXPLAIN in a test).
- FX floor: bars older than the earliest `fx_rates` date have no join row → returned
  **unconverted**, with the response carrying `fxFrom` (earliest rate date) so the UI caveats
  instead of silently carry-forwarding. Same-currency (target === base) short-circuits to the
  plain base series (no join, identity).
- The D27 `contracts/fx` TS helpers remain the single **client-side** implementation (SPA live
  totals, fee forms). The SQL join is the single **server-side** implementation. Both encode the
  same `rate(B)/rate(A)` cross-rate; a property test pins them equal for shared inputs.

Touched repos: portfoliost-instruments (table, importer, read path, endpoints, registry),
portfoliost-wallets (settlement re-pointed at instruments' FX, local FX dropped),
portfoliost-contracts, portfoliost (SPA selector + proposal rewrites). Rules: one step = one
commit; a step is `[x]` only after its tests pass (instruments: vitest + stack; wallets: vitest;
SPA: build + unit + e2e).

- **Development mode:** no production data to migrate. `instruments.fx_rates` is loaded fresh by
the one-off deep import (48.1); wallets' `fx_rates` is dropped, not copied. All portfolio
positions/settled amounts are rebuilt afterwards via `google-sheets-sync` "Wipe & Reimport"
(`POST /api/admin/jobs/sheets-sync/run {wipe:true}`), so old converted values are recomputed from
scratch against the new FX source.
- **Conversion precedence:** price endpoints with `?currency=` are the default way to get
  converted values; the raw FX rate endpoint remains for rate-only needs (settlement, one-off
  lookups) but is no longer the chart/portfolio path.

**Dependency note:** after this, the only FX reader left in wallets is settlement (fee-fx,
cashFlows, balance history), reading instruments' FX over the existing internal module boundary
(`INSTRUMENTS_URL` already configured for price-bars); the local `fx_rates` table is dropped.
The `/api/currencies` registry moves to instruments with the table (its availability SoT).

---

### 48.1 — Move `fx_rates` + importer into instruments

- [x] `portfoliost-instruments/src/db/schema.ts`: add `fxRates` + `fxSyncState` tables in the
  `instruments` schema (identical shape to wallets': `rate_date date`, `currency char(3)`,
  `rate numeric(20,10)`, `source`, `fetched_at`; PK `(rate_date, currency)`); drizzle migration.
- [x] Port the importer from `portfoliost-wallets/src/services/fx-import.ts` into instruments
  (`src/services/fx-import.ts`): `TRACKED_CURRENCIES`, `upsertRates`, `syncDaily`, `importHistory`
  (default start `1999-01-04`), `backfillCurrency` — same frankfurter/ECB source + `@marx2/contracts/fx`
  conventions.
- [x] One-off deep import: run `importHistory` (start `1999-01-04`) to backfill the full series
  into `instruments.fx_rates`; verify `min(rate_date)` ≈ 1999 and no >10-day gaps per currency.
  **Done against the local dev DB (dev mode): 208,918 rows, floor exactly 1999-01-04, 30 currencies.
  Only source gap >10d: ISK 2008-12-09 → 2018-02-01 — a gap in ECB's own series (verified against
  frankfurter directly; Iceland left the ERM reference-rate publication in 2008), not an import
  defect. Unconvertible bars in that window are handled by the `fxFrom`/unconverted semantics.
  The same deep import runs against prod in 48.6 after the deploy.**
- [x] **No data migration.** We are in development mode: no production `fx_rates` history to
  preserve. The 48.1 one-off deep import into `instruments.fx_rates` is the only FX data load;
  wallets' existing `fx_rates` is simply dropped. (All portfolios will be rebuilt via
  `google-sheets-sync` "Wipe & Reimport" — `POST /api/admin/jobs/sheets-sync/run {wipe:true}` — so
  any old converted/settled amounts are recomputed from scratch against the new FX source.)
- [ ] Instrument CronJob mirroring the wallets `fxsync` CronJob (daily incremental) — Helm value
  + cron spec; unit test for the importer against a mocked frankfurter response.
  (Importer unit tests done; the homelab cron spec lands in 48.6 with the tag pin — enabling it
  earlier would run the pre-§48 image which lacks `dist/scripts/fx-sync.js`.)
- [x] Tests: importer upsert/idempotency, deep-import floor assertion; full instruments suite green.
- [x] Commit (portfoliost-instruments).

### 48.2 — `price_bars_as` read path + `?currency=` on price endpoints

- [x] `src/db/price-bars.ts`: add `getPriceBarSeries(..., targetCcy?)` — when `targetCcy` is set
  and `≠ baseCcy`, run the parameterized join
  `close * (f.rate / fb.rate)` over `price_bars_all ⨝ fx_rates(target) ⨝ fx_rates(EUR base)`,
  `WHERE symbol=:s AND date BETWEEN :from AND :to`; when equal/absent, the existing plain read.
  Return `{ closes, dates, baseCurrency, currency, fxFrom }` where `fxFrom` = earliest `fx_rates`
  date covering the window (null when no conversion applied). Bars older than `fxFrom` are
  unconverted (left as base) — document this in the response.
  (Implemented as `conversionJoinSql`/`queryViewAs` in services/price-bars.ts; `currency` = the
  served/output currency — target when converted, native base otherwise. EUR is the implicit
  fx base: no EUR row exists, the join uses 1.0.)
- [x] EXPLAIN test: assert the query plan probes `price_bars` and both `fx_rates` PKs (no seq
  scan on `fx_rates`); seed a bounded window + a few currencies, assert converted values equal
  the D27 `contracts/fx` `crossRate` for the same inputs (pins SQL and TS implementations equal).
- [x] `src/routes/instruments.ts`: add optional `currency` query param to `/price-bars`, `/price`,
  `/history`; resolve `baseCcy` via `resolveInstrumentCurrency` (the §47 single resolver); pass
  through to the read path; contract response gains `baseCurrency` + `fxFrom` (nullable).
  Unsupported currency or unresolvable base → 400. `/history` + `/price` (provider-fetched rows)
  convert via `contracts/fx` over `fxWindow`/`latestFxRates` (rate-only reads, db/fx-rates.ts);
  benchmark overlay shares the selected currency.
- [x] Contract bump: `portfoliost-contracts` `PriceBarSeries`/`PriceHistory`/`PriceResponse` gain
  `baseCurrency` + `fxFrom`; push → CI patch bump → `npm install` + `gen:types` in instruments and
  SPA, commit lock + generated types. (v1.6.31; the spec schema for the `/price` response is
  `HistoricalPrice` — it gained the fields too.)
- [x] Tests: vitest route cases — same-currency short-circuit, cross-currency converted values,
  `fxFrom` floor, unknown currency → 400; existing suite green.
- [x] Commit (portfoliost-instruments) + Commit (contracts + consumers).

### 48.3 — Re-point wallets settlement at instruments' FX; move registry; drop local FX

#### 48.3a — Instruments: serve the endpoints the data moved with — DONE (`6da496f`)

- [x] `GET /api/internal/fx-rates?from&to[&date]` — same `{rate, asOf}` shape wallets' internal
  route had, with a 10-day walk-back when the exact date is missing; JWT service-to-service auth.
- [x] Move `GET /api/currencies` to instruments — the registry's availability SoT is the
  `fx_rates` table itself (D26), so the endpoint follows the table. Display metadata
  (name/symbol/minorUnits) stays the static contracts catalog (D26) — only the availability join
  moves.
- [x] Move `GET /api/fx/latest` (implementation finding — not in the original list): the SPA fee
  dialog already calls it through the gateway `/api/fx/` (`src/api/fx.ts` → `getLatestRate`).
  Endpoints follow the data; the SPA is untouched, only the gateway upstream moves (48.3d).
- [x] Move `GET /api/admin/fx-rates` (implementation finding — not in the original list): the D47
  paginated rate listing lives with the table; `portfoliost-admin`'s proxy is re-pointed in 48.3d.
- [x] Tests (8 route cases) + full instruments suite (21 files / 334 tests green).
- [x] Commit (portfoliost-instruments) `6da496f`.

#### 48.3b — Wallets: pair-rate client + re-point settlement consumers — DONE (in `9cf4e42`)

- [x] New `src/services/instruments-fx.ts` against `INSTRUMENTS_URL`: `resolvedFxRate(auth, from,
  to, date?)` → `{rate, asOf} | null`, memoized `fxTo(auth, to)`, `resolveRates(auth, to, froms)`
  → `Map<ccy, number | null>`. Degrades to 1:1 on 404/unreachable (the old "no table" behavior);
  an unresolvable pair maps to `null` and keeps the old "converted field is null" semantics.
  Conversion math stays `@marx2/contracts/fx` (D27) — only the data source moves.
- [x] Re-point every local `fxRates`/`latestRates` reader. Consumer set was **broader than the
  original plan list** (implementation finding): `fee-fx.ts`, `cashFlows.ts`, `valuation.ts`,
  `quotes.ts`, `backfill.ts` (invested cost basis), `portfolio-transactions.ts` (4× `positionWire`
  call sites), `portfolios.ts` (merged analytics), `mergedAnalytics.ts` (rate callback now a pure
  `(from) => number | null` parameter).
- [x] **Retire wallets' FX join in the `backfill.ts` price path**: the value path fetches
  `/price-bars?currency=<portfolio base>` for positions whose instrument currency is known and
  non-base (null stays native — §45.3 never guess) and multiplies `qty × converted close` only —
  the "only quantity multiplication" property. `invested` still converts cost basis via the pair
  client (genuine rate-only need). **Precedence rule held:** where a price endpoint can convert on
  the fly (`?currency=`), consumers use it instead of fetching raw rates.
- [x] Test stand-in `src/test-fx-mock.ts`: stubs `globalThis.fetch` for
  `/api/internal/fx-rates`, computing pair cross-rates from a seeded EUR table via
  `contracts/fx` `crossRate` (D27 — no local formula). Reworked 9 test files (schema, history,
  movements, portfolios, cashFlows, mergedAnalytics, quotes, snapshots, valuation); the fx-rates
  seed becomes `mockInstrumentsFx({ table, asOf })`.
- [x] Wallets suite green: 26 files / 311 tests, `tsc --noEmit` clean. (One import.test.ts
  bootstrap timeout under full-parallel load is pre-existing flake — passes in isolation and on
  re-run; not FX-related.)

#### 48.3c — Wallets: drop the local FX — DONE (in `9cf4e42`; mock-stack commit pending with 48.3d)

- [x] Removed: `routes/registry.ts` (+ `/api/currencies`),
  `routes/admin.ts` (+ `/api/admin/fx-rates`), `services/fx-import.ts` (+tests),
  `scripts/fx-sync.ts`, `scripts/fx-backfill.ts`, `fxRates`/`fxSyncState` from `db/schema.ts`,
  both route mounts in `index.ts`, the `fx:sync`/`fx:backfill` npm scripts.
- [x] Drop migration for `wallets.fx_rates` + `wallets.fx_sync_state` (generated:
  `drizzle/0004_shallow_triton.sql`, two `DROP TABLE ... CASCADE`) — committed with code.
- [x] Mock stack: strip `fx_rates` references from `mocks/db-seed/wallets.mjs` (demo FX rows now
  INSERT into `instruments.fx_rates` — the real service drops `wallets.fx_rates` in 0004) +
  stale comment in `mocks/lib/demo-fx.js`. (portfoliost repo — committed with 48.3d.)
- [x] **Golden-value test** (dev-mode correctness proof, unit level):
  `backfill.test.ts` "golden value — mixed-currency portfolio" — USD portfolio holding USD/PLN/EUR
  instruments; one stub stands in for the whole instruments service (price-bars honors
  `?currency=` by converting closes, internal fx-rates serves the pair rate). Asserts: non-base
  symbols are requested with `?currency=<base>`, base as-is; hand-computed value/invested/netFlow
  (PLN→USD = 1.08/4.3, EUR→USD = 1.08) over two days.
- [x] `npm run build` + full wallets suite green (26 files / 312 tests); commit (portfoliost-wallets)
  `9cf4e42`.

#### 48.3d — Re-route the front door — DONE (commits below; homelab ingress edit held for 48.6)

- [x] Gateway `gateway/default.conf.template`: `/api/currencies` **and** `/api/fx/` →
  `${API_INSTRUMENTS_URL}` (both previously `${API_WALLETS_URL}`).
- [x] `portfoliost-admin` proxy (`src/index.ts`): `/currencies/rates` →
  `${API_INSTRUMENTS_URL}/api/admin/fx-rates` (previously wallets) + test updated; `API_INSTRUMENTS_URL`
  already present in compose + homelab env. `API_WALLETS_URL` stays for the other admin features
  (market-data, sheets-sync, service-probe).
- [x] Mock stack: `mocks/db-seed/wallets.mjs` demo FX rows now INSERT into `instruments.fx_rates`
  (the compose seed targets the real wallets DB, which 0004 drops); stale `demo-fx.js` comment.
- [x] Commits: portfoliost `4442361` (gateway + mock seed), portfoliost-admin `35a8df3` (proxy).
- [ ] **Homelab ingress** (`cluster/apps/pfire/portfoliost/app/helmrelease.yaml`): `/api/currencies`
  + `/api/fx` paths re-pointed wallets → instruments — **edited locally, push deferred to 48.6a**
  (must land in the same Flux reconcile as the new instruments tag, or prod 404s: the old
  instruments image doesn't serve these paths yet).
- [x] `/api/currencies` still lists all 30 currencies: covered by instruments `fx.test.ts`
  (served from `fx_rates`); settlement round-trips green in the 48.3b wallets suite.

### 48.4 — E2E repeatability + test-only FX fixtures (test fix)

The e2e suite must be **repeatable**: green on a fresh seed, and green on the Nth run against
the same stack. Baseline (2026-09-22, `docker compose down -v` + full re-seed, fresh images):
**89 pass / 3 fail / 1 skip**. The two §48-sensitive failures (fees-fx rate expectation,
combined-chart render) went green on the fresh seed — the seed-only FX fixture
(`mocks/db-seed`: 30 currencies × 1 day, `DEMO_FX` in `constants.mjs`, INSERTed into
`instruments.fx_rates` at stack startup) is the right layer. The three remaining failures are
state problems, not §48 regressions:

- `chart-currency.spec.ts:26,46` (SNT.WA vs SPY): the Price Chart renders with an **empty
  series** during the run (y-axis label count 0; the identical DOM query returns labels on
  manual replay). Service logs show a provider-tier **502 burst in the same window**
  (`SNT.WA/history` ×2, `SNT.WA/seasonality`, Top10 quote fan-out) — under parallel e2e load a
  failed background `/history` fetch appears to wipe the series already rendered from
  `price-bars`. Additionally: the "S&P 500" benchmark resolves to SPY, but **SPY has no bars in
  the seeded `price_bars`** (9 symbols: AAPL, AMAT, AMD, CART, KO, MSFT, NOTSTOOQ, NVDA,
  SNT.WA) — benchmark symbol resolution must be verified and benchmark bars seeded if missing.
- `wallets-watchlists.spec.ts:103` (Salary deposit edit/delete): **cross-test race** —
  `portfolios.spec.ts` `refillUsdWallet` deposits 10000 into the shared seed wallet in
  parallel, pushing "Salary deposit" (12 days old) out of the bounded Recent-transactions
  list. The test depends on global seed state that other specs mutate.

**Rule (test-only FX):** e2e FX expectations derive **only** from the `mocks/db-seed` demo
fixtures (mock-only, never run in the cluster). Tests never assume the 48.1 deep import; the
deep import is not part of the test stack. A test needing a specific rate asserts the seeded
fixture value, and the suite starts from a fresh seed (48.4c).

- [x] **48.4a** Chart resilience + benchmark data: (1) reproduce — force a 502 on
  `GET /api/instruments/SNT.WA/history` (background full-history fetch) while
  `price-bars`-rendered series is visible, assert the series is kept; fix the error path
  (research overview data flow / `PriceChart.vue`) so a failed `/history` never clears an
  already-rendered series; (2) find where the benchmark list resolves "S&P 500" → symbol
  (rg the benchmark source); if that symbol lacks seeded bars, extend the `pricebars-sim`
  seed (portfoliost-instruments) so benchmark overlays work on the fresh stack.
  Tests: `chart-currency.spec.ts` green (both SNT.WA tests + the AAPL same-currency test);
  full e2e green.
  _Done: `PriceChart.vue` gained a load-generation guard + "empty /history never wipes a
  rendered series" (shows a notice instead); `chart-currency.spec.ts` has the new 502-burst
  resilience test. Benchmark leg of `/history` (portfoliost-instruments) now reads the
  benchmark's local `price_bars_all` first (SPY/QQQ/IWM bars seeded by `pricebars-sim`,
  which also got deterministic 11y weekday series for all 15 e2e symbols + SNT.WA),
  provider-only as fallback; main leg falls back to local bars on provider 502/empty.
  4 new instruments route tests; chart-currency 4/4._
- [x] **48.4b** Self-contained wallet-mutation test: rewrite
  `wallets-watchlists.spec.ts:103` to create its own wallet + its own transactions (the
  `fees-fx.spec.ts` `createWallet` pattern) instead of mutating seed-wallet rows; audit the
  other specs for seed-state reads they depend on (`refillUsdWallet` stays — buy specs share
  the seed wallet — but must work from the seeded balance on every fresh stack).
  Tests: full e2e green.
  _Done: test creates `E2E Ledger <ts>` + two uniquely-described deposits, edits and
  deletes its own rows (spec 9/9)._
- [x] **48.4c** Reset gate: `npm run test:e2e` starts from a clean seed state. Add a pre-step
  that recreates the postgres volume and re-ups the stack without rebuilding
  (`docker compose down -v && docker compose up -d` — re-runs migrations, `pricebars-sim`,
  `mock-db-seed`), or a lighter TRUNCATE-all-app-schemas + re-run `mock-db-seed` script
  (benchmark both, pick the faster, document the choice in the script). Wire it into the
  `test:e2e` npm script (or `test:e2e:clean` invoked by `test:e2e`).
  Tests: **run the full e2e suite back-to-back twice — both runs fully green**
  (repeatability proof).
  _Done: `scripts/reset-mock-state.sh` (TRUNCATE all app-schema base tables + re-run
  `pricebars-sim` + `mock-db-seed`, ~11s, benchmarked vs ~90s for `down -v && up -d`, choice
  documented in the script header), wired via the existing `pretest:e2e`. Back-to-back
  `npm run test:e2e`: run 1 = 93 passed / 1 skipped, run 2 = 93 passed / 1 skipped (the skip
  is research.spec's pre-existing provider auto-skip, present at baseline)._
- [x] **48.4e** Nth-run state leaks (found while proving 48.4c on un-reset runs):
  (1) wallets `GET /api/portfolios/merged` and `/:id/analytics` treated any portfolio with
  `< 2 value_snapshots` as backfill-pending forever — but a portfolio whose only trades
  are from today can never produce snapshots (`backfill.ts` window is
  [first BUY/SELL, yesterday]), so each test-created portfolio poisoned every later merged
  call on the same day → combined chart vanished. Fix: `hasBackfillableHistory()` (mirrors
  the backfill window rule) now gates the pending check; 2 unit tests (pending only with
  older history; same-day-only portfolio → complete + empty).
  (2) `research-currency.spec.ts` never unregistered its `page.route` rewrites — late SPA
  polls hit the handlers after test end ("route.fetch: Test ended"), which skipped the
  next test in the worker. Fix: `page.unrouteAll({ behavior: "ignoreErrors" })` at test end.
  Verified: combined-chart spec green on a dirty (un-reset) stack; full suite green.
- [x] **48.4d** Commit (portfoliost + portfoliost-instruments + portfoliost-wallets).
  _Done: portfoliost 7d50999, portfoliost-instruments d46e03e, portfoliost-wallets 8d1720e._

### 48.5 — SPA: chart currency selector + converted series

- [x] **48.5a** `PriceChart.vue`: the currency in the title becomes a `<select>` (options from the
  shared `/api/currencies` registry per `AGENTS.md` — never hardcoded; default = instrument base
  currency). Selecting a currency re-fetches the series with `?currency=` and renders the
  converted closes; title shows the *selected* currency; a small `fxFrom` caveat appears when
  `fxFrom` is inside the visible window ("FX rates from {fxFrom}; earlier bars in {baseCcy}").
  _Done: title h2 carries `data-testid=chart-currency-select` (registry options, base always
  present — prepended if untracked; hidden until the base currency is known); both legs
  (price-bars + history) re-fetch via `currencyQueryParam(selected, base)` — same-currency
  short-circuits to null (no refetch); `baseCurrency`/`fxFrom` ride on the responses; the caveat
  predicate is the pure `fxCaveat()` helper; the selector resets on symbol change and re-defaults
  to the new base after the load. Fullscreen title + notes unchanged pattern._
- [x] **48.5b** Comparison overlay: benchmarks (SPY/QQQ/IWM, USD) are fetched with
  `?currency=<selected>` too, so the overlay shares the selected currency; the §47
  percent-normalization fallback remains only for genuinely unconvertible cases.
  _Done: `getHistory(..., currency)` passes the param through — the server already converts the
  compare series and reports `compare.currency = target`; `forcedPct`/`needsPercentComparison`
  now only fire for genuinely unconvertible cases (verified in e2e: USD benchmark on a
  PLN→USD-converted axis shows no "currencies differ" note)._
- [x] **48.5c** `useCurrenciesStore` (or equivalent) already exists — wire the selector to it;
  verify no hard-coded currency list is introduced.
  _Done: `PriceChart.vue` warms the store on mount; `currencyOptions` is store-driven (EUR first,
  popular, then the rest — the store's stable ordering). No currency list added to the component._
- [x] **48.5d** Tests: unit for the selector→param mapping and the `fxFrom` caveat predicate; e2e
  (docker compose mock — extend the mock price endpoints to honor `?currency=`) asserting the
  title, converted axis, and caveat render. The converted window needs a **deterministic
  multi-day FX history** in `mocks/db-seed` — extend the demo fixtures with a fixed
  N-day × demo-currency rate schedule (test-only fixture per the 48.4 rule; no live rates).
  _Done: (1) new `src/utils/priceChartFx.ts` (`currencyQueryParam`, `fxCaveat`) +
  `tests/unit/utils/priceChartFx.test.ts` (11 cases). (2) e2e
  `chart-currency.spec.ts` "§48.5 — currency selector converts the series + caveat": default
  PLN, select USD → converted `$` axis, last close = native × (DEMO_FX.USD/DEMO_FX.PLN) exact,
  `fxFrom` = first converted bar, caveat renders, benchmark shares USD (no cross-currency note);
  expectations derived from the seeded fixture only (imports `DEMO_FX`). (3) multi-day schedule:
  `mocks/db-seed/constants.mjs` `DEMO_FX_DAYS=30` + `demoFxSchedule()` — 30 calendar days ending
  today, FLAT at the DEMO_FX closes (flat keeps walk-back and exact-date rates identical to the
  single-day fixture, so no existing value expectation shifts); `wallets.mjs` inserts the
  schedule. (4) standalone mock price endpoints honor `?currency=` against the same schedule
  semantics (`mocks/lib/demo-fx.js` `convertSeriesAs`/`targetCurrencyParam` + instruments
  `/history` + `/price-bars`: converted tail, unconverted head, `fxFrom`, same-currency
  short-circuit, 400 on unsupported target / unknown base); `mocks/tests/run.mjs` +9 checks.
  `ResearchPriceChart.test.ts` updated (mocks `getPriceBars` + the currencies store; new
  4-arg `getHistory` signature). Helper `priceChartYAxis` now `trimStart()`s the h2 text
  (flex title carries the select)._
- [x] **48.5e** Commit (portfoliost).
  _Done: portfoliost `29cbe5a`. Suite: build ✓, unit 328 ✓, test:mock 219 ✓, e2e 94 passed /
  1 skipped (pre-existing research.spec provider auto-skip) — full suite green on the
  re-seeded stack._

### 48.6 — Closeout

- [x] **48.6a** Deploy: push instruments + wallets `main` (GHA `v*` bump); pin new tags in
  `~/prv/homelab/.../pfire/<name>/app/helmrelease.yaml` in the **same** Flux reconcile that
  (i) adds the instruments `fxsync` CronJob (daily incremental, mirroring the old wallets spec —
  the 48.1 deferral), (ii) removes the wallets `fxsync`/`fx-backfill` CronJobs (removing them
  earlier would run the pre-§48 wallets image which still needs the table), and (iii) pushes the
  SPA ingress re-point from 48.3d (`portfoliost/app/helmrelease.yaml` — `/api/currencies` +
  `/api/fx` → instruments; the old instruments image 404s on both paths, so it cannot land
  earlier).
- [x] **48.6b** Prod deep import (user runs the kubectl commands — no cluster access from the
  agent side): `kubectl -n pfire exec deploy/portfoliost-instruments -- node
  dist/scripts/fx-backfill.js 1999-01-04`; verify `select count(*), min(rate_date), max(rate_date)
  from instruments.fx_rates` ≈ 208k rows / floor 1999-01-04.
- [x] **48.6c** Verify in prod: (a) `instruments.fx_rates` holds the deep series (208,947 rows,
  1999-01-04→2026-09-22, 30 ccy); (b) `wallets.fx_rates` gone (to_regclass null) + values
  consistent (cost basis, wallet balances convert at 0.26363845/1.1463); (c) `/api/currencies`
  full registry (31) from instruments; (d) PKO.WA PriceChart selector PLN 60–130 axis → USD
  15–35 via `?currency=USD` server-side (200); (e) native history intact (366d 100,000→119,190
  PLN, backfill complete). Display-currency rendering bugs found → **48.6e**.
- [ ] **48.6d** Update `openst-coverage.md` / price-data docs; archive §48 to `plan-archive.md`.
- [ ] **48.6e** Prod verification findings (2026-09-22, post-48.6a/b) — points to fix:
  - [ ] **B1 — /en/charting crashes (unimplemented stub):** ChartingView throws
    `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` on load; `main`
    empty. Nav link exists although the section is not built — implement or hide the entry.
  - [ ] **B2 — holdings table shows portfolio-base `converted*` under the profile currency
    symbol:** PLN portfolio + USD profile renders `PLN 104,190.00 / $104,190.00` (identity).
    Wallets converts to `portfolio.baseCurrency` (`resolveRates(to=baseCurrency)` in
    portfolio-transactions.ts; position carries `displayCurrency: "PLN"`); the SPA renders
    those fields with the profile display-currency symbol, ignoring `displayCurrency`. Example service
    contract (example-service-real-api.yaml positions) = display currency. Decide the owner: wallets
    converts to the requested display currency (parity) or the SPA converts client-side via
    `/api/fx/latest`.
  - [ ] **B3 — portfolio performance chart renders native values under the display-currency
    axis:** Obligacje (119,190 PLN) shows a "$120K/$100K" axis on "Performance Chart: USD".
    Analytics `timeSeries` is correct in portfolio currency — convert the series to the display
    currency (same decision as B2).
  - [ ] **B4 — investments "Cash balance" sums native wallet balances:** UI shows
    -$1,074,977.97 = Σ native balances (PLN+USD+EUR added raw, $ symbol);
    `/api/wallets/total-balance` correctly returns **-569,668.76 USD** (per-wallet
    `exchangeRate` 0.26363845/1.1463). Example service parity: "Całkowite saldo … € · N walut" =
    converted total. SPA should render the converted `totalBalance`.
  - [ ] **B5 — /api/portfolios/total-metrics doesn't convert per-portfolio values:**
    `totalValue` 526,478.49 "USD" aggregates the Obligacje portfolio's 119,190 **PLN** as USD
    (≈31,421 correct) — drives the investments header total, "Portfolio Value" chart and
    return %. Fix in wallets: convert each portfolio value to `baseCurrency` (rate via
    instruments fx) before aggregating.

### 48.7 — Rewrite related proposals to the new architecture

- [ ] In `docs/proposals/` — addenda recording the 2026-09-26 ownership decision (not a silent
  rewrite of accepted history):
  - `fees-and-custom-fx.md` D25/D26: FX rate store + importer now owned by **instruments** (daily
    market data, same module as prices); D26 availability SoT + `/api/currencies` served by
    instruments; wallets keeps *settlement* only and reads instruments' FX.
  - `wallets-module.md` D20/D21 (FX store, snapshots): mark the FX store as moved out — wallets
    snapshots/rate-source semantics unchanged, data source is instruments.
  - `price-data-architecture.md`: add the `?currency=` parameterized-join conversion (48.2),
    `fxFrom` floor semantics, no-new-index rationale.
  - `instruments-provider-module.md`: record `fx_rates` + importer + registry as instruments
    responsibilities.
- [ ] No tests (docs); commit (portfoliost).

---

## 49. Dividends end-to-end: parity with example-service (2026-09-26)

From the dividend-state audit + live example-service capture (TEST DIV portfolio, dividend
submitted and read back from example-service's own API — observed, not guessed). Example service stores
dividends **as DIVIDEND rows in the standard transactions table** (no separate
dividend entity): `quantity × price = gross`, `taxes` separate, **`totalAmount =`
gross − tax (net)**, `exchangeRate` at the receive date, wallet credited the net.

Our state today: the entry point already exists (HoldingsTab position menu →
AddPositionDialog kind="dividend"), the `taxes` column already exists in the contract
and wallets schema — but the SPA never sends it, the POST/PATCH routes don't accept
it, `totalAmount` is gross (not net), there's no notes field, no total/per-share
toggle, and `GET /api/portfolios/:id/dividends` is a **stub returning zeros** in prod
(the mock serves research data, hiding the gap). The instruments calendar route also
carries the §47 "?? USD" anti-pattern and `CalendarData.dividend` (payment dates) is a
dead field the SPA renders but nothing ever fills.

Scope: portfoliost-contracts (`notes`), portfoliost-wallets (taxes/notes in
tx create+edit, net-totalAmount for DIVIDEND, real `/dividends` endpoint), portfoliost
SPA (dedicated dividend dialog with example-service fields, Dividends tab, currency fixes in
research), mocks. Depends on §47 (currency resolver, no-USD rule) — implement after
§47.4 so the research-side fixes use the final resolver.

---

### 49.1 — Contracts: `notes` + explicit dividend semantics

- [ ] `portfoliost-contracts/contracts/openapi.yaml`: add `notes: { type: string,
  nullable: true }` to `Transaction` and to the transaction create/update request
  schema; document on `Transaction` that for `type: DIVIDEND`, `price` is the
  per-share gross, `quantity × price` is the gross, `taxes` is the withholding tax,
  and `totalAmount` is the **net** (gross − taxes) — the example-service convention (verified
  against the live API 2026-09-26).
- [ ] Push `main` → CI patch bump + publish; `gh release list --repo Marx2/portfoliost-contracts`
  to verify the tag.
- [ ] Consumers: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>`
  in portfoliost-wallets and portfoliost; `npm run gen:types` in portfoliost; commit
  locks + generated types (per-repo commits).
- [ ] Tests: contracts suite green in `portfoliost-contracts/contracts/`.
- [ ] Commit (contracts + consumers).

### 49.2 — Wallets schema: `notes` column

- [ ] `portfoliost-wallets/src/db/schema.ts`: add `notes: text("notes")` to the
  portfolio-transactions table; drizzle migration (nullable, no backfill — dev mode,
  portfolios rebuild on wipe & reimport if needed).
- [ ] Tests: migration applies on a fresh PGLite; schema test updated; suite green.
- [ ] Commit (portfoliost-wallets).

### 49.3 — Wallets API: accept taxes+notes, net totalAmount, real `/dividends`

- [ ] `src/routes/portfolio-transactions.ts` POST `/:id/transactions`: extend
  `TransactionCreateSchema` with `taxes` (nullable number ≥ 0) + `notes`; for
  `type === "DIVIDEND"` compute `totalAmount = quantity × price − (taxes ?? 0)`
  (net — example-service convention; BUY/SELL untouched); validation: `taxes ≤ gross`
  (422 otherwise); persist `taxes` + `notes`; wallet credit already uses
  `quantity × price` → change to the **net** for DIVIDEND in `createWalletLink`.
- [ ] PATCH `/:id/transactions/:txId`: same field handling + recompute
  (taxes change re-derives net totalAmount and wallet delta).
- [ ] `GET /:id/dividends` (portfolios.ts:1048, currently a stub): implement from
  real DIVIDEND rows — items `{symbol, instrumentName, date, quantity, gross
  (=qty×price), taxes, amount (net), currency, exchangeRate, convertedAmount,
  notes}` sorted date desc + `totalDividends` (net, sum) + `count`; contract shape reuses a
  `DividendsData`-adjacent portfolio response (extend it in 49.1 if the
  current shape is insufficient — it currently only models instrument research
  rows, which is why the mock fakes it).
- [ ] Tests: vitest round-trips — dividend with tax (net persisted, wallet credited
  net, `taxes > gross` → 422), dividend without tax (net = gross), notes
  round-trip, GET dividends aggregates + totals, BUY/SELL totals unchanged; full
  wallets suite green.
- [ ] Commit (portfoliost-wallets).

### 49.4 — SPA: dedicated dividend dialog (example-service parity)

- [ ] New `RecordDividendDialog.vue` (does NOT reuse AddPositionDialog — different
  field set), opened from the existing HoldingsTab "Dividend" action:
  - header: instrument + "HOLDING: {qty}";
  - entry-mode toggle **Total / Per share** (per share auto-fills quantity with
    held shares; total mode hides quantity);
  - cash-portfolio (wallet) selector, preselected = portfolio's linked wallet;
  - fields: **Gross amount** (mode-dependent), **Withholding tax** (optional, ≥ 0),
    **Receive date** (default today), **Notes** (optional);
  - FX leg reuses the existing automatic/custom rate machinery (`rateSource`,
    D29/D38 `FxRateFields`) when wallet/transaction currency differs from
    instrument currency — no new rate code;
  - live summary: gross / − tax / **net** (transaction currency) + converted net
    in wallet currency; validate `tax ≤ gross` client-side.
- [ ] Wire the dialog into HoldingsTab (replace the kind="dividend" path through
  AddPositionDialog); submit to the existing POST with `taxes` + `notes`.
- [ ] EditTransactionModal: when the edited tx is DIVIDEND, surface the same
  gross/tax/notes fields (per-share display derived).
- [ ] Tests: unit for mode math (total↔per-share, net = gross − tax) +
  e2e (docker compose, mock updated in 49.7): record a dividend with tax in the
  per-share mode → transaction row shows DIVIDEND with net total, wallet balance
  credited net.
- [ ] Commit (portfoliost).

### 49.5 — SPA: portfolio Dividends tab + transactions table

- [ ] `PortfolioDividendsTab.vue`: render the real endpoint (49.3) — per-row
  symbol/date/gross/tax/net (with currency per row), totals; replace the current
  research-backed mock data source in prod (tab stays fed by the same endpoint in
  mock mode, now returning the same shape from real txs).
- [ ] `TransactionsTable.vue`: for DIVIDEND rows render the tax column when
  non-zero and a notes tooltip; verify the existing blue "DIVIDEND" badge is
  kept.
- [ ] Tests: e2e — a recorded dividend (49.4) appears in the Dividends tab with
  gross/tax/net and in the transactions table.
- [ ] Commit (portfoliost).

### 49.6 — SPA + instruments: dividend currency correctness (§47 alignment)

- [ ] `portfoliost-instruments` calendar route (~line 814): replace
  `profileData?.currency ?? "USD"` with `resolveInstrumentCurrency(getDb(),
  routeSymbol)` (the §47 single resolver); add `/dividends` route to §47.4's
  `currencySource` treatment.
- [ ] Dead-field fix deferred to 49.9: `CalendarData.dividend` (payment dates) is not
  populated today and the SPA renders an always-empty "Upcoming Dividend" card —
  49.9 implements the dividend calendar (payment dates) end-to-end; until then the
  SPA card stays hidden (`v-if` on data presence), not removed.
- [ ] `ResearchDividends.vue`: `instrCcy = history[0]?.currency ?? "USD"` → use
  the §47 badge rules (unknown → plain number + red badge); `ResearchCalendar.vue`
  ex-dividend amounts follow the fixed route currency.
- [ ] Tests: instrument route tests for the calendar currency source; SPA unit
  for the instrCcy chain; suite green.
- [ ] Commit (instruments) + Commit (portfoliost) + Commit (contracts, if the
  dead field is removed).

### 49.7 — Mocks: parity

- [ ] `mocks/portfolios`: `POST/PATCH transactions` accept `taxes` + `notes`,
  compute net totalAmount for DIVIDEND, credit wallet net; `GET /:id/dividends`
  returns real tx rows (drop the research-data fake) with the 49.3 shape.
- [ ] `mocks/tests/run.mjs`: round-trips mirroring 49.3's wallet cases.
- [ ] Tests: `npm run test:mock` + e2e green.
- [ ] Commit (portfoliost).

### 49.8 — Closeout

- [ ] Full gate: `npm run build` + `npm run test` + `npm run test:mock` +
  `npm run test:e2e` (SPA), wallets + instruments suites, contracts suite.
- [ ] Deploy wallets (+ instruments if 49.6 touches it) per the homelab flow;
  verify in prod: record a dividend with tax in a real portfolio → row shows
  net total, wallet credited net, Dividends tab shows it; delete the test row.
- [ ] Update `fees-and-custom-fx.md` addendum (taxes on DIVIDEND = withholding,
  net-totalAmount convention); archive §49 (up to 49.8) to `plan-archive.md`;
  §49.9 stays pending (provider tier, separate closeout).

### 49.9 — Dividend calendar: ex-dividend + payment dates (provider tier, later)

Implements the dividend-calendar half of the portfolio/instrument calendar feature
(deferred from 49.6). Provider tier first per the standard step ordering;
follows the planner's openst→cachest→instruments→SPA sequence.

- [ ] Probe: `obb.equity.calendar.dividend` rows + the dividend-history DataFrame
  (openst `get_dividend_history`) — capture which providers expose
  `payment_date` (vs ex-date only); save fixtures under
  `openst/tests/fixtures/`. One request per symbol, no automation.
- [ ] openst: where the provider exposes it, add `payment_date` to
  `get_dividend_history` rows (`{"date", "amount", "payment_date"?}`) and pass
  calendar `dividend` rows through untouched (they already carry raw columns via
  `_df_records`); unit tests with fixtures; full openst suite green; compose smoke
  (curl one US dividend payer, cache HIT on second call).
- [ ] cachest: no new route (dividend history + calendar dividend are existing
  passthroughs) — verify the fetcher preserves the new `payment_date` field
  (quick check + `test_real_config_has_...` style assertion if it does field
  filtering); full cachest suite green.
- [ ] instruments: `toCalendar` maps `payment_date` into `CalendarData.dividend[]`
  (`{date, title: "Dividend Payment", year, amount}`) alongside the existing
  `exDividend[]` (ex-dividend dates keep populating `exDividend` — both arrays
  fed, amounts from the same rows); `/dividends` history rows gain
  `paymentDate` (nullable) in the contract; SPA `ResearchDividends.vue` shows the
  payment date per row when present; the always-empty "Upcoming Dividend" card in
  `ResearchCalendar.vue` becomes live; `toDividends` passes `paymentDate` through.
- [ ] Tests: instruments vitest (row with/without payment_date), SPA e2e (calendar
  shows both ex-date and payment-date sections for a seeded dividend payer).
- [ ] Closeout: contract bump + consumer installs, deploy openst/instruments,
  archive §49 fully to `plan-archive.md`.

---

**§49 design decisions (resolved at planning):**
- **Dividend = DIVIDEND transaction row** (example-service parity, confirmed against the
  live API) — no separate dividend entity; `totalAmount` is the **net**
  (gross − withholding tax), wallet is credited the net, `taxes` kept separately
  (column already exists; only wire it through).
- **Entry point**: position menu (already present) → new dedicated
  `RecordDividendDialog` (example-service's dialog field set); the Transactions tab gets
  no dividend button (example-service doesn't either).
- **Entry modes**: Total and Per-share (per-share auto-fills held quantity).
- **FX**: receive-date rate via the existing D29 automatic/custom machinery;
  conversion math stays `@marx2/contracts/fx` (D27).
- **`/portfolios/:id/dividends`** aggregates real DIVIDEND rows (no research
  data); the dividend **calendar** (ex-date + payment date) is supported via
  49.9 (provider tier, later step) — until then the SPA payment-date card stays
  hidden and `CalendarData.dividend` stays empty (field kept, not removed).
- **Ordering**: §49 runs after §47 (currency fixes reuse its resolver); no
  dependency on §48.
