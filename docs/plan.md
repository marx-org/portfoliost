# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then
archived. This file holds **only unfinished work**; everything completed,
superseded or obsoleted lives in `plan-archive.md`.

Some steps below cite an earlier section by number for provenance (e.g. "the
bar established in §63.13"). Those citations may point into `plan-archive.md` —
the RCA they refer to is preserved there in full.

Legend: `[ ]` pending · `[x]` done (a `[x]` only ever appears in a step that
also still has `[ ]` work; fully finished steps are archived)

**Start at [§78 — Everything that needs YOU](#78-everything-that-needs-you-2026-10-01).**
It is the only section whose items block other work, and the only one I cannot
progress on my own: three spreadsheet edits and two decisions. Everything else
here is mine to pick up.

---

## 78. Everything that needs YOU (2026-10-01)

Consolidated from the places it was scattered. Four items, all of them actions
only the portfolio owner can take — three are edits to the source spreadsheet, one
is a decision. Nothing here is a queue I can grind through, and each one blocks
work that is otherwise ready.

**Everything below this line needs no `--wipe`.** The wipe ran today at 14:16 UTC
and the incremental import reports `inserted=0 skipped=2368`, so the database is
already exactly what the sheet says. Adding rows and re-running the *incremental*
sync is sufficient: §69.3 re-backfills every portfolio the import touched, from
the first trade, with nobody pressing Recompute.

Admin → Jobs → "Sync sheet" (the incremental one, **not** "Wipe & Reimport").

### 78.1 — XTB: add one `Wpłata` row. Until then its history is offset.

XTB's value series goes **negative** — `9.49 → −4.04` on 2022-02-17, a −142.6%
single-day "move" that is the worst in the system. §72.35 read the sheet
in-cluster and proved the import is not at fault: the funding row does not exist.
`Typ` counts per Konto show XTB with `Kupno=5 Sprzedaż=5 Div=12` and **no
`Wpłata` and no `Wypłata` at all**, and the `Gotówka` sheet has no XTB column
either, so the funding was never recorded anywhere.

One row, dated **on or before 2022-02-11**:

| column | value |
|---|---|
| `Typ` | `Wpłata` |
| `Aktywo` | `Gotówka XTB` |
| `Ilość transakcyjna` | `2716,60` |
| `Cena transakcyjna jednostki (PLN)` | `1,00 zł` |
| `Wartość transakcji (PLN)` | `2 716,60 zł` |
| `Waluta transakcji` / `Kurs waluty transakcji` | `PLN` / `1,00 zł` |
| `Konto` | `XTB` |
| `wpłata/wypłata` | `1` |

**2 716,60 PLN is exact**: the sum of XTB's five buys (568,20 + 396,97 + 446,74 +
434,75 + 869,94) against 2 957,88 PLN of sales — a real +241,28 PLN realised,
which the ledger currently reports as −56,50.

**`wpłata/wypłata` must be `1`.** Despite the name the importer reads that column
as the **AU flag**, and `parseRow` *throws* on a `Wpłata`/`Wypłata` row whose AU
flag is 0 — the whole import aborts. So a plausible-looking `0` there costs you
every row in the sheet, not just this one.

- [ ] Add the row above, re-import, confirm the unfunded-portfolio finding clears
      and `invested` stops being 0
      > **Then:** I re-measure XTB's worst single-day move (flow-adjusted) and
      > re-run §65.1's −25% bar across all ten.
- [ ] Decide whether XTB's `Gotówka` column should exist at all
      > Not blocking. The recon (§63.4) derives cash from the ledger, so the row
      > above is sufficient; a `Gotówka XTB` column would only make the recon
      > cross-checkable for this one account.

### 78.2 — IBKR / IKE Marek / IKE Beata: the Transakcje rows are missing, not Gotówka

§63.4 replaced the old per-day report with one comparable number per account, and
that is where this stands (measured today, unchanged since this afternoon):

| account | derived | sheet's last row | Δ | direction |
|---|---|---|---|---|
| IBKR | 24 741,35 | 6 006,42 | **+18 734,93** | app knows money the sheet does not |
| IKE Beata | 4 442,52 | 3 032,89 | **+1 409,63** | same |
| IKE Marek | 961,87 | 4 951,85 | **−3 989,98** | **reverse** — the sheet has ~4k the app does not |

**This is two different problems wearing one number, which is why it cannot be
closed by watching a figure approach zero.** IBKR and IKE Beata are missing
`Transakcje` inflow/outflow rows. IKE Marek is the opposite: the sheet's balance
runs ~4k *ahead* of what the ledger can explain, so something is recorded there
that the app never saw.

Note the old report's numbers were meaningless — it reported `recon =
−368,300.77` on IBKR, which was never a balance but the sheet's own `cashFlow`
column replayed onto a `Gotówka` anchor the flows do not belong to, summed over
full history. A check reporting a figure about itself.

- [ ] Add the missing Transakcje rows for IBKR and IKE Beata
      > **Then:** I re-run the dry sync and confirm both deltas fall toward zero.
- [ ] **IKE Marek is the one to look at first** — a *negative* Δ means the sheet
      records money the app has no record of. That is not a missing row; it is a
      row whose `Typ`/`Aktywo` the importer does not read as a deposit. Give me
      the Gotówka series for that account and I will find which row it is rather
      than you hunting for it.
      > This is the single most useful thing in this section: it is the one item
      > where I can do the work once you hand me the numbers.

### 78.3 — Six PL government bonds 404 upstream. Decide: hunt, or accept and label.

Six PL bonds (`BST0322`-style SKMs) return 404 from every configured provider.
The price-audit lists 11 more that "have no bars" — mostly these plus MPW/WBA
(delisted, correctly) and the `.TFI` funds.

**Their pre-sale history is understated by a known-unknown amount**, and §72.31's
`gapSymbols` is the only thing marking it.

- [x] **Decide: find a source that carries them, or accept the partial sum and
      make the UI say so**
      > **Accepted 2026-10-01**, and the hunt is impossible rather than deprioritised:
      > the feed discards matured instruments *and their history*. `BST0327` (matures
      > Mar 2027) has **427** bars; `BST0922` (matured Sep 2022) has **0**, though it
      > traded across 2021–22. All 8 are Polish **government** retail bonds, and
      > carrying them at cost (§72.21) is near-correct since they were redeemed.

### 78.4 — Add a CI job that runs the test suite, across all five repos

Not a spreadsheet item, but it is yours to decide and it is the only open item
that needs a judgement rather than data.

**No CI in any of the five repos runs `npm test`.** Every workflow is release +
build + push; the Dockerfile runs `npm run build` (tsc) but not the suite.
Wallets' entire CI history has two workflow names. So the suite has only ever run
on this machine.

- [ ] **Add `npm test` (and `npm run test:mock` where the repo has one) on every
      PR, for all five repos**

### 78.5 — Then verify, once the rows land

**Folded in from §65.1, which had no open work of its own left.** The two halves were
split the wrong way round: the owner's action and the check that confirms it are one
chain, and separating them meant §65 sat open with nothing anyone could do. §65's
remaining three steps are here; §65 is archived.

**No `--wipe`.** The wipe ran 2026-10-01 14:16 UTC and the incremental sync then
reported `inserted=0 skipped=2368`, so the database is already exactly what the sheet
says. Adding rows and re-running the *incremental* sync is sufficient — §69.3
re-backfills every portfolio the import touched, from the first trade, with nobody
pressing Recompute. Admin → Jobs → "Sync sheet" (not "Wipe & Reimport").

- [ ] **Re-run the Gotówka recon and confirm all three deltas move toward zero**
      > §65.1. Today: IBKR **+18 734,93**, IKE Beata **+1 409,63**, IKE Marek
      > **−3 989,98**. IKE Marek's sign is the interesting one — see §78.2.
- [ ] **Assert 0 row errors and that the synthetic `#d`/`#t` legs still dedupe on a
      second run**
      > §65.1. Both held on the 2026-10-01 run (`errors=0`, all 2,368 skipped,
      > `portfoliosTouched=0`); re-assert after the new rows land.
- [ ] **All 10 `portfolio_backfill_metadata.status = complete`, and every
      `gap_symbols` accounted for**
      > §65.1. `status` is `complete` on all ten today. `gap_symbols` is **not** empty
      > on 4 (Crypto 1, IKE Beata 7, IKE Marek 6, Rach. 1) — six of those symbols are
      > the §78.3 bonds, so this cannot close until that decision's *consequences* are
      > recorded rather than until the symbols gain prices.
- [ ] **No single-day move worse than −25% in the ALL series**
      > §65.1, bar from §63.13. **Measure flow-adjusted** (`(value − net_flow)` vs the
      > prior day): on raw `value` Equate+ reads −80.2% and IBKR −20.0%, both pure
      > *withdrawals* — Equate+'s true worst day is −22.0%. IKE Marek's −76.1% and
      > IKE Beata's −34.1% are **explained** by §78.5's `unpricedValue`: each is
      > exactly the unpriceable bond purchase on that day. XTB remains, and it needs
      > §78.1.

---

## 79. Fundamentals tab: `FCF / Share` is broken twice, and the statements have no currency or source (2026-10-02)

Two data-integrity defects found while assessing fonrex as a source of European
fundamentals. Not a proposal — these came out of the provider analysis, and both
are wrong *today* in PROD, independent of anything we add. Touches the frontend
(`portfoliost`), the instruments service, and the contracts repo.

Context that makes §79.2 the more serious of the two: `GET /api/instruments/
{symbol}/fundamentals` fires **three independent** `fetchFundamentals` calls
(`portfoliost-instruments/src/routes/instruments.ts:1090-1094`), one per
statement, and each walks `STATEMENT_PROVIDERS = ["fmp","yfinance","polygon",
"sec"]` separately (`openst/src/openbb_client.py:18`, first-non-empty). One
instrument can therefore return income from `yfinance` and balance from `polygon`,
in different currencies and units, merged into one response by
`toFundamentals()` (`src/adapters/translate.ts:544`) that records no provenance.
`FundamentalsData` (`openapi.yaml:649-705`) has **no `currency` field and no
`sources` field**, and the tab renders every value through `formatCompact` with
no currency symbol. A GPW name in PLN and a US name in USD are indistinguishable
on screen. §79.2 gets worse with every provider we add, which is why it is
sequenced before any Tier 1 fundamentals work.

### 79.1 — `FCF / Share` renders as a percentage and is never populated

Two independent faults stacked on one column.

**a. Wrong unit.** `ResearchFundamentals.vue:47` lists `freeCashFlowPerShare`
alongside the genuine ratios in the percent branch of `cell()`:

```
if (key.toLowerCase().includes("growth") || key === "netIncomeMargin" ||
    key === "debtEquityRatio" || key === "freeCashFlowPerShare") {
  return `${v.toFixed(1)}%`
}
```

`freeCashFlowPerShare` is currency-per-share, not a ratio. `$33.67` renders as
`33.7%`. Its three siblings in that branch (`netIncomeMargin`,
`debtEquityRatio`, and any `*growth*`) are real ratios.

- [ ] **Drop `freeCashFlowPerShare` from the percent branch of `cell()`** in
      `src/modules/instruments/ResearchFundamentals.vue:47`, leaving the three
      real ratios. It then falls through to the numeric ladder
      (`formatCompact` ≥1e6 → `toLocaleString` ≥1000 → `toFixed(2)`), which is
      correct for a per-share amount in the instrument's currency.
- [ ] **Add a unit test** that asserts `cell()` returns `"33.67"`, not
      `"33.7%"`, for `freeCashFlowPerShare: 33.67`, and still returns a
      percent for `netIncomeMargin: 12.5`.
      > `cell()` is currently not exported and has no test file. Export it (or
      > extract to `src/modules/instruments/fundamentalsFormat.ts` alongside
      > `compareMetrics.ts`) and cover all four percent-branch keys plus the
      > three ladder thresholds. Tests: `npm run test` green; `npm run build`
      > (includes `vue-tsc --noEmit`) green.

**b. Never populated.** The `cashFlow` mapper in `toFundamentals()`
(`src/adapters/translate.ts:596-616`) builds its row object explicitly and
contains **no `freeCashFlowPerShare` key**. Against the real
openst/cachest backend the column is permanently `—`. It only looks correct in
e2e because the mock seed carries it (`mocks/shared/data/research/AAPL.json`,
written by `scripts/regen-seed.mjs:205`) — a mock-only artefact masking the gap,
which is exactly why it survived.

- [ ] **Emit `freeCashFlowPerShare` in the cash-flow mapper**, keyed by fiscal
      year against the income statement's share count:
      `freeCashFlowPerShare = freeCashFlow / dilutedSharesOutstanding`, joining
      the two arrays on `year` (the income mapper already computes
      `dilutedSharesOutstanding` from `diluted_average_shares` /
      `weighted_average_shares_diluted`, `translate.ts:569`).
      > A year join, **not** a positional one: the three statements arrive from
      > independent provider calls with independent period coverage, so
      > `income[i]` and `cash[i]` are not guaranteed to be the same year. Guard
      > the division (undefined or 0 shares → `undefined`, never `NaN`/`Infinity`),
      > and prefer `diluted_average_shares` over the basic count for
      > consistency with `dilutedSharesOutstanding`.
- [ ] **Test the mapper** in `src/adapters/translate.test.ts`: aligned years
      produce the quotient; mismatched or missing years produce `undefined`,
      never `NaN`; a zero share count produces `undefined`.
- [ ] **Drop the value from the mock seed** so it stops masking regressions, or
      keep it and add an assertion that the real mapper path produces the same
      number for the seeded fixture.
      > Prefer removing it: the seed is what let (b) ship unnoticed. If it stays,
      > `regen-seed.mjs:205` must stop being the only source of the field.
      > Tests: `npm run test:mock` and `npm run test:e2e` green.
- [ ] **Commit** `fix(instruments): emit and correctly format freeCashFlowPerShare`
      > Split from 79.1a so the mapper and the formatter are independently
      > revertable — a bad join is a data bug, a bad format string is cosmetic.

**Related drift found alongside, not in scope here:** `openapi.yaml:685-689`
declares `totalCapitalization`, `longTermDebtToCapitalization` and
`totalDebtToCapitalization`, which `toFundamentals()` never emits and the tab
never renders; `balanceSheet.cash` (`openapi.yaml:680`) is emitted at
`translate.ts:580` and never rendered; `cashFlowFromOperatingActivitiesGrowth`
is computed at `translate.ts:611`, declared at `openapi.yaml:701`, and read by
no component. Separately, the tab hard-codes `period=annual`
(`routes/instruments.ts:1091`) with no quarter or year-range control, unlike
every sibling research tab. Log these against §78 rather than expanding §79.

### 79.2 — Statements carry no currency and no source provenance

Decide between labelling and pinning, then implement the chosen one. Both close
the defect; they differ in cost and in what they promise the user.

- [ ] **Record which of the two this section implements**, in a
      `Design decisions (resolved)` note under this section.
      > The two are not exclusive, but they are different scopes. *Label*
      > adds `currency` + `sources` to `FundamentalsData` and is honest about
      > what the data is: mixed-provider, single-currency-as-reported. *Pin*
      > resolves one provider per instrument, requests all three statements from
      > it, and can then legitimately claim a single consistent basis — at the
      > cost of losing statements the pinned provider does not carry (yfinance
      > has no balance sheet for some GPW names, so pinning can turn a
      > partially-filled table into an empty one).
- [ ] **Add `currency` and `sources` to `FundamentalsData`** in
      `../portfoliost-contracts/contracts/openapi.yaml`, as
      `sources: { incomeStatement, balanceSheet, cashFlow }` carrying the
      provider name per statement, `currency: string`, and `currencySource`
      mirroring the existing `CurrencyResolution["currencySource"]` vocabulary
      (`provider` / `estimated` / `unknown`, `src/services/instrument-currency.ts:265`).
      > Reuse that resolver, do not invent a parallel currency path: the route
      > already calls `resolveCurrency(db, symbol, profile.currency, exchangeHint)`
      > for `/profile` (`routes/instruments.ts:366`), and §71's venue-country
      > fallback is what makes it correct for a venue-qualified symbol with no
      > listing in `ticker_reference`. Threading `exchangeHint` here closes the
      > same class of defect §72.4 documents.
- [ ] **Regenerate types** with `npm run gen:types` from
      `../portfoliost-contracts/contracts` (not the repo root), then populate
      the new fields in `toFundamentals()`.
      > `toFundamentals(income, balance, cash)` currently receives only three
      > row arrays. It needs the resolved currency and the three provider names,
      > so either widen its signature or lift the merge into
      > `routes/instruments.ts:1090-1094`, which is where the per-call provider
      > identity is actually known.
      > `openst` does not report which provider satisfied a walk today
      > (`openbb_client.py` returns rows only), so provider identity has to come
      > from `request.state`-style plumbing in openst or from cachest response
      > metadata — **inspect `cachest/config.yaml:251-258` for what it forwards
      > before choosing**. Do not guess this shape.
- [ ] **Render the currency in the tab** — a currency label on each of the three
      cards, plus a visible source marker when the three statements disagree on
      provider.
      > `ResearchFundamentals.vue:43-55` `cell()` has no currency argument today;
      > the label belongs at card level, not per cell, to avoid repeating a
      > symbol on 30 values.
- [ ] **If pinning instead of labelling**: resolve the provider once per
      instrument, pass it to all three `fetchFundamentals` calls, and record the
      choice so it is stable across the 24 h cachest TTL
      > (`cachest/config.yaml:251-258`, `cache_ttl 86400`,
      > `stale_ttl 2592000`) rather than re-resolved per request — a per-request
      > pin would flip providers mid-table on a cache miss, which is the same
      > defect with a shorter fuse.
- [ ] **Tests**: contract schema test for the new fields; `toFundamentals` test
      asserting `sources` matches the providers actually used and that
      `currencySource` is `"estimated"` (not `"provider"`) when the answer comes
      from the venue; a component test that a mixed-source response renders the
      disagreement marker. `npm run test` and `npm run build` green.
- [ ] **Commit** `feat(instruments): expose statement currency and provider provenance`

### 79.3 — Half the balance sheet is empty for every non-US instrument (found 2026-10-02)

More urgent than §79.1 or §79.2, and the cause is a provider-schema mismatch in
the same function. Five of the ten balance-sheet columns render `—` for every
European instrument in PROD, and `debtEquityRatio` goes with them because it is
derived from one of them.

**There is no fixed schema to map onto.** `openbb_core.provider.standard_models.balance_sheet.BalanceSheetData`
sets `extra="allow"` and declares exactly three fields — `fiscal_period`,
`fiscal_year`, `period_ending`. Every line item is a provider extra.
`FMPBalanceSheetData` declares 63 typed fields, so FMP emits the same keys for
every symbol. **openbb's yfinance balance model declares nothing beyond those
three** — raw yfinance keys pass through verbatim, and yfinance's naming differs
by listing. `toFundamentals()`'s `pick()` candidates
(`translate.ts:575-595`) were evidently taken from the FMP/US shape.

Measured against openst on the live stack, `statement=balance&period=annual`:

| field | AAPL | SAP.DE | PKO.WA | EU listings actually serve |
|---|---|---|---|---|
| `totalAssets` | ✓ | ✓ | ✓ | `total_assets` |
| `totalLiabilities` | ✓ | **✗** | **✗** | `total_liabilities_net_minority_interest` |
| `shareholdersEquity` | **✗** | **✗** | **✗** | `total_common_equity`, `stockholders_equity` |
| `cashAndShortTermInvestments` | ✓ | **✗** | **✗** | `cash_equivalents`, `cash_and_cash_equivalents` |
| `workingCapital` | ✓ | **✗** | **✗** | absent entirely |
| `netDebt` | ✓ | **✗** | ✓ | `net_debt` |
| `totalDebt` | ✓ | ✓ | ✓ | `total_debt` |
| `retainedEarnings` | ✓ | ✓ | ✓ | `retained_earnings` |

**AAPL 7/8 · SAP.DE 4/8 · PKO.WA 5/8.** Note `shareholdersEquity` is empty for
AAPL too — the bug is not European-only, US symbols just happen to share the
key names the mapper was written against.

**There is no fallback to wait for.** FMP returns `HTTP 402` on
`/stable/income-statement`, `/balance-sheet-statement` and
`/cash-flow-statement` for `SAP.DE`, `PKO.WA` and `MC.PA` on the current plan:
*"Premium Query Parameter: 'Special Endpoint : This value set for 'symbol' is not
available under your current subscription"*. `AAPL` on the same endpoints returns
200. Separately, `/api/v3/*` returns `403 "Legacy Endpoint … no longer
supported"` for this key on every symbol. `search-symbol` does resolve
`PKO.WA`/`PKN.WA` on `WSE`, so the symbols exist — the statement data is plan-gated.
**yfinance is therefore the only source of European statements in the chain**,
and this cannot be deferred until a better provider arrives.

- [x] **Widen the `pick()` candidate lists** in `toFundamentals()`'s
      `balanceSheet` mapper (`translate.ts:575-595`) to accept the yfinance
      passthrough names alongside the FMP ones — `total_liabilities` +
      `total_liabilities_net_minority_interest`; `shareholders_equity` +
      `total_equity` + `total_common_equity` + `stockholders_equity`;
      `cash_and_equivalents` + `cash_and_short_term_investments` +
      `cash_and_cash_equivalents` + `cash_equivalents`.
      > Order matters and is not arbitrary: `total_liabilities` is the
      > liabilities-excluding-minority figure and
      > `total_liabilities_net_minority_interest` includes it, so they are not
      > interchangeable. Prefer the `_net_minority_interest` variant when both
      > are present so the column is internally consistent with
      > `total_assets`, and record which was chosen.
      > `shareholdersEquity` is a judgement call, not a rename: `total_equity`
      > includes non-controlling interests, `total_common_equity` and
      > `stockholders_equity` do not. Pick one, apply it to every provider, and
      > say which in the code — otherwise `debtEquityRatio` silently changes
      > meaning between a US and an EU row.
      > Measured again before coding, and the live rows carry two keys this
      > list does not name: `cash_cash_equivalents_and_short_term_investments`
      > is yfinance's actual combined cash line (SAP: 8,220 + 1,552 = 9,772,
      > which reconciles) and `working_capital` is reported directly on SAP.
      > Both are in the fix. `cash_equivalents` (SAP 4,310, a sub-line of cash)
      > and `cash_financial` (SAP 3,910, neither cash nor cash-plus-investments)
      > are ranked *below* `cash_and_cash_equivalents` so neither can win.
