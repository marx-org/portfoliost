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


## 83. Cumulative (all-portfolios) Performance tab (2026-10-02)

User request (no proposal file): "a performance tab for cumulative portfolio —
maybe make a component out of the existing per-portfolio tab and just load all
data into it?"

Placed as an **additional tab on the main Portfolios page** (`InvestmentsTabs`),
not a route under `/portfolios/:id`, because it aggregates over all portfolios
and therefore has no `:id`. Built the way the request suggests: extract
`PortfolioPerformanceTab.vue`'s body into a prop-driven component and mount it
twice — per-portfolio from the existing route, and for the account from a new
`/investments/performance` route backed by `GET /api/portfolios/merged`.

**Half of the reuse already exists.** `PortfolioPerformanceChart.vue` is
deliberately one component with no variant prop (§41: *"the charts differ only in
the data delivered"*), and the combined chart on
`src/modules/portfolios/InvestmentsView.vue:382-410`
already uses it. Do not add a second chart or a `combined` prop.

**The other half is the blocker.** "Load all data into it" cannot work as stated,
because the aggregate's return columns do not exist and cannot be read off a sum
of per-portfolio columns. `buildMergedPerformance` (`mergedAnalytics.ts:146-163`)
returns `timeSeries[]` as `{date, value, invested}` only and hard-nulls
`timeWeightedReturn` / `moneyWeightedReturn` with `monthlyReturns: []`; §82.1
does not reach it either, since it scopes to `/:id/analytics`.

The fix is structural, not cosmetic, and it is short: **select `net_flow`
alongside `value` in `/merged` and run the same builders on the summed series.**
`(ΣVₜ) / (ΣVₜ₋₁ + ΣFₜ) − 1` *is* the aggregate's daily return, so no
per-portfolio weighting is needed and no portfolio is privileged.
`buildDailyReturns(values, flows)` (`returnColumns.ts:43`) is already exactly
that expression, and it is now the single implementation §81.1 established — this
section consumes it and must not re-derive it. `netFlow` is external-only per
portfolio (§62.4/D50), so a transfer between two of the user's own portfolios is
excluded on both legs and cancels in the sum.

**Dependency: satisfied.** §81.1–81.3 landed in `811d942`. What this section
builds on, by name:

- `buildDailyReturns(values, flows)` / `chainReturns(returns)` / `buildTwr` —
  `returnColumns.ts:43` / `:53` / `:63`
- `computeRiskMetrics(returns, dates, riskFreeRate?)` — `riskMetrics.ts:242`,
  **pure**, and it returns `maxDrawdown`, `annualizedReturn` and the withheld
  reason. This is why §83.4 needs no new route and no contract change.
- `currentDrawdownPercent(points)` — `src/utils/drawdown.ts`, reads `cumulativeTwr`
  first with a raw-`value` fallback (§81.3)

**Ordering: satisfied.** §81.1–81.3 landed in `811d942`; §82 landed in `05c6855`,
`d02a289`, `a3275be`, `b667c5d`, `ed62b62`. §83.1 now edits the file §82.2–82.4
also edited, so the D85–D89 metrics are already in it — §83.1 is the extraction,
not the introduction.

**Revised 2026-10-02 after §82 landed — what that changed here.** §83 was drafted
against a `PortfolioPerformanceTab.vue` that had no Overview card, one Returns
Chart and no per-year view. It is now 788 lines carrying all of that, so three
things in this section are no longer accurate as written and are corrected in
place below:

1. **The tab grew a second consumer-shaped dependency.** §82.2's Overview card
   (Net gain / Net invested / XIRR / TWR p.a. / Timing) and §82.3's Monthly |
   Yearly toggle read `performance.annualizedReturn`,
   `annualizedReturnWithheldReason`, `moneyWeightedReturn`,
   `moneyWeightedReturnWithheldReason` and `timeframe`. So §83.2 must populate
   `annualizedReturn` **and its withheld reason** on the aggregate, not just the
   return scalars — a tab whose TWR p.a. tile always renders `—` while the
   per-portfolio tab shows a number is the exact "looks like a working page"
   failure §83.6's last test is written to catch. §83.3 and §83.4 are unaffected:
   benchmarks and risk ratios were already declared.
2. **§83.1's extraction surface grew.** Four more things cannot move as-is and
   must become props or internal state: `store.analyticsTimeframe` (which gates
   the Yearly toggle's availability, `:467`), `firstBenchmark` (`:485`),
   `excessByYear` (`:488`), and the `<script lang="ts">` block (`:1-117`) holding
   `yearlyReturns` / `benchmarkYearlyReturns` / `yearlyTotals`. The math block
   travels *with* the template — it is the D88 derivation the Yearly table needs —
   so the existing unit test's import path changes (one line; §83.1).
3. **The FX caveat moved from a footnote to the headline.** §82.2's two money
   tiles (`totalReturn`, `totalInvested`) are the numbers a reader checks against
   their own bank balance, and on a multi-currency aggregate they are the most
   constant-currency-shaped figures on the page. §83.6 says so where those tiles
   are, not only in a footnote under the chart.

Recorded decisions (resolved with the user):

- **Benchmarks need no contract change and no persistence.** `benchmarks[]` is
  already declared on `PortfolioAnalytics` (`openapi.yaml:1545`); `/merged`
  simply ignores the query param today. The selection is per-request store state
  (`stores/portfolios.ts:81-91`), not a DB column, so there is no schema to add.
- **Performers need one contract addition** — see §83.5. `/held-stocks`
  (`portfolios.ts:498`) is *not* reusable: it aggregates by symbol across
  portfolios, drops P/L entirely, and hardcodes `changePercent: 0`.
- **The existing `combined-chart` card is replaced, not duplicated.**
  `InvestmentsView.vue:382-410` renders the same endpoint through the same chart;
  leaving both puts the same curve on two adjacent pages.
- **FX is constant-currency by construction** and the tab must say so — see §83.6.

### 83.1 — Extract `PerformanceTabContent.vue` with no behaviour change

- [x] **Move the tab body** (Overview card, chart card, Drawdown card, Returns
      Chart, Top/Bottom Performers) out of `PortfolioPerformanceTab.vue` into
      `src/components/PerformanceTabContent.vue` — `docs/COMPONENTS.md`: used by
      ≥2 places, so `src/components/`, not the module folder. Props: `analytics`,
      `riskMetrics`, `positions`, `baseCurrency`, `selectedBenchmarks`,
      `timeframe`, `loading`, `backfillPending`, `recomputing`, `testid`,
      `titlePrefix?`. Emits `update:selectedBenchmarks`, `update:timeframe` and
      `recompute`. Take a `testid` prop and prefix every testid with it, per
      `COMPONENTS.md`.
      > The nine things that cannot move as-is and must become props or emits
      > (line numbers are the landed 788-line file): `route.params.id` (`:138`),
      > `store.analytics` (`:141`, `:293`, `:473`), `getPortfolioRiskMetrics(id)`
      > (`:232`), `store.positions` (`:312`),
      > `store.setBenchmarks(syms, id)` (`:203`), `store.detail.baseCurrency`
      > (`:366`), **`store.analyticsTimeframe` (`:467`, added by §82.3 — it is
      > what makes Yearly available at all, so it must be a prop and the emit a
      > `update:timeframe`; letting the component own it would leave the
      > aggregate's selector writing per-portfolio store state)**.
      > `firstBenchmark` (`:485`) and `excessByYear` (`:488`) derive from the
      > `analytics` prop, so they move as computeds untouched. The `chartRate` /
      > `displayCurrencyOr` pair (`:378`) and `convertedPnl` (`:350`) stay
      > **inside** the component — both are pure functions of props plus the
      > display-currency store, so both tabs get them for free. That is the whole
      > return on this refactor. Purely local UI state moves inside with it:
      > `returnsMode` (`:464`), `showCustomTimeframe` (`:140`), the whole
      > Customize modal incl. `InstrumentSearchModal` + `benchmarkOptions`
      > (`:133`, `:153-205`).
- [x] **Move the `<script lang="ts">` block with the template** (`:1-117`) —
      `yearlyReturns`, `benchmarkYearlyReturns`, `yearlyTotals`, `YearlyReturnRow`,
      `YearlyReturnTotals`, `yearRows`. It is the D88/D89 derivation, and the
      Yearly table in the template consumes it, so splitting the two would leave
      a component whose testids and whose maths live in different files.
      `tests/unit/modules/portfolios/PortfolioPerformanceTab.test.ts:4-8`
      therefore changes its **import path only** (to
      `@/components/PerformanceTabContent.vue`); no assertion changes. Do **not**
      re-export the functions from the wrapper to avoid that edit — two import
      paths for one derivation is how the two tabs end up with two answers.
- [x] **Keep every existing `data-testid` string.** `PortfolioPerformanceTab.test.ts`
      and `tests/e2e/performance-display-currency.spec.ts` +
      `tests/e2e/parity-portfolios.spec.ts` select on them; a rename breaks three
      specs for no gain. Testids are stable API per `COMPONENTS.md`. (The
      `testid` prop therefore prefixes the *aggregate* copy only — the
      per-portfolio mount must pass `testid=""` and render byte-identical ids.)
- [x] **Keep `PortfolioPerformanceTab.vue` as a thin route wrapper** that fetches,
      converts and delegates, so its behaviour is unchanged by construction. It
      keeps the `AnalyticsTimeframe` state machine: `changeTimeframe` (`:244`),
      the 5s backfill poll (`:214`) and `handleRecompute` (`:257`).
- [x] Tests: a new `tests/unit/components/PerformanceTabContent.test.ts` porting
      the cases from `PortfolioPerformanceTab.test.ts` against the component
      directly — tiles render payload values, `annualizedReturn: null` with a
      reason renders `—` and hides the Timing line, a display-currency switch
      re-renders the money tiles without a remount. The existing
      `PortfolioPerformanceTab.test.ts` and `InvestmentsView.test.ts` pass
      **unmodified** apart from that import line.
- [x] Tests: `npm run build` (includes `vue-tsc --noEmit`) and `npm run test` green.
- [x] Commit `refactor(spa): extract the performance tab body into a prop-driven component`


> Landed in `c5096c0`: the extracted component is `src/components/PerformanceTabContent.vue`
> (id-prefix convention `${tid}-<field>`, unset on this mount), the wrapper keeps only the
> fetch/poll/recompute state machine, and the `<script lang="ts">` block moved with the
> template. All 25 `data-testid` strings verified byte-identical against `HEAD` (the four
> per-year ones as `` `${tid('perf-returns-yearly-*')}-${row.year}` ``). `vue-tsc` clean;
> 583 unit tests green, of which 5 are new in
> `tests/unit/components/PerformanceTabContent.test.ts`.
### 83.2 — `/merged`: sum the flows and build the aggregate return columns

The only step that makes the tab possible. Everything after it is presentation.

- [x] **Add `netFlow`, `unpricedValue` and `carriedValue`** to the `/merged`
      SELECT (`portfolios.ts:786-792`) and thread all three through
      `sumSnapshotsByDateForwardFilled` (`mergedAnalytics.ts:83`) so the aggregate
      sums them per date exactly as it already sums `value` / `invested`. A
      portfolio with no row on date *d* contributes its carried value and **0**
      flow, so its slice of that day's return is 0 — which is correct, not an
      omission.
      > The two withheld amounts are not optional. They are what fires
      > `PortfolioPerformanceChart`'s §78.5 chip (`:109-146`), which reports
      > *"up to 10,465 PLN is missing from this curve"*. Omitting them reuses a
      > chart component with its honesty warning silently disarmed — on the one
      > screen where a wrong total is most expensive. `unpricedValue` must stay
      > **absent rather than 0** on a row that predates the column, for the reason
      > the per-portfolio route spells out at `portfolios.ts:1268-1277`.
- [x] **Chain the aggregate TWR** through `buildDailyReturns` + `chainReturns`
      (`returnColumns.ts:43`, `:53`) — the same path `buildTwr` takes. Do not
      re-derive `Vₜ/(Vₜ₋₁+Fₜ)−1` here, and do not read any stored
      `cumulative_twr` column: those are per-portfolio and summing indices is
      meaningless.
- [x] **Emit per-point `cumulativeTwr`** on the aggregate series, and the scalars
      `timeWeightedReturn` / `moneyWeightedReturn` / `simpleReturnPercent` from
      the last index point, mirroring `:1381-1389`. The aggregate MWR has no
      stored `cumulative_mwr` column to read, so compute it with
      `buildMwr(aggValues, aggFlows, aggDates)` (`returnColumns.ts:109`) at
      request time and read its last element the same way.
- [x] **Populate `annualizedReturn` + `annualizedReturnWithheldReason`** —
      `annualizedReturnWithheldReason(index, dates)` then
      `annualizedReturn(index, dates)` (`riskMetrics.ts:213` / `:177`), exactly
      as `:1305-1319` does, and percent as that line percentises it. §82.1 made
      `/merged`'s absence of these the reason the Overview tab could not be
      reused; without them the cumulative tab's TWR p.a. tile reads `—` forever.
      > **The withholding predicate is shared on purpose**
      > (`annualizedReturnWithheldReason` = ≥60 points AND ≥90 calendar days),
      > so the aggregate tile and the per-portfolio tile can never disagree about
      > the same window. Do not "helpfully" lower the floor for the aggregate:
      > it has more points than any single portfolio, so it is the side that
      > least needs the exemption.
      > **Unit trap, restated because this is a third call site:**
      > `annualizedReturn()` returns a **fraction**; `/:id/analytics` sends a
      > **percent** under the same field name, and `/:id/risk-metrics` sends the
      > fraction. §83.2 writes to the analytics shape, so percent it.
- [x] **`moneyWeightedReturnWithheldReason` mirrors `/:id/analytics`, which is
      hardcoded `null` (`:1545`).** `buildMwr` silently falls back to
      `buildSimple` when XIRR has no sign change (`:129-131`), so a value with
      `null` reason is not proof the number is an XIRR. Do not invent a new
      reason here — that would be a fourth answer. Record it as the same
      (accepted) defect the per-portfolio tab has, and let §83.2's test pin the
      *current* behaviour so the two tabs cannot diverge.
- [x] **Populate `monthlyReturns`** with `buildMonthlyReturns` (`:1294`) over the
      aggregate TWR index, so the Returns Chart is not empty — and, since §82.3
      landed, so the **Yearly** toggle has an index to walk. Yearly availability
      is still gated on `timeframe === "ALL"` in the SPA (`:467`); `/merged` must
      therefore honour `?timeframe=ALL` as the full window or the toggle shows a
      partial year as a whole one.
- [x] **Fix the early return at `:749-782`.** When *any* portfolio has fewer than
      2 snapshots, the route returns `backfillStatus:"pending"` with an **empty
      series** — so one brand-new portfolio erases every other portfolio's history
      from a view whose entire purpose is the cumulative total. Return the partial
      sum *and* the pending flag, keeping §72.7's rule that reporting a mid-rebuild
      portfolio is a read and firing a backfill from a GET is not.
- [x] Tests — a deposit into one of two portfolios must leave the aggregate TWR
      **unchanged** (§81.1's invariant, applied to the aggregate: this is the test
      that would have caught the missing `net_flow`); an internal transfer between
      two of the user's own portfolios leaves it unchanged; `Π(1 + monthlyReturns)`
      reconciles to `cumulativeTwr` at the last point; one portfolio with < 2
      snapshots still returns the other portfolios' series plus
      `backfillStatus:"pending"`.
- [x] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` (tsc) green.
- [x] Commit `feat(wallets): build the aggregate TWR and monthly returns in /merged`


> Landed in `portfoliost-wallets@31aed4b`: `/merged` now selects `net_flow`,
> `unpriced_value` and `carried_value`; `sumSnapshotsByDateForwardFilled` carries value
> and invested forward but counts flow only on its own date; `buildMergedPerformance`
> derives `cumulativeTwr` / `timeWeightedReturn` / `moneyWeightedReturn` /
> `simpleReturnPercent` / `annualizedReturn` (+ withheld reason) / `monthlyReturns` from
> `returnColumns.ts` + `riskMetrics.ts`, never from a stored column. `buildMonthlyReturns`
> MOVED from `routes/portfolios.ts` to `returnColumns.ts` so one month-boundary rule serves
> both routes. The pending early-return now returns the partial sum with the flag.
> 574 tests green, `tsc` clean.
>
> **Two boxes above were written before the code existed and needed widening, both
> recorded in the diff rather than worked around:**
> 1. The plan asked only for the two withheld *amounts*, but
>    `PortfolioPerformanceChart`'s chip needs a COUNT beside the amount —
>    `gapMessage` returns `""` when both `gapSymbols` and `heldGapSymbols` are
>    absent (`PortfolioPerformanceChart.vue:126-147`). Threading the amounts alone
>    would have left the honesty warning silent. `/merged` therefore also returns the
>    UNION of the per-portfolio `getGapSymbols` claims via a new `aggregateGapSymbols`
>    helper — a union, not a re-derivation, and `null` (not `[]`) when nothing claims
>    a gap, per §72.30.
> 2. `unpricedValue`/`carriedValue` had to become tri-state on the aggregate: a
>    contributor that did not measure them makes the whole sum `null` (unknown), not
>    a sum of the measured ones. Summing past an unmeasured row would report "nothing
>    withheld" on exactly the series that need the warning — the same argument the
>    per-portfolio route makes at `portfolios.ts:1272-1277`.
### 83.3 — Benchmark overlays on the aggregate

- [x] **Accept `?benchmarks=SPY,QQQ` on `/merged`** and mirror the benchmark block
      at `:1295-1323`: aggregate `dailyExternalFlows` across **all** the user's
      portfolios, seed with the aggregate `invested` at the window start, and call
      `buildBenchmarkSeries` per symbol in the **aggregate base** currency.
      > Give `dailyExternalFlows` (`cashLedger.ts:255-287`) a
      > `string | string[]` portfolio filter rather than writing a second flow
      > reader. It already owns the external-only rule and the per-day historical
      > FX rate (`rateToBase(..., day)`, `:307`), and both are exactly what a
      > second implementation gets subtly wrong.
      > Its per-day rate is deliberately **unlike** §83.6's single spot rate on
      > the value series. A benchmark must pay for the flows on the day they
      > happened; the value series is a constant-currency restatement. Do not
      > "unify" them.
- [x] **Pin the internal-transfer case with a test, not an assumption.** Both legs
      are external-only-excluded per portfolio, so neither reaches the aggregate
      flow map and the benchmark is not perturbed by money moving between the
      user's own portfolios.
- [x] No contract change and no persistence (see recorded decisions above).
- [x] Tests: a fixture where a deposit buys the benchmark and the line rises with
      the market only on flow-free days; an internal transfer does not perturb it;
      unknown tickers are dropped (`:1321`); no `benchmarks` param → `[]` as today.
- [x] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` green.
- [x] Commit `feat(wallets): support benchmark overlays on the merged series`


> Landed in `portfoliost-wallets@d0f4263`: `dailyExternalFlows` takes
> `string | string[]` (`inArray` for the array case) so `/merged` sums the user's flows with the
> function that already owns the external-only rule and the per-day rate; `/merged` accepts
> `?benchmarks=` + `?benchmarkCalcType=`, seeds with the aggregate `invested` at the window
> start, and drops unknown tickers. `BenchmarkBuildContext.portfolioId` became OPTIONAL
> with a note — `buildBenchmarkSeries` never read it (`grep ctx.portfolioId` is empty), and
> the aggregate has no single portfolio to put there; inventing one would put a lie in a
> field that looks like it scopes something.
> Three route tests pin it: the deposit line is `[100, 100, 110]` (flat ON the deposit day —
> a value-ratio mirror prints 200 there and claims +120%), the paired transfer leaves the
> line at `[100, 100, 110]` / +10%, and an unknown ticker drops the overlay while the
> aggregate series still comes back. 577 tests green, `tsc` clean.

> Landed in `portfoliost-wallets@d0f4263`: `dailyExternalFlows` takes
> `string | string[]` (`inArray` for the array case) so `/merged` sums the user's flows with the
> function that already owns the external-only rule and the per-day rate; `/merged` accepts
> `?benchmarks=` + `?benchmarkCalcType=`, seeds with the aggregate `invested` at the window
> start, and drops unknown tickers. `BenchmarkBuildContext.portfolioId` became OPTIONAL
> with a note — `buildBenchmarkSeries` never read it (`grep ctx.portfolioId` is empty), and
> the aggregate has no single portfolio to put there; inventing one would put a lie in a
> field that looks like it scopes something.
> Three route tests pin it: the deposit line is `[100, 100, 110]` (flat ON the deposit day —
> a value-ratio mirror prints 200 there and claims +120%), the paired transfer leaves the
> line at `[100, 100, 110]` / +10%, and an unknown ticker drops the overlay while the
> aggregate series still comes back. 577 tests green, `tsc` clean.
83.4 needs no new route and no contract change.
- `currentDrawdownPercent(points)` — `src/utils/drawdown.ts`, reads `cumulativeTwr`
  first with a raw-`value` fallback (§81.3)

**Ordering: satisfied.** §81.1–81.3 landed in `811d942`; §82 landed in `05c6855`,
`d02a289`, `a3275be`, `b667c5d`, `ed62b62`. §83.1 now edits the file §82.2–82.4
also edited, so the D85–D89 metrics are already in it — §83.1 is the extraction,
not the introduction.

**Revised 2026-10-02 after §82 landed — what that changed here.** §83 was drafted
against a `PortfolioPerformanceTab.vue` that had no Overview card, one Returns
Chart and no per-year view. It is now 788 lines carrying all of that, so three
things in this section are no longer accurate as written and are corrected in
place below:

1. **The tab grew a second consumer-shaped dependency.** §82.2's Overview card
   (Net gain / Net invested / XIRR / TWR p.a. / Timing) and §82.3's Monthly |
   Yearly toggle read `performance.annualizedReturn`,
   `annualizedReturnWithheldReason`, `moneyWeightedReturn`,
   `moneyWeightedReturnWithheldReason` and `timeframe`. So §83.2 must populate
   `annualizedReturn` **and its withheld reason** on the aggregate, not just the
   return scalars — a tab whose TWR p.a. tile always renders `—` while the
   per-portfolio tab shows a number is the exact "looks like a working page"
   failure §83.6's last test is written to catch. §83.3 and §83.4 are unaffected:
   benchmarks and risk ratios were already declared.
2. **§83.1's extraction surface grew.** Four more things cannot move as-is and
   must become props or internal state: `store.analyticsTimeframe` (which gates
   the Yearly toggle's availability, `:467`), `firstBenchmark` (`:485`),
   `excessByYear` (`:488`), and the `<script lang="ts">` block (`:1-117`) holding
   `yearlyReturns` / `benchmarkYearlyReturns` / `yearlyTotals`. The math block
   travels *with* the template — it is the D88 derivation the Yearly table needs —
   so the existing unit test's import path changes (one line; §83.1).
3. **The FX caveat moved from a footnote to the headline.** §82.2's two money
   tiles (`totalReturn`, `totalInvested`) are the numbers a reader checks against
   their own bank balance, and on a multi-currency aggregate they are the most
   constant-currency-shaped figures on the page. §83.6 says so where those tiles
   are, not only in a footnote under the chart.

Recorded decisions (resolved with the user):

- **Benchmarks need no contract change and no persistence.** `benchmarks[]` is
  already declared on `PortfolioAnalytics` (`openapi.yaml:1545`); `/merged`
  simply ignores the query param today. The selection is per-request store state
  (`stores/portfolios.ts:81-91`), not a DB column, so there is no schema to add.
- **Performers need one contract addition** — see §83.5. `/held-stocks`
  (`portfolios.ts:498`) is *not* reusable: it aggregates by symbol across
  portfolios, drops P/L entirely, and hardcodes `changePercent: 0`.
- **The existing `combined-chart` card is replaced, not duplicated.**
  `InvestmentsView.vue:382-410` renders the same endpoint through the same chart;
  leaving both puts the same curve on two adjacent pages.
- **FX is constant-currency by construction** and the tab must say so — see §83.6.

### 83.1 — Extract `PerformanceTabContent.vue` with no behaviour change

- [x] **Move the tab body** (Overview card, chart card, Drawdown card, Returns
      Chart, Top/Bottom Performers) out of `PortfolioPerformanceTab.vue` into
      `src/components/PerformanceTabContent.vue` — `docs/COMPONENTS.md`: used by
      ≥2 places, so `src/components/`, not the module folder. Props: `analytics`,
      `riskMetrics`, `positions`, `baseCurrency`, `selectedBenchmarks`,
      `timeframe`, `loading`, `backfillPending`, `recomputing`, `testid`,
      `titlePrefix?`. Emits `update:selectedBenchmarks`, `update:timeframe` and
      `recompute`. Take a `testid` prop and prefix every testid with it, per
      `COMPONENTS.md`.
      > The nine things that cannot move as-is and must become props or emits
      > (line numbers are the landed 788-line file): `route.params.id` (`:138`),
      > `store.analytics` (`:141`, `:293`, `:473`), `getPortfolioRiskMetrics(id)`
      > (`:232`), `store.positions` (`:312`),
      > `store.setBenchmarks(syms, id)` (`:203`), `store.detail.baseCurrency`
      > (`:366`), **`store.analyticsTimeframe` (`:467`, added by §82.3 — it is
      > what makes Yearly available at all, so it must be a prop and the emit a
      > `update:timeframe`; letting the component own it would leave the
      > aggregate's selector writing per-portfolio store state)**.
      > `firstBenchmark` (`:485`) and `excessByYear` (`:488`) derive from the
      > `analytics` prop, so they move as computeds untouched. The `chartRate` /
      > `displayCurrencyOr` pair (`:378`) and `convertedPnl` (`:350`) stay
      > **inside** the component — both are pure functions of props plus the
      > display-currency store, so both tabs get them for free. That is the whole
      > return on this refactor. Purely local UI state moves inside with it:
      > `returnsMode` (`:464`), `showCustomTimeframe` (`:140`), the whole
      > Customize modal incl. `InstrumentSearchModal` + `benchmarkOptions`
      > (`:133`, `:153-205`).
- [x] **Move the `<script lang="ts">` block with the template** (`:1-117`) —
      `yearlyReturns`, `benchmarkYearlyReturns`, `yearlyTotals`, `YearlyReturnRow`,
      `YearlyReturnTotals`, `yearRows`. It is the D88/D89 derivation, and the
      Yearly table in the template consumes it, so splitting the two would leave
      a component whose testids and whose maths live in different files.
      `tests/unit/modules/portfolios/PortfolioPerformanceTab.test.ts:4-8`
      therefore changes its **import path only** (to
      `@/components/PerformanceTabContent.vue`); no assertion changes. Do **not**
      re-export the functions from the wrapper to avoid that edit — two import
      paths for one derivation is how the two tabs end up with two answers.
- [x] **Keep every existing `data-testid` string.** `PortfolioPerformanceTab.test.ts`
      and `tests/e2e/performance-display-currency.spec.ts` +
      `tests/e2e/parity-portfolios.spec.ts` select on them; a rename breaks three
      specs for no gain. Testids are stable API per `COMPONENTS.md`. (The
      `testid` prop therefore prefixes the *aggregate* copy only — the
      per-portfolio mount must pass `testid=""` and render byte-identical ids.)
- [x] **Keep `PortfolioPerformanceTab.vue` as a thin route wrapper** that fetches,
      converts and delegates, so its behaviour is unchanged by construction. It
      keeps the `AnalyticsTimeframe` state machine: `changeTimeframe` (`:244`),
      the 5s backfill poll (`:214`) and `handleRecompute` (`:257`).
- [x] Tests: a new `tests/unit/components/PerformanceTabContent.test.ts` porting
      the cases from `PortfolioPerformanceTab.test.ts` against the component
      directly — tiles render payload values, `annualizedReturn: null` with a
      reason renders `—` and hides the Timing line, a display-currency switch
      re-renders the money tiles without a remount. The existing
      `PortfolioPerformanceTab.test.ts` and `InvestmentsView.test.ts` pass
      **unmodified** apart from that import line.
- [x] Tests: `npm run build` (includes `vue-tsc --noEmit`) and `npm run test` green.
- [x] Commit `refactor(spa): extract the performance tab body into a prop-driven component`


> Landed in `c5096c0`: the extracted component is `src/components/PerformanceTabContent.vue`
> (id-prefix convention `${tid}-<field>`, unset on this mount), the wrapper keeps only the
> fetch/poll/recompute state machine, and the `<script lang="ts">` block moved with the
> template. All 25 `data-testid` strings verified byte-identical against `HEAD` (the four
> per-year ones as `` `${tid('perf-returns-yearly-*')}-${row.year}` ``). `vue-tsc` clean;
> 583 unit tests green, of which 5 are new in
> `tests/unit/components/PerformanceTabContent.test.ts`.
### 83.2 — `/merged`: sum the flows and build the aggregate return columns

The only step that makes the tab possible. Everything after it is presentation.

- [x] **Add `netFlow`, `unpricedValue` and `carriedValue`** to the `/merged`
      SELECT (`portfolios.ts:786-792`) and thread all three through
      `sumSnapshotsByDateForwardFilled` (`mergedAnalytics.ts:83`) so the aggregate
      sums them per date exactly as it already sums `value` / `invested`. A
      portfolio with no row on date *d* contributes its carried value and **0**
      flow, so its slice of that day's return is 0 — which is correct, not an
      omission.
      > The two withheld amounts are not optional. They are what fires
      > `PortfolioPerformanceChart`'s §78.5 chip (`:109-146`), which reports
      > *"up to 10,465 PLN is missing from this curve"*. Omitting them reuses a
      > chart component with its honesty warning silently disarmed — on the one
      > screen where a wrong total is most expensive. `unpricedValue` must stay
      > **absent rather than 0** on a row that predates the column, for the reason
      > the per-portfolio route spells out at `portfolios.ts:1268-1277`.
- [x] **Chain the aggregate TWR** through `buildDailyReturns` + `chainReturns`
      (`returnColumns.ts:43`, `:53`) — the same path `buildTwr` takes. Do not
      re-derive `Vₜ/(Vₜ₋₁+Fₜ)−1` here, and do not read any stored
      `cumulative_twr` column: those are per-portfolio and summing indices is
      meaningless.
- [x] **Emit per-point `cumulativeTwr`** on the aggregate series, and the scalars
      `timeWeightedReturn` / `moneyWeightedReturn` / `simpleReturnPercent` from
      the last index point, mirroring `:1381-1389`. The aggregate MWR has no
      stored `cumulative_mwr` column to read, so compute it with
      `buildMwr(aggValues, aggFlows, aggDates)` (`returnColumns.ts:109`) at
      request time and read its last element the same way.
- [x] **Populate `annualizedReturn` + `annualizedReturnWithheldReason`** —
      `annualizedReturnWithheldReason(index, dates)` then
      `annualizedReturn(index, dates)` (`riskMetrics.ts:213` / `:177`), exactly
      as `:1305-1319` does, and percent as that line percentises it. §82.1 made
      `/merged`'s absence of these the reason the Overview tab could not be
      reused; without them the cumulative tab's TWR p.a. tile reads `—` forever.
      > **The withholding predicate is shared on purpose**
      > (`annualizedReturnWithheldReason` = ≥60 points AND ≥90 calendar days),
      > so the aggregate tile and the per-portfolio tile can never disagree about
      > the same window. Do not "helpfully" lower the floor for the aggregate:
      > it has more points than any single portfolio, so it is the side that
      > least needs the exemption.
      > **Unit trap, restated because this is a third call site:**
      > `annualizedReturn()` returns a **fraction**; `/:id/analytics` sends a
      > **percent** under the same field name, and `/:id/risk-metrics` sends the
      > fraction. §83.2 writes to the analytics shape, so percent it.
- [x] **`moneyWeightedReturnWithheldReason` mirrors `/:id/analytics`, which is
      hardcoded `null` (`:1545`).** `buildMwr` silently falls back to
      `buildSimple` when XIRR has no sign change (`:129-131`), so a value with
      `null` reason is not proof the number is an XIRR. Do not invent a new
      reason here — that would be a fourth answer. Record it as the same
      (accepted) defect the per-portfolio tab has, and let §83.2's test pin the
      *current* behaviour so the two tabs cannot diverge.
- [x] **Populate `monthlyReturns`** with `buildMonthlyReturns` (`:1294`) over the
      aggregate TWR index, so the Returns Chart is not empty — and, since §82.3
      landed, so the **Yearly** toggle has an index to walk. Yearly availability
      is still gated on `timeframe === "ALL"` in the SPA (`:467`); `/merged` must
      therefore honour `?timeframe=ALL` as the full window or the toggle shows a
      partial year as a whole one.
- [x] **Fix the early return at `:749-782`.** When *any* portfolio has fewer than
      2 snapshots, the route returns `backfillStatus:"pending"` with an **empty
      series** — so one brand-new portfolio erases every other portfolio's history
      from a view whose entire purpose is the cumulative total. Return the partial
      sum *and* the pending flag, keeping §72.7's rule that reporting a mid-rebuild
      portfolio is a read and firing a backfill from a GET is not.
- [x] Tests — a deposit into one of two portfolios must leave the aggregate TWR
      **unchanged** (§81.1's invariant, applied to the aggregate: this is the test
      that would have caught the missing `net_flow`); an internal transfer between
      two of the user's own portfolios leaves it unchanged; `Π(1 + monthlyReturns)`
      reconciles to `cumulativeTwr` at the last point; one portfolio with < 2
      snapshots still returns the other portfolios' series plus
      `backfillStatus:"pending"`.
- [x] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` (tsc) green.
- [x] Commit `feat(wallets): build the aggregate TWR and monthly returns in /merged`


> Landed in `portfoliost-wallets@31aed4b`: `/merged` now selects `net_flow`,
> `unpriced_value` and `carried_value`; `sumSnapshotsByDateForwardFilled` carries value
> and invested forward but counts flow only on its own date; `buildMergedPerformance`
> derives `cumulativeTwr` / `timeWeightedReturn` / `moneyWeightedReturn` /
> `simpleReturnPercent` / `annualizedReturn` (+ withheld reason) / `monthlyReturns` from
> `returnColumns.ts` + `riskMetrics.ts`, never from a stored column. `buildMonthlyReturns`
> MOVED from `routes/portfolios.ts` to `returnColumns.ts` so one month-boundary rule serves
> both routes. The pending early-return now returns the partial sum with the flag.
> 574 tests green, `tsc` clean.
>
> **Two boxes above were written before the code existed and needed widening, both
> recorded in the diff rather than worked around:**
> 1. The plan asked only for the two withheld *amounts*, but
>    `PortfolioPerformanceChart`'s chip needs a COUNT beside the amount —
>    `gapMessage` returns `""` when both `gapSymbols` and `heldGapSymbols` are
>    absent (`PortfolioPerformanceChart.vue:126-147`). Threading the amounts alone
>    would have left the honesty warning silent. `/merged` therefore also returns the
>    UNION of the per-portfolio `getGapSymbols` claims via a new `aggregateGapSymbols`
>    helper — a union, not a re-derivation, and `null` (not `[]`) when nothing claims
>    a gap, per §72.30.
> 2. `unpricedValue`/`carriedValue` had to become tri-state on the aggregate: a
>    contributor that did not measure them makes the whole sum `null` (unknown), not
>    a sum of the measured ones. Summing past an unmeasured row would report "nothing
>    withheld" on exactly the series that need the warning — the same argument the
>    per-portfolio route makes at `portfolios.ts:1272-1277`.
### 83.3 — Benchmark overlays on the aggregate

- [x] **Accept `?benchmarks=SPY,QQQ` on `/merged`** and mirror the benchmark block
      at `:1295-1323`: aggregate `dailyExternalFlows` across **all** the user's
      portfolios, seed with the aggregate `invested` at the window start, and call
      `buildBenchmarkSeries` per symbol in the **aggregate base** currency.
      > Give `dailyExternalFlows` (`cashLedger.ts:255-287`) a
      > `string | string[]` portfolio filter rather than writing a second flow
      > reader. It already owns the external-only rule and the per-day historical
      > FX rate (`rateToBase(..., day)`, `:307`), and both are exactly what a
      > second implementation gets subtly wrong.
      > Its per-day rate is deliberately **unlike** §83.6's single spot rate on
      > the value series. A benchmark must pay for the flows on the day they
      > happened; the value series is a constant-currency restatement. Do not
      > "unify" them.
- [x] **Pin the internal-transfer case with a test, not an assumption.** Both legs
      are external-only-excluded per portfolio, so neither reaches the aggregate
      flow map and the benchmark is not perturbed by money moving between the
      user's own portfolios.
- [x] No contract change and no persistence (see recorded decisions above).
- [x] Tests: a fixture where a deposit buys the benchmark and the line rises with
      the market only on flow-free days; an internal transfer does not perturb it;
      unknown tickers are dropped (`:1321`); no `benchmarks` param → `[]` as today.
- [x] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` green.
- [x] Commit `feat(wallets): support benchmark overlays on the merged series`


> Landed in `portfoliost-wallets@d0f4263`: `dailyExternalFlows` takes
> `string | string[]` (`inArray` for the array case) so `/merged` sums the user's flows with the
> function that already owns the external-only rule and the per-day rate; `/merged` accepts
> `?benchmarks=` + `?benchmarkCalcType=`, seeds with the aggregate `invested` at the window
> start, and drops unknown tickers. `BenchmarkBuildContext.portfolioId` became OPTIONAL
> with a note — `buildBenchmarkSeries` never read it (`grep ctx.portfolioId` is empty), and
> the aggregate has no single portfolio to put there; inventing one would put a lie in a
> field that looks like it scopes something.
> Three route tests pin it: the deposit line is `[100, 100, 110]` (flat ON the deposit day —
> a value-ratio mirror prints 200 there and claims +120%), the paired transfer leaves the
> line at `[100, 100, 110]` / +10%, and an unknown ticker drops the overlay while the
> aggregate series still comes back. 577 tests green, `tsc` clean.
### 83.4 — Aggregate drawdown: no new route, no SPA arithmetic

Written this way because §81.1 made `computeRiskMetrics` **pure** — it takes
`(returns, dates)` and nothing else. After §83.2 the route already holds both.

- [x] **Populate the already-declared `performance.*` risk fields inline on
      `/merged`** — `maxDrawdown`, `sharpeRatio`, `sortinoRatio`, `calmarRatio`,
      `volatility`, `winRate` — by calling
      `computeRiskMetrics(buildDailyReturns(aggValues, aggFlows), aggDates)`
      (`riskMetrics.ts:242`). Every one of those keys is already declared
      (`openapi.yaml:1484-1491`), so this is wiring, not schema: **no
      `/merged/risk-metrics` route and no contract change.**
      > This is a deliberate transport divergence from the per-portfolio tab,
      > which reads `maxDrawdown` from a separate `/:id/risk-metrics` call. The
      > *numbers* come from the same `computeRiskMetrics`, so they cannot drift —
      > but do not hand-roll a second Max Drawdown in the SPA to "make it
      > symmetric". That is the drift this step exists to prevent.
      > **Units are the per-route ones, deliberately.** `computeRiskMetrics`
      > returns `annualizedReturn` as a **fraction** (that is what
      > `/:id/risk-metrics` ships), while `performance.*` on `/merged` is the
      > analytics shape, where `/:id/analytics` ships **percents** (`:1311-1319`).
      > So the one field this step writes twice — `annualizedReturn`, populated in
      > §83.2 — must be the analytics unit here too, and `maxDrawdown` /
      > `sharpeRatio` / `sortinoRatio` / `calmarRatio` / `volatility` / `winRate`
      > keep the ratios-as-fractions form the Risk tab already shows. Writing the
      > risk-metrics form onto `/merged` would put the same contract field at two
      > magnitudes on one response, which is the defect §82.1's comment records.
- [x] **Do not add a Max Drawdown tile to the aggregate tab** beyond the one the
      Drawdown card already renders. Per D89, risk *ratios* stay on the Risk tab;
      the aggregate has no Risk tab, so drawdown is the only one of these that
      travels, and it travels because the existing card needs it.
- [x] Test: the §81.3 fixture on the aggregate path — `cumulativeTwr` of
      `{100, 50, 150, 75}` reports **−75%**, not −50%, and
      `currentDrawdownPercent` (which the card calls for Current) agrees with
      `maxDrawdown` on the peak-to-trough leg.
- [x] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` green.
- [x] Commit `feat(wallets): return aggregate risk metrics on the merged series`


> Landed in `portfoliost-wallets@afb993c`: `buildMergedPerformance` now calls
> `computeRiskMetrics(buildDailyReturns(values, flows), dates)` and copies `maxDrawdown`,
> `sharpeRatio`, `sortinoRatio`, `calmarRatio`, `volatility`, `winRate` onto `performance`.
> No new route, no contract change — every key was already declared at
> `openapi.yaml:1484-1491`. `annualizedReturn` is deliberately NOT copied from the risk
> result: that field is a FRACTION and §83.2's is the analytics PERCENT, so the last box's
> unit rule is enforced by the code rather than by a reviewer's memory.
> The §81.3 fixture on the aggregate path reports **−75%**, and the emitted index peaks at
> 100 and ends at 25, which is what `currentDrawdownPercent` reads for the Current tile.
> 579 tests green, `tsc` clean.
### 83.5 — Cross-portfolio performers: one contract addition and a bulk route

- [ ] **Contracts:** add `GET /api/portfolios/positions` → `{ positions: Position[] }`,
      reusing the already-declared `Position` schema (`openapi.yaml:1382`), which
      carries `portfolioId`, `unrealizedGainLoss`, `percentageChange`,
      `instrumentCurrency`, `country` and `assetType` — everything the two
      performer cards render. Add **`portfolioName: { type: string, nullable: true }`
      to `Position`** in the same push: the aggregate cards must say which
      portfolio each row came from, since one ticker can be held in two
      portfolios with very different results, and the per-portfolio tab simply
      does not need the label because its whole page is that portfolio. Nullable,
      so the per-portfolio route keeps satisfying the schema unchanged.
      Then the `AGENTS.md` workflow: push `main`, let CI bump the patch and
      publish, then `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new-version>`
      and `npm run gen:types`.
      > This is the only contract change in the section — §83.2/§83.3/§83.4 are
      > all wiring against fields already declared, so this is the one release to
      > get right.
- [ ] **Wallets:** register the route **above `/:id`** — the `:726` precedent, or
      `"positions"` is parsed as a portfolio id — selecting open positions for the
      identity ordered by `unrealizedGainLoss` desc, reusing the wire-shaping of
      `GET /:id/positions` (`portfolio-transactions.ts:1197`) so the two responses
      cannot drift.
- [ ] **SPA:** `getAllPositions()` in `api/portfolios.ts`; `TotalPerformanceView.vue`
      passes the result to `PerformanceTabContent` as `positions`. No new card —
      the existing performers block already sorts on `unrealizedGainLoss`
      (`PortfolioPerformanceTab.vue:311-318`). Render `portfolioName` as a
      secondary line under the ticker, omitted when null so the per-portfolio
      cards are unaffected.
- [ ] Tests: contract validation; a wallets route test asserting the response is
      the `Position[]` shape, carries `portfolioName`, and is scoped to the
      identity (another user's positions never appear); an SPA case asserting the
      aggregate list spans more than one portfolio and labels each row.
- [ ] Commit, one per repo in `AGENTS.md` order: `feat(contracts): declare the
      all-portfolios positions endpoint` → `feat(wallets): serve all open
      positions` → `feat(spa): show cross-portfolio performers on the cumulative
      tab`.

### 83.6 — Route, tab, view; retire the duplicate card; state the FX caveat

- [ ] **Add the tab** to `src/modules/portfolios/InvestmentsTabs.vue` (`:8-30`,
      the `tabs` array) after `Portfolios`, and route `investments/performance`
      → `TotalPerformanceView.vue` in `router/index.ts` (beside `:59`). Both
      files live under `src/modules/portfolios/`, not `src/views/`.
- [ ] **`TotalPerformanceView.vue` owns exactly what the per-portfolio wrapper
      owns:** the `/merged` fetch, the timeframe selector (which `PerformanceTabContent`
      now emits `update:timeframe` for, rather than writing
      `store.analyticsTimeframe` — that state is per-portfolio and this view has
      no portfolio), the display-currency conversion off
      `store.totalMetrics.baseCurrency` (the `InvestmentsView.vue:93-107` pattern),
      the recompute fan-out, and the backfill poll. It passes the result into
      `PerformanceTabContent`.
      > `handleMergedRecompute` (`:66-78`) fires `recomputePortfolio` once per
      > portfolio in a `Promise.all` — ten portfolios is ten writes from one
      > button click. Keep the behaviour (it is what the user asked for by
      > clicking it) but put the count in the button label so the cost is visible
      > before it is paid.
- [ ] **Remove the `combined-chart` card** and its `merged*` state from
      `src/modules/portfolios/InvestmentsView.vue` (`:21-78`, `:97-107`,
      `:382-410`) replacing it with a link to the new tab. Same endpoint, same
      chart component — only the placement moves.
- [ ] **State the FX caveat on the tab, next to the Overview card.** `resolveRates`
      (`instruments-fx.ts:153-170`) resolves **one spot rate per pair** and
      applies it across the whole history, so the aggregate is a
      constant-currency total: it excludes FX moves between a portfolio's base
      and the aggregate base. On a single-base portfolio this is invisible; on a
      multi-currency aggregate it is a material omission from "total return", and
      a user reading a flat PLN portfolio's history would otherwise take it for a
      currency call. Say it — do not leave it implicit.
      > **Revised after §82: put it on the Overview card, not under the chart.**
      > §82.2's `perf-overview-net-gain` / `perf-overview-net-invested` tiles
      > render `performance.totalReturn` / `totalInvested` in the display
      > currency, and they are the two numbers a reader checks against a bank
      > balance. A caveat printed below the chart is one scroll away from the
      > tiles it qualifies. The one-line note goes at the top of the Overview
      > card on the aggregate view only — `PerformanceTabContent` must not render
      > it unconditionally, because on a single-base portfolio it would be
      > commentary about a problem the page does not have. Hence a prop.
      > This is existing §68.4 behaviour, unchanged by this section. It becomes
      > *visible* here, not *wrong* here.
- [ ] Tests: retarget `tests/e2e/combined-chart.spec.ts` onto the new tab's
      testids, keeping both existing cases (chart renders; the timeframe selector
      switches). Add cases asserting **every §82 tile is not `—` on the seeded
      aggregate** — TWR, MWR/XIRR, TWR p.a., Timing, and drawdown — a tab that
      renders dashes where the per-portfolio tab renders numbers is the failure
      mode of every step above, and it looks like a working page. Add a case for
      the Yearly toggle, which is new on this tab: `ALL` shows it enabled and a
      non-`ALL` timeframe disables it (`PortfolioPerformanceTab.vue:467`), and the
      Σ footer reconciles to the Net gain tile.
- [ ] Tests: a display-currency switch re-converts chart and tiles together (they
      share a rate). `npm run build` + `npm run test` green.
- [ ] Commit `feat(spa): add the cumulative performance tab`

### 83.7 — Example service parity and the full suite

- [ ] **Playwright side-by-side** against `app.example-service.ai`'s performance page at
      the same viewport, plus the a11y tree. This section adds a page example-service has
      no exact equivalent for, so the comparison is about layout, tile styling and
      wording — adopt example-service's wording verbatim for a money or return tile where it
      does not contradict D85–D89.
- [ ] **Run the whole suite:** `npm run build` (includes `vue-tsc --noEmit`),
      `npm run test`, `npm run test:mock`, `npm run test:e2e` against
      `docker compose up -d --build`. Rebuild the `portfoliost` container after the
      frontend changes and **restart the gateway** afterwards, or only
      wallets-routed e2e paths will 404 for the wrong reason (see `AGENTS.md`).
- [ ] `portfoliost-wallets` suite green; then release per `AGENTS.md` (push
      `main` → GHA bumps `v*` → pin in the homelab helmrelease → Flux applies →
      verify with kubectl).
- [ ] Commit `test(spa): cover the cumulative performance tab in e2e`

---

## 85. Every ticker is a link to its research page (2026-10-02)

User request (no proposal file): *"Extend stock ticker to be clickable. Link
should lead to research page for this stock (bond, fund, etc)."* — and, on
follow-up, not only to add the missing links but to **put a `TickerBadge`
where a symbol is still rendered as plain text** (Top/Bottom Performers,
Dividend History, and the rest of that list).

**Half of this already exists and must not be rebuilt.** §60.1–60.3 established
the only sanctioned way into research — `researchRoute(symbol, route.fullPath)`
(`src/utils/research.ts:14`) plus the `from` query param and
`researchBackTarget` — and wired it at eight call sites. Four surfaces are
already linked: the transactions table (`:390`), the holdings table
(`PortfolioHoldingsTab.vue:417`), the calendar chips
(`PortfolioCalendarTab.vue:218`) and the compare rows
(`PortfolioCompareTab.vue:59`). §85 adds call sites to that same helper. It
introduces no new route, no new component, and no second way to build a link.

**The gap, measured.** An audit of every surface that shows a symbol found:

- **9 files render a `TickerBadge` that is not inside a link** —
  `TransactionFormFields.vue:59` (shared by the Add-Position stock step *and*
  `EditPositionDialog.vue:321`), `AddPositionDialog.vue:555`,
  `EditTransactionModal.vue:184`, `RecordDividendDialog.vue:124`,
  `PortfolioDividendsTab.vue:98`, `PortfolioNewsTab.vue:62`,
  `PortfolioPerformanceTab.vue:685` + `:708`, `ResearchCompare.vue:56`.
- **10 files render a symbol as bare text** — the chart-modal `<h2>`
  (`PortfolioHoldingsTab.vue:578`), the Edit-position (`EditPositionDialog.vue:278`)
  and Add-position (`AddPositionDialog.vue:507`) dialog headings, the yearly
  returns `vs {{ benchmarkSymbol }}` header (`:644`), both Chart-controls
  benchmark lists (`:757`, `:763`), the Charting page chip and comparison
  headers (`ChartingView.vue:130`, `:190`), the public share holdings table
  (`PublicPortfolioView.vue:72`), and the admin bond-catalogue / market-data
  symbol cells (`BondCatalogueView.vue:66`, `MarketDataView.vue:140`, `:187`,
  `:212`).

**Ordering: run §83 first.** §83.1 moves the Top/Bottom Performers block out of
`PortfolioPerformanceTab.vue` into `PerformanceTabContent.vue`. §85.2/§85.3 edit
those exact lines and the Chart-controls modal, so **apply them to
`PerformanceTabContent.vue`, not to the file §83.1 empties.** Doing §85 first
means doing the same four edits twice.

Recorded decisions (resolved with the user):

- **Mechanism: wrap the call site.** Add
  `<router-link :to="researchRoute(sym, route.fullPath)">` around the badge,
  exactly as `TransactionsTable.vue:390`, `PortfolioHoldingsTab.vue:417` and
  `WatchlistsView.vue:128` already do. **No `to` prop on `TickerBadge`** — it
  is documented as "fetches nothing" and each call site passes the data it has
  (`docs/COMPONENTS.md`), and a router-coupled prop breaks its no-router unit
  mounts. **No `TickerLink.vue` wrapper** either: 19 call sites do not justify a
  fourth layer, and the wrapping is the pattern §60.2 already proved.
- **Inside a modal, the badge does not use `router-link`.** `router-link`
  navigates without closing the dialog it sits in, leaving the research page
  under an unmounting overlay. Modal surfaces reuse the emit-then-push path
  those files already have (`EditTransactionModal.goResearch` `:162`,
  `AddPositionDialog.goResearch` `:463`, `PortfolioHoldingsTab.goResearch`
  `:313`) — `emit("close")` first, then
  `router.push(researchRoute(sym, route.fullPath))`. This is also why
  `from` is the page *behind* the modal: the route is unchanged while a modal
  is open.
- **Scope: everywhere, including the public share page and the admin tables.**
- **A symbol that has no research page stays clickable.** `/:symbol/profile`
  already falls back to the bond profile (`portfoliost-instruments/src/routes/instruments.ts:366-375`)
  and `ResearchOverview.vue:217` already renders a "Limited data availability"
  banner for a symbol with identity but no market data. Only a total 404 leaves
  the red error banner — that page is **left exactly as it is**, it is
  pre-existing behaviour and not this section's business.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + e2e against the dockerized stack per `AGENTS.md`).

### 85.1 — `researchBackTarget`: a second allowlisted internal prefix

The one prerequisite, and it is tiny. The share page lives at
`/public/portfolio/:shareId` (`router/index.ts:36-40`, `meta: { public: true }`),
and `researchBackTarget` (`:28-32`) accepts only a `from` starting `/en/` — so a
`from` passed from the share page would be **silently discarded** and "Go back"
would land on `/en/investments` instead of the share.

- [ ] Accept two literal internal prefixes in `researchBackTarget`: `/en/` (as
      today) and `/public/`. Nothing else changes — no scheme, no `//`, no
      relative path can satisfy either, so the open-redirect property is
      identical to what §60.1 established.
      > Do **not** generalise this to "any path that starts with a slash".
      > `/logout` and the catch-all `/:pathMatch(.*)*` are both single-segment
      > or otherwise outside the two prefixes precisely so they cannot be used
      > as a redirect target. Two named prefixes is the whole allowlist.
- [ ] Tests in `tests/unit/utils/research.test.ts`: `/public/portfolio/abc123`
      passes through; `/publicsomething`, `//public`, `http://…`, `public/…`
      (relative) and a non-string still fall back to `/en/investments` — the
      trailing-slash shape matters, so `"/en"` alone must still be rejected.
- [ ] Tests: `npm run test` green.
- [ ] Commit `feat(spa): let the research back link return to a shared portfolio`

### 85.2 — The nine badges that render but do not link

Split by navigation mechanism, per the recorded decision above. Each site gets
`from = route.fullPath` so "Go back" returns to the page the user is on.

- [ ] **`<router-link>` wrap — surfaces with no dialog to close:**
      `PortfolioDividendsTab.vue:98` (Symbol column; the `<tr>` at `:96` has no
      click handler, so the cell is a clean slot), `PortfolioNewsTab.vue:62`
      (article-card header; the sibling title `<a>` at `:73` is unaffected),
      `PortfolioPerformanceTab.vue:685` and `:708` (Top/Bottom Performers `<li>`
      — **in `PerformanceTabContent.vue`**, per the ordering note),
      `ResearchCompare.vue:56` (peer column headers).
      > `ResearchCompare.vue` gets the wrap on **peer columns only**. The
      > primary column (`r.symbol === symbol`, blue at `:54`) must stay a plain
      > badge: `researchRoute` hard-codes `research-overview`, so linking it
      > would silently move the user off the Compare tab to the page they are
      > already on. Its `r.symbol` is also nullable (`:63`) — guard `v-if` on
      > `r.symbol`, which also skips the empty-string badge case.
      > `PortfolioDividendsTab.vue:37` hardcodes `symbol: "—"` on the legacy
      > `history[]` fallback path. `researchRoute("—")` would produce
      > `/en/research/%E2%80%94/overview` — a real link to nothing. **Guard the
      > wrap on a symbol that is neither empty nor `"—"`**, so the legacy table
      > renders its badge plain.
- [ ] **Emit-then-push — surfaces inside a dialog:**
      `TransactionFormFields.vue:59` (shared identity block), `AddPositionDialog.vue:555`
      (Option step), `EditTransactionModal.vue:184`, `RecordDividendDialog.vue:124`.
      Reuse the `view-chart` event rather than adding a new one: in
      `TransactionFormFields` make the badge `@click="emit('view-chart')"` —
      the same thing the "View chart" text button at `:69` already does, and
      `EditTransactionModal.goResearch` already pushes `researchRoute`.
      > This is what gives **`EditPositionDialog.vue` research access at all**.
      > It passes `:show-view-chart="false"` (`:332`) and has **no** `@view-chart`
      > handler, so today that modal has no route into research whatsoever.
      > Add `@view-chart="goResearch"` there — close the dialog, then
      > `router.push(researchRoute(position.symbol, route.fullPath))` — and the
      > badge is the only affordance the modal needs. The same applies to
      > `AddPositionDialog`'s Option step (`:523` already wires `@view-chart`,
      > so the badge reuses it) and to `RecordDividendDialog`, which needs a
      > `goResearch` written because it has neither a button nor a handler.
      > Do **not** make `TransactionFormFields` emit a second, parallel event
      > for the badge. One event, two triggers, one code path.
- [ ] Tests: `PortfolioNewsTab.test.ts:75` asserts the badge lives under
      `article > div` — a `<a>` **inside** that div keeps it passing; do not
      re-parent the badge. New cases: the Dividend History symbol cell renders
      a link to `{ name: "research-overview", params: { symbol: "AAPL" } }` on
      the `items[]` path and a **plain badge, no link**, on the legacy
      `history[]` path (`PortfolioDividendsTab.test.ts`, new file);
      `PortfolioPerformanceTab.test.ts` asserts the Top Performers badge is
      clickable (it stubs `TickerBadge: true` at `:77` — the test must assert
      the wrapping `RouterLink`'s `to`, not the badge); a new
      `EditPositionDialog` case asserts the badge emits `view-chart` while
      `show-view-chart` is false, and that `@view-chart` is handled.
- [ ] Tests: `npm run build` and `npm run test` green.
- [ ] Commit `feat(spa): link every ticker badge that renders without a link`

### 85.3 — Badges where the symbol is still plain text

`docs/COMPONENTS.md` requires instrument logos to go through `TickerBadge` and
holds a checkable invariant: `grep -rn "/api/logos/" src` must return
`TickerBadge.vue` and `RecentSearchesBar.vue` only. Every conversion below
preserves it by construction — that is the reason to convert through the badge
instead of pasting in a `<span>`.

- [ ] **Dialog and modal headings → the badge, still leaving the wording:**
      `PortfolioHoldingsTab.vue:578` (`<h2>` of the full-screen chart modal —
      render `TickerBadge size="lg"` beside the existing `— {{ companyName }}`
      rather than replacing the heading text, since the `h2` is also the
      `role="heading"` the e2e locates), `EditPositionDialog.vue:278`
      (`<h3>Edit {{ symbol }} position</h3>` — put the badge inside the `h3`,
      the `aria-label` at `:276` stays text), `AddPositionDialog.vue:507`.
- [ ] **Chart-controls benchmark rows — the one nested-interactive hazard.**
      `PortfolioPerformanceTab.vue:757` sits inside a `<label>` (`:749`) that
      wraps the row's `<input type="checkbox" @change="toggleDraftBenchmark">`.
      A link there **toggles the checkbox** unless it stops propagation. Wrap in
      `<router-link>` **with `@click.prevent.stop`**, and use the same
      `:to="researchRoute(opt.symbol, route.fullPath)"`.
      `:763` (the Custom rows) has no checkbox and only a sibling Remove
      `button`, so it is a clean wrap. Both are in `PerformanceTabContent.vue`.
      > Keep the visible option **name** at `:756` as-is. That row is
      > "SPDR S&P 500 — SPY", and `researchRoute` needs the symbol, so the badge
      > belongs on the right-hand symbol chip at `:757`, not replacing the
      > human-readable name.
- [ ] **Yearly-returns benchmark header.** `PortfolioPerformanceTab.vue:644`
      renders `vs {{ benchmarkSymbol }}`. Wrap the **symbol** in a
      `<router-link>` with a `TickerBadge size="sm" align="right"`, keeping the
      literal `vs ` text so the column still reads as a comparison.
      > This breaks an exact-text assertion: `PortfolioPerformanceTab.test.ts:597`
      > asserts `perf-returns-yearly-excess-header` `toBe("vs SPY")`, and the
      > badge appends the `(US) ETF` details line. Relax it to
      > `toContain("vs")` + `toContain("SPY")` (cases at `:597`, `:617`,
      > `:627`; the absent-when-no-benchmark case at `:642` still holds).
      > State the reason in the commit body — the text is deliberately richer
      > now, not accidentally different.
- [ ] **Deliberately not converted, with reasons:** `PriceChart.vue:891` (the
      chart `<h2>` renders on the research page itself, where a link would be a
      self-link; the holdings modal that also reaches it already gets a linked
      badge from the line above), `PortfolioHoldingsTab.vue:556` (the
      Confirm-delete message — a navigation target inside a destructive
      confirmation is a mis-click waiting to happen), and
      `InstrumentSearchModal.vue:98` (the badge is inside a `<button>`;
      a nested `<a>` is invalid HTML, and that row already navigates in
      `mode="navigate"` via `openResult` at `:43`).
- [ ] Tests: new `tests/unit/modules/portfolios/PortfolioHoldingsTab.test.ts`
      case for the chart-modal badge (no test file exists for that modal
      today); the relaxed `perf-returns-yearly-excess-header` assertions;
      a `PerformanceTabContent.test.ts` case asserting the Chart-controls
      symbol link carries `@click.prevent.stop` semantics — i.e. clicking it
      does **not** call `toggleDraftBenchmark` (assert by trigger, not by
      reading the attribute).
- [ ] Tests: `npm run build` and `npm run test` green.
- [ ] Commit `feat(spa): show the ticker badge where a symbol was bare text`

### 85.4 — Charting page: the chip links, the comparison headers get a badge

- [ ] `ChartingView.vue:124-141` — wrap the chip's symbol + name in
      `<router-link :to="researchRoute(symbol, route.fullPath)">` with
      `class="min-w-0 truncate"`. **Keep the `rounded-full` pill and do not put
      a `TickerBadge` inside it**: a logo plate in a pill is not example-service's
      geometry, and the chip already carries symbol + name. Confirm against
      `app.example-service.ai` charting at the same viewport in this step's gate, and
      switch to the badge if example-service shows a plate there. The sibling Remove
      `button` (`:137`) keeps its own handler and is unaffected.
      > `tests/e2e/charting.spec.ts:29/54/64/70-71` and
      > `ChartingView.test.ts:52/65/68/78` assert on **counts** of
      > `stock-chip` / `remove-stock`, not chip internals — a wrapping link
      > keeps all of them green. That is the reason to prefer a wrap here over
      > a DOM restructure.
- [ ] `ChartingView.vue:190` — the fundamentals-comparison `<th>` per stock
      becomes `TickerBadge size="sm" align="right"` inside a `<router-link>`,
      matching `ResearchCompare.vue:56` exactly (that table is the same shape:
      `r.symbol` is optional, so guard `v-if="r.symbol"`). Drop the `uppercase`
      on those cells — an uppercase class applied to a company name is a bug
      the research table already documents against (`ResearchCompare.vue:48-51`).
- [ ] Tests: `ChartingView.test.ts` gains a case asserting the chip's link
      `to` is `research-overview` for `AAPL`; `tests/e2e/charting.spec.ts`
      gains a case clicking a chip and asserting
      `/\/en\/research\/[A-Z0-9.-]+\/overview/`.
- [ ] Tests: `npm run build`, `npm run test`, and `npm run test:e2e` green.
- [ ] Commit `feat(spa): link the charting chips and badge the comparison headers`

### 85.5 — Public shared portfolio: the holdings table gets a linked badge

- [ ] `PublicPortfolioView.vue:72` — replace `<td>{{ p.symbol }}</td>` with a
      `<router-link :to="researchRoute(p.symbol, route.fullPath)">` wrapping
      `TickerBadge size="sm"`, keeping the `<td>`'s padding. Pass `from`
      (`route.fullPath` is `/public/portfolio/:shareId`) — §85.1 is what makes
      that survive `researchBackTarget`, and without it "Go back" drops the
      share context entirely.
      `PublicPortfolioShare.portfolio.positions[]` (`src/api/portfolios.ts:380`)
      carries `symbol`; the badge's optional `name` / `countryCode` /
      `assetType` are simply not passed, so the block degrades to logo + ticker,
      which is the documented behaviour (`docs/COMPONENTS.md`).
- [ ] **Say what actually happens to an unauthenticated visitor, in the commit
      body.** `/en/research/:symbol/overview` is `meta: { requiresAuth: true }`,
      so `router.beforeEach` (`router/index.ts:284-286`) bounces a logged-out
      visitor to `/login?redirect=…`. For the owner, who is authenticated, it
      works and "Go back" returns to the share. This is the accepted
      consequence of putting research links on a public page — the alternative
      is a share page whose tickers are the one thing a visitor cannot act on.
      > A `<router-link>` renders as an `<a>` regardless of auth state, so it
      > must not be conditionally hidden on `auth.isAuthenticated` — the SPA
      > cannot know who holds the share, and hiding it would make the page
      > differ per viewer.
- [ ] Tests: new `tests/unit/modules/settings/PublicPortfolioView.test.ts`
      (no test file exists) asserting the holdings cell renders a
      `RouterLink` whose `to` is
      `{ name: "research-overview", params: { symbol: "SNT.WA" }, query: { from: "/public/portfolio/abc" } }`;
      e2e in `tests/e2e/` for the share page asserting
      `href="/en/research/SNT.WA/overview?from=…"` on the row.
- [ ] Tests: `npm run build`, `npm run test` green.
- [ ] Commit `feat(spa): link the tickers on a public shared portfolio`

### 85.6 — Admin: bond catalogue and market data

- [ ] `BondCatalogueView.vue:66` — `TickerBadge size="sm"` inside a
      `<router-link>`, keeping the existing `font-mono font-semibold` cell
      styling for the symbol and leaving the separate Name column at `:67`
      alone.
      > **This is the case the request names explicitly — "bond".** The symbols
      > here are `ROD1033` / `NNEP25`-style series, not equity tickers, and the
      > bond profile fallback (`portfoliost-instruments/src/routes/instruments.ts:366-375`)
      > is what makes the target resolve. `TickerBadge` requests
      > `/api/logos/ROD1033`; confirm the logos endpoint returns a plate rather
      > than a broken image for series with no logo, and if it 404s, accept the
      > alt-text fallback rather than special-casing the badge.
- [ ] `MarketDataView.vue:140` (pending split candidates), `:187` (history),
      `:212` (overflow summary) — same conversion. These carry no name, so the
      badge shows logo + ticker only.
      > These tables are operational, not navigational: a click now navigates
      > away from a half-filled "Apply factor" form at `:153-162`. That is
      > acceptable (the input state is not persisted today anyway) but it must
      > be **noted in the commit body**, not silently shipped.
- [ ] Tests: new unit cases for the three `MarketDataView` tables and
      `BondCatalogueView` asserting each symbol cell is a `RouterLink` with the
      bare symbol in `params.symbol`.
- [ ] Tests: `npm run build` and `npm run test` green.
- [ ] Commit `feat(spa): link instrument symbols in the admin tables`

### 85.7 — The venue-suffix wart, surfaced by this section

Found while auditing the call sites. **§60.2 kept this deliberately** ("keep the
existing `.US` suffix handling"), so it is a decision to revisit, not a
regression — but the request's scope ("bond, fund, etc") makes it visible.

- [ ] `AddPositionDialog.vue:463` appends `.US` to any symbol that lacks it:
      `router.push(researchRoute(symbol.endsWith(".US") ? symbol : `${symbol}.US`, …))`.
      A Polish position therefore produces `/en/research/SNT.WA.US/overview`.
      It **resolves** — `venueFreeSymbol` (`portfoliost-instruments/src/adapters/symbol.ts:21-24`)
      cuts at the last dot and `isSavingsBond` uses it — so this is a wrong-looking
      URL, not a 404. Drop the suffixing and pass the symbol through.
      > Only `AddPositionDialog` does this. Every other surface passes the
      > symbol verbatim, so removing it makes the app consistent rather than
      > changing behaviour anywhere else. Check the e2e regexes
      > (`portfolios.spec.ts:213` and `research.spec.ts:327`) still match — they
      > are written as `/(\.US)?/` precisely because this existed.
- [ ] Tests: a case asserting `goResearch` for a `.WA` and a bare savings-bond
      symbol produces the **unadorned** symbol in `params.symbol`; extend
      `tests/unit/utils/research.test.ts` to record that `researchSymbol`
      uppercases and **does not** strip venue suffixes — it never has, and the
      strip is `venueFreeSymbol`'s job on the backend.
- [ ] Commit `fix(spa): stop appending .US to research links from the position dialog`

### 85.8 — Docs, Example service parity, and the full suite

- [ ] **`docs/COMPONENTS.md`** — under "TickerBadge (the instrument identity
      block)", record that a badge on a portfolio-, charting-, admin- or
      share-page surface is expected to be wrapped in
      `researchRoute(sym, route.fullPath)`, and that dialogs use the
      emit-then-push path instead (§85.2's reason: a `router-link` does not
      close its dialog). Add the two-step **and check** to the section: a badge
      reachable from a portfolio page should be reachable by link.
      Re-verify the existing invariant still holds:
      `grep -rn "/api/logos/" src` → `TickerBadge.vue` and `RecentSearchesBar.vue` only.
- [ ] **Playwright side by side** against `app.example-service.ai` at the same viewport
      for the four surfaces this changes: Holdings → Performance (Top/Bottom
      Performers), Portfolio → Dividends, Charting chips, and a watchlist. This
      is the step that decides the §85.4 chip question; record the comparison in
      the commit body.
- [ ] **E2E for the newly linked surfaces** in `tests/e2e/research.spec.ts`,
      reusing the `Go back` describe block at `:270` so every new entry point
      proves the `from` round-trip, not just the navigation: Top Performers
      (extend `tests/e2e/top-performers-currency.spec.ts:26`, which already
      locates the `SNT.WA` row by text), Dividend History
      (`tests/e2e/dividends.spec.ts:115`), a news card
      (`portfolios.spec.ts:77`), the dialogs (open → click badge → back), and
      the chart modal.
- [ ] **Regression net on the existing specs** that locate badges by role, so
      a link does not break a locator: `research.spec.ts:259`
      (`getByRole("button", { name: "MSFT" })` — the search modal is untouched,
      assert it still passes), `portfolios.spec.ts:72-74`
      (`getByRole("link", { name: "META" })`) and `:77-104`
      (`getByTestId("ticker-badge")` on the news cards).
- [ ] **Full suite:** `npm run build` (includes `vue-tsc --noEmit`),
      `npm run test`, `npm run test:mock`, `npm run test:e2e` against
      `docker compose up -d --build`. Rebuild the `portfoliost` container after
      the frontend changes and **restart the gateway** afterwards, or only
      wallets-routed paths will 404 for the wrong reason (`AGENTS.md`).
- [ ] Commit `test(spa): cover ticker-to-research links in e2e and document the rule`

---

## 86. Key facts per instrument class — bonds, funds, ETFs, crypto (2026-10-02)

User request (no proposal file): *"Make a specific 'key facts' in Research per
instrument. Currently it is designed for stocks, but we have bonds, funds, crypto
and they have their own specific information we currently miss, even different
bonds types has different info."*

**The gap, measured, not assumed.** The Key Facts card
(`ResearchOverview.vue:297-335`) is eight hard-coded `<dt>/<dd>` pairs — Name,
Sector, Industry, Country, ISIN, Exchange, Employees, CEO. Six of those are
shared identity; **Sector, Industry, Employees and CEO are equity-only**, and for
any non-equity symbol all four render a dash. Four of the eight are *already
fetched and thrown away at the last step*:

- **`etf_category` is populated and never displayed.** The profile route maps it
  into `finnhubIndustry` (`routes/instruments.ts:446`) and separately into
  `gicsSector` (`:447`); the card reads `gicsSector` for "Sector" and
  `gicsIndustry` for "Industry", and `translate.ts:221-224` hard-codes
  `gicsSector`/`gicsIndustryGroup`/`gicsIndustry`/`gicsSubIndustry` all `null`.
  Verified live in the local reference table: `etf_category` holds
  `"Equity"` / `"Fixed Income"` for 16 530 ETF rows. **The cheapest real win in
  this section is a row the backend already fills.**

**`toInstrumentProfile` is the lossy point, and it is lossy for every class.**
`translate.ts:189-231` reads only equity-shaped keys. For a savings bond the
provider returns ten fields and the translator emits three. For a Catalyst
corporate bond it returns thirteen and emits three. Verified live through
cachest on 2026-10-02:

```
GET :8090/fixedincome/profile/…  → upstream 404 (no emissions synced locally)
GET :8090/corp-bond/profile/BST0327
  {"symbol":"BST0327","name":"Best S.A.","isin":"PLBEST000333",
   "stock_exchange":"GPW RR","hq_country":"PL","asset_type":"corp_bond",
   "issuer":"Best S.A.","series":"W3","market":"GPW RR","status":"Notowane",
   "nominal_value":"100.0","nominal_currency":"PLN","secured":"NIE",
   "coupon_type":"zmienne WIBOR 3M + 4%","current_rate":"7.83%",
   "maturity_date":"2027-03-07","country":"PL","currency":"PLN"}
GET :8090/crypto/profile/BTC-USD
  {"symbol":"BTC-USD","currency":"USD","price":84127.1484,"date":"2026-10-02"}
```

Every one of those bond fields — issuer, series, coupon type, current rate,
maturity, secured, status, nominal — is **already in production through the
provider tier, is cached by cachest, and dies in the translator.**

**Two provider profiles are never called at all.** `src/adapters/cachest.ts` has
`fetchBondProfile` (`:138-140`, `/fixedincome/profile`) and has **no**
`fetchCorpBondProfile` and **no** `fetchCryptoProfile`, although both routes
already exist and are configured — `cachest/config.yaml:183-190`
(`OPENST_CORP_BOND_PROFILE`, `cache_ttl 86400`) and `:243-249`
(`OPENST_CRYPTO_PROFILE`, `cache_ttl 21600`), served from `openst/src/main.py:650`
and `:454`. Consequence, and it is a live bug rather than a missing feature: a
Catalyst bond symbol is not a savings bond, so `isSavingsBond` is false, the
profile route tries the **equity** tier (`:367`), and on failure tries the
**savings-bond** tier (`:456`) — which obligacje.pl does not carry. `/corp-bond/
profile` is never reached, so a Catalyst bond's research page 502s today. The
comment at `:371-375` documents the cost of the current probe order ("the equity
fallback spins through three OpenBB providers") and that cost is paid on every
bond lookup.

**The crypto ceiling is real and must not be papered over.** The installed
`openbb_fmp/models/crypto_search.py` declares `FMPCryptoSearchData` with exactly
`symbol`, `name`, `exchange`, `ico_date`, `circulating_supply`, `total_supply`,
and `openbb_core/.../crypto_search.py` adds nothing beyond `symbol` and `name`.
There is **no market cap, no rank, no ATH and no ATL** available from the one
configured provider (`openst/src/openbb_client.py:537`, `CRYPTO_SEARCH_PROVIDERS
= ["fmp"]`). Those four are recorded below as unavailable rather than specified
as nullable fields that are permanently `—`.

Recorded decisions (resolved with the user, 2026-10-02):

- **Contract shape: a nullable `keyFacts` on the existing `InstrumentProfile`,
  discriminated by `kind`, one schema per asset class.** Not a new route — the
  page already fetches the profile on every load (`ResearchOverview.vue:34-41`),
  so a second request buys nothing. Not flattened onto the profile either: at
  most six of ~20 flat nullable fields are ever populated for any one instrument,
  and the per-class rendering logic lands in the view regardless.
- **`kind` reuses the existing canonical vocabulary** —
  `stock | etf | fund | crypto | bond | corp_bond`, the exact `AssetType` union
  at `tickerref-queries.ts:8` and the lowercase form of the contract's six
  `InstrumentType` values (`translate.ts:86-108`). Six kinds, no seventh.
  `kind` is deliberately redundant with the existing `profile.assetType`: the
  latter is the contract enum in `SCREAMING_CASE` and is **nullable** when the
  symbol is absent from the local reference table (`routes/instruments.ts:429-448`),
  whereas `kind` is non-null whenever `keyFacts` is present and is what makes
  the union discriminable. A reviewer will ask why both exist; the answer is
  above, and it is the reason the two are not merged.
- **Bonds are two kinds, not one — `bond` and `corp_bond` — because the field
  sets are disjoint**, which is the request's own point ("even different bonds
  types has different info"). A savings bond has `rateRule` / `margin` /
  `redemptionFee` / `termMonths` / `seriesCode`; a Catalyst bond has `issuer` /
  `series` / `secured` / `status` / `couponType` / `currentRate` / `nominalValue`.
  They share only `maturityDate` and a notion of nominal, so they share one
  *concept* and nothing else — one schema with fourteen nullable fields would be
  worse than two schemas with six each, because every reader would have to know
  which half applies.
- **`margin` is not a contract field on either bond kind.** `CorporateBondProfileData`
  declares it (`corp_bond_profile.py:47`) but the scraper's own docstring says
  "`margin` is `None` — the detail page embeds the margin in `coupon_type` for
  variable-rate bonds" (`obligacje.py:62-68`), and the live payload above has no
  `margin` key. A field that is structurally always null is a permanent dash.
- **`margin` on a savings bond is a semantic overload and the card must not
  label it "Margin".** `_extract_margin` (`openst/src/importers/bond_series.py:228-246`)
  documents all three cases explicitly: for `rate_rule: "fixed"` the stored value
  *is* the flat annual rate; for `cpi_12m+margin` it is the inflation add-on; for
  `nbp_ref+margin` it is the NBP add-on. The column is called `margin` and means
  a **rate** in one case and a **spread** in the other two. The label switches on
  `rateRule` — see §86.9 — and the default label when `rateRule` is absent is
  "Rate".
- **Provider strings render verbatim; nothing is translated.** `secured` arrives
  as `"NIE"`, `status` as `"Notowane"`, `couponType` as
  `"zmienne WIBOR 3M + 4%"`. Translating them means inventing an English
  vocabulary the rest of the app does not have. One rule, applied once: raw text
  is shown raw, only numeric and date values are formatted.
- **Three Catalyst fields arrive as strings, not numbers, and two of them carry
  their own unit.** `nominal_value` is `"100.0"`, `current_rate` is `"7.83%"`
  (a trailing `%` that would render as `7.83%%` through `formatPercent`), and
  `secured` is a Polish boolean string. Each conversion is pinned in §86.6.
- **Crypto key facts are exactly what FMP returns** (user's call, after the
  measurement above): `name`, `exchange`, `icoDate`, `circulatingSupply`,
  `totalSupply`, plus the quote currency already on the profile. Market cap,
  rank, ATH and ATL are **not** specified as nullable fields — they are recorded
  as unavailable from the current provider, which is a different statement from
  "we fetch it and it happens to be empty".
- **Funds ship thin, on purpose** (user's call). The local reference carries
  name + aliases only; the ANALIZY snapshot CSV is
  `code,name,currency,points,first,last,close` (`openst/data/fund-catalogue.csv`,
  verified: `ARK01,Erste Akcji Polskich,PLN,7183,1998-04-02,2026-09-29,90.4`).
  There is no manager, category type, OPL/TER, risk class or recommended holding
  period anywhere in the stack. `FundKeyFacts` therefore carries **one** field,
  `categoryCode`, and the section says so on the page rather than implying
  coverage. The TFI detail importer that would fix it is named as follow-up in
  §86.10.
- **ETFs also ship thin**: `category` from `ticker_reference.etf_category`. That
  is one row, but it is a row the backend fills today and the UI discards.

Ordering: **contracts land before instruments, deliberately.** The provider-tier
rule (fixture → openst → cachest → instruments) orders *data*; the contract is a
*compile* dependency — `translate.ts` types its return as
`components["schemas"]["InstrumentProfile"]`, so an adapter cannot emit
`keyFacts` until the schema exists. Fixture capture still comes first, because it
decides which fields the contract declares. There is **no cachest step**: all
three profile routes are already configured, and the fix is on the instruments
side of the boundary.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + `docker compose` level per `openst/CLAUDE.md`, `cachest/CLAUDE.md`, and
`AGENTS.md`).

### 86.1 — Fixture capture: pin the real field set for all four classes

No code. The point of this step is that §86.2 declares fields and §86.6 parses
them, and neither may be written against a guessed shape.

- [ ] `openst/tests/fixtures/bond/corp_bond_profile_BST0327.json` — save the
      verbatim body captured above (already verified reachable at
      `:8090/corp-bond/profile/BST0327`; the HTML that produces it is already
      committed at `openst/tests/fixtures/obligacje_bond_profile_BST0327.html`,
      so this JSON is the *parsed* form and must be regenerated, not hand-typed).
- [ ] `openst/tests/fixtures/crypto/search_BTC-USD.json` — the raw
      `obb.crypto.search("BTCUSD", provider="fmp")` response behind
      `/crypto/search`, so §86.3's assertions are made against a recorded shape
      rather than a live key. **Note in the commit body which of
      `circulating_supply` / `total_supply` / `ico_date` / `exchange` are
      non-null for `BTC-USD`** — FMP populates them for majors and may not for
      long-tail tokens, and that difference is the reason the contract fields are
      nullable.
- [ ] `openst/tests/fixtures/crypto/profile_BTC-USD.json` — today's
      four-field body, so §86.3's test proves the widening is additive rather
      than a replacement.
- [ ] Record the savings-bond field set from
      `openst/tests/fixtures/obligacjeskarbowe/ros.html` — that fixture already
      exists and is committed; what is new is asserting the parsed values. It
      carries `Seria:`, `Oprocentowanie:` and the literal prose
      `"marża 2,00% + inflacja"`, i.e. `rate_rule = "cpi_12m+margin"` with
      `margin = 2.00` and `fee_b = 2.00` per `_classify_rate` /
      `_extract_margin`. **No live emission is available locally** — verified:
      `openst.bond_series` is empty and `/fixedincome/search` 404s, because the
      bond-series import has not been run in this compose stack. The fixture is
      therefore the source of truth for this step, and the commit body must say
      so rather than implying a live capture.
- [ ] **Commit body carries the measured table** — one row per class, field →
      wire key → type (number / string / date) → nullable. §86.2's schema is
      transcribed from it, so a disagreement between the table and the schema is
      a reviewable diff.
- [ ] Commit `chore(openst): capture the profile payloads key facts are built from`

### 86.2 — Contracts: six `*KeyFacts` schemas and `InstrumentProfile.keyFacts`

- [ ] `portfoliost-contracts/contracts/openapi.yaml` — add six schemas
      (`StockKeyFacts`, `EtfKeyFacts`, `FundKeyFacts`, `CryptoKeyFacts`,
      `BondKeyFacts`, `CorpBondKeyFacts`), each opening with a literal
      `kind` property whose value is fixed (`const`), and add
      `keyFacts: { oneOf: [ … ], nullable: true }` to `InstrumentProfile`
      (`:465-502`). Fields transcribed from §86.1's table — **only** the fields
      that table marks populated, plus `margin` explicitly annotated as the
      overloaded value the label depends on. Numeric fields are
      `type: number, nullable: true`; the four Catalyst fields that arrive as
      strings (`nominalValue`, `currentRate`, `secured`, `status`) are
      `type: string, nullable: true`, **not** numbers — typing them as numbers
      would make §86.6's parsing an unchecked cast rather than a `Number()` with
      a `NaN` guard.
- [ ] `npm run lint` from `portfoliost-contracts/contracts/` — this is
      `scripts_check_spec.py`, the duplicate-property-key guard. It exists
      because §70.2 inserted a block into `PortfolioTotalMetrics` twice and two
      contracts published before a consumer caught it. Six new schemas is the
      exact shape of edit that caused it.
- [ ] `npm test` and `npm run build` in the same directory.
- [ ] **Push `main` and let CI bump the patch version — never tag by hand**
      (`AGENTS.md`, ops section). Verify the real tag with
      `gh release list --repo Marx2/portfoliost-contracts`.
- [ ] `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new-version>`
      in **both** consumers — `portfoliost-instruments` and `portfoliost` — then
      `npm run gen:types` in each. Commit `package-lock.json` and
      `src/generated/api-types.d.ts` (`portfoliost-instruments`) /
      `generated/api-types.d.ts` (`portfoliost`) in each repo.
      > Both repos already carry the `gen:types` script
      > (`portfoliost-instruments/package.json:23`, `portfoliost/package.json:20`).
      > The installed and repo specs are both `1.6.59` today, so there is no
      > pre-existing drift to reconcile — if the install lands a different
      > version than `gh release list` reported, stop and reconcile rather than
      > committing a mixed state.
- [ ] Tests: `npm run build` in `portfoliost-instruments` (its
      `src/generated/api-types.d.ts` must contain the six schema names — a
      missing one means the wrong package version was installed).
- [ ] Commit `feat(contracts): per-asset-class key facts on the instrument profile`

### 86.3 — openst: widen the crypto profile

`get_crypto_profile` (`openbb_client.py:610-626`) derives its body from the quote
and explicitly omits `name` because "name is not derivable from a price bar".
That reasoning was right for a quote-derived body and is now superseded: the
search leg already exists, already runs against the only provider that has
crypto metadata (`CRYPTO_SEARCH_PROVIDERS = ["fmp"]`, `:537`), and already
carries the name.

- [ ] Rewrite `get_crypto_profile(pair)` to call
      `obb.crypto.search(pair, provider=<first provider with a key, honouring
      the existing `_provider_is_blocked` / `_provider_has_key` gate>)` and merge
      the matching row onto the quote-derived body. Add `name`, `exchange`,
      `ico_date`, `circulating_supply`, `total_supply`; keep `symbol`,
      `currency`, `price`, `date` exactly as they are.
      > **Match on symbol, not on the first row returned.** The fetcher's
      > `transform_data` filters with `str.contains(query, case=False)` and
      > returns a list — `BTC` matches `BTC-USD` but the first hit is not
      > guaranteed to be the pair asked for. Selecting `symbol == pair` and
      > returning the body unchanged when there is no exact match is the
      > difference between a fact and a plausible-looking wrong fact.
- [ ] `margin` is not part of this; it is not a crypto field.
- [ ] Tests in the openst suite, fixture-driven against §86.1's two JSON files:
      a crypto whose search row has all five fields populated; one whose supply
      fields are null (must emit `null`, never `0`); a pair with no exact symbol
      match (must keep the quote-derived body and omit the five); and a search
      provider without a key (must not raise — `_provider_has_key` gating is the
      established pattern from `get_crypto_quote`).
- [ ] Tests: `docker compose --profile test build test &&
      docker compose --profile test run --rm test` — all 542 green.
- [ ] Commit `feat(openst): carry name and supply on the crypto profile`

### 86.4 — openst standalone smoke

- [ ] `docker compose up -d` in `openst`, then **one** `curl` per symbol:
      `/crypto/profile/BTC-USD`, `/corp-bond/profile/BST0327`, and
      `/fixedincome/profile/<a real emission>`.
- [ ] Call each **twice** and confirm the second is a Redis cache HIT (the
      `_cached_or_404` envelope makes this observable in the response), so the
      widened crypto profile costs one upstream call per TTL, not two per
      research page view.
- [ ] The third curl is expected to fail locally — `openst.bond_series` is empty
      and no emission is synced (verified in §86.1). **Record that in the commit
      body** rather than skipping the check silently, and note that the
      standalone smoke therefore covers crypto and corporate bonds only.
- [ ] Commit — none required if nothing changed; if the smoke forced a fix, that
      fix is its own commit before the instruments steps.

### 86.5 — instruments: the two cachest adapters that do not exist

`src/adapters/cachest.ts` has `fetchBondProfile` (`:138-140`) and nothing for
Catalyst or crypto. Both upstream routes exist and are already cached by
cachest, so **this step adds no cachest configuration** — it only makes the
existing cache reachable.

- [ ] `fetchCorpBondProfile(symbol)` → `${BASE_URL}/corp-bond/profile/{symbol}`,
      modelled on `fetchBondProfile`. Same `UpstreamError` behaviour — the
      caller needs to distinguish "not a Catalyst bond" from "cachest is down",
      which is exactly why `fetchFundSearch` (`:54-61`) swallows 404 while
      `fetchBondProfile` does not.
- [ ] `fetchCryptoProfile(pair)` → `${BASE_URL}/crypto/profile/{pair}`.
- [ ] Tests in `src/adapters/`: each encodes the path with
      `encodeURIComponent` (assert on the exact URL, including a pair whose
      quote currency contains a character that must be escaped), and each turns
      a non-2xx into an `UpstreamError` carrying the status.
- [ ] Tests: `npm test` green (`vitest run`, `src/routes/instruments.test.ts` is
      the file that will need its fetch mocks extended in §86.8).
- [ ] Commit `feat(instruments): fetch the corporate-bond and crypto profiles`

### 86.6 — instruments: `toKeyFacts`, bonds first

Bonds are the headline of the request and the only class with two disjoint field
sets, so they get their own step and their own commit.

- [ ] `src/adapters/translate.ts` — add `toBondKeyFacts(row: Row, kind)` and
      `toCorpBondKeyFacts(row: Row)`, returning the §86.2 schemas. Every field
      reads through the existing `str` / `num` / `pick` helpers (`translate.ts:47-79`)
      so a provider change degrades to `null` rather than throwing.
- [ ] **Savings bond** (source keys from `openbb_client.py:727-738`):
      `seriesCode`←`series_code`, `issueDate`←`issue_date`,
      `maturityDate`←`maturity_date`, `termMonths`←`term_months`,
      `rateRule`←`rate_rule`, `margin`←`margin`, `redemptionFee`←`fee_b`,
      `nominal`←`nominal`.
      > `fee_b` and `nominal` arrive through `_plain`, i.e. as JSON numbers or
      > strings depending on the driver — `num()` handles both, and a
      > `termMonths` of `0` must survive as `0` rather than becoming `null`
      > (`num` already returns `0`; do not add a truthiness filter on top).
- [ ] **Catalyst corporate bond** — the three string-shaped fields, pinned:
      - `nominalValue` ← `nominal_value` (`"100.0"`) →
        `num()`, so a malformed value becomes `null` and never `NaN`.
      - `currentRate` ← `current_rate` (`"7.83%"`) → **strip the trailing `%`
        and parse the remainder**, yielding `7.83` as a number. Keeping the `%`
        in the value would render `7.83%%` through `formatPercent` in §86.9. If
        the string has no `%`, parse it as a plain decimal rather than
        returning `null` — `current_rate` is the single most useful number on
        the card and a missing suffix must not cost it.
      - `secured` ← `secured` (`"NIE"`) → kept as the provider's string. Per the
        recorded decisions it is **not** mapped to a boolean and **not**
        translated; `"NIE"` on the card is the honest rendering of a Polish
        source.
      - The rest are pass-through: `issuer`, `series`, `market`, `status`,
        `nominalCurrency`, `couponType`, `maturityDate`.
      > **`margin` is deliberately absent** — the scraper never sets it
      > (`obligacje.py:62-68`) and the live payload has no such key. Its absence
      > is a decision recorded in this section, not an oversight.
- [ ] Wire `toBondKeyFacts` into `toInstrumentProfile` (`:189-231`) for the
      existing `isBond` branch (`:198`), and into `toInstrumentDetail`
      (`:160-187`) only if `InstrumentDetail` grows the field — it has not been
      specified to, so **do not** touch it in this step.
- [ ] Tests in `src/adapters/translate.test.ts` against the §86.1 fixtures:
      savings bond with `rate_rule: "cpi_12m+margin"` → `kind: "bond"`,
      `margin: 2`, `fee_b` → `redemptionFee: 2`, `rateRule` passed through
      **untranslated**; `rate_rule: "fixed"` → `kind: "bond"` with the same
      `margin` value and a different `rateRule` (this pair is the test that
      proves the label switch in §86.9 has its data); Catalyst →
      `kind: "corp_bond"`, `nominalValue: 100`, `currentRate: 7.83`,
      `secured: "NIE"`, `status: "Notowane"`, and **no** `margin` key at all;
      a row missing `current_rate` entirely → `currentRate: null` without
      throwing; `"7.83"` without the `%` → `7.83`.
- [ ] Tests: `npm test` and `npm run build` green.
- [ ] Commit `feat(instruments): translate savings-bond and Catalyst key facts`

### 86.7 — instruments: `toKeyFacts` for crypto, ETF, fund, stock

The remaining four kinds. Each is a different source, which is why they are one
step rather than four: no single one of them is a change of behaviour on its own,
and four near-empty commits would be noise.

- [ ] **Crypto** (`kind: "crypto"`) — `name`←`name`,
      `exchange`←`exchange`, `icoDate`←`ico_date`,
      `circulatingSupply`←`circulating_supply`, `totalSupply`←`total_supply`.
      `quoteCurrency` comes from the profile's existing `currency`, not from the
      key-facts row. **No `marketCap`, `rank`, `ath` or `atl` keys** — FMP does not
      carry them (§86.1) and a permanently-null field is a permanent dash.
- [ ] **ETF** (`kind: "etf"`) — `category` ← the `ticker_reference` row's
      `etfCategory`. This is the value already mapped to `finnhubIndustry` at
      `routes/instruments.ts:446`; prefer reading `etfCategory` from the same
      reference `ref` the route already holds rather than re-querying.
- [ ] **Fund** (`kind: "fund"`) — `categoryCode` only, and only when the
      reference row is an `ANALIZY::` listing key; `null` for a `TFI::` row.
      Verified shapes: `ANALIZY::ARK01` / `ARK01` / `Erste Akcji Polskich`, and
      `TFI::NNEP65.TFI` / `NNEP65.TFI`, whose `isin` is empty and whose aliases
      carry the human name. One field, and the page says so.
- [ ] **Stock** (`kind: "stock"`) — `sector`←`gicsSector`,
      `industry`←`gicsIndustry`, `employees`←`employeeTotal`, `ceo`, plus
      `ipo`←`ipo`, `sharesOutstanding`←`shareOutstanding`,
      `marketCap`←`marketCapitalization`. Pure relocation: every value is already
      on the profile and already fetched. **No new upstream call.**
      > `gicsSector`/`gicsIndustry` are hard-coded `null` in
      > `translate.ts:221-224` and filled by the route's reference-table pass
      > (`:447`). The stock kind therefore reads the **post-fill** object, not
      > the raw provider row — meaning `toKeyFacts` for stocks runs in the route
      > (`:429-452`), not inside the pure translator. Keep the translator pure and
      > let the route pass the enriched profile in; a `toStockKeyFacts` that
      > re-reads the provider row would return the dashes this section is
      > removing.
- [ ] Tests in `translate.test.ts` for each of the four, including: a crypto row
      with null supplies → `null` not `0`; an ETF with `etf_category: "Fixed
      Income"` → `category: "Fixed Income"`; a fund on a `TFI::` key →
      `categoryCode: null`; a stock with a null `ceo` → `ceo: null` and the key
      still present.
- [ ] Tests: `npm test` and `npm run build` green.
- [ ] Commit `feat(instruments): translate crypto, ETF, fund and stock key facts`

### 86.8 — instruments: dispatch the profile by asset class

This is where the Catalyst-bond 502 is actually fixed, and it replaces a probe
order that costs a three-provider equity spin on every bond lookup.

- [ ] `src/routes/instruments.ts` `/:symbol/profile` (`:390-467`) — resolve the
      asset class **first** from the local reference via the existing
      `assetTypeForSymbol` + `normalizeAssetType`, then fetch the matching
      provider profile: `bond` → `fetchBondProfile`, `corp_bond` →
      `fetchCorpBondProfile`, `crypto` → `fetchCryptoProfile`, everything else →
      `fetchProfile`.
      > Copy the pattern, do not invent one: `services/quote-dispatch.ts:109-121`
      > already dispatches the quote route exactly this way off the same
      > `assetTypeForSymbol` read, including the `catch` that falls back to
      > `"stock"`. Two dispatchers reading the same column is cheap; a third
      > ordering convention is not.
- [ ] **Keep today's probe order for a symbol the reference does not know.** A
      null `assetType` means no sync has run, not that the symbol is an equity;
      falling back to the existing `fetchProfile` → `fetchBondProfile` cascade
      (`:453-464`) preserves current behaviour for unsynced symbols and is what
      stops this step from turning a WSE stock into a 404.
- [ ] Leave the `/:symbol/detail` route (`:340-388`) on its existing path in
      this step. It has the same dispatch problem, but `InstrumentDetail` has
      not been given `keyFacts`, so there is nothing to fix there yet — noted
      here so the omission is deliberate and recorded, not forgotten.
- [ ] Extend `src/routes/instruments.test.ts` (the fetch mocks): a `BST0327`
      reference row with `asset_type: "corp_bond"` resolves through
      `fetchCorpBondProfile` and returns `kind: "corp_bond"` with `issuer`; a
      `BTC-USD` row with `asset_type: "crypto"` resolves through
      `fetchCryptoProfile`; an unknown symbol still resolves through the
      cascade; and — the regression this step exists for — a Catalyst bond whose
      equity profile **succeeds** with an empty frame must still be served as a
      bond, not as a stock.
- [ ] Tests: `npm test` and `npm run build` green.
- [ ] Commit `fix(instruments): dispatch the profile route by asset class`

### 86.9 — SPA: `KeyFactsCard` replaces the hard-coded card

- [ ] New `src/modules/instruments/KeyFactsCard.vue` — feature-scoped, used by
      one view, so it belongs in the module and not `src/components/`
      (`docs/COMPONENTS.md:17`). Props: `profile: InstrumentsProfile`. It
      renders the **shared identity block** (Name, Country with the flag image,
      ISIN, Exchange, plus the `weburl` link at `ResearchOverview.vue:326-334`)
      and then the **kind-specific block** from `profile.keyFacts`.
- [ ] One `KEY_FACT_ROWS: Record<kind, ReadonlyArray<{ field: keyof …;
      label: string }>>` map drives the second block, so a new field is one array
      entry and not a new `<dt>`. Labels live in exactly one place, the same way
      `ASSET_TYPE_LABELS` does in `TickerBadge.vue:8` — and for the same reason:
      the contract enums are not display strings.
- [ ] **The `margin` label switch** — `bond` rows label `margin` as
      **"Rate"** when `rateRule === "fixed"`, **"Inflation margin"** when
      `rateRule === "cpi_12m+margin"`, **"NBP margin"** when
      `rateRule === "nbp_ref+margin"`, and **"Rate"** when `rateRule` is null.
      This is the single most important line in the component: the same stored
      number is a rate in one case and a spread in the others
      (`bond_series.py:228-246`), and a card that always says "Margin" states
      something false for two of the three savings-bond families.
- [ ] Formatting, using the existing helpers in `src/utils/format.ts`:
      `formatAmount` (`:30`) for `nominal` / `nominalValue` paired with
      `nominalCurrency`; `formatNumber` (`:41`) for `termMonths`,
      `circulatingSupply`, `totalSupply`; `formatCompact` (`:58`) for
      `marketCap`; `formatDate` (`:70`) for `maturityDate` / `issueDate` /
      `icoDate`; **verbatim strings** for `issuer`, `series`, `market`, `status`,
      `secured`, `couponType`, `rateRule`, `exchange`, `category`,
      `categoryCode`, `name`. A null value renders the card's existing `"—"`
      (`ResearchOverview.vue:70-72`).
- [ ] `ResearchOverview.vue:297-335` — delete the hard-coded card, mount
      `<KeyFactsCard :profile="profile" />` in its place. **The `Key Facts`
      heading and the `card p-6` wrapper move into the new component** so the
      markup is identical and `tests/e2e/research.spec.ts:27`
      (`getByText("Key Facts")`) keeps passing unchanged.
- [ ] **Hide the card when there is nothing to say.** A symbol with identity but
      no `keyFacts` (an unsynced WSE stock, a crypto pair whose search leg has no
      exact match) must not render a card of six dashes. The existing
      "Limited data availability" banner (`:217-225`) already covers that case;
      the card is `v-if`'d off `profile.keyFacts || sharedIdentityRows.length`.
- [ ] **Do not touch** the Analyst Price Target card (`:263-295`), the
      "Latest Earnings Call" card (`:337-354`), or the "Key Statistics" block
      (`:371-383`). All three are equity-only and already degrade correctly —
      `v-if="metrics"` at `:371`, `v-if="latestEarningsCall"` at `:337`. They are
      the model this section follows, not part of it.
- [ ] Tests in `tests/unit/modules/instruments/`: a new `KeyFactsCard.test.ts`
      with one case per kind asserting the exact label set rendered —
      stock keeps all eight original rows, `corp_bond` renders Issuer / Series /
      Market / Status / Nominal / Nominal currency / Secured / Coupon type /
      Current rate / Maturity and **not** Employees or CEO, `bond` renders Series
      / Issue date / Term / Rate rule / Maturity / Nominal / Redemption fee and
      **no** Margin, `crypto` renders Name / Exchange / ICO / Circulating supply /
      Total supply, `etf` renders Category, `fund` renders Category code. Plus:
      the same savings-bond fixture rendered under `fixed` and under
      `cpi_12m+margin` asserts the label is **"Rate"** in one and
      **"Inflation margin"** in the other.
- [ ] Extend `tests/unit/modules/instruments/ResearchOverview.test.ts`: the
      existing "renders the company profile fields" case (`:215`) must still pass
      unchanged — it is the proof that a stock's card is byte-identical after the
      move.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green.
- [ ] Commit `feat(spa): render per-class key facts on the research overview`

### 86.10 — Stack smoke, e2e, docs, and the recorded gaps

- [ ] `docker compose up -d redis openst cachest instruments`, curl each of
      `AAPL`, `SPY` (ETF), `BST0327`, `BTC-USD`, `ARK01` through the gateway at
      `:8080` and confirm a non-null `keyFacts` with the right `kind` on each.
      **`docker compose restart gateway` after any upstream recreate** or only
      instruments-routed paths will 404 for the wrong reason — nginx caches each
      upstream address for the life of the process and the symptom is a 404 from
      the wrong Hono service, not a 502 (`portfoliost/AGENTS.md`).
- [ ] e2e in `tests/e2e/research.spec.ts`: a corporate bond, a crypto pair and an
      ETF each render their own key facts. A bond lookup needs the reference row,
      so assert against the symbols the local sync actually produced — query
      `instruments.ticker_reference` for one `corp_bond` and one `crypto` row
      first, and **skip with a named reason rather than inventing a symbol** if
      the local sync has not run.
- [ ] `npm run test:stack` green, then the full SPA gate: `npm run build`,
      `npm run test`, `npm run test:mock`, `npm run test:e2e` against a rebuilt
      stack.
- [ ] **`docs/COMPONENTS.md`** — add a `KeyFactsCard` entry under "Where things
      live": the shared-identity rows come from the profile, the kind-specific
      rows from `profile.keyFacts`, labels live in `KEY_FACT_ROWS` and nowhere
      else, and a new asset class is one schema plus one array entry.
- [ ] **Record the three gaps this section deliberately does not close**, in the
      commit body and in this section's archive note — not as new work:
      1. **Funds have no real key facts.** One field ships. The TFI detail
         importer — manager, category type, OPL/TER, risk class, recommended
         holding period — needs a new openst plugin route against
         analizy.pl or biznesradar's TFI section, plus a fixture capture and its
         own cachest route. Named as the obvious next proposal; not started here.
      2. **Crypto has no market cap, rank, ATH or ATL.** FMP's crypto search is
         the only configured crypto search provider and carries none of them.
         CoinGecko does; adopting it means a new provider + API key in openst.
      3. **`/:symbol/detail` (`routes/instruments.ts:340-388`) still uses the
         probe order.** Same dispatch as §86.8, deferred because
         `InstrumentDetail` has no `keyFacts` field yet.
- [ ] Commit `docs(spa): document KeyFactsCard and record the remaining class gaps`
