# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## 51. Document the SPA component conventions (docs/COMPONENTS.md)

Closed 2026-09-23 — `docs/COMPONENTS.md` + the `AGENTS.md` pointer are in
place (commit `367270e`, doc accuracy pass this closeout); full record in
`plan-archive.md` §51.

---

## 52. Additional dividend providers: biznesradar calendar + dividendmax plugin (optional, future)

Proposal: — (user note 2026-09-23 from the §49.9 probe: OpenBB ships no
dividendmax provider; openst currently covers payment dates via nasdaq).

Two provider extensions to enrich dividend/payment-date coverage beyond
nasdaq/fmp. Provider tier ordering per the standard step sequence; nasdaq-first
(from §49.9) stays the default until this section closes.

1. **biznesradar dividend calendar** — extend the EXISTING
   `openst/plugins/openbb_biznesradar` plugin to serve `equity.calendar.dividend`
   for the GPW market from `https://www.biznesradar.pl/dywidendy/` (no API key).
   Inspected 2026-09-23 via Playwright: table columns Profil (→ `/dywidenda/{sym}`) |
   Dywidenda za rok | Data WZA | Ostatnie notowanie z prawem do dywidendy (≈ ex-date) |
   Dzień wypłaty (payment date) | Dywidenda na akcję | Stopa dywidendy* | Status
   ("rekomendowana"/"uchwalona"/"wypłacona"); **only the yield column is Premium-gated**.
   Year selector is a path arg — `/dywidendy/,YYYY,{sortCol},{dir}`, sortCol 4 = Dzień
   wypłaty (gives a calendar-ordered page); dates are Polish short format "01 paź 26"
   (parse `DD MMM YY`, Polish month abbreviations).
2. **dividendmax** — brand-new OpenBB provider plugin for the dividendmax.com
   website. **Pivot 2026-09-24 (user decision): no paid API key exists, and the
   site serves everything publicly — scrape the public pages instead of a keyed
   API** (same posture as the biznesradar plugin). Resolution: public
   `GET /suggest.json?q={ticker}` (unauthenticated JSON → `path`); data: one
   `/dividends` page per security, full history table server-rendered, no
   pagination. TOS: personal non-commercial use, no reproduction/distribution —
   low-volume (2 polite requests per symbol, long cache) per house scraping
   convention. Steps below assume the key-free scrape design.

Planned coverage outcome: fmp/nasdaq keep covering US, biznesradar covers GPW
coupon/payment dates, dividendmax (public-page scrape, analyst-curated incl.
declaration dates) is a quality fallback/enhancement.

Rules: one step = one commit.

### 52.1 — Fixture capture: biznesradar /dywidendy/ (done 2026-09-24)

- [x] ONE request (no automation): GET `https://www.biznesradar.pl/dywidendy/,2026,4,2`
  (sorted by payment date) + the same sort for the previous year (for "wypłacona"
  rows) → save raw HTML under `openst/tests/fixtures/biznesradar-dywidendy/`; record
  which columns are Premium-gated and the exact date format.
  - Captured `dywidendy-2026.html` (207 data rows: 175 wypłacona / 29 uchwalona /
    2 rekomendowana / 1 empty) + `dywidendy-2025.html` (217 rows, all wypłacona),
    both from `/dywidendy/,YYYY,4,2` (sortCol 4 = Dzień wypłaty, dir 2).
  - Columns: `Profil` (link → `/dywidenda/{sym}`) | `Dywidenda za rok` (year int) |
    `Data WZA` | `Ostatnie notowanie z prawem do dywidendy` (≈ ex-date) |
    `Dzień wypłaty` (payment date) | `Dywidenda na akcję` (amount, "0,74 PLN" —
    comma decimal + PLN) | `Stopa dywidendy*` | `Status`.
  - Premium-gated: **only** `Stopa dywidendy*` — renders `<span class="paid-content
    paid-content--short">` anchor to /premium/brpremium. All other cells parse as
    plain text.
  - Date format: Polish short `DD MMM YY` (e.g. "05 sie 26", "28 wrz 26",
    "30 gru 26"); missing/not-yet cells are `bd.` inside `<span class="value--light">`.
  - Single `qTableFull` table (`class="table table--accent-header ..."`), no
    pagination on this page (all rows in one tbody).
