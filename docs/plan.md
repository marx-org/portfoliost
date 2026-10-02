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

## 81. Drawdowns and annualization both ignore cash flows (2026-10-02)

Three defects in portfolio performance measurement, all live in PROD — two in
`portfoliost-wallets`, one in the `portfoliost` SPA. Found while choosing which
performance metrics to display; none is a speculative improvement, and each one
makes a number on screen wrong today. §81.1 is the serious one: it is also a
deviation from our own spec (`docs/proposals/portfolios-module.md:386` says
`annualizedReturn` comes *from TWR*, and the code never sees a TWR). §81.3 is the
same root cause as §81.1, reproduced in the frontend, on the Performance tab's
own Drawdown card.

`GET /api/portfolios/:id/risk-metrics` (`src/routes/portfolios.ts:1453`) selects
`snapshotDate`, `value`, `cumulativeTwr`, `cumulativeMwr`, then hands
`computeRiskMetrics` the **raw `value`** column (`src/routes/portfolios.ts:1484`
→ `:1491`). `computeRiskMetrics` derives every daily return from that series via
`dailyLogReturns` (`src/services/riskMetrics.ts:21-31`), which takes
`log(values[i] / values[i-1])` and knows nothing about `net_flow` — even though
`net_flow` sits in the same table and is selected two lines away for the TWR
column. Note that the two metrics on this route that *are* correct
(`moneyWeightedReturn` at `:1488`, and the monthly bars from `buildMonthlyReturns`
at `:156`) read the pre-computed `cumulative_twr`/`cumulative_mwr` columns. The
split is what makes this look plausible in the UI.

### 81.1 — `computeRiskMetrics` is fed raw `value`, so every deposit counts as a return

One deposit day moves `value` with no market move behind it, and
`dailyLogReturns` books the whole jump as a portfolio return. A €50k deposit into
a €50k portfolio with flat prices logs `log(100/50) = 69.3%` for that day. From
there:

| Metric | Source | How the flow contaminates it |
| --- | --- | --- |
| `volatility` | `riskMetrics.ts:53` | The 69.3% observation is fed through `√252`, so deposits dominate σ |
| `sharpeRatio` | `riskMetrics.ts:81` | Numerator (mean daily return) inflated by flow days, denominator by the same |
| `sortinoRatio` | `riskMetrics.ts:101` | Same, and the deposit lands in `Math.min(r - dailyRf, 0)` as 0 — never counted as downside |
| `winRate` | `riskMetrics.ts:131` | Every deposit day is a "win"; reads high |
| `maxDrawdown` | `riskMetrics.ts:63` | A deposit **during** a drawdown resets the peak, so real drawdowns are truncated — 100 → 50 → deposit 100 → 150 → 75 is a true −75% flow-neutral drawdown but reports −50% |
| `calmarRatio` | `riskMetrics.ts:119` | Inherits both: `annualizedReturn / abs(maxDrawdown)` |
| `periodReturnPercent` | `riskMetrics.ts:155` | `(last/first − 1)` on raw values — reads deposited capital as profit |

The fix is to stop deriving returns from `value` and instead build the
**flow-neutral daily sub-period return series** the snapshots already support:

```
HPR_t = V_t / (V_{t-1} + netFlow_t) − 1        // t = 1 … n−1
```

This is the same expression `buildTwr` uses (`returnColumns.ts:35`) — reuse it
rather than re-deriving it, so the risk metrics and the chart cannot drift apart.
Chain the `HPR`s into an index (start 1.0) and feed **that** to `maxDrawdown`;
feed the `HPR` array itself to `annualizedVolatility`, `sharpeRatio`,
`sortinoRatio` and `winRate` (they currently re-derive log returns internally,
so they should take returns, not values). `periodReturnPercent` becomes
`index_last − 1`. Do **not** read the stored `cumulative_twr` column as the
index: it is rounded to 2 dp (`returnColumns.ts:38`), which is ~1 bp of
quantisation per day and far too coarse for a daily σ.

