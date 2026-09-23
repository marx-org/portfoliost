# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---


## 48. FX ownership → instruments (archived 2026-09-23)

Closed — full record (48.1–48.7, incl. 48.6e B1–B6) in `plan-archive.md` §48.
Open tail: none — B3/B4/B5 (+ summary cards, all-drawn cash weights) prod-verified 2026-09-23
on SPA v1.0.193 / wallets v1.1.46. §48 closed.

---

## 49. Dividends end-to-end: parity with example-service (2026-09-26, closed 2026-09-23)

Implemented end-to-end (§49.1–§49.8): wallets DIVIDEND taxes/notes + net totalAmount,
contracts 1.6.35, SPA dialog/Dividends tab/Tax column, currency chain, mock parity,
e2e. Gate green; deployed via homelab pin bump (`Marx2/homelab` f1730a46c: wallets
v1.1.50, instruments v1.0.63). Archived to `plan-archive.md`. Only the pending
§49.9 (dividend calendar) remains below; its text is unchanged and stays in place.

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

---

## 50. Dividend recording: example-service parity (deploy §49.4 dialog + close layout gaps)

Proposal: — (example-service parity per AGENTS.md; follow-up to §49).

Prod shows the **legacy** dividend flow — user screenshot "Dividend for SCW.WA"
with Purchase Date / Quantity / Price per share / Transaction Fees / Shares ×
Price / Total Cost. That is the `AddPositionDialog` stock step; the §49.4
`RecordDividendDialog` (example-service-style total/per-share, gross/tax/net) exists in
the repo but never reached prod: the homelab SPA pin is `v1.0.193` (recorded at
§48 close), while the §49 commits published `v1.0.194`–`v1.0.205` (HEAD =
v1.0.205). Two parts: (a) roll the SPA pin so prod actually has the §49
dialog, then (b) close the residual layout gaps between
`RecordDividendDialog.vue` and the example-service reference screenshots (dialog title,
header card with logo + "shares held", per-share two-column row, tax+date
two-column row, currency-symbol prefix, notes textarea, negative-tax/green-net
summary). SPA-only — no contracts, wallets, or provider-tier changes.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(build + unit + mock + e2e per AGENTS.md; deploy steps verified against the
admin UI instead).

---

### 50.1 — Roll the current SPA (v1.0.205) to prod; verify the §49 dialog is live

- [ ] Bump `ghcr.io/marx2/portfoliost` `tag` from `v1.0.193` to `v1.0.205` in
  `Marx2/homelab` (`cluster/apps/pfire/portfoliost/app/helmrelease.yaml`);
  Flux roll.
- [ ] Verify via Playwright on https://portfoliost.k.homylab.com → Admin →
  System that the running SPA version is `v1.0.205` (login: passkey).
- [ ] Manual prod check: portfolio → Holdings → position menu → **Dividend**
  opens the NEW dialog (Total/Per share toggle, "Cash portfolio",
  "Gross Dividend Amount", "Withholding Tax", "Date received", gross/tax/net
  summary) — NOT "Dividend for X" with Purchase Date / Price per share /
  Transaction Fees.
- [ ] Tests: none (deploy-only — verified via the Admin System version panel
  and the manual UI check above).
- [ ] Commit (homelab pin bump).

### 50.2 — Dialog title + header card parity

- [ ] `src/modules/portfolios/RecordDividendDialog.vue`: add the dialog title
  "Record dividend" in the header row (example-service: "Zapisz dywidendę"); new
  testid `dividend-title`.
- [ ] Header card: replace the initials box with
  `<img :src="`/api/logos/${position.symbol}`">` + initials fallback (same
  pattern as `AddPositionDialog` option step); symbol + `({position.country})`
  + asset-type pill from `position.assetType` (example-service: "MSFT ( US ) [Akcja]");
  company name; then a "Shares held: {position.quantity}" line below (example-service:
  "POSIA-DANE AKCJE: 31"); new testid `dividend-shares-held`.