- [x] Tests: none yet (capture step); fixtures are inputs to 52.2.
- [x] Commit.

### 52.2 — biznesradar plugin: `calendar.dividend` on openbb_biznesradar (done 2026-09-24)

- [x] `scraper.py`: fetch + parse the `/dywidendy/` table into rows
  `{ex_dividend_date~last-notowanie, payment_date, amount, status, symbol}` (Polish
  month-abbrev date parser added to the existing helpers); date-window filter applied
  client-side on the parsed rows.
  - `parse_pl_short_date` helper (validated over all 12 PL months in the fixtures)
    parses `DD MMM YY` → 2000+YY; `_parse_pln_amount` handles `0,74 PLN`;
    `_dywidendy_url(year)` builds `/,YYYY,4,2` (payment-date sort).
  - `scrape_dividend_calendar(start, end)` fetches one page per year in the window
    (single table, never paginated), keeps rows whose ex-/payment date falls within
    the window, drops date-less (`bd.`) rows; symbol = pre-paren Profil token.
- [x] `models/calendar_dividend.py` + provider registration in the plugin `__init__.py`
  so `obb.equity.calendar.dividend(start_date, end_date, provider="biznesradar")`
  resolves; calendar rows map to the OpenBB `DividendCalendar` shape.
  - `CalendarDividendFetcher` with `status` kept as a provider extra; default window =
  current year when start/end omitted; reversed window → empty list.
- [x] Unit tests in `plugins/openbb_biznesradar/tests/test_calendar_dividend.py` against
  the captured HTML (mocked HTTP); full openst docker compose suite green (incl. the
  separate plugin pytest passes per the existing ImportPath collision pairing).
  - 104 plugin tests green; full suite 282/104/53.
- [x] openbb_client: append `"biznesradar"` to `CALENDAR_PROVIDERS` (after fmp/nasdaq).
- [x] Commit (openst 6ce9ec0).

### 52.3 — dividendmax fixture capture (done 2026-09-24 — scrape, not API)

- [x] Capture the real dividendmax shape first (endpoints/auth/date columns/pagination
  were UNKNOWN — do not guess). No paid API key exists, and the site is fully
  public, so per the 2026-09-24 user decision we captured the PUBLIC pages:
  ONE request each for `GET /suggest.json?q=aapl` and `q=vodafone` (resolution) +
  the `/dividends` page of one US payer (AAPL) and one UK payer (VOD). Saved raw
  under `openst/tests/fixtures/dividendmax/` (`summary.json` records it all).
  - **Resolution endpoint:** `GET /suggest.json?q={query}` → unauthenticated
    `[{search, id, name, ticker, flag, image, path}]`. Partial name matches are
    included (q=aapl → AAPL **and** APLY), and one ticker can map to multiple
    listings (q=vodafone → VOD UK plc + VOD US ADR). So resolve by
    **exact `ticker == query`** and prefer the US listing on ties.
  - **History table:** `table[aria-label='Declared and forecast {NAME}
    dividends']` (class `mdc-data-table__table`). 9 columns: Status | Type |
    Decl. date | Ex-div date | Pay date | Decl. Currency | Forecast amount |
    Decl. amount | Accuracy. No pagination — full history (~20 yrs of Paid rows)
    plus ~5 forecast years in one page.
  - **Dates:** `DD Mon YYYY` English (e.g. `31 Oct 2030`); missing = `–` (en dash).
  - **Amounts:** subunit notation — `265c` / `4.5¢` (US cents) / `7.77p` (pence);
    divide by 100. `Sign up` = forecast amount gated (irrelevant for Paid rows);
    `—` = None. Use **Decl. amount** for Paid rows.
  - **Currency** is per-row (`Decl. Currency`; EUR/GBP/USD seen on Vodafone).
  - **Returned fields:** `ex_dividend_date` ✓, `payment_date` ✓,
    `declaration_date` ✓, `record_date` ✗ (not present).
  - **TOS:** personal non-commercial use only, no reproduction/distribution —
    we do 2 polite requests per symbol with a long cache (house scraping
    convention, cf. biznesradar). Site is Cloudflare + reCAPTCHA v3 guarded on
    interactive routes, but both scrape targets answer 200 with a plain Mozilla UA.