- [x] **Handle `workingCapital` where the provider does not supply it.** For
      PKO.WA neither `total_current_assets` nor `total_current_liabilities` is
      present. Either compute it from `current_assets`/`current_liabilities`
      when a provider supplies those instead, or return `undefined` and render
      `—` deliberately rather than by accident.
      > Do not fabricate it. A wrong working-capital figure is worse than a
      > blank cell, and §79.2 is precisely about not presenting numbers whose
      > basis is unknown.
      > All three: a reported `working_capital` wins, else
      > `total_current_assets`/`current_assets` minus
      > `total_current_liabilities`/`current_liabilities`, else `undefined`.
      > SAP supplies the mixed pair (20256 − 17416 = 2840, matching its own
      > reported figure) and PKO supplies neither, so PKO's cell stays `—`.
- [x] **Add fixture-driven tests** in `src/adapters/translate.test.ts` covering
      both shapes: one row set in the FMP/US naming and one in the yfinance/EU
      naming, asserting the same eight fields populate from either.
      > Capture the EU fixtures from the live responses recorded in this
      > section, not from memory — the key names above are what the HTTP layer
      > returned today and are the whole basis of the fix.
      > Assert `debtEquityRatio` too: it is the derived column that makes the
      > bug visible in the UI, and it is currently empty for every EU name.
      > `npm run test` green.
      > Captured 2026-10-02 as literal first rows, not paraphrases. The split is
      > AAPL = FMP (the only row carrying `cik`/`accepted_date`/`fiscal_year` —
      > openbb normalises nothing else) and SAP.DE + PKO.WA = yfinance
      > passthrough. 485 tests green.
