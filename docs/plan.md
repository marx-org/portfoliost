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