- [ ] Tests: `tests/unit/modules/portfolios/RecordDividendDialog.test.ts` —
  title text present; "Shares held: 10" for the seeded position; asset pill
  renders the `assetType`. `npm run build` + `npm run test` green.
- [ ] Commit.

### 50.3 — Field layout parity (per-share row, tax+date row, currency prefix, notes textarea)

- [ ] `RecordDividendDialog.vue` per-share mode: two-column row —
  "Dividend per share" + "Shares receiving dividend" (number input, defaults
  to held quantity, editable; example-service: "Dywidenda na akcję" /
  "Akcje otrzymujące dywidendę" pre-filled with 31) — replacing the stacked
  "Shares" + "Dividend per share" fields. Testids `dividend-gross` and
  `dividend-shares` unchanged (e2e + unit depend on them).
- [ ] Currency display: prefix the money inputs (gross, per-share, tax) with
  the currency **symbol** from `useCurrenciesStore` (registry-driven per
  AGENTS.md; fallback: the code) instead of the trailing "USD" suffix
  (example-service: "$" inside the field).
- [ ] "Withholding Tax" + "Date received" in a two-column row (example-service:
  "Podatek u źródła" / "Data otrzymania dywidendy"); add an info tooltip to
  the tax label ("Tax withheld at source; subtracted from the gross amount").
- [ ] Notes: single-line `<input>` → `<textarea rows="3">` (example-service:
  "Notatki (opcjonalne)", multi-line). Testid `dividend-notes` unchanged.
- [ ] Tests: unit — per-share mode shows both column labels and
  `dividend-shares` defaults to the held quantity; notes element is a
  textarea; tax>gross block, net math, payload and FX tests unchanged and
  green. `npm run build` + `npm run test` + `npm run test:mock` green.
- [ ] Commit.

### 50.4 — Summary card parity (negative tax, green net)

- [ ] `RecordDividendDialog.vue` summary: tax row renders with a minus sign
  and red text when tax > 0 (example-service shows "-0,00 USD" in red); "Net Amount"
  row green + semibold (example-service: "Kwota netto"). Keep the cross-currency
  "Net (wallet ccy)" row — portfoliost extension beyond example-service.
- [ ] Tests: unit — gross 200 / tax 30 → tax row text starts with "-30.00"
  and carries the red class; net row carries the green class.
  `tests/e2e/dividends.spec.ts` still asserts `dividend-net` "80.00 USD"
  (unchanged). `npm run build` + `npm run test` green.
- [ ] Commit.

### 50.5 — Remove the dead dividend branch from AddPositionDialog

- [ ] `src/modules/portfolios/AddPositionDialog.vue`: drop `"dividend"` from
  `PositionAction.kind`; remove the "Dividend for {symbol}" title/aria-label
  branches, the "Record dividend for …" button-label branch, and the
  `DIVIDEND` txType / `txQty` handling in `submitStock` (the only entry point
  — Holdings position menu — has routed dividends to `RecordDividendDialog`
  since §49.4; this branch is unreachable).