- [x] **Audit the `incomeStatement` and `cashFlow` mappers for the same defect**
      before closing. Only the balance sheet was measured here; the other two
      have the identical `pick()` shape and the same passthrough exposure.
      > If they are also affected, fix them in the same commit rather than
      > leaving a known-wrong sibling behind — but say in the commit message
      > which were confirmed broken and which were only checked.
      > Both were affected, worse than the balance sheet. Income: `revenue` was
      > read as a bare key and is `total_revenue` on every yfinance row, which
      > also emptied `netIncomeMargin`; `netIncomeGrowth` read `r.net_income`
      > directly while `netIncome` read a `pick()`, so it was blank for AAPL;
      > `dilutedSharesOutstanding` matched no key any provider emits and was
      > empty everywhere. Cash flow: `dividendPayment` matched nothing on any
      > symbol. Left deliberately blank as genuine provider gaps — PKO.WA has no
      > EBIT and no EBITDA line, and SAP's `net_debt` arrives null.
      > A third class of defect turned up, not naming: `freeCashFlow` was
      > `operating − capitalExpenditure` while every provider reports capex as a
      > negative outflow, so the subtraction **added it back**. AAPL FY2025 read
      > 124,197 against a true 98,767 — 26% overstated on the one symbol
      > anyone would check by hand. Now prefers the provider's own
      > `free_cash_flow` and falls back to `operating − |capex|`; the fallback
      > was verified to reproduce the provider figure exactly for all three
      > symbols.