- [x] Tests: none yet (capture step); fixtures are inputs to 52.4.
- [x] Commit.

### 52.4 — dividendmax plugin package (scrape design) (done 2026-09-24)

- [x] New `openst/plugins/openbb_dividendmax/` package: `__init__.py` registering the
  provider on `equity.fundamental.dividends` (model key `HistoricalDividends`;
  **NOT on `equity.calendar.dividend` — that query carries no symbol and
  dividendmax has no public cross-company calendar page, only per-company
  history; the site's cross-company "Countdown" calendar is Premium**), models/ +
  a network client for the captured public endpoints (`/suggest.json?q=` resolution
  with exact-ticker + US-preferred disambiguation, then the `/dividends` history
  table; English `DD Mon YYYY` dates, subunit amount notation, per-row currency,
  `–`/`Sign up`/`—` handling; **Paid rows only** — Forecast amounts are
  "Sign up"-gated and the standard model requires an amount); politeness delay +
  `DIVIDENDMAX_FETCH_DELAY_S` env like biznesradar. No API key (key-free public
  scrape, 52.3).
  - `client.py`: `parse_en_date`, `parse_subunit_amount` (`265c`/`4.5¢`/`7.77p`
    → /100, rounded 4dp), `resolve_path` (exact ticker; `VOD.L`-style dot-prefix
    fallback; US listing preferred on ties), `scrape_dividend_history` (2 polite
    requests, 1 s default delay).
  - `HistoricalDividendsData` extras: `payment_date`, `declaration_date`,
    `currency`, `dividend_type`, `status`.
  - Wired: `requirements.txt` (`-e ./plugins/openbb_dividendmax`), Dockerfile
    test CMD (4th plugin pytest invocation — ImportPath collision pairing).
- [x] openbb_client: append `"dividendmax"` to `DIVIDEND_PROVIDERS` (after
  nasdaq/fmp/intrinio so it only serves as fallback until explicitly preferred).
  **Not** added to `CALENDAR_PROVIDERS` — the calendar query has no symbol, so a
  per-company-page provider can't serve it (recorded in 52.6).
  - 2 client tests that pinned `call_count == 4` now assert
    `len(DIVIDEND_PROVIDERS)`.
- [x] Unit tests in `plugins/openbb_dividendmax/tests/` against captured fixtures
  (mocked HTTP); full openst docker compose suite green.
  - 21 new plugin tests; full suite 282/104/53/21.
  - Live e2e verified in the test container: `obb.equity.fundamental.dividends(
    "AAPL", provider="dividendmax")` → 58 rows with `payment_date`/
    `declaration_date`/`currency` (2011–2026).
- [x] Commit (openst 4f0e40d).

### 52.5 — cachest (done 2026-09-24)

- [x] `calendar.dividend` + dividend history are existing passthroughs — verify the
  fetcher preserves the biznesradar/dividendmax rows (quick check +
  `test_real_config_has_...`-style assertion if it does field filtering); full cachest
  suite green.
  - Quick check: `OPENST_CALENDAR_DIVIDEND` (`/calendar/dividend`) and
    `OPENST_DIVIDENDS` (`/dividends/{ticker}`) carry **no** `json_field` and **no**
    `extract.selector` in `config.yaml` — the upstream JSON body is cached and
    returned byte-for-byte, so the new provider extras (dividendmax
    `currency`/`dividend_type`/`declaration_date`; biznesradar `status`) pass
    through untouched. The §49.9 `test_real_config_has_dividend_{calendar,history}_route`
    tests already pin `not route.extract.selector` + `json_field == ""` on both
    routes.
  - Added `test_fetch_json_passthrough_keeps_dividendmax_and_biznesradar_fields`
    (byte-for-byte passthrough of rows carrying the §52 extras).
  - Full cachest compose suite green: 85 passed.
- [x] Commit (cachest 9799638).

### 52.6 — Closeout

- [ ] Re-run the §49.9 probe comparison (biznesradar GPW + dividendmax vs nasdaq/fmp
  payment-date coverage); decide whether dividendmax becomes the preferred history
  source and biznesradar the GPW coupon/payment calendar.
- [ ] Archive §52 to `plan-archive.md`.

---

## 53. Main-page portfolio cards: stale charts, MWR overflow, current_value, snapshot FX (investigated 2026-09-23 in PROD)

Proposal: — (investigation, no proposal doc — see "Findings" below).

The investments-page portfolio cards (`PortfolioCard.vue`) render sparklines from the
same `/api/portfolios/:id/analytics` data as the performance tab, but four distinct
defects make them look wrong/stale in PROD:

**Findings (verified against the homelab cluster, 2026-09-23):**

1. **Card sparkline never re-renders after mount.** `PortfolioCard.vue` binds the
   vue3-apexcharts `options` from a stable cached computed and lacks the `:key`
   remount fingerprint that `PortfolioPerformanceChart.vue` already carries
   (§48.6e B3 — prop updates are not pushed into the running instance in this
   stack). Timeframe clicks and 5 s backfill-poll updates may leave the initial
   series on screen.
2. **MWR overflow kills backfill → `Crypto` permanently stuck on "Loading chart…".** `portfolio_backfill_metadata` for Crypto: status `failed`, error
   `numeric field overflow` — `buildMwr`'s XIRR Newton solver diverges for
   near-zero-capital / one-sided-flow histories and "converges" to a garbage rate;
   `Math.pow(1+r, t)` then produced `cumulative_mwr ≈ 1.01e12` into a
   `numeric(20,8)` column (`returnColumns.ts`). The card polls only on
   `backfillStatus === "pending"`, so `failed` shows "Loading chart…" forever with
   no diagnostics.
3. **`portfolios.current_value` is never maintained** — all 10 portfolios are 0, so
   every card shows "Value $0.00 · Return 0.00%" while the chart ends at real
   values.
4. **Two pipelines write `value_snapshots` with different FX rules.** Backfill
   (`backfill.ts`) fetches closes server-side converted into the portfolio base
   currency (plan §48.3); snapshot-on-read (`quotes.ts` `snapshotPortfolioValue`)
   sums `positions.market_value × fx(instrument_currency→base)`, but the live-quote
   path stores `current_price`/`market_value` in the **quote's native price
   currency, unconverted** (§39). PROD proof (IBKR): TSM lot `current_price 452.00`
   (USD close, matches `price_bars_all`) with `instrument_currency=USD` and MV 4 068 —
   while the backfill valued the same day at 199 983 PLN, snapshot-on-read wrote
   251 782 PLN (+26%, pure FX inconsistency between the two pipelines' price/rate
   resolution). That 2026-09-23 row is what both charts now end on.

Repos touched: `portfoliost-wallets` (53.1–53.2, 53.5–53.7), `portfoliost` SPA
(53.3–53.4). No provider-tier (openst/cachest/instruments) work.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level).

