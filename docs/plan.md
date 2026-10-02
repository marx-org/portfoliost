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


## 82. Performance tab: overview tiles & per-year returns (D85–D89)

Proposal: [performance.md](proposals/performance.md) — make the Performance tab
answer "how much more cash than I put in?" and "how efficiently is it invested,
per year and overall".

One new card above the Performance Chart (five tiles) and a `Monthly | Yearly`
toggle on the existing Returns Chart. Touches `portfoliost` and
`portfoliost-wallets` only — **no contract change**, because every field the
proposal needs is already declared in `openapi.yaml` and three of them are
already computed by the route and returned to a UI that displays none of them
(`portfolios.ts:1345-1359`). Risk ratios stay on the Risk tab.

The provider-tier ordering (openst → cachest → instruments) does not apply: no
new data source, no scraping, no route in `config.yaml`. Steps run
backend → SPA tiles → per-year table → benchmark column → parity + full suite.

**Dependency:** TWR p.a. must be annualised over *elapsed calendar years from
the flow-neutral index*. §81.2 is where that number gets built correctly; this
section consumes it and must not re-derive annualization independently.

---

### 82.1 — Populate `performance.annualizedReturn` with the flow-neutral annualised rate

The only backend change in this section. `annualizedReturn` and
`annualizedReturnWithheldReason` are declared in the contract
(`openapi.yaml:1447`, `:1449`) and the analytics route returns **neither** — the
`performance` object it builds ends at `simpleReturnPercent`
(`portfolios.ts:1343-1360`). The SPA therefore has nothing to render a TWR p.a.
tile from.

- [x] **Compute the TWR p.a. in the analytics route** from the already-selected
      `cumulativeTwr` column, annualising over elapsed calendar days:
      `(twr_last / 100) ** (365 / calendarDays(first, last)) − 1`, expressed as a
      **percentage** to match every sibling in `performance.*`
      (`totalReturnPercent`, `moneyWeightedReturn`, `timeWeightedReturn` are all
      percents). Use the existing `daysBetween` helper in
      `src/services/returnColumns.ts` rather than a second date-difference
      implementation.
      > Reuse §81.2's `annualizedReturn(values, dates)` if it accepts the TWR
      > index by then — one implementation, and this step becomes a two-line
      > call. Do not add a third annualizer if it does not.
      > Landed as a two-line call to §81.2's `annualizedReturn`. `cumulative_twr`
      > is stored on a 100 base, but the function takes a ratio `iN / i0`, so the
      > stored index is passed unscaled. Rows with a NULL `cumulative_twr` are
      > `flatMap`-dropped, never coerced to 0 — a 0 in the index is a −100% day.
- [x] **Return `annualizedReturn: null` plus a reason** when the span is under a
      full year, rather than annualising a partial window. Reuse the existing
      `annualizedReturnWithheldReason` (`src/services/riskMetrics.ts:176-188`)
      as the single source of truth for the predicate so the Risk tab and this
      tile cannot disagree about the same window. The reason string travels in
      the already-declared `annualizedReturnWithheldReason` field — **no new
      vocabulary, no `openapi.yaml` edit.**
      > **The two clauses of this bullet conflicted** — "under a full year"
      > (365 days) and "reuse the existing predicate" (≥60 points AND ≥90 days)
      > are different gates, and a one-quarter series falls between them. User
      > decision 2026-10-02: the shared predicate wins. A full-year gate here
      > would have made this tile print `—` for every sub-year portfolio while
      > the Risk tab printed a number for the same window — the exact
      > disagreement this bullet exists to prevent. So the tile annualises a
      > quarter, as the Risk tab already does.
      > **Unit split, also user-confirmed:** `performance.annualizedReturn` is a
      > **percent** (13.04) and `/risk-metrics`'s `annualizedReturn` is a
      > **fraction** (0.1304) — one contract field name, two units. Kept, because
      > the percent is what `performance.*`'s siblings speak, and recorded in a
      > comment at the call site because §81's archive already flagged this
      > payload's mixed units as a defect.
