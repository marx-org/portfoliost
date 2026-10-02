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

- [ ] **Move the tab body** (Overview card, chart card, Drawdown card, Returns
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
- [ ] **Move the `<script lang="ts">` block with the template** (`:1-117`) —
      `yearlyReturns`, `benchmarkYearlyReturns`, `yearlyTotals`, `YearlyReturnRow`,
      `YearlyReturnTotals`, `yearRows`. It is the D88/D89 derivation, and the
      Yearly table in the template consumes it, so splitting the two would leave
      a component whose testids and whose maths live in different files.
      `tests/unit/modules/portfolios/PortfolioPerformanceTab.test.ts:4-8`
      therefore changes its **import path only** (to
      `@/components/PerformanceTabContent.vue`); no assertion changes. Do **not**
      re-export the functions from the wrapper to avoid that edit — two import
      paths for one derivation is how the two tabs end up with two answers.
- [ ] **Keep every existing `data-testid` string.** `PortfolioPerformanceTab.test.ts`
      and `tests/e2e/performance-display-currency.spec.ts` +
      `tests/e2e/parity-portfolios.spec.ts` select on them; a rename breaks three
      specs for no gain. Testids are stable API per `COMPONENTS.md`. (The
      `testid` prop therefore prefixes the *aggregate* copy only — the
      per-portfolio mount must pass `testid=""` and render byte-identical ids.)
- [ ] **Keep `PortfolioPerformanceTab.vue` as a thin route wrapper** that fetches,
      converts and delegates, so its behaviour is unchanged by construction. It
      keeps the `AnalyticsTimeframe` state machine: `changeTimeframe` (`:244`),
      the 5s backfill poll (`:214`) and `handleRecompute` (`:257`).
- [ ] Tests: a new `tests/unit/components/PerformanceTabContent.test.ts` porting
      the cases from `PortfolioPerformanceTab.test.ts` against the component
      directly — tiles render payload values, `annualizedReturn: null` with a
      reason renders `—` and hides the Timing line, a display-currency switch
      re-renders the money tiles without a remount. The existing
      `PortfolioPerformanceTab.test.ts` and `InvestmentsView.test.ts` pass
      **unmodified** apart from that import line.
- [ ] Tests: `npm run build` (includes `vue-tsc --noEmit`) and `npm run test` green.
- [ ] Commit `refactor(spa): extract the performance tab body into a prop-driven component`

### 83.2 — `/merged`: sum the flows and build the aggregate return columns

The only step that makes the tab possible. Everything after it is presentation.

- [ ] **Add `netFlow`, `unpricedValue` and `carriedValue`** to the `/merged`
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
- [ ] **Chain the aggregate TWR** through `buildDailyReturns` + `chainReturns`
      (`returnColumns.ts:43`, `:53`) — the same path `buildTwr` takes. Do not
      re-derive `Vₜ/(Vₜ₋₁+Fₜ)−1` here, and do not read any stored
      `cumulative_twr` column: those are per-portfolio and summing indices is
      meaningless.
- [ ] **Emit per-point `cumulativeTwr`** on the aggregate series, and the scalars
      `timeWeightedReturn` / `moneyWeightedReturn` / `simpleReturnPercent` from
      the last index point, mirroring `:1381-1389`. The aggregate MWR has no
      stored `cumulative_mwr` column to read, so compute it with
      `buildMwr(aggValues, aggFlows, aggDates)` (`returnColumns.ts:109`) at
      request time and read its last element the same way.
- [ ] **Populate `annualizedReturn` + `annualizedReturnWithheldReason`** —
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
- [ ] **`moneyWeightedReturnWithheldReason` mirrors `/:id/analytics`, which is
      hardcoded `null` (`:1545`).** `buildMwr` silently falls back to
      `buildSimple` when XIRR has no sign change (`:129-131`), so a value with
      `null` reason is not proof the number is an XIRR. Do not invent a new
      reason here — that would be a fourth answer. Record it as the same
      (accepted) defect the per-portfolio tab has, and let §83.2's test pin the
      *current* behaviour so the two tabs cannot diverge.
- [ ] **Populate `monthlyReturns`** with `buildMonthlyReturns` (`:1294`) over the
      aggregate TWR index, so the Returns Chart is not empty — and, since §82.3
      landed, so the **Yearly** toggle has an index to walk. Yearly availability
      is still gated on `timeframe === "ALL"` in the SPA (`:467`); `/merged` must
      therefore honour `?timeframe=ALL` as the full window or the toggle shows a
      partial year as a whole one.
- [ ] **Fix the early return at `:749-782`.** When *any* portfolio has fewer than
      2 snapshots, the route returns `backfillStatus:"pending"` with an **empty
      series** — so one brand-new portfolio erases every other portfolio's history
      from a view whose entire purpose is the cumulative total. Return the partial
      sum *and* the pending flag, keeping §72.7's rule that reporting a mid-rebuild
      portfolio is a read and firing a backfill from a GET is not.
- [ ] Tests — a deposit into one of two portfolios must leave the aggregate TWR
      **unchanged** (§81.1's invariant, applied to the aggregate: this is the test
      that would have caught the missing `net_flow`); an internal transfer between
      two of the user's own portfolios leaves it unchanged; `Π(1 + monthlyReturns)`
      reconciles to `cumulativeTwr` at the last point; one portfolio with < 2
      snapshots still returns the other portfolios' series plus
      `backfillStatus:"pending"`.
- [ ] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` (tsc) green.
- [ ] Commit `feat(wallets): build the aggregate TWR and monthly returns in /merged`

### 83.3 — Benchmark overlays on the aggregate

- [ ] **Accept `?benchmarks=SPY,QQQ` on `/merged`** and mirror the benchmark block
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
- [ ] **Pin the internal-transfer case with a test, not an assumption.** Both legs
      are external-only-excluded per portfolio, so neither reaches the aggregate
      flow map and the benchmark is not perturbed by money moving between the
      user's own portfolios.
- [ ] No contract change and no persistence (see recorded decisions above).
- [ ] Tests: a fixture where a deposit buys the benchmark and the line rises with
      the market only on flow-free days; an internal transfer does not perturb it;
      unknown tickers are dropped (`:1321`); no `benchmarks` param → `[]` as today.
- [ ] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` green.
- [ ] Commit `feat(wallets): support benchmark overlays on the merged series`

### 83.4 — Aggregate drawdown: no new route, no SPA arithmetic

Written this way because §81.1 made `computeRiskMetrics` **pure** — it takes
`(returns, dates)` and nothing else. After §83.2 the route already holds both.

- [ ] **Populate the already-declared `performance.*` risk fields inline on
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
- [ ] **Do not add a Max Drawdown tile to the aggregate tab** beyond the one the
      Drawdown card already renders. Per D89, risk *ratios* stay on the Risk tab;
      the aggregate has no Risk tab, so drawdown is the only one of these that
      travels, and it travels because the existing card needs it.
- [ ] Test: the §81.3 fixture on the aggregate path — `cumulativeTwr` of
      `{100, 50, 150, 75}` reports **−75%**, not −50%, and
      `currentDrawdownPercent` (which the card calls for Current) agrees with
      `maxDrawdown` on the peak-to-trough leg.
- [ ] Tests: `npm run test` green in `portfoliost-wallets`; `npm run build` green.
- [ ] Commit `feat(wallets): return aggregate risk metrics on the merged series`

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
