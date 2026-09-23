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

- [x] `portfoliost-contracts/contracts/openapi.yaml`: add `notes: { type: string,
  nullable: true }` to `Transaction` and to the transaction create/update request
  schema; document on `Transaction` that for `type: DIVIDEND`, `price` is the
  per-share gross, `quantity × price` is the gross, `taxes` is the withholding tax,
  and `totalAmount` is the **net** (gross − taxes) — the example-service convention (verified
  against the live API 2026-09-26). `taxes` also added (nullable) to
  `Transaction` + `CreateTransactionRequest` (it was only on cash/import schemas).
- [x] Push `main` → CI patch bump + publish; `gh release list --repo Marx2/portfoliost-contracts`
  to verify the tag. → **v1.6.33** (verified 2026-09-23).
- [x] Consumers: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>`
  in portfoliost-wallets, portfoliost **and portfoliost-admin** (admin also pins
  the contract for its typegen); `npm run gen:types` in each; commit
  locks + generated types (per-repo commits).
- [x] Tests: contracts suite green in `portfoliost-contracts/contracts/` (also
  wallets + admin suites green after the bump).
- [x] Commit (contracts + consumers).

### 49.2 — Wallets schema: `notes` column

- [x] `portfoliost-wallets/src/db/schema.ts`: add `notes: text("notes")` to the
  portfolio-transactions table; drizzle migration (nullable, no backfill — dev mode,
  portfolios rebuild on wipe & reimport if needed). → migration `drizzle/0005_special_professor_monster.sql`.
- [x] Tests: migration applies on a fresh PGLite; schema test updated; suite green
  (18 schema tests, 315 total).
- [x] Commit (portfoliost-wallets).

### 49.3 — Wallets API: accept taxes+notes, net totalAmount, real `/dividends`

- [x] `src/routes/portfolio-transactions.ts` POST `/:id/transactions`: extend
  `TransactionCreateSchema` with `taxes` (nullable number ≥ 0) + `notes`; for
  `type === "DIVIDEND"` compute `totalAmount = quantity × price − (taxes ?? 0)`
  (net — example-service convention; BUY/SELL untouched); validation: `taxes ≤ gross`
  (422 otherwise); persist `taxes` + `notes`; wallet credit already uses
  `quantity × price` → change to the **net** for DIVIDEND in `createWalletLink`.
- [x] PATCH `/:id/transactions/:txId`: same field handling + recompute
  (taxes change re-derives net totalAmount and wallet delta).
- [x] `GET /:id/dividends` (portfolios.ts:1048, currently a stub): implement from
  real DIVIDEND rows — items `{symbol, instrumentName, date, quantity, gross
  (=qty×price), taxes, amount (net), currency, exchangeRate, convertedAmount,
  notes}` sorted date desc + `totalDividends` (net, sum) + `count`; contract shape reuses a
  `DividendsData`-adjacent portfolio response (extend it in 49.1 if the
  current shape is insufficient — it currently only models instrument research
  rows, which is why the mock fakes it).
- [x] Tests: vitest round-trips — dividend with tax (net persisted, wallet credited
  net, `taxes > gross` → 422), dividend without tax (net = gross), notes
  round-trip, GET dividends aggregates + totals, BUY/SELL totals unchanged; full
  wallets suite green.
- [x] Commit (portfoliost-wallets).

### 49.4 — SPA: dedicated dividend dialog (example-service parity)

- [x]] New `RecordDividendDialog.vue` (does NOT reuse AddPositionDialog — different
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
- [x]] Wire the dialog into HoldingsTab (replace the kind="dividend" path through
  AddPositionDialog); submit to the existing POST with `taxes` + `notes`.
- [x]] EditTransactionModal: when the edited tx is DIVIDEND, surface the same
  gross/tax/notes fields (per-share display derived).
- [ ] Tests: unit for mode math (total↔per-share, net = gross − tax) +
  e2e (docker compose, mock updated in 49.7): record a dividend with tax in the
  per-share mode → transaction row shows DIVIDEND with net total, wallet balance
  credited net.
- [ ] Commit (portfoliost).

### 49.5 — SPA: portfolio Dividends tab + transactions table

- [x]] `PortfolioDividendsTab.vue`: render the real endpoint (49.3) — per-row
  symbol/date/gross/tax/net (with currency per row), totals; replace the current
  research-backed mock data source in prod (tab stays fed by the same endpoint in
  mock mode, now returning the same shape from real txs).
- [x]] `TransactionsTable.vue`: for DIVIDEND rows render the tax column when
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
