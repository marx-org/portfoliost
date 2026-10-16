# Proposal: Performance tab — overview tiles & per-year returns

**Status**: proposed (2026-10-02)
**Builds on**: [portfolios-module.md](portfolios-module.md) (D53–D64), [benchmarks.md](benchmarks.md) (D50), [portfoliost-presentation.md](portfoliost-presentation.md)
**Scope**: make the per-portfolio Performance tab answer two questions it currently cannot — *"how much more cash do I have than I put in?"* and *"how efficiently was it invested, per year and overall?"*. One new overview card (five tiles) above the Performance Chart, and a `Monthly | Yearly` toggle on the existing Returns Chart. Risk ratios stay on the Risk tab.

> Decision numbers start at **D85** — D82–D84 are taken by
> [instruments-provider-module.md](instruments-provider-module.md). Plan §82 was
> drafted with the placeholder "(D82)" before this file existed; its heading is
> corrected to D85–D89.

---

## Context

The Performance tab today renders four cards: Performance Chart, Drawdown, Returns Chart (monthly bars), and Top/Bottom Performers. It is a good chart and a bad *answer*. Three problems, in order of how much they mislead:

1. **The headline number is missing.** The payload carries `totalReturn` and
   `totalInvested` (`openapi.yaml:1471-1472`) and the tab renders neither. The
   Drawdown card answers "how far did I fall from my peak" without ever saying
   "you are €X up". A user who opens this tab cannot learn their gain in one
   glance.

2. **Return is displayed but not explained.** The Drawdown card shows a negative
   percentage; nothing distinguishes money the markets made from money the user
   added. Adding €50k on Monday and reading +10% on Friday is not a 10% return.

3. **Nothing is per-year.** The Returns Chart is monthly bars with no total, so
   "which year was good?" has no answer and no compounding check. A year-over-year
   table is the standard instrument for this and it is absent.

Two numbers make the gap worse than it looks. `performance.annualizedReturn` and
`annualizedReturnWithheldReason` are **declared in the contract and never
returned** — the analytics route's `performance` object ends at
`simpleReturnPercent` (`portfolios.ts:1343-1360`). So the one figure that would
answer "how did I do per year, in comparable terms" exists in the spec, is absent
from the wire, and has no UI. Separately, the Risk tab's drawdown tile and the
Performance tab's own drawdown tile were computed over different series (fixed in
plan §81.3), which is the kind of internal disagreement that makes a screen
untrustworthy.

Scope boundary: this proposal is the **per-portfolio** tab. The account-wide
(cumulative) equivalent is plan §83, which reuses this work through a shared
component — the two must not diverge.

---

## Design

### D85 — The overview card: five tiles, two questions

A single `card` **above** the Performance Chart, `data-testid="perf-overview"`,
reusing the Drawdown card's tile markup (`:334-343`) so the tab grows no second
visual dialect.

| # | Tile | Source field | Question it answers |
| --- | --- | --- | --- |
| 1 | **Net gain** | `performance.totalReturn` | how much more cash than I put in |
| 2 | **Net invested** | `performance.totalInvested` | how much of it was mine |
| 3 | **XIRR** | `performance.moneyWeightedReturn` | what my timing was worth |
| 4 | **TWR p.a.** | `performance.annualizedReturn` | what the investments did, per year |
| 5 | **Timing** | `XIRR − TWR p.a.` | did adding money help or hurt |

Tiles 1–2 are a *pair* and must be read together: gain over invested, never gain
alone. Tile 5 is the one that carries information — the difference between what
the money did (TWR) and what the user's timing added (XIRR):

- **XIRR > TWR p.a.** — "adding money helped". The user deployed capital at good
  points.
- **XIRR < TWR p.a.** — "adding money hurt". Capital arrived late enough, or in
  enough size, to drag the blended rate below the investments' own.
- **Within ~1 pp** — "timing was roughly neutral". Any tighter threshold is
  precision the underlying figures do not support.