### 53.1 — wallets: guard MWR (and XIRR) against divergence

- [ ] `src/services/returnColumns.ts`: `xirr()` returns `null` when the result is
  non-finite or outside a sane band (|r| > 10); `buildMwr` then takes its existing
  `buildSimple` fallback (it already does — the guard makes it reachable).
- [ ] Unit tests in `returnColumns.test.ts` (create if absent, else extend):
  (a) the Crypto-shaped case — small capital + one large deposit whose XIRR would
  exceed the band → every `buildMwr` output is finite and |v| < 1e12 (column-bound
  regression); (b) a healthy mixed-flow case still yields a real MWR (no
  regression to the fallback).
- [ ] Full wallets suite green (`npm run test`); `npm run build` clean.
- [ ] Commit.

### 53.2 — wallets: widen cumulative columns + reimport PROD

- [ ] Belt-and-braces: change `cumulative_twr/mwr/simple` from `numeric(20,8)` to
  `numeric(28,8)` in `src/db/schema.ts`; `npm run db:generate` → migration SQL
  committed alongside.
- [ ] Migration applies in dev docker-compose without error; wallets suite green.
- [ ] PROD: **user-approved wipe & reimport** of the wallets DB (Admin → Jobs →
  "Wipe & Reimport", `portfoliost-sheets-sync`), then verify
  `portfolio_backfill_metadata` shows `complete` for **all** portfolios (incl.
  Crypto) and no `numeric field overflow` in the error column. (Requires explicit
  user approval at execution time — homelab mutation.)
- [ ] Commit (schema + migration).

