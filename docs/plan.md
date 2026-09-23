# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

### 49.9 — Dividend calendar: ex-dividend + payment dates (provider tier, later)

Implements the dividend-calendar half of the portfolio/instrument calendar feature
(deferred from 49.6). Provider tier first per the standard step ordering;
follows the planner's openst→cachest→instruments→SPA sequence.

- [x] Probe: `obb.equity.calendar.dividend` rows + the dividend-history DataFrame
  (openst `get_dividend_history`) — capture which providers expose
  `payment_date` (vs ex-date only); save fixtures under
  `openst/tests/fixtures/`. One request per symbol, no automation.
  - Probed 2026-09-23 (AAPL, `docker compose run test`, one request per provider), raw
    captures in `openst/tests/fixtures/dividend-probe/` (`summary.json`, `gap-probe.json` + 3 CSV).
  - `equity.fundamental.dividends`: **yfinance → ex-date + amount only (NO `payment_date`)**, the
    current first-success winner; **nasdaq → `payment_date` + `record_date` + `declaration_date`
    present** (USD); **tmx → `payment_date` present but CAD amounts for AAPL → skipped**; fmp → 402
    premium (`limit > 5` blocked on the current plan); intrinio → "Results not found".
  - `equity.calendar.dividend`: **fmp AND nasdaq** both valid providers, rows already carry
    `payment_date` (raw columns pass through `_df_records` untouched) — calendar side needs no
    provider work; add nasdaq as CALENDAR_PROVIDERS fallback.
  - dividendmax is **not** an OpenBB provider (neither endpoint accepts it) — only fmp/intrinio/
    nasdaq/tmx/yfinance (history) and fmp/nasdaq (calendar); a dividendmax source would need a
    custom OpenBB plugin.
  - ⇒ openst step: pass `payment_date` through from nasdaq rows; to actually get payment dates in
    history, prefer **nasdaq** (or merge) before accepting the yfinance row, else `payment_date`
    stays null on the yfinance path.
- [x] openst: where the provider exposes it, add `payment_date` to
  `get_dividend_history` rows (`{"date", "amount", "payment_date"?}`) and pass
  calendar `dividend` rows through untouched (they already carry raw columns via
  `_df_records`); unit tests with fixtures; full openst suite green; compose smoke
  (curl one US dividend payer, cache HIT on second call).
  - Done 2026-09-23: `DIVIDEND_PROVIDERS` reordered **nasdaq-first** (the only history
    provider carrying `payment_date`; yfinance keeps its null path only in fallback);
    `CALENDAR_PROVIDERS = ["fmp", "nasdaq"]` (both pass `payment_date` through `_df_records`);
    row shape `{date, amount, payment_date?}` (`payment_date` present only when the
    provider supplies it). Unit tests incl. nasdaq-shape fixture + blocked/rate-limit
    provider-skip under the new order; suite 282/91/53 green; compose smoke on AAPL:
    `payment_date` in row + Redis cache HIT (1.13 s → 0.00 s).
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
