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
    captures in `openst/tests/fixtures/dividend-probe/` (`summary.json` + 3 CSV).
  - `equity.fundamental.dividends`: **yfinance → ex-date + amount only (NO `payment_date`)**, the
    current first-success winner; **nasdaq → `payment_date` + `record_date` + `declaration_date`
    present**; fmp → 402 premium (`limit > 5` blocked on the current plan); intrinio → "Results not found".
  - `equity.calendar.dividend` (fmp): rows already carry `payment_date` (raw columns pass
    through `_df_records` untouched) — calendar side needs no provider work.
  - ⇒ openst step: pass `payment_date` through from nasdaq/yfinance rows; to actually get
    payment dates in history, prefer **nasdaq** (or merge) before accepting the yfinance
    row, else `payment_date` stays null on the yfinance path.
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
