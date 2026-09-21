# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## 47. Quote-currency correctness: no silent USD fallback, provider consistency, currency UI signals (2026-09-26)

Follow-up to §45 (archived): the research page labels the same TFI fund price as USD (NNEP65.TFI) or
PLN (INGAKC.TFI) depending on whether openst's scrape of the biznesradar page found the
`priceCurrency` meta tag, because every layer — openst, instruments routes (`q.currency ?? "USD"`),
SPA (`profile.currency ?? quote.currency ?? "USD"`) — silently falls back to USD when the provider
omits the currency.

Scope: openst emits a consistent `currency` for its known universe (.TFI/.FIZ → PLN) when the page
meta is absent; the instruments module becomes the single resolver (provider meta vs local
`resolveInstrumentCurrency`), **never guessing USD**, and signals divergence to the SPA; the SPA
drops every `"USD"` fallback, shows the currency in chart titles, red-flags unknown/estimated
currencies, keeps chart height stable, and makes the mode toggle reflect the forced percent
normalization when currencies differ.

Touched repos: openst, portfoliost-contracts, portfoliost-instruments, portfoliost (SPA). Rules: one
step = one commit; a step is `[x]` only after its tests pass (openst: pytest + compose smoke;
instruments: vitest + stack; SPA: build + unit + e2e per `AGENTS.md`).

---

### 47.1 — Fixture capture: NNEP65.TFI quote currency truth

- [x] `curl` `https://biznesradar.pl/notowania/NNEP65.TFI` and `INGAKC.TFI` (and one `.WA` control,
  e.g. `BST0327.WA`); save raw HTML to `openst/tests/fixtures/biznesradar/NNEP65.TFI_notowania.html`
  (fixture dir lives at the openst repo root, next to the existing `INGAKC.TFI_notowania.html` /
  `BST0327.html` captured in §45 — the `.WA` control is fetched WITHOUT the suffix, biznesradar
  404s on `.WA`).
- [x] Settle the cache question (**RESOLVED 2026-09-22 — stale openst Redis, not cachest**): the live
  page carries the `priceCurrency` meta (captured fixture `content="PLN"`), and a fresh scrape
  carries `currency: "PLN"`. Prod served a stale openst-level value: `equity_quote:NNEP65.TFI` in
  openst's Redis (db 2) was cached ~11 h earlier without currency (TTL 86400 s). Purging that key
  (Redis `DEL`, since the openst pod has no per-ticker purge route) and re-curling
  `/equity/quote/NNEP65.TFI` immediately returned `"currency": "PLN"`. ⇒ 47.2 is **hardening**
  (provider meta stays the source of truth; the cache is the bug, not the scraper).
- [x] Tests: fixtures exist and are byte-stable (`test_nnep65_fixture_carries_currency` pins the
  PLN truth — re-capture without the meta fails). Full openst suite green via
  `docker compose --profile test run --rm test` (279 + 87 + 53 passed).
