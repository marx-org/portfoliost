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

## 52. Additional dividend providers: biznesradar calendar + dividendmax plugin

Closed 2026-09-24 — biznesradar `CalendarDividend` (GPW coupon/payment
calendar, union-merged in openst `get_calendar`) + dividendmax
`HistoricalDividends` (key-free public-page scrape, fallback). Decisions:
dividendmax stays a fallback (nasdaq remains preferred for US); biznesradar
is the GPW coupon/payment calendar. Commits: openst 03b1ca5 / 6ce9ec0 /
8d898e9 / 4f0e40d / c53979b, cachest 9799638. Full record in
`plan-archive.md` §52.

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