### 53.3 — SPA: card chart remount + failed-backfill state

- [ ] `src/modules/portfolios/PortfolioCard.vue`: add the `chartKey` remount
  fingerprint (copy the pattern + comment from
  `src/components/PortfolioPerformanceChart.vue`) to the `<apexchart>` so timeframe
  switches and poll updates repaint the running instance.
- [ ] Handle `analytics.backfillStatus === "failed"`: render "Chart unavailable"
  + a small **Recompute** button (existing `recomputePortfolio` API) instead of the
  eternal "Loading chart…"; stop the pending-only poll assumption.
- [ ] Vitest: the chart key changes when the series fingerprint changes (same
  assertions as the shared component's tests).
- [ ] Playwright e2e (docker-compose stack): on the investments page, click 6M→1Y
  on a card and assert the remount (canvas key/replacement or series count
  change); `npm run test:e2e` green.
- [ ] `npm run build`, `npm run test`, `npm run test:mock`, `npm run test:e2e`
  green; commit.

### 53.4 — Decision recorded: card sparkline stays shape-only, no FX conversion

- [ ] No code change (user decision 2026-09-23): the card sparkline renders the
  series shape only — no value labels, no tooltip (already the case: `dataLabels`
  off, `tooltip.enabled=false`). It is therefore not converted to the display
  currency; no numbers on the card are mislabeled by it. The numeric Value/
  Invested/Return row is fixed by 53.5 instead.
- [ ] Assert in 53.3's vitest/e2e that the sparkline renders no text/tooltip
  (guards against a later "nice to have" re-introducing unconverted numbers).
- [ ] Commit (test-only).

### 53.5 — wallets: maintain `portfolios.current_value` from the latest snapshot

- [ ] In the history-write paths (`backfill.ts` `runBackfill`/`recalcPortfolioHistory`
  after the batch is committed, and `quotes.ts` `snapshotPortfolioValue` after its
  upsert), set `portfolios.current_value` = the newest `value_snapshots.value` for
  that portfolio (1-day-old is acceptable — user decision 2026-09-23). Factor into
  one small exported helper (`syncCurrentValueFromSnapshots(db, portfolioId)`) and
  call from both sites.
- [ ] Unit tests: after a backfill/recalc the column equals the last snapshot
  value; after a snapshot-on-read upsert it equals the new row; a portfolio whose
  history is cleared (all txs removed) → `current_value` 0.
- [ ] Existing detail/summary surfaces that read `currentValue` keep behaving
  (no contract change — column already exists in the schema/contract).
- [ ] Full wallets suite green; commit.

### 53.6 — wallets: unify snapshot-on-read FX with the backfill rule

- [ ] In `quotes.ts`: when accumulating `liveValues` for `snapshotPortfolioValue`,
  carry the quote's own currency (`quote.currency`, already fetched, §39-validated
  ISO code). In `snapshotPortfolioValue`, convert each leg as
  `mv × fx(quoteCurrency → base)`; when no live quote exists (fallback branch) use
  the position's stored `market_value` with `fx(instrument_currency → base)` as
  today (stored MVs on fallback are the legacy native-mixed values — document the
  residual).
- [ ] Unit test (the regression that motivated this): a portfolio with one USD
  lot (quote currency USD) + one PLN-denominated base lot, base currency PLN →
  `snapshotPortfolioValue` output equals what `computeSnapshotBatch` produces for
  the same fixtures (pipeline-agreement test).
- [ ] Full wallets suite green; commit.

### 53.7 — Closeout

- [ ] Dev docker-compose smoke: seed a multi-currency portfolio, trigger backfill
  + a quote refresh, assert same-day snapshot value is stable (53.6) and
  `current_value` tracks the latest snapshot (53.5).