XIRR and TWR answer genuinely different questions and the *gap* between them is
the signal. Reporting either alone invites the reader to treat a money-weighted
number as an investment result, which is the specific misreading this card exists
to prevent.

Rules:

- Money tiles convert through the **existing** display-currency path — reuse the
  `useDisplayConversion` / `chartRate` pair already built at `:251-264` rather
  than adding a sixth copy, so switching display currency re-converts in place
  without a re-mount.
- `null` or absent renders `—`, **never `0`**. A withheld TWR p.a. and a genuine
  0.0% return are different facts and must not look alike.
- The Timing line is a difference of two rates, so it is only meaningful when
  both are present. **Hide the entire line** when either input is withheld; never
  print a difference against `null`.

### D86 — No contract change

Every field this proposal needs is already declared in `openapi.yaml`:
`totalReturn` / `totalInvested` (`:1471-1472`), `moneyWeightedReturn` (`:1480`),
`annualizedReturn` + `annualizedReturnWithheldReason` (`:1479`, `:1481`),
`cumulativeTwr` (`:1542`), and `timeSeries[].invested` (`:1509`). Two of them
(`annualizedReturn`, `annualizedReturnWithheldReason`) are computed by
`/risk-metrics` and returned to a UI that displays none of them.

Adding the two scalars to the analytics response is therefore a **wiring change,
not a schema change** — no `openapi.yaml` edit, no `@marx-org/contracts` release, no
`gen:types` run. That is deliberate: it keeps the section to two repos.

### D87 — `Monthly | Yearly` toggle on the Returns Chart

The Returns Chart card header gains a two-way toggle. **Monthly** is today's bar
chart, unchanged. **Yearly** renders a table in the same card.

```
┌────────┬───────────┬──────────┬──────────────┐
│ Year   │ TWR %     │ Gain     │ vs SPY       │
├────────┼───────────┼──────────┼──────────────┤
│ 2023   │ +24.1%    │ 5,300    │ +3.2%        │
│ 2024   │ +18.2%    │ 4,100    │ −1.1%        │
│ 2025   │ +11.4%    │ 2,950    │ +2.0%        │
│ 2026   │ +4.3%*    │    890   │ —            │
│ Σ      │ × 1.7044  │ 13,240   │ no total     │
└────────┴───────────┴──────────┴──────────────┘
                                    * YTD
```

Worked example (the fixture the tests assert against): four years at
+24.1 / +18.2 / +11.4 / +4.3 % with gains 5,300 / 4,100 / 2,950 / 890.
`1.241 × 1.182 × 1.114 × 1.043 = 1.70435…` → **× 1.7044**; gains sum to
**13,240**.

**Yearly is gated to the `ALL` timeframe.** `analytics` is timeframe-filtered
server-side, so a 3M window holds no calendar year and a 1Y window holds at most
one. Selecting any timeframe other than `ALL` forces Monthly and disables the
toggle with a visible hint. **Do not issue a second `ALL` fetch** to satisfy it —
the tab already holds the full series the moment `ALL` is selected, and a second
request is a second chance to disagree with the first.

The current calendar year is marked `YTD` and **never annualised** — a partial
year reported at a full year's rate is the §81.2 defect in a different costume.

### D88 — Two exact formulas, differenced from the stored index

Both columns are derived from `performance.timeSeries[]` in one exported pure
function beside the component (`docs/COMPONENTS.md` — shared math goes in a plain
`<script>` block), returning one row per calendar year:
`{ year, twrPercent, gain, isYtd }`.

**Year TWR = `cumulativeTwr(last of y) / cumulativeTwr(last of y−1) − 1`.**

Differencing the stored index, not re-chaining and not aggregating the monthly
bars. Three reasons, all of which have bitten this codebase before:

- `cumulative_twr` **is** the exact chain. Re-chaining from monthly percentages
  compounds the rounding of an already-rounded input.