- [x] **Export the daily flow-neutral return series** as a single named function
      in `src/services/returnColumns.ts` (next to `buildTwr`, sharing its
      per-day expression), and have `buildTwr` consume it so there is one
      implementation of the sub-period return.
- [x] **Change the risk-metric functions to take the prepared series**:
      `maxDrawdown(index)` / `annualizedVolatility(returns)` /
      `sharpeRatio(returns)` / `sortinoRatio(returns)` / `winRate(returns)` /
      `periodReturnPercent(index)`, and `computeRiskMetrics` to select `netFlow`
      alongside `value` at `src/routes/portfolios.ts:1470-1475` and prepare both
      series once.
      > Every existing case in `src/services/riskMetrics.test.ts` (40 `it()`s
      > across 10 describes) passes a *value* array with no flows. A signature
      > change means they all need rewriting to the new input shape, which is the
      > bulk of this step — do it as one mechanical pass, then add the flow cases
      > below. `src/routes/risk-metrics.test.ts` (9 cases) seeds `netFlow: "0"`
      > and will keep passing unchanged.
- [x] **Add the flow tests that would have caught this** — for each of
      `volatility`, `sharpe`, `sortino`, `winRate`, `maxDrawdown`,
      `periodReturnPercent`: a portfolio that receives one large deposit
      mid-window with **flat** prices must return the *same* metric as the same
      series with the deposit removed (this is the invariant that was violated),
      and a `calmar` case where a deposit during a drawdown no longer truncates
      it.
- [x] **Tests**: `npm run test` green in `portfoliost-wallets`; `npm run build`
      (tsc) green.
- [x] **Commit** `fix(wallets): derive risk metrics from flow-neutral returns, not raw value`

### 81.2 — `annualizedReturn` annualizes calendar days with a trading-day exponent

Independent of §81.1 and wrong even for a portfolio with no flows at all.

`annualizedReturn` (`riskMetrics.ts:143-151`) computes
`(V_last / V_first) ** (TRADING_DAYS / n) − 1` where `n = values.length − 1`.
`TRADING_DAYS` is `252` (`riskMetrics.ts:14`), but `n` counts **calendar** days:
the snapshot series is built from `calendarDays(from, to)`
(`src/services/backfill.ts:1079` → `:471-481`), which emits every day including
weekends and holidays. So the exponent is wrong by a factor of 365/252 ≈ 1.45
wherever the window is measured in days rather than years.

The error is largest exactly where it does the most damage — a one-year window
gives `n ≈ 365`, exponent `252/365 = 0.690`, so a genuine **+10.0%** year is
reported as **+6.8%**. It inverts at short windows: a 91-point quarter gives
`n = 90`, exponent `252/90 = 2.80`, so **+5.0%** in three months is reported as
**+14.6%** annualized where the correct figure is **+21.9%**. That last one is
the "small profit inflated into a large percentage" failure in its purest form,
and it needs no deposits at all — any portfolio with a flat three months of
returns is being annualized this way.

> **Corrected 2026-10-02 during implementation.** This paragraph originally read
> "a quarter gives `n ≈ 91`, exponent `252/91 = 2.77`, so +5.0% in three months
> is reported as **+14.5%** annualized" and implied +5.0% was the correct
> answer. It is not: annualizing a quarterly return to a yearly rate is supposed
> to exceed it. 14.6% *was* the old code's output; the corrected exponent
> (`365/90`) gives +21.9%. Measured in `riskMetrics.test.ts`
> ("annualizes a 91-day +5% quarter to ~+21.9%, not ~+14.6%"), which pins both
> numbers so neither can drift again.

The basis is also the wrong construct even once the exponent is corrected:
annualizing `V_last / V_first` measures the growth of the *value*, which grows
when you deposit. Per `portfolios-module.md:386` it must come from TWR over
**elapsed years**, i.e. from the flow-neutral index §81.1 builds:

```
annualized = (index_last / index_first) ** (365 / calendarDays) − 1
```

using calendar days in both the exponent numerator and the step count, which is
the only self-consistent pairing given the series is calendar-daily.

