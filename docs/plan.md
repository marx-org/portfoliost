# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

### 49.9 — Dividend calendar: ex-dividend + payment dates (closed 2026-09-23)

Closed — full record (probe, openst, cachest, contracts, instruments, tests,
closeout) in `plan-archive.md` §49.9. Payment dates live in prod: openst
`v1.1.32`, instruments `v1.0.64`, SPA `v1.0.208`, contracts `@marx2/contracts`
`1.6.36` (homelab pin `fb1d762df`).

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

---

## 50. Dividend recording: example-service parity (closed 2026-09-23)

Closed — full record (50.1–50.8, incl. the 50.8 shared `DividendFields`
component) in `plan-archive.md` §50. SPA dividend dialogs at example-service parity
(record: Total/Per Share; edit: shared layout) and dead `AddPositionDialog`
dividend branch removed. Prod-verified 2026-09-23 on SPA `v1.0.206`
(homelab pin `6fd280808`); component conventions documented in
`docs/COMPONENTS.md` (see §51).

---

## 51. Document the SPA component conventions (docs/COMPONENTS.md)

Proposal: — (process doc, born from the §50.8 DividendFields extraction).

The reusable field-group components in `src/components/` (FeeFields,
FxRateFields, TransactionFormFields, DividendFields) follow a consistent
house style that was only discoverable by reading the code — §50.8 needed a
re-read of three components before the new one could be written consistently.
One short reference so future components (and agents) follow the style
without archaeology.

Rules: one step = one commit.

### 51.1 — Write docs/COMPONENTS.md + AGENTS.md pointer

- [ ] `docs/COMPONENTS.md` covering: where components live
  (`src/components/` shared primitives/field groups vs `src/modules/<domain>/`
  feature views & dialogs); SFC typing conventions (`<script setup lang="ts">`,
  typed `defineProps` with JSDoc, `defineEmits` with `update:x` events — the
  codebase does **not** use `defineModel`); the `testid` prop prefix +
  `const tid = props.testid ?? "default"` pattern; the `:value` + `@input`
  field-binding pattern; slots for parent-specific injections (e.g.
  `#before-summary`, `#after-toggle`, FxRateFields `#manual`); pure shared
  math exported from a plain `<script>` block (e.g. `dividendTotals`);
  styling rules (shared classes in `src/styles/main.css` — `card`, `input`,
  `label`, `btn-primary/secondary/ghost/danger` — always with `dark:`
  variants, `tabular-nums` for numbers); currency rules (code/symbol only via
  `useCurrenciesStore`, never hardcoded lists; FX math only via
  `@marx2/contracts/fx` per D27); logo convention (`/api/logos/${symbol}`
  img, `rounded-full bg-slate-100 dark:bg-slate-800`); testid stability (unit
  + e2e suites select on them — refactors must preserve them); test layout
  (`tests/unit/**` mirrors `src/`, e2e against docker compose,
  `npm run build|test|test:mock|test:e2e` gates).
- [ ] One-line pointer in `AGENTS.md` under "UI guidelines" →
  `docs/COMPONENTS.md`.
- [ ] Tests: none (doc-only; the full suite must stay green).
- [ ] Commit.

---

**§50 design decisions (resolved at planning):**
- **Deploy first, refine second** — v1.0.205 already ships the §49.4 dialog;
  the stale homelab pin (v1.0.193) is why prod still shows the
  `AddPositionDialog` dividend flow. 50.1 fixes that before any layout work.
- **Accent color stays the portfoliost theme** (blue primary) — parity covers
  layout/wording/behavior, not example-service's green branding.
- **Keep portfoliost extensions** — the `FxRateFields` block and the
  "Net (wallet ccy)" summary row stay (cross-currency support; no example-service
  counterpart in the reference).
- **Button copy** — "Enter a dividend amount" (empty) / "Record dividend ·
  N N Ccy" (filled) kept; example-service's filled-state copy isn't shown in the
  reference.