- Summing or averaging monthly returns is simply wrong — +10% then −10% is
  −1%, not 0% and not 10%. The Σ row's job is to make that visible
  (`× 1.7044`, never `+58.0%`), and it can only be right if each year is a
  chained product.
- The first year uses the series' own first point as its base, so a series that
  starts mid-year reports a partial year as a partial year rather than against a
  base the series does not contain.

**Year gain = `[value − invested](end of y) − [value − invested](start of y)`.**

A *change in* net gain, not a sum of daily differences. This is what makes the
column reconcile: `Σ year gains` equals `performance.totalReturn` exactly,
because every day's `value − invested` telescopes into the difference between the
endpoints. That reconciliation is the point of the column and must be asserted in
a test — it is the check that catches a wrong base year.

Both formulas convert Gain through the same `chartRate` used by the D85 tiles, so
the Σ footer and the Net gain tile on screen are the same number by construction.

### D89 — Excess per year against the first benchmark; risk ratios stay on the Risk tab

The fourth column is `portfolio year TWR − benchmark year TWR`, the same
year-boundary ratio as D88 applied to the benchmark's own index.
`benchmarks[].timeSeries[]` already carries the transaction-mirrored series, so
this is arithmetic, not a new data source.

- The column header names the symbol it is measured against (`vs SPY`).
- **First selected benchmark only.** Benchmarks are a list, so "excess vs all of
  them" is not a single number. One column is a deliberate cap; widening it is a
  separate decision, not a widening of this one.
- With no benchmark selected, **omit the column entirely** rather than rendering
  an empty one.
- **No Σ in this column, and say so.** Excess returns compound but do not sum, so
  a Σ row that looked additive would be wrong. Render the cell as "no total"
  rather than blank.

**Risk ratios (Sharpe, Sortino, Calmar, volatility, win rate) stay on the Risk
tab.** The Performance tab is a money-and-time view; the Risk tab is a
distribution view. Duplicating the ratios here would put two sets of the same
numbers on two screens, and the whole point of this proposal is that the numbers
on this tab can be trusted — which they cannot be if a second copy can drift.

---

## Implementation plan

Implemented as plan **§82** (`docs/plan.md`), one commit per step:

| Step | Change | Repos |
| --- | --- | --- |
| §82.1 | return `annualizedReturn` + withheld reason from the analytics route | `portfoliost-wallets` |
| §82.2 | D85 overview card | `portfoliost` |
| §82.3 | D87 toggle + D88 table | `portfoliost` |
| §82.4 | D89 excess column | `portfoliost` |
| §82.5 | example-service parity, full suite | `portfoliost` |

The provider-tier ordering (openst → cachest → instruments) does not apply: no
new data source, no scraping, no route in `cachest/config.yaml`.

**Ordering dependency.** TWR p.a. must be annualised over *elapsed calendar years
from the flow-neutral index*. Plan §81.2 is where that number is built correctly
(landed, commit `811d942`); §82 consumes it and must not re-derive annualisation.
`computeRiskMetrics` already returns `annualizedReturn` from the index
(`riskMetrics.ts:242`), so §82.1 is a two-line call, not a third annualiser.

---

## Resolved decisions

- **Five tiles, one card, above the chart.** Not five cards, and not folded into
  the Drawdown card — they answer a different question than drawdown.
- **Timing is a difference, not a fifth metric.** It is the only tile that is
  *derived* rather than read, and it is the one that explains the gap between XIRR
  and TWR.
- **No contract change** (D86). Two declared-but-unreturned scalars are the whole
  backend surface.
- **Yearly gated to `ALL`**, forcing Monthly on any other timeframe, with **no
  second fetch**.
- **Year TWR by differencing `cumulativeTwr`**; year gain as the change in
  `value − invested`, which reconciles to `totalReturn` and is asserted as such.
- **Excess per year against the first benchmark only**, no Σ, column absent when
  no benchmark is selected.
- **Risk ratios stay on the Risk tab.**
- **Current year marked `YTD`, never annualised.**