- [x] **Test the arithmetic in the route test** (`src/routes/analytics.test.ts`):
      a 365-point series with `cumulativeTwr` rising 100 → 110 must return
      `annualizedReturn: 10`, and a 91-point series must return `null` with the
      reason set, not a larger number.
      > Two corrections to this fixture, both because the plan's numbers did not
      > survive contact with `daysBetween`:
      > **366** points (not 365) is what returns exactly `10`. A point count is
      > not a day count: 365 daily points span 364 days, so the exponent is
      > 365/364 and the answer is **10.03**, not 10. Both are now pinned — the
      > 10.03 case exists so nobody "simplifies" the exponent back to 1.
      > The 91-point series now asserts the **number** `(1.1 ** (365/90) − 1)×100`
      > rather than `null`, per the decision above; it still fails loudly if the
      > withholding gate ever moves back to a full year. The withheld cases are
      > 59 points and 80 points / 79 days.
- [x] **Tests**: `npm run test` green in `portfoliost-wallets`; `npm run build`
      (tsc) green.
      > 568/568. One flake on the first run — `internal.test.ts:432` timed out at
      > 5000ms under full-suite load, passes in isolation and on a clean re-run.
      > FX service-token test, no relation to this step.
- [x] **Commit** `feat(wallets): return the flow-neutral annualized return in analytics`

### 82.2 — Overview tiles card