- [x] Commit (openst `b5f71c5`).
- [ ] ~(cachest)~ — no cachest change needed (its `/stats/invalidate-ticker/equity/quote:NNEP65.TFI`
  route works, but the stale layer was openst's own Redis).

### 47.2 — openst: consistent currency for the known universe

- [ ] In `plugins/openbb_biznesradar/openbb_biznesradar/scraper.py`, add
  `default_currency_for_symbol(symbol) -> str | None` — `.TFI`/`.FIZ` suffix → `"PLN"` (Catalyst/TFI
  universe is PLN by construction, same assumption as instruments' `resolveInstrumentCurrency`),
  otherwise `None`.
- [ ] `scrape_quote` and `probe_notowania_full`/profile path: when `_currency_from_soup` returns
  `None`, use `default_currency_for_symbol(symbol)`; omit the key only when both are `None`
  (backwards-compatible row shape).
- [ ] Tests: new pytest cases in the plugin test suite using the 47.1 fixtures — (a) meta present →
  meta wins, (b) meta absent + `.TFI` → `PLN`, (c) meta absent + non-Polish symbol → key omitted.
  Full openst suite green.
- [ ] Compose smoke: `docker compose up -d redis openst`, `curl /equity/quote/NNEP65.TFI` and
  `/equity/quote/INGAKC.TFI` → both carry `"currency": "PLN"`; second call is a cache HIT.
- [ ] Commit (openst).

### 47.3 — Contracts: `currencySource` on quote/history/profile

- [ ] `portfoliost-contracts/contracts/openapi.yaml`: add `currencySource` (enum
  `"provider" | "estimated" | "unknown"`) to `Quote`, `PriceHistory`, and `InstrumentProfile`/detail
  schemas; document semantics (provider = upstream declared it; estimated = local suffix/exchange
  resolution; unknown = nothing known — `currency` may be null).
- [ ] Push to `main` → CI bumps patch + publishes; verify tag with
  `gh release list --repo Marx2/portfoliost-contracts`.
- [ ] Consumers: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>` in
  portfoliost-instruments and portfoliost, `npm run gen:types` in portfoliost, commit lock +
  `generated/api-types.d.ts`.
- [ ] Tests: contracts package suite green in `portfoliost-contracts/contracts/`.
- [ ] Commit (contracts + both consumer repos, separate commits per repo).

### 47.4 — instruments: single currency resolver, no USD guessing

- [ ] `src/routes/instruments.ts`: replace the blind fallbacks — `/quote`:
  `currency: q.currency ?? resolveInstrumentCurrency(...)` with `currencySource` derived by
  comparing the provider value vs the local resolution (match → `provider`; provider
  missing/mismatch → `estimated`; both absent → `unknown` + `currency: null`); `/profile` and
  `/history` get the same treatment (history already resolves locally — now tag it `estimated`
  unless provider agrees).
- [ ] Keep `resolveInstrumentCurrency` as the only local resolver (no new heuristics); its final
  `"USD"` catch becomes `"unknown"`/null propagation.
- [ ] Tests: vitest route/adapter cases for all three `currencySource` outcomes incl. the NNEP65 vs
  INGAKC fixtures; existing suite green.
- [ ] Commit (portfoliost-instruments).

### 47.5 — SPA: kill the USD fallback, red-flag unknown/estimated currency

- [ ] `ResearchOverview.vue`: `instrCcy` becomes `profile.currency ?? quote.currency` — **no**
  `"USD"`; when null, render prices without a currency code (plain number) + a red
  `Currency unknown` badge next to the price; when `currencySource === "estimated"`, render an
  amber/red `PLN (estimated)` hint.
- [ ] Audit and remove every other hardcoded `"USD"` currency fallback in `src/` (`rg '\?\? "USD"'`
  and `rg 'currency.*"USD"'` in the research + chart paths) — same treatment: null → no label +
  warning badge.
- [ ] Tests: unit test for the `instrCcy` chain; e2e (docker compose mock — extend the mock
  instruments endpoints to cover provider/estimated/unknown) asserting the badge appears and no fake
  USD label renders.
- [ ] Commit (portfoliost).

### 47.6 — SPA: chart currency in title + stable chart height

- [ ] `PriceChart.vue`: title becomes `Price Chart (PLN)` (currency from the same resolved source as
  47.5 — prop, not a second fetch); currency also in the fullscreen title. Initialize
  `chartCurrency` to `""` (never `"USD"`); while empty, y-axis shows plain numbers.
- [ ] Fixed chart region: the `<div>` around the apexchart gets a fixed height wrapper (e.g.
  `h-[400px]`) so the card does not reflow when the cross-currency note / loading notice / summary
  appear; verify legend + notice no longer shift the plot.
- [ ] Tests: e2e — screenshot/a11y diff before/after toggling transactions + comparison (chart plot
  box unchanged); build + unit green.
- [ ] Commit (portfoliost).

### 47.7 — SPA: mode toggle must reflect the effective % normalization

- [ ] The caption "Percent — currencies differ (EUR vs USD)" is correct and stays — it explains why
  the user was switched to percent view. The only defect: the mode toggle still highlights "Price"
  while the plot is percent-normalized, so the highlight and the caption contradict.
- [ ] When `axisUnit === "pct"` is forced by a currency mismatch, mark the effective mode on the
  toggle itself — e.g. the active "Price" button renders `Price → %` (or a badge) — without changing
  the user's `mode` selection (it must survive removing the benchmark, so switching back to Price
  mode works).
- [ ] Tests: unit test for the forced-state predicate; e2e asserting both the "Price" highlight and
  the forced-% indicator are visible together.
- [ ] Commit (portfoliost).

### 47.8 — Closeout

- [ ] Deploy: push openst + portfoliost-instruments `main` (GHA `v*` bump), pin new tags in
  `~/prv/homelab/.../pfire/<name>/app/helmrelease.yaml`, verify with kubectl + a live curl through
  cachest.
- [ ] Verify in prod: NNEP65.TFI and INGAKC.TFI both show PLN (provider source) on the research
  page; chart titles carry the currency.
- [ ] Update §45 archive entry with the resolution pointer; archive §47 to `plan-archive.md`; update
  `openst-coverage.md` if it tracks quote currency.

---

**§47 design decisions (resolved at planning):**
- **Currency selector / FX-converted chart** → deferred to §48 (which supersedes the original
  wallets-convert sketch: FX market rates moved to instruments, price endpoints convert
  server-side, SPA chart label becomes a selector).
- **Severity:** red = unknown (plain number, no currency code), amber = estimated (code shown +
  hint).
- **Cachest:** no new route needed (currency flows through the existing equity quote/profile
  passthrough); 47.2's smoke curls openst directly, 47.8 verifies through cachest in prod. Flag if
  cachest strips unknown fields (quick check of its fetcher passthrough at implementation time).

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

- [ ] `portfoliost-instruments/src/db/schema.ts`: add `fxRates` + `fxSyncState` tables in the
  `instruments` schema (identical shape to wallets': `rate_date date`, `currency char(3)`,
  `rate numeric(20,10)`, `source`, `fetched_at`; PK `(rate_date, currency)`); drizzle migration.
- [ ] Port the importer from `portfoliost-wallets/src/services/fx-import.ts` into instruments
  (`src/services/fx-import.ts`): `TRACKED_CURRENCIES`, `upsertRates`, `syncDaily`, `importHistory`
  (default start `1999-01-04`), `backfillCurrency` — same frankfurter/ECB source + `@marx2/contracts/fx`
  conventions.
- [ ] One-off deep import: run `importHistory` (start `1999-01-04`) to backfill the full series
  into `instruments.fx_rates`; verify `min(rate_date)` ≈ 1999 and no >10-day gaps per currency.
- [ ] **No data migration.** We are in development mode: no production `fx_rates` history to
  preserve. The 48.1 one-off deep import into `instruments.fx_rates` is the only FX data load;
  wallets' existing `fx_rates` is simply dropped. (All portfolios will be rebuilt via
  `google-sheets-sync` "Wipe & Reimport" — `POST /api/admin/jobs/sheets-sync/run {wipe:true}` — so
  any old converted/settled amounts are recomputed from scratch against the new FX source.)
- [ ] Instrument CronJob mirroring the wallets `fxsync` CronJob (daily incremental) — Helm value
  + cron spec; unit test for the importer against a mocked frankfurter response.
- [ ] Tests: importer upsert/idempotency, deep-import floor assertion; full instruments suite green.
- [ ] Commit (portfoliost-instruments).

### 48.2 — `price_bars_as` read path + `?currency=` on price endpoints

- [ ] `src/db/price-bars.ts`: add `getPriceBarSeries(..., targetCcy?)` — when `targetCcy` is set
  and `≠ baseCcy`, run the parameterized join
  `close * (f.rate / fb.rate)` over `price_bars_all ⨝ fx_rates(target) ⨝ fx_rates(EUR base)`,
  `WHERE symbol=:s AND date BETWEEN :from AND :to`; when equal/absent, the existing plain read.
  Return `{ closes, dates, baseCurrency, currency, fxFrom }` where `fxFrom` = earliest `fx_rates`
  date covering the window (null when no conversion applied). Bars older than `fxFrom` are
  unconverted (left as base) — document this in the response.
- [ ] EXPLAIN test: assert the query plan probes `price_bars` and both `fx_rates` PKs (no seq
  scan on `fx_rates`); seed a bounded window + a few currencies, assert converted values equal
  the D27 `contracts/fx` `crossRate` for the same inputs (pins SQL and TS implementations equal).
- [ ] `src/routes/instruments.ts`: add optional `currency` query param to `/price-bars`, `/price`,
  `/history`; resolve `baseCcy` via `resolveInstrumentCurrency` (the §47 single resolver); pass
  through to the read path; contract response gains `baseCurrency` + `fxFrom` (nullable).
- [ ] Contract bump: `portfoliost-contracts` `PriceBarSeries`/`PriceHistory`/`PriceResponse` gain
  `baseCurrency` + `fxFrom`; push → CI patch bump → `npm install` + `gen:types` in instruments and
  SPA, commit lock + generated types.
- [ ] Tests: vitest route cases — same-currency short-circuit, cross-currency converted values,
  `fxFrom` floor, unknown currency → 400; existing suite green.
- [ ] Commit (portfoliost-instruments) + Commit (contracts + consumers).

### 48.3 — Re-point wallets settlement at instruments' FX; move registry; drop local FX

- [ ] `portfoliost-instruments`: expose `GET /api/internal/fx-rates?from&to` (same shape wallets'
  internal route had) **and move `GET /api/currencies` to instruments** — the registry's
  availability SoT is the `fx_rates` table itself (D26), so the endpoint follows the table. Gateway
  re-routes `/api/currencies` to `INSTRUMENTS_URL`; SPA consumers already point at instruments for
  this flow. Display metadata (name/symbol/minorUnits) stays the static contracts catalog (D26) —
  only the availability join moves.
- [ ] `portfoliost-wallets`: replace the local `fxRates` schema reads in `fee-fx.ts`,
  `cashFlows.ts`, and `backfill.ts` with a client to instruments' FX —
  `GET /api/internal/fx-rates` (see 48.2: a resolved-rate lookup taking `from`/`to`/`date`, the
  same shape as wallets' existing internal route, reachable via `INSTRUMENTS_URL`). Conversion
  math stays `@marx2/contracts/fx` (D27) — only the *data source* moves, so this is a URL swap,
  not a rewrite.
- [ ] Drop `wallets.fx_rates` + `fx_sync_state` (drizzle migration) — development mode, the deep
  import in 48.1 is the only FX data load; remove the wallets `fxsync`/`fx-backfill` CronJobs +
  `fx-import.ts` + their tests. Remove the wallets `/api/currencies` route (now served by
  instruments).
- [ ] **Retire wallets' FX join in `backfill.ts`**: the position-value path now calls instruments
  `/price-bars?currency=<portfolio base>` and multiplies `close × qty` with no local FX lookup —
  the "only quantity multiplication" property. **Precedence rule:** whenever a price endpoint can
  convert on the fly (`?currency=`), consumers use it *instead of* fetching raw rates and
  converting manually; `GET /api/internal/fx-rates` stays for genuine rate-only needs (settlement,
  one-off lookups) and is expected to see reduced traffic after this.
  In development mode the correctness proof is a
  golden-value test over a seeded mixed-currency portfolio (unit level, not a prod diff), since
  real portfolio values are rebuilt on the next wipe & reimport.
- [ ] Tests: settlement round-trips (fee fx, cash flows, balance history) green against
  instruments-sourced rates; `/api/currencies` (now served by instruments) still lists all 30
  currencies; full wallets suite.
- [ ] Commit (portfoliost-wallets).

### 48.4 — SPA: chart currency selector + converted series

- [ ] `PriceChart.vue`: the currency in the title becomes a `<select>` (options from the shared
  `/api/currencies` registry per `AGENTS.md` — never hardcoded; default = instrument base
  currency). Selecting a currency re-fetches the series with `?currency=` and renders the
  converted closes; title shows the *selected* currency; a small `fxFrom` caveat appears when
  `fxFrom` is inside the visible window ("FX rates from {fxFrom}; earlier bars in {baseCcy}").
- [ ] Comparison overlay: benchmarks (SPY/QQQ/IWM, USD) are fetched with `?currency=<selected>`
  too, so the overlay shares the selected currency; the §47 percent-normalization fallback remains
  only for genuinely unconvertible cases.
- [ ] `useCurrenciesStore` (or equivalent) already exists — wire the selector to it; verify no
  hard-coded currency list is introduced.
- [ ] Tests: unit for the selector→param mapping and the `fxFrom` caveat predicate; e2e (docker
  compose mock — extend the mock price endpoints to honor `?currency=`) asserting the title,
  converted axis, and caveat render.
- [ ] Commit (portfoliost).

### 48.5 — Closeout

- [ ] Deploy: push instruments + wallets `main` (GHA `v*` bump), pin new tags in
  `~/prv/homelab/.../pfire/<name>/app/helmrelease.yaml`; enable the new instruments FX CronJob and
  disable the wallets one; verify with kubectl.
- [ ] Verify in prod: (a) `instruments.fx_rates` holds the deep series; (b) `wallets.fx_rates`
  is gone and settlement still settles correctly; (c) `/api/currencies` served by instruments
  lists the full registry; (d) a PLN chart in USD shows converted closes with the selector;
  (e) portfolio history values unchanged.
- [ ] Update `openst-coverage.md` / price-data docs; archive §48 to `plan-archive.md`.

### 48.6 — Rewrite related proposals to the new architecture

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