- **Out of scope** — dividend *editing* (`EditTransactionModal` dividend
  branch) is a separate flow; the hardcoded `:country="'US'"` on
  `AddPositionDialog` → `TransactionFormFields` (affects buy/sell, visible as
  the wrong "(US)" in the legacy screenshot) is a separate bug.

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
2. **dividendmax** — brand-new OpenBB provider plugin (OpenBB ships none, so this is
   the only way to source that vendor); requires a dividendmax API key (**paid plan** —
   budget/key decision is the user's; steps assume a key exists).

Planned coverage outcome: fmp/nasdaq keep covering US, biznesradar covers GPW
coupon/payment dates, dividendmax is a paid-quality fallback/enhancement.

Rules: one step = one commit.

### 52.1 — Fixture capture: biznesradar /dywidendy/

- [ ] ONE request (no automation): GET `https://www.biznesradar.pl/dywidendy/,2026,4,2`
  (sorted by payment date) + the same sort for the previous year (for "wypłacona"
  rows) → save raw HTML under `openst/tests/fixtures/biznesradar-dywidendy/`; record
  which columns are Premium-gated and the exact date format.
- [ ] Tests: none yet (capture step); fixtures are inputs to 52.2.
- [ ] Commit.

### 52.2 — biznesradar plugin: `calendar.dividend` on openbb_biznesradar

- [ ] `scraper.py`: fetch + parse the `/dywidendy/` table into rows
  `{ex_dividend_date~last-notowanie, payment_date, amount, status, symbol}` (Polish
  month-abbrev date parser added to the existing helpers); date-window filter applied
  client-side on the parsed rows.
- [ ] `models/calendar_dividend.py` + provider registration in the plugin `__init__.py`
  so `obb.equity.calendar.dividend(start_date, end_date, provider="biznesradar")`
  resolves; calendar rows map to the OpenBB `DividendCalendar` shape.
- [ ] Unit tests in `plugins/openbb_biznesradar/tests/test_calendar_dividend.py` against
  the captured HTML (mocked HTTP); full openst docker compose suite green (incl. the
  separate plugin pytest passes per the existing ImportPath collision pairing).
- [ ] openbb_client: append `"biznesradar"` to `CALENDAR_PROVIDERS` (after fmp/nasdaq).
- [ ] Commit.

### 52.3 — dividendmax fixture capture (API)

- [ ] Capture the real dividendmax API shape first (exact endpoints, auth header,
  date columns, pagination are UNKNOWN — do not guess): with a valid key, ONE request
  each for dividend history + the dividend calendar of one US payer; save raw
  JSON/CSV under `openst/tests/fixtures/dividendmax/`; record endpoint path, columns,
  and whether `payment_date`/`record_date`/`declaration_date` are returned.
- [ ] Confirm vendor TOS allows programmatic access for this use and that rate/quota
  fit the calendar window.
- [ ] Tests: none yet (capture step); fixtures are inputs to 52.4.
- [ ] Commit.

### 52.4 — dividendmax plugin package

- [ ] New `openst/plugins/openbb_dividendmax/` package: `__init__.py` registering the
  provider on `equity.fundamental.dividends` and `equity.calendar.dividend`, models/ +
  a network client for the captured endpoints; `OPENBB_DIVIDENDMAX_API_KEY` in
  `env.example`/`.env`.
- [ ] openbb_client: append `"dividendmax"` to `DIVIDEND_PROVIDERS` and
  `CALENDAR_PROVIDERS` (after nasdaq/fmp so it only serves as fallback until
  explicitly preferred).
- [ ] Unit tests in `plugins/openbb_dividendmax/tests/` against captured fixtures
  (mocked HTTP); full openst docker compose suite green.
- [ ] Commit.

### 52.5 — cachest

- [ ] `calendar.dividend` + dividend history are existing passthroughs — verify the
  fetcher preserves the biznesradar/dividendmax rows (quick check +
  `test_real_config_has_...`-style assertion if it does field filtering); full cachest
  suite green.
- [ ] Commit.

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