- [x] **Commit** `fix(instruments): map yfinance balance-sheet keys in toFundamentals`
      > Same function as §79.1, so keep it separate: this one is a data-correctness
      > change to five live columns, that one is a formatter plus one unpopulated
      > field. Different risk, independently revertable.

### 79.4 — FMP's European statements are plan-gated, and the v3 tier is gone

Not a defect in our code, but it constrains §79.3 and §79.2 and should not be
rediscovered from scratch. Recorded 2026-10-02 against the live `FMP_API_KEY`.

- [ ] **Record the FMP tier boundary in `docs/openst-coverage.md`** next to the
      existing provider notes, so nobody re-adds FMP as a European fallback.
      > `openst/CLAUDE.md` and `cachest/CLAUDE.md` already treat
      > `docs/openst-coverage.md` as the record of what each provider actually
      > returns. Add: FMP statements are US-only on the current plan (402 on
      > all three statement endpoints for `SAP.DE`, `PKO.WA`, `MC.PA`); the
      > legacy `/api/v3/*` tier returns 403 for this key on **every** symbol,
      > so openbb's fmp provider is on `/stable` only; `search-symbol` does
      > resolve European listings (`PKO.WA`, `PKN.WA` on `WSE`), so symbol
      > resolution and data access are gated separately and a successful
      > `search-symbol` is not evidence the statements are available.
      > If openbb's fmp provider is still calling `/api/v3`, that is a
      > separate live defect — **check which base URL it uses before writing
      > this note**, do not assume.
      > Tests: none needed, doc-only, verified by re-running the three probes.