A new `card` **above the Performance Chart card** in
`src/modules/portfolios/PortfolioPerformanceTab.vue`, four tiles plus one
full-width Timing line: Net gain, Net invested, XIRR, TWR p.a., Timing =
`XIRR − TWR p.a.` with a plain-language reading ("adding money helped" / "adding
money hurt").

- [ ] **Add the card** reading `store.analytics.performance` only —
      `totalReturn`, `totalInvested`, `moneyWeightedReturn`, `annualizedReturn`,
      `annualizedReturnWithheldReason`. **No new API call**: all five are on the
      payload the tab already holds. Absent or `null` renders `—`, never `0`.
- [ ] **Convert the money tiles through the existing display-currency path** —
      reuse the `useDisplayConversion` / `chartRate` pair already built at
      `:251-264` rather than adding a sixth conversion copy, so switching the
      display currency re-converts the tiles in place without a re-mount.
- [ ] **Render the Timing line defensively**: it is a difference of two rates,
      so it is only meaningful when both are present. Hide the whole line when
      either input is withheld, and never print a difference against `null`.
- [ ] **Reuse the Drawdown card's tile markup** (`:334-343`) for the four tiles
      so the tab does not grow a second visual dialect, and give the card the
      `data-testid="perf-overview"` prefix with `-net-gain`, `-net-invested`,
      `-xirr`, `-twr-pa`, `-timing` on the tiles.
- [ ] **Tests**: extend
      `tests/unit/modules/portfolios/PortfolioPerformanceTab.test.ts` — assert
      the tiles render the payload values, that `annualizedReturn: null` with a
      reason renders `—` and hides the Timing line, and that a display-currency
      switch re-renders the money tiles without remount (mirroring the existing
      §48.6e B3 cases at `:113`). `npm run build` (includes `vue-tsc --noEmit`)
      green.
- [ ] **Commit** `feat(spa): add the performance overview tiles`

### 82.3 — `Monthly | Yearly` toggle on the Returns Chart, with TWR % and Gain

Per proposal D87. The toggle sits in the Returns Chart card header; Monthly is
today's bar chart unchanged, Yearly renders the four-column table.

- [ ] **Extract the per-year derivation as a named export** next to the component
      (`docs/COMPONENTS.md` — shared pure logic exported from a component file),
      taking `performance.timeSeries[]` and returning one row per calendar year:
      `year`, `twrPercent`, `gain`, `isYtd`. Two formulas, both exact: year TWR
      = `cumulativeTwr(last of y) / cumulativeTwr(last of y−1) − 1`; year gain
      = `[value − invested](end of y) − [value − invested](start of y)`. The
      first year uses the series' own first point as its base.
      > Do **not** re-chain TWR from monthly bars — `cumulativeTwr` is already the
      > exact chain, and differencing it introduces rounding. Do **not** sum or
      > average the monthly percentages.
- [ ] **Render Yearly as a table** with a `Σ` footer row: the % cell shows the
      compounded product (`× 1.7044`), the Gain cell the sum. Mark the current
      calendar year `YTD` and never annualise it.
- [ ] **Gate Yearly to `ALL`** (proposal D87): `analytics` is timeframe-filtered
      server-side, so a 3M window holds no year. Selecting any other timeframe
      forces Monthly and disables the toggle with a visible hint. Do not issue a
      second `ALL` fetch.
- [ ] **Convert the Gain column** with the same `chartRate` used by the tiles, so
      the Σ footer equals the Net gain tile on screen.
- [ ] **Tests**: unit-test the exported derivation against the worked example in
      the proposal — four years at +24.1 / +18.2 / +11.4 / +4.3 % with gains
      5,300 / 4,100 / 2,950 / 890 must yield a compounded product of `1.7044`
      (±0.0001 on the stored 2 dp index) and a gain sum of `13,240`; plus the
      reconciliation assertions (`Σ gains` equals `performance.totalReturn`, and
      `Π(1 + twr)` equals `cumulativeTwr` at the last point) which are the whole
      point of the two columns and must fail loudly if either drifts. Add
      component cases for the toggle state and the YTD label.
- [ ] **Commit** `feat(spa): add yearly TWR and gain to the returns chart`

### 82.4 — Excess TWR per year against the benchmark

The fourth column. `benchmarks[].timeSeries[]` already carries the
transaction-mirrored series, so this is the same year-boundary ratio applied to
the benchmark's own index.

- [ ] **Compute excess per year** as `portfolio year TWR − benchmark year TWR` for
      the **first selected benchmark only**, and render the column header with
      that symbol (`vs SPY`). With no benchmark selected, omit the column
      entirely rather than rendering an empty one.
      > Benchmarks are a list, so "excess vs all of them" is not a single number.
      > One column for the first is a deliberate cap; widening it is a separate
      > decision.
- [ ] **Render no total in that column** and say so — excess returns compound
      but do not sum, and a Σ row that looked additive would be wrong.
- [ ] **Tests**: component case with one benchmark selected asserting the column
      appears with the right symbol and that the per-year excess matches a
      hand-computed fixture; and a no-benchmark case asserting the column is
      absent.
- [ ] **Commit** `feat(spa): add per-year excess return against the benchmark`

### 82.5 — Example service parity check and the full suite

`AGENTS.md` makes `app.example-service.ai` the source of truth for UI and a Playwright
side-by-side comparison the preferred way to find gaps. This section adds a card
and a toggle that example-service does not have in this shape, so the comparison is about
layout, tile styling and wording — not about whether the tiles exist.

- [ ] **Compare before/after with Playwright** against both apps: the Performance
      tab at the same viewport, plus the a11y tree, and diff the two cards this
      section touched. Record any example-service wording for a money or return tile and
      adopt it verbatim where it does not contradict the proposal's semantics.
- [ ] **Run the whole suite**: `npm run build` (includes `vue-tsc --noEmit`),
      `npm run test`, `npm run test:mock`, `npm run test:e2e` against
      `docker compose up -d --build`. Rebuild the `portfoliost` container after
      the frontend changes and **restart the gateway** afterwards, or only
      wallets-routed e2e paths will 404 for the wrong reason (see `AGENTS.md`).
- [ ] **Extend `tests/e2e/performance-display-currency.spec.ts`** with one case
      that switches the display currency and asserts both the Net gain tile and
      the Gain column re-convert together — they share a rate, so a regression in
      either is one assertion away.
- [ ] **Commit** `test(spa): cover the performance overview and yearly returns in e2e`

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
the data delivered"*), and the combined chart on `InvestmentsView.vue:400`
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

**Ordering:** §83.1 edits the file §82.2–82.4 also edit. Run **81 → 82 → 83** so
the D85–D89 work lands once, in the shared component, and both tabs inherit it.

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

- [ ] **Move the tab body** (chart card, Drawdown card, Returns Chart,
      Top/Bottom Performers) out of `PortfolioPerformanceTab.vue` into
      `src/components/PerformanceTabContent.vue` — `docs/COMPONENTS.md`: used by
      ≥2 places, so `src/components/`, not the module folder. Props: `analytics`,
      `riskMetrics`, `positions`, `baseCurrency`, `selectedBenchmarks`, `loading`,
      `backfillPending`, `recomputing`, `titlePrefix?`. Emits
      `update:selectedBenchmarks` and `recompute`. Take a `testid` prop and
      prefix every testid with it, per `COMPONENTS.md`.
      > The six things that cannot move as-is and must become props or emits:
      > `route.params.id` (`:20`), `store.analytics` (`:175`),
      > `getPortfolioRiskMetrics(id)` (`:114`), `store.positions` (`:194`),
      > `store.setBenchmarks(syms, id)` (`:85`), `store.detail.baseCurrency`
      > (`:248`). The `chartRate` / `displayCurrencyOr` pair (`:260-261`) and
      > `convertedPnl` (`:232-240`) stay **inside** the component — both are pure
      > functions of props plus the display-currency store, so both tabs get them
      > for free. That is the whole return on this refactor.
- [ ] **Keep every existing `data-testid` string.** `PortfolioPerformanceTab.test.ts`
      and the `performance-*.spec.ts` e2e files select on them; a rename breaks
      three specs for no gain. Testids are stable API per `COMPONENTS.md`.
- [ ] **Keep `PortfolioPerformanceTab.vue` as a thin route wrapper** that fetches,
      converts and delegates, so its behaviour is unchanged by construction.
- [ ] Tests: a new `tests/unit/components/PerformanceTabContent.test.ts` porting
      the cases from `PortfolioPerformanceTab.test.ts` against the component
      directly — tiles render payload values, `annualizedReturn: null` with a
      reason renders `—` and hides the Timing line, a display-currency switch
      re-renders the money tiles without a remount. The existing
      `PortfolioPerformanceTab.test.ts` and `InvestmentsView.test.ts` pass
      **unmodified**.
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
      `timeWeightedReturn` / `moneyWeightedReturn` / `simpleReturnPercent` /
      `annualizedReturn` from the last index point, mirroring `:1352-1360`. The
      aggregate MWR has no stored `cumulative_mwr` column to read, so compute it
      with `buildMwr(aggValues, aggFlows, aggDates)` (`returnColumns.ts:109`) at
      request time.
- [ ] **Populate `monthlyReturns`** with `buildMonthlyReturns` (`:1290`) over the
      aggregate TWR index, so the Returns Chart is not empty and the per-year view
      in §82.3/D87 has a series to difference.
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
      (`PortfolioPerformanceTab.vue:193-200`). Render `portfolioName` as a
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

- [ ] **Add the tab** to `InvestmentsTabs.vue` (`:8-24`) after `Portfolios`, and
      route `investments/performance` → `TotalPerformanceView.vue` in
      `router/index.ts` (beside `:59`).
- [ ] **`TotalPerformanceView.vue` owns exactly what the per-portfolio wrapper
      owns:** the `/merged` fetch, the timeframe selector, the display-currency
      conversion off `store.totalMetrics.baseCurrency` (the
      `InvestmentsView.vue:93-107` pattern), the recompute fan-out, and the
      backfill poll. It passes the result into `PerformanceTabContent`.
      > `handleMergedRecompute` (`:66-78`) fires `recomputePortfolio` once per
      > portfolio in a `Promise.all` — ten portfolios is ten writes from one
      > button click. Keep the behaviour (it is what the user asked for by
      > clicking it) but put the count in the button label so the cost is visible
      > before it is paid.
- [ ] **Remove the `combined-chart` card** and its `merged*` state from
      `InvestmentsView.vue:382-410` (and `:24-78`, `:97-107`), replacing it with a
      link to the new tab. Same endpoint, same chart component — only the
      placement moves.
- [ ] **State the FX caveat on the tab.** `resolveRates` (`instruments-fx.ts:153-170`)
      resolves **one spot rate per pair** and applies it across the whole history,
      so the aggregate is a constant-currency total: it excludes FX moves between
      a portfolio's base and the aggregate base. On a single-base portfolio this
      is invisible; on a multi-currency aggregate it is a material omission from
      "total return", and a user reading a flat PLN portfolio's history would
      otherwise take it for a currency call. Say it — do not leave it implicit.
      > This is existing §68.4 behaviour, unchanged by this section. It becomes
      > *visible* here, not *wrong* here.
- [ ] Tests: retarget `tests/e2e/combined-chart.spec.ts` onto the new tab's
      testids, keeping both existing cases (chart renders; the timeframe selector
      switches). Add a case asserting TWR, MWR, TWR p.a. and drawdown are **not**
      `—` on the seeded aggregate — a tab that renders four dashes is the failure
      mode of every step above, and it looks like a working page.
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