> **Implementation note.** Reading the dates rather than `index.length − 1` also
> matters for a *sparse* series: 100 points on a 4-day stride span 396 elapsed
> days, and a point-count exponent reads that +9.2% as +27.5%. Pinned in
> `riskMetrics.test.ts` ("reads elapsed days off the dates, so a sparse series is
> not read as daily").
>
> `TRADING_DAYS` stays at 252 for `annualizedVolatility` / `sharpeRatio` /
> `sortinoRatio`. Those scale a per-day dispersion by `√(periods per year)`
> rather than converting a measured span, so a trading-day σ is the comparable
> unit — and unlike the exponent, the √-scaling does not depend on how many
> points the series happens to have. See §81.4 for what that unit costs on a
> calendar-daily series.
>
> `daysBetween` in `returnColumns.ts` is now exported and is the single
> date-difference implementation: `annualizedReturn` and
> `annualizedReturnWithheldReason` both call it, so the 90-day predicate cannot
> drift from the exponent.

- [x] **Rewrite `annualizedReturn`** to take the flow-neutral index and the dates,
      annualizing over `365 / calendarDays` instead of `252 / n`.
- [x] **Add the regression test for the exponent**: a 365-point series rising
      exactly 10% must annualize to ~10%, not ~6.8%. Plus a 91-point series to
      pin the quarterly case (+5% in 91 days must read ~+21.9%, not ~+14.6% —
      corrected, see above), a sparse-series case, and a case with one mid-window
      deposit asserting the annualized figure is unchanged by it.
- [x] **Tests**: `npm run test` green in `portfoliost-wallets` (559 tests); `npm
      run build` (tsc) green.
- [x] **Commit** `fix(wallets): annualize over elapsed calendar years from TWR`

### 81.3 — `currentDrawdownPercent` in the SPA takes its peak over raw `value`

The same defect as §81.1, in the SPA, on the Performance tab's own Drawdown card.
Found while working out how to extend that tab; it is on screen today.

`currentDrawdownPercent` (`src/modules/portfolios/PortfolioPerformanceTab.vue:176-182`)
is computed client-side from `seriesValues` (`:174`), which is
`performance.timeSeries[].value` — the **raw portfolio value**, with no flow
adjustment:

```
const max = Math.max(...values)
return (values[values.length - 1] / max - 1) * 100
```

Every external cash flow raises the running maximum, so the denominator is
"peak including money that was never at risk". A deposit made during a drawdown
therefore **shrinks the reported Current Drawdown**, and the amount it shrinks it
by is the deposit: 100 → 50 → deposit 100 → 150 → 75 is a true −75% flow-neutral
drawdown and reports −50% here. The card's Max Drawdown tile
(`:184-190`) reads `riskMetrics.maxDrawdown` from the backend, so after §81.1
both tiles on that card become correct and consistent — but until then the two
tiles disagree with each other, which is visible on one screen.

The fix uses data the SPA already has: `timeSeries[]` also carries
`cumulativeTwr` (`src/routes/portfolios.ts:1277`), which is exactly the
flow-neutral index this peak should be taken over. Prefer that over recomputing a
TWR chain in the SPA — the index is pre-computed and rounded to 2 dp
(`returnColumns.ts:38`), which is ample for a peak lookup and not ample for a
daily σ. Do **not** import the backend's TWR builder into the SPA; if a future
card needs the daily return series rather than the index, add it to the
`analytics` payload instead.

- [x] **Recompute `currentDrawdownPercent` over `cumulativeTwr`**, falling back to
      the existing raw-`value` path when the series has no TWR column (a
      pre-migration snapshot row), so the card still renders rather than blanking.
- [x] **Add the component test** that pins the defect: a `timeSeries` of
      `[{value:100, cumulativeTwr:100},{value:50, cumulativeTwr:50},{value:150, cumulativeTwr:50},{value:75, cumulativeTwr:25}]`
      must report **−50%**, not −75% — and a no-flow series must report the same
      number as before, so the fallback and the TWR path agree.
      > `currentDrawdownPercent` is a module-local `computed` in a `<script setup>`
      > SFC, so it is not directly testable today. Extract the arithmetic to a
      > named export alongside the other shared maths (`docs/COMPONENTS.md`) and
      > import it back, which is the same treatment §79.1 gave `cell()`.
- [x] **Tests**: `npm run test` green in `portfoliost` (vitest unit) and
      `npm run build` (includes `vue-tsc --noEmit`) green. Add the tile to the
      existing Performance tab e2e rather than a new spec — one assertion that a
      seeded flow-bearing portfolio's Current Drawdown matches its Max Drawdown's
      peak-to-trough is enough to catch a regression.
      > **Plan correction.** The step assumed the compose seed carries a
      > flow-bearing portfolio. It does not: `SELECT count(DISTINCT net_flow)`
      > over `portfolios.value_snapshots` returns 1 for every seeded portfolio and
      > `max(abs(net_flow))` is 0, so `value` and `cumulative_twr` are exactly
      > proportional and *no* seeded portfolio can tell the two paths apart. The
      > e2e therefore splices a flow-bearing `timeSeries` into the analytics
      > response with `page.route()` (and stubs `risk-metrics` to match, so the
      > cross-tile comparison is like-for-like). Verified it fails against the old
      > raw-value implementation and passes against this one.
- [x] **Commit** `fix(spa): take the current-drawdown peak over the TWR index`

### 81.4 — `√252` understates annualised volatility on a calendar-daily series (CLOSED — 2026-10-02)

Found while implementing §81.2 and **deliberately left out of it**: §81.2's
defect is a unit mismatch in an *exponent*, this one is a unit mismatch in a
*√-scaling*, and they have opposite fixes. Bundling them would have made the
§81.2 commit change three displayed numbers for a reason unrelated to its stated
bug. Raising it rather than quietly doing it.

`TRADING_DAYS` (252) survives §81.2 and is still applied to a **calendar-daily**
series at `riskMetrics.ts:56` (`annualizedVolatility`), `:88` (`sharpeRatio`)
and `:112` (`sortinoRatio`). The series carries a point for every calendar day
with weekend/holiday **carry-forward** prices (`backfill.ts:487`), so ~104 of
every 365 daily returns are exactly 0. Two compounding errors:

1. Those zero days damp the daily σ by `√(261/365)` ≈ 0.846 — the dispersion is
   diluted across days on which nothing could move.
2. `√252` then scales a *calendar*-daily σ by a *trading*-day count, a factor
   `√(252/365)` ≈ 0.831 low.

Measured on a synthetic 365-day series of 261 real returns with a true daily σ of
0.549% plus 104 flat days (2026-10-02):

| | annualised σ |
| --- | --- |
| reported today (`sd_cal × √252`) | 7.37% |
| `sd_cal × √365` | 8.87% |
| true (`sd_real × √261`) | 8.87% |

So volatility reads **~17% low**, and Sharpe and Sortino inherit it (both are
`excessMean / sd × √TRADING_DAYS`, so the ratio of annualised σ to annualised
excess return is off by the same ~17% — Sharpe and Sortino are understated
together and stay internally consistent with each other, but not with the
annualised return that §81.2 now reports correctly).

The fix is one constant in three places, and note that `√365` is not a
compromise: it is **exactly** right here, because `√(261/365)` × `√365` =
`√261`. The flat weekend days are already doing the damping the trading-day
count assumes.

**The open question is comparability, not correctness.** `√252` is the
near-universal convention for annualising a *trading-day* σ, and example-service and
most published Sharpe ratios use it. Changing it moves three numbers on the Risk
tab by ~17% with no accompanying correction to the rest of the industry. So the
choice is:

- **Correct the maths** (→ `√365`, one constant, three call sites, numbers move
  ~17%) and document that our Sharpe is annualised on a calendar-daily basis;
  or
- **Keep `√252`** and document the convention as the price of being comparable
  with example-service and with published figures.

Note that *not* choosing is a real answer too — it leaves `annualizedReturn` on
a 365-day exponent (measured span) beside a `√252`-scaled σ (trading-day
convention), which is defensible because the two constructs genuinely differ but
should at least be written down rather than left to look like an oversight.

> **Decided 2026-10-02: use 365.** The user chose correctness over
> comparability with example-service and with published Sharpe figures, which quote √252.
> `TRADING_DAYS` is deleted from `riskMetrics.ts`; `DAYS_PER_YEAR = 365` now
> serves both the §81.2 exponent and these three √-scalings.
>
> The daily risk-free rate moved with it (`0.05/252` → `0.05/365`), because the
> mean return it is subtracted from is a calendar-daily mean. Leaving it at
> `/252` would have subtracted a *trading*-daily rate from a calendar-daily mean
> — a unit mismatch of the same kind this step exists to remove, and it is why
> Sharpe rose 25% rather than the 20% volatility rose.
>
> Measured on the seeded Top10 portfolio (1Y, live compose stack):

> | metric | before (√252) | after (√365) |
> | --- | --- | --- |
> | `volatility` | 0.1414 | 0.1702 (+20.4% = √(365/252)) |
> | `sharpeRatio` | 2.71 | 3.40 |
> | `sortinoRatio` | 3.10 | 3.90 |
> | `calmarRatio`, `maxDrawdown`, `winRate`, `periodReturnPercent` | — | unchanged |
>
> **The benchmark is deliberately left on √252.** `backfill.ts:442` annualises
> benchmark volatility from provider price bars, which are trading days only —
> verified 2026-10-02 on `instruments.price_bars_all`: 0 weekend bars, Mon–Fri
> ~10.9k rows each. √252 is correct for that series, so portfolio and benchmark
> now use *different* constants, each right for its own series. The module
> docstring previously claimed they shared one convention; it now explains the
> asymmetry, because "why do these two disagree?" is the obvious next question.

- [x] **Decide** which way the Risk tab goes, with the user. → **365** (above).
- [x] Replace `√TRADING_DAYS` with `√DAYS_PER_YEAR` in
      `annualizedVolatility` / `sharpeRatio` / `sortinoRatio`, and the daily
      risk-free divisor with it; delete the now-unused `TRADING_DAYS`.
- [x] Add the `sd_real × √261` table above as a unit test
      ("recovers the true annualised σ of a calendar-daily series with flat
      weekends"), asserting √365 lands within 0.1% of the truth and √252 lands
      17% low.
- [x] Re-check the Risk tab e2e for hardcoded expectations — there are none;
      `PortfolioRiskTab.vue` only renders what the API returns, so no spec
      changed.
- [x] Document why `backfill.ts` keeps √252, in the `riskMetrics.ts` module note.
- [x] **Tests**: `npm run test` green in `portfoliost-wallets` (560);
      `npm run build` (tsc) green. SPA `test:mock` 235 ✓, `test:e2e` 119 ✓ / 1
      pre-existing failure (`portfolios.spec.ts:289`).
- [x] **Commit** `fix(wallets): annualise portfolio sigma on 365 days, not 252`


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

- [ ] **Compute the TWR p.a. in the analytics route** from the already-selected
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
- [ ] **Return `annualizedReturn: null` plus a reason** when the span is under a
      full year, rather than annualising a partial window. Reuse the existing
      `annualizedReturnWithheldReason` (`src/services/riskMetrics.ts:176-188`)
      as the single source of truth for the predicate so the Risk tab and this
      tile cannot disagree about the same window. The reason string travels in
      the already-declared `annualizedReturnWithheldReason` field — **no new
      vocabulary, no `openapi.yaml` edit.**
- [ ] **Test the arithmetic in the route test** (`src/routes/analytics.test.ts`):
      a 365-point series with `cumulativeTwr` rising 100 → 110 must return
      `annualizedReturn: 10`, and a 91-point series must return `null` with the
      reason set, not a larger number.
- [ ] **Tests**: `npm run test` green in `portfoliost-wallets`; `npm run build`
      (tsc) green.
- [ ] **Commit** `feat(wallets): return the flow-neutral annualized return in analytics`

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