- [ ] **Commit** `docs(instruments): record FMP plan tier boundary for non-US statements`

---

## 80. Admin → Topology: the cronjob list has drifted, and the graph is unreadable (2026-10-02)

User request, two halves. Both are defects in the **D55 Topology tab** and the
**System tab** beside it, and both are in the same subsystem, so they are one
section with one ordering rule: **fix the data before the geometry** — a bigger
canvas that still shows the wrong jobs is a bigger wrong picture.

Proposal: [proposals/portfoliost-presentation.md](proposals/portfoliost-presentation.md)
— renovated 2026-10-02 to as-built; its "Known drift" section is the short
version of this one.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

### The drift, measured against the cluster on 2026-10-02

Both tabs hardcode the job list, and both are wrong. `portfoliost-admin` already
holds RBAC to list CronJobs (`cluster-read-role`, `cluster/apps/pfire/rbac.yaml`),
so this is a curation problem, not a permissions one.

The request was about last week's changes; the measured drift is older than that,
so the table carries ages rather than just names. `fundcategorysync` (25 h) and
`snapshotsync` (19 h) are the two genuinely new ones, `fxsync` is the rename
(9 d — the old name's death is what left a dead row behind), and `corpbondsync`
(12 d) plus the four openst jobs were never in the System tab at all.

| CronJob | schedule | age | System tab | Topology graph |
|---|---|---|---|---|
| `portfoliost-instruments-tickersync` | `30 4 * * 1` | 39 d | yes | yes |
| `portfoliost-instruments-fxsync` | `10 17 * * *` | 9 d | **no** | **no** (as `portfoliost-wallets-fxsync`) |
| `portfoliost-instruments-corpbondsync` | `45 4 * * *` | 12 d | **no** | **no** |
| `portfoliost-instruments-fundcategorysync` | `15 5 * * *` | 25 h | **no** | **no** |
| `portfoliost-wallets-snapshotsync` | `0 13 * * *` | 19 h | **no** | **no** |
| `openst-bond-import` | `30 4 * * *` | 15 d | **no** | yes |
| `openst-bond-archive` | `0 6 3 * *` | 15 d | **no** | yes |
| `openst-cpi-import` | `30 4 * * *` | 16 d | **no** | yes |
| `openst-cpi-seed` | `0 5 1 1 *` (**suspended**) | 15 d | **no** | yes |
| `stooq-downloader` | `0 3 * * 0` (**suspended**) | 140 d | yes | yes |
| `stooq-importer` | `@yearly` (**suspended**) | 140 d | yes | yes |

**Removed:** `portfoliost-wallets-fxsync` is gone — FX ownership moved to
instruments (§48.6a), and the cluster has `portfoliost-instruments-fxsync`
instead. The System tab still lists the dead name, so it shows a row whose image
can never resolve. **Removed:** `portfoliost-wallets-snapshotsync-postfx`, which
existed until 2026-10-01 when the two identical snapshotsync objects were merged
into one (k3s v1.36.2 rejects a comma-separated `schedule`, so one object could
not hold both windows — the reasoning is in the wallets HelmRelease comment).
Neither tab listed it, so nothing to delete in code; it is recorded here because
"the post-FX pass is gone" is a real behavioural change: day-end converted values
now settle on the next morning's run instead of the same evening.

**Three suspended jobs** (`openst-cpi-seed`, `stooq-downloader`,
`stooq-importer`) currently render as ordinary scheduled work. The graph already
carries `suspended` metadata for the openst four; the other two do not, and the
System tab has no column for it at all.

Not ours, and must stay out of both tabs: `pgdb` (flyway),
`postgres-pfire-repo1-{diff,full,incr}` (CrunchyData pgBackRest, operator-owned),
`scanst` / `scanst-override` / `scanst-test`, `stooq` (`stooq-daily`), plus the
non-portfoliost deployments sharing the namespace (grist, pgadmin, pgweb,
swaggerui, investbrain, …). The ownership line is **the homelab manifests**, not
`kubectl get cronjobs` — the namespace is shared.

### 80.1 — System tab: resync the hardcoded CronJob list

`src/jobs-version.ts` `CRONJOBS` is a four-element array
(`portfoliost-wallets-fxsync`, `portfoliost-instruments-tickersync`,
`stooq-downloader`, `stooq-importer`) read against a live
`listNamespacedCronJob` result. Entries absent from the cluster are skipped, so
the dead `fxsync` name degrades to *silently missing* rather than to an error —
which is why nobody noticed.

- [ ] **Replace the array with the eleven portfoliost-owned CronJobs**, in the
      table above, and export it so a test can assert on it.
      > Names are the rendered object names, not the app-template keys:
      > `fxsync` under the instruments HelmRelease renders as
      > `portfoliost-instruments-fxsync`. Take them from
      > `~/prv/homelab/homelab` `origin/main`
      > (`cluster/apps/pfire/{openst,portfoliost-instruments,stooq-downloader,stooq-importer}/app/`),
      > which is the source of truth — **not** from the cluster listing, which
      > also carries the shared-namespace jobs that are not ours. Note the local
      > homelab checkout lags `origin/main`; read it via
      > `git show origin/main:<path>` after a fetch. `jobshot` (a Deployment) and
      > `portfoliost-sheets-sync` (an on-demand jobshot Job, no CronJob) stay out
      > of this array — `index.ts` already appends sheets-sync separately.
- [ ] **Add `schedule` and `suspended` to `JobVersion`**, read from
      `cj.spec.schedule` / `cj.spec.suspend`, so the System tab can render
      `impl: "job"` rows as *Job · Scheduled* / *Job · Suspended* instead of a
      single green "Job" badge that reads as "running".
      > `SystemInfoView.vue:42` maps `impl === "job"` to one badge. The endpoint
      > shape is `ServiceVersion` in `src/api/admin.ts` and in the contracts
      > spec — check whether `ServiceVersion` already tolerates the extra fields
      > before widening it, and add them there if it does not.
- [ ] **New test file** `src/jobs-version.test.ts` — there is none today. Assert
      that `CRONJOBS` equals the eleven names above, and that
      `listJobVersions()` against a stubbed `listNamespacedCronJob` returns a row
      per name that exists, skips a name that does not, and never invents one.
      > The "skips a name that does not exist" case is the behaviour that hid
      > the dead `fxsync` entry: it is correct and it is also why the array can
      > rot unnoticed. Lock it deliberately rather than by accident.
- [ ] **Tests**: `npm run test` green in `portfoliost-admin`; `npm run build`
      green in `portfoliost` (the `ServiceVersion` type change flows into
      `SystemInfoView.vue`).
- [ ] **Commit** `fix(admin): resync the System tab CronJob list and show suspension`

### 80.2 — A guard, so the next drift is a failing test and not an eyeball

The decision recorded for this section is **keep the list hardcoded and resync
it** — discovery was considered and rejected for now, because the namespace is
shared and every discovered CronJob would need an ownership rule that is itself
a hardcoded list. The cost of that choice is drift, so the list needs a
tripwire.

- [ ] **Add a captured fixture** of the portfoliost-owned CronJobs — name,
      schedule, suspend flag, image tag, capture date — as
      `src/cronjobs.fixture.json`, and a test asserting `CRONJOBS` matches it.
- [ ] **Add `scripts/check-cronjobs.mjs`** that reads the live namespace with
      `kubectl get cronjobs -n pfire -o json`, filters to the fixture's names,
      and exits non-zero on any difference in name / schedule / suspend; with
      `--refresh` it rewrites the fixture instead.
      > Its honest limit: **an offline test cannot fail on its own.** The fixture
      > only changes when someone runs `--refresh`, so this catches a job edited
      > in the HelmRelease without a resync, and nothing more. Saying so here is
      > the point — a guard that needs the same manual act it is guarding against
      > is a tripwire, not automation. Wiring it into CI against the live cluster
      > is the follow-up that would make it self-firing, and it needs a
      > kubeconfig in CI.
- [ ] **Tests**: `npm run test` green; `node scripts/check-cronjobs.mjs` run
      against the live cluster exits 0 with the fixture as captured on 2026-10-02
      (i.e. the filter does not drag the shared-namespace jobs in).
- [ ] **Commit** `test(admin): guard the CronJob list against cluster drift`

### 80.3 — Topology graph: same drift, plus an edge that points at the wrong owner

`topology/graph-definition.ts` carries the job nodes as static data with
hand-written `job: { schedule, suspended, purpose }` metadata — no live probe,
by design: kube-state-metrics exposes no "last run succeeded" signal for a
CronJob, so the honest wording is "what the manifest declares".

- [ ] **Replace the `portfoliost-wallets-fxsync` node with
      `portfoliost-instruments-fxsync`** and re-point its edge at
      `portfoliost-instruments` (`Updates FX rates`, `10 17 * * *`, not
      suspended).
- [ ] **Add three job nodes** with schedule / suspend / purpose metadata:
      `portfoliost-instruments-corpbondsync` (`45 4 * * *` → instruments, the
      D80 corp-bond catalogue upsert deployed in §35),
      `portfoliost-instruments-fundcategorysync` (`15 5 * * *` → instruments,
      the analizy.pl fund-category upsert that §72.39's classification depends
      on — with no `ANALIZY::` row a fund routes as a stock and silently
      returns zero bars),
      `portfoliost-wallets-snapshotsync` (`0 13 * * *` → wallets, the only
      writer of `positions.market_value` in the scheduled pipeline since §76.1 —
      say so in the `purpose` text, it is the most consequential job in the
      namespace).
- [ ] **Fix the FX edge owner**: `portfoliost-wallets → ecb` is labelled "FX
      rates (via fxsync CronJob)", but wallets no longer owns FX. Move the edge
      to `portfoliost-instruments → ecb` (`fx_rates` lives there since §48.6a).
- [ ] **Add `suspended: true` to `stooq-downloader` and `stooq-importer`**, both
      suspended in the cluster. Give all twelve job nodes a `purpose` string —
      the details panel renders it, and the three new ones have none.
- [ ] **Update `tests/unit/modules/admin/topology-graph-definition.test.ts`** —
      `EXPECTED_NODE_IDS` (39 → 41), `EXPECTED_EDGE_PAIRS` (47 → 49),
      `areaNodes("jobs")` count (10 → 12), the vitest snapshot, and the
      "maps verified OpenST CronJobs" case.
      > Counts: one node out, three in; one job edge out, three in, and the ECB
      > edge changes source rather than count.
      > `loadTopologyLayout` applies a stored layout only on an exact id-set
      > match, so adding and removing node ids invalidates every saved
      > `pfire.topology-layout.v1` position and users get the fresh dagre pass on
      > first load. That is the intended behaviour, not something to work around.
- [ ] **Tests**: `npm run test` and `npm run test:e2e` green
      (`tests/e2e/topology.spec.ts:112` asserts the OpenST job nodes are mapped
      and inspectable — check whether it enumerates ids).
- [ ] **Commit** `fix(spa): resync topology job nodes with the cluster`

### 80.4 — Nodes sized to be read

`NODE_SIZES` in `topology-layout.ts:41` (internal 200×40, storage 150×40, jobs
160×40, external 160×36, providers 120×28) is dagre's idea of each box, and it
doubles as the geometry the lane-bounds and persistence tests assert against. The
rendered box is whatever the node component's Tailwind padding makes it, so the
two are maintained by hand and can disagree.

- [ ] **Enlarge the five node components**: `InternalNode`, `StorageNode`,
      `JobNode` from `px-3 py-2` / `text-sm` to `px-4 py-2.5` / `text-base`;
      `ExternalNode` likewise; `ProviderNode` from `px-2.5 py-1` / `text-xs` to
      `px-3 py-1.5` / `text-sm`, with the quota badge `text-[10px]` → `text-xs`.
- [ ] **Update `NODE_SIZES` to the rendered sizes**, and raise `LANE_PADDING`
      from 24 so a lane still frames its contents.
      > Measure, do not guess: `getBoundingClientRect()` on a rendered node in
      > the browser is the number `NODE_SIZES` has to match, because
      > `extent: "parent"` clamps children to the lane and dagre spaces by this
      > constant. A lane smaller than its contents clips them.
- [ ] **Assert the two agree**: a test that every area's `NODE_SIZES` entry is at
      least the component's minimum rendered box, so the constant cannot silently
      drift from the markup again.
- [ ] **Tests**: `npm run test` green (layout snapshot updates), `npm run build`
      green, plus a Playwright pass on `tests/e2e/topology.spec.ts` — the lane
      tests at `:311` and `:348` assert boxes render and drag together, which is
      exactly what a size mismatch breaks.
- [ ] **Commit** `fix(spa): enlarge topology nodes to a readable size`

### 80.5 — Pack lanes sideways, so a wide screen is used

The graph reads left-to-right (`rankdir: "RL"`, D55-9) but `packAreas` pushes
overlapping lanes **downward**, so five areas stack into a tall column and
`fitView` — which fits both axes — zooms out to satisfy the height. That is the
mechanism behind "boxes are very small and unreadable"; §80.4 alone makes the
boxes bigger and the zoom-out worse.

- [ ] **Flip the pack axis**: in `packAreas`, advance `x` instead of `y` when a
      lane must clear an already-placed one, and order the pass by raw `x` then
      definition order.
      > Keep the guarantee the same — pairwise-disjoint lanes — and keep
      > `nearOverlap` as the single overlap predicate. `clampLaneMotion` is
      > already axis-symmetric (binary search over the displacement vector), so
      > lane dragging needs no change.
- [ ] **Fix the tests that encode the old axis.**
      > `topology-layout.test.ts:48` asserts lane *left edges* ascend in the
      > order data-providers → storage → internal → external-services; that
      > ordering came from the rank columns, and horizontal packing re-orders it.
      > Either relax it to "no two lanes overlap and every node is inside its
      > lane" (`:83`, `:103`) or pin the new left-to-right lane order
      > deliberately — but do not leave it asserting the old geometry.
- [ ] **Shorten the canvas** in `mission-control.css`: `.mission-canvas` is
      `clamp(540px, calc(100vh - 430px), 1000px)`. A wide layout wants a shorter
      stage, and `fitView` has more width to spend on the zoom that §80.4 needs.
      Check the `≤720px` media block at `:115` still collapses sensibly.
- [ ] **Raise `max-zoom`** from 1.5 (`TopologyView.vue:459`) only if §80.4 and
      §80.5 together still leave the default view short of 1:1 — measure on a
      real viewport before changing it.
- [ ] **Tests**: `npm run test` green; `npm run test:e2e` green — `:311` asserts
      lanes never overlap, `:373` that Re-layout restores the canonical
      arrangement, `:394` that moved lanes survive a reload.
- [ ] **Commit** `feat(spa): pack topology lanes horizontally for wide screens`

### 80.6 — `cachestProviders` is permanently empty (found while renovating the proposal)

Not requested. Recorded because it was found, it is in the same subsystem, and
it is a two-line fix next to `LABEL_PREF`. Drop this step if the section is
already long enough.

`CACHEST_P99_Q` filters `service_name="cachest"`, but the OTel exporter in this
cluster emits `job` and `service` and **no `service_name`**. Verified against
the live Prometheus on 2026-10-02:
`count(http_client_request_duration_seconds_bucket{service_name="cachest"})` →
empty. So `cachestProviders` is always `[]`, and
`TopologyDetailsPanel.vue:192` (`v-if="… && cachestProviders.length"`) never
renders the per-upstream latency table. The service rows next to it are fine —
they go through `queryMapByLabel`, which is why this one query was missed.

- [ ] **Resolve the cachest identity through `LABEL_PREF`** the same way the
      service rows do, instead of hardcoding `service_name`.
- [ ] **Test** that the generated PromQL carries no unresolvable label filter,
      and that a stubbed series keyed on `job` yields a populated
      `cachestProviders`.
      > Extend `portfoliost-admin/src/topology.test.ts` — the ingress/OTel
      > fallback paths are already covered there, so this is an added case, not
      > a new file.
- [ ] **Tests**: `npm run test` green in `portfoliost-admin`; confirm against the
      live cluster that the endpoint returns a non-empty `cachestProviders`.
- [ ] **Commit** `fix(admin): resolve cachest provider latency through the label fallback`