- [ ] PROD (after 53.2's reimport, with user approval): Playwright against
  `https://portfoliost.k.homylab.com` — card sparklines repaint on timeframe
  click, no "Loading chart…" stuck cards, card Value matches the chart end value
  (±1 day), Crypto card shows a chart.
- [ ] Archive §53 to `plan-archive.md`.

---

## 54. Portfolio calendar: month grid over holdings' event calendars (example-service parity)

Proposal: — (user request 2026-09-24; no proposal doc — example-service parity per AGENTS.md).

The instrument calendar (research page, §49.9) is live; the portfolio
**Calendar** tab is a flat Upcoming/Recent events *table* fed by
`GET /api/portfolios/:id/calendar` — the wallets route is a stub
(`c.json({ events: [] })`), and the SPA's `PortfolioCalendarTab.vue` renders
`upcoming`/`past` shapes the real endpoint never returns. Example service's
portfolio calendar (inspected live 2026-09-24, `/pl/portfolios/<id>/calendar`) is
a **month grid**: toolbar `Calendar ‹ May 2026 › | Impact | All events ▾ | Today`,
SUN–SAT columns, day cells with small event chips (e.g. `AAPL Ex-Div: $0.26`),
and a premium gate. Parity target: the month grid over the portfolio's
holdings' events, **not gated** (AGENTS.md: premium features ship as working
content). Event source = fan-out to the per-instrument calendar that §49.9
shipped (openst/cachest/instruments unchanged — no provider-tier work).

Repos touched: `portfoliost-contracts` (54.1), `portfoliost-wallets` (54.2),
`portfoliost` SPA + mock (54.3–54.5). The mock endpoint
(`mocks/portfolios/index.js` `loadResearch`-based) already serves the flat
upcoming/past shapes and is kept unchanged (54.1's shape stays additive).

Example service observations to keep honest (2026-09-24 capture in
`/tmp/example-service_pf_calendar.png`): the "All events" dropdown also mixes in
macro-economic events (ISM, CPI, FOMC…) and holidays (Memorial Day) — those
are NOT holdings events; we render holdings events only (decision, see
Open question 3). Chip format is `SYMBOL <Type>: <amount in instrument ccy>`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level).

---

### 54.1 — contracts: per-holding calendar in `CalendarData`

- [ ] `contracts/openapi.yaml` — `CalendarData` gains `holdings` (additive;
  `upcoming`/`past` stay for the mock and any flat consumers):
  ```yaml
  holdings:
    type: array
    items:
      type: object
      required: [symbol]
      properties:
        symbol: { type: string }
        companyName: { type: string }
        currency: { type: string }
        earnings:   # same item shape as CalendarData.earnings
        exDividend: # same item shape as CalendarData.exDividend
        dividend:   # same item shape as CalendarData.dividend
  ```
  (item shapes reuse the existing `earnings`/`exDividend`/`dividend` item
  objects verbatim — factor into named sub-schemas if the spec tooling
  requires it; wallets/SPA types are contract-typed per AGENTS.md, no local
  redefinitions.)
- [ ] Push → CI patch-bumps → `NODE_AUTH_TOKEN=$(gh auth token) npm install
  @marx2/contracts@<new>` in `portfoliost` + `portfoliost-wallets` →
  `npm run gen:types` (SPA) / regenerate (wallets) → contracts suite green.
- [ ] Tests: contracts suite (`npm test` in `portfoliost-contracts/contracts/`).
- [ ] Commit (contracts) + consumer bumps (one commit per repo).

### 54.2 — wallets: real `GET /:id/calendar` via instruments fan-out

- [ ] New `src/services/portfolioCalendar.ts` — clone the `portfolioNews.ts`
  pattern: `getPortfolioSymbols` (distinct open positions) + per-symbol
  `fetch(`${INSTRUMENTS_URL}/api/instruments/${symbol}/calendar`)` (bounded
  fan-out, `Promise.allSettled`, per-symbol failure → skip symbol, never 500;
  pass through `Authorization`).
- [ ] `src/routes/portfolios.ts` `/:id/calendar`: return `holdings` shape from
  the service (each entry: `symbol`, `companyName` (from `positions`),
  `currency` (from the instruments calendar response — the §47.5 resolved
  instrument currency, no fallback), and the three arrays within the
  instruments window; symbols whose fetch failed are omitted). Keep the
  endpoint `200` with `holdings: []` when the portfolio has no open
  positions or instruments is unreachable.
- [ ] Unit tests (`portfolioCalendar.test.ts`, mocked `fetch`): (a) two symbols
  → two holdings with their arrays + currencies; (b) one fetch 502 → that
  symbol omitted, others intact; (c) no open positions → `holdings: []` and
  zero fetches; (d) `INSTRUMENTS_URL` unset → `holdings: []` (1:1 degrade,
  same rule as `instruments-fx.ts`).
