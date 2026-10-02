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