- [ ] Grep the repo for remaining `kind === "dividend"` / `'dividend'`
  position-action references; `PortfolioHoldingsTab.vue` keeps its
  `ActionKind` (it drives the new dialog's `open` prop).
- [ ] Tests: `PortfolioHoldingsTab.test.ts` ("'Dividend' action opens
  RecordDividendDialog (not AddPositionDialog)") green; `npm run build`
  (vue-tsc catches any leftover reference) + `npm run test` green.
- [ ] Commit.

### 50.6 — Playwright parity diff vs example-service + e2e assertions

- [ ] Rebuild the dockerized stack (`docker compose up -d --build`); with
  Playwright, screenshot the new dialog in both modes (Total, Per share) and
  diff side-by-side against the example-service reference screenshots (title, header
  card, toggle, field order/labels, summary, buttons). Fix any residual
  cosmetic gaps found, in this same step if small.
- [ ] `tests/e2e/dividends.spec.ts`: add assertions — `dividend-title`
  "Record dividend"; `dividend-shares-held` shows the held quantity; per-share
  mode shows the "Dividend per share" + "Shares receiving dividend" pair;
  notes is a textarea; with tax > 0 the summary tax row shows a minus sign.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `npm run test:e2e` all green.
- [ ] Commit.

### 50.7 — Deploy final SPA + closeout

- [ ] Bump the homelab SPA pin to the new HEAD tag (includes 50.8); Flux roll;
  verify prod (Admin → System version; Holdings → Dividend dialog matches the
  example-service reference in both modes; editing a DIVIDEND row shows the parity
  layout).
- [ ] Archive §50 to `docs/plan-archive.md`.
- [ ] Tests: none beyond the 50.6 suite (deploy verified via the Admin System
  version panel + the prod UI check).
- [ ] Commit (homelab pin bump).

### 50.8 — Edit dividend transaction: example-service parity via shared DividendFields component

Added 2026-09-23 on user request — editing a DIVIDEND row still shows the
buy-style layout (Quantity / Price per share / Historical Price header).
User direction: **one form in both places** — extract the §50.2–50.4 field
layout into a shared component and use it in both
`RecordDividendDialog.vue` and `EditTransactionModal.vue` (non-dividend
branch of the edit modal untouched):

- [ ] New `src/components/DividendFields.vue` — toggle (Total / Per share),
  total-mode "Gross dividend amount" with registry currency-symbol prefix,
  per-share two-column row "Dividend per share" + "Shares receiving
  dividend" (editable), two-column row "Withholding Tax" (info tooltip) +
  "Date received", tax>gross inline error, notes `<textarea rows="3">`,
  summary card (gross / minus-signed red tax / green net + optional
  cross-currency converted-net row). v-models: per-share, gross-total,
  per-share-gross, quantity, taxes, date, notes (all strings); props:
  tx-ccy, ccy-symbol, testid prefix (record → `dividend`, edit → `edit-tx`
  — existing testids preserved), converted-net/converted-ccy (optional).
  Exports pure `dividendTotals(...)` helper (quant/gross/tax/net/price/
  taxExceedsGross) reused by both parents for payload math + submit gating.
- [ ] `RecordDividendDialog.vue` — replace its inline field block with
  `<DividendFields testid="dividend" .../>` (header card, wallet select,
  FxRateFields, submit footer stay). All `dividend-*` testids unchanged.
- [ ] `EditTransactionModal.vue` (dividend only): header card drops the
  "View chart / Historical Price" right block + the hardcoded "(US)" span,
  gains a "Shares: {quantity}" line; field block replaced with
  `<DividendFields testid="edit-tx" .../>` (testids `edit-tx-gross`,
  `edit-tx-shares`, `edit-tx-tax`, `edit-tx-notes`, `edit-tx-net` preserved —
  per-share mode reuses `edit-tx-gross` exactly like the record dialog's
  `dividend-gross`; `edit-tx-tax-total` added). Non-dividend layout
  (Purchase Date / Quantity / Price per share / Fees) unchanged.
- [ ] Wire: edit submit posts `quantity` + derived per-share `price`
  (per-share mode: price = per-share input; total mode: price = gross ÷
  quantity, 0 when quantity is 0) via `dividendTotals`.
- [ ] Tests: new unit spec
  `tests/unit/modules/portfolios/EditDividendTransaction.test.ts` — total
  mode prefills gross = qty×price and submits derived price; per-share mode
  edits price+quantity; tax>gross blocks + minus/red summary; notes textarea
  present; BUY layout still shows Quantity/Price/Fees (existing FeeFxDialogs
  suite green). RecordDividendDialog suite green without testid churn.
  `npm run build` + `npm run test` + `npm run test:mock` green.
- [ ] Commit.

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