- [ ] Full wallets suite green (`npm run test`) + `npm run build`.
- [ ] Commit.

### 54.3 — SPA: month-grid `PortfolioCalendarTab` (example-service layout)

- [ ] Rewrite `src/modules/portfolios/PortfolioCalendarTab.vue` as the example-service
  month grid (per `docs/COMPONENTS.md`): toolbar row inside a `card` —
  "Calendar" label, ‹/› month buttons, "May 2026"-style month label, an
  event-type filter ("All events" / "Earnings" / "Ex-Dividend" / "Dividend
  payment" — plain `<select class="input">`, `testid="pf-cal-filter"`), and a
  **Today** button (`btn-secondary`). Grid: `grid-cols-7` header SUN–SAT +
  42 day cells (6 weeks; prev/next-month days muted); today outlined; event
  chips per day (max ~3 visible + "+N more"; chip = `SYMBOL <Type>: <amount>`
  with `tabular-nums`, amounts formatted via `formatAmount(amount,
  holding.currency)` — instrument ccy, never converted). Chip colors per type
  (earnings = blue, ex-dividend = amber, dividend payment = green — same
  mapping as today's `badgeClass`, with `dark:` variants). Clicking a symbol
  chip links to `research-overview` (existing pattern). Empty state: grid
  still renders; below it "No events in this month." testids: `pf-cal-prev-month`,
  `pf-cal-next-month`, `pf-cal-today`, `pf-cal-grid`, `pf-cal-filter`; the
  old table testids are dropped with the table — update
  `tests/e2e/portfolios.spec.ts` calendar expectations in the same commit.
- [ ] Flat-shape compat: if `holdings` is absent (mock returns
  `upcoming`/`past`) the component derives holdings-shaped data from the flat
  arrays (group by symbol; no `currency` → omit amount) so the mock-backend
  dev path and 54.3's unit tests work without the real endpoint. The mock
  itself is untouched.
- [ ] Vitest (`tests/unit/modules/portfolios/PortfolioCalendarTab.test.ts`):
  month navigation (prev/next changes the month label + rendered day set),
  Today resets, filter hides other types, chip count cap + "+N more",
  flat-shape derivation path.
- [ ] `npm run build` + `npm run test` + `npm run test:mock` green; commit.

### 54.4 — E2E: calendar grid on a seeded portfolio (compose stack)

- [ ] Playwright (docker compose, real wallets + live instruments): open a
  seeded portfolio → Calendar tab → expect `pf-cal-grid` with 42 day cells
  and the "All events" select; ‹/› navigation changes the month label; if
  the provider stack yields no rows for the seeded holdings (fmp-only,
  §49.9 fragility) the month still renders + empty state (no hard failure —
  same provider-skip convention as `research.spec.ts` chart tests); when
  rows exist, at least one chip is visible and links to research.
- [ ] `npm run test:e2e` green; commit.

### 54.5 — Closeout

- [ ] Dev docker-compose smoke: seeded multi-holding portfolio → real
  endpoint returns `holdings` for ≥1 symbol with the instruments currency;
  grid renders its chips on the right days (verify dates by hand once —
  ex-date chips on `exDividend` rows, not payment dates).
- [ ] PROD (with user approval if a SPA pin bump is needed): Playwright
  against `https://portfoliost.k.homylab.com` — Calendar tab shows the month
  grid (not the table), navigation works, no paywall.
- [ ] Archive §54 to `plan-archive.md`.

**Open questions (answer before steps run — they block 54.1/54.3):**

1. **"Impact" toggle** — example-service shows it but gates it behind premium with no
   visible meaning. Ship it as a disabled decoration (plan default), drop it,
   or define behavior now (e.g. chip shows the event's impact on portfolio
   value — needs position quantity × amount)?
2. **Amount currency** — chips show the amount in the *instrument's*
   currency (example-service does; e.g. `$0.26` for a EUR portfolio). Confirmed OK,
   or convert to the portfolio base ccy (D27, quantity × amount)?
3. **Macro events + holidays** — example-service mixes in economic data (ISM, CPI,
   FOMC) and holidays. Plan default: **no** (holdings events only — no
   provider tier exists for macro). Confirm.
