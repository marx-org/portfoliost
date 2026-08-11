# plan.md — example-service.ai parity (5 reported gaps)

Long-running plan. Each step is implemented, verified (build + unit + mock + e2e), committed, and then marked here.

Legend: `[ ]` pending · `[x]` done

## Step 0 — Fix chart rendering crashes (foundation)
- [x] Apexcharts crashes with `JSON.parse: "undefined" is not valid JSON` whenever a series contains `null`/`undefined` points — this is why research shows "no charts at all". (Actual root cause: vue3-apexcharts `series` prop is `required`, deep-cloned via `JSON.parse(JSON.stringify(undefined))`; we passed only `:options`.)
- [x] Sanitize null points in all chart series (`ResearchOverview.vue` EPS + price charts, `PortfolioDetailView.vue` equity curve + monthly returns). (Done via `:series` prop on all 6 charts.)
- [x] Verify: `npm run build`, docker rebuild, browser console has 0 errors on research + portfolio pages; e2e passes.
- [x] Commit. — `c17d463`

## Step 1 — Main screen tabs (complaint #1)
- [x] New `InvestmentsTabs.vue` (Portfolios | Transactions | Watchlists) with active state, rendered on the 3 investments views.
- [x] Heading → "Portfolios"; add "Import from Broker" placeholder button.
- [x] E2e tab-switching test passes. Commit. — `4204d7d` (+ router-tolerance fix `a506b0f`)

## Step 2 — Portfolio detail with 9 tabs (complaint #2) ✅
- [x] 2.1 Routing + layout shell: `/en/portfolios/:id` → layout (header: back, name, strategy, rename, Display currency/Share/Add Position/Delete + metric strip) + 9-tab nav + nested router-view; default child `/holdings`. — `f6889dd`
- [x] 2.2 Mock endpoints + API client: `GET /api/portfolios/:id/{allocation,dividends,calendar,news,compare}` derived from holdings + research; `src/api/portfolios.ts` functions + types. — `6f6062a`
- [x] 2.3 Holdings tab: move existing positions table into `PortfolioHoldingsTab.vue` (step 3 will add the three-dots column). — `f6889dd`
- [x] 2.4 Transactions tab: move existing transaction list into `PortfolioTransactionsTab.vue`. — `06b42f1`
- [x] 2.5 Allocation tab: sector/asset-type/currency breakdown with donut chart + table. — `fc5d897`
- [x] 2.6 Analytics tab: equity curve + monthly returns + benchmarks + risk stats (from analytics + risk-metrics). — `2edb619`
- [x] 2.7 Dividends + Calendar tabs: dividend history + upcoming earnings/dividend events for held symbols. — `221fe2f`
- [x] 2.8 News + Compare tabs: ticker-scoped news + research compare table. — `0eeea0e`
- [x] 2.9 Tests: e2e detail-tab navigation, unit coverage, lint/typecheck. Commit. — `0eeea0e`

## Step 3 — Position row actions (complaint #3) ✅
- [x] Trailing three-dots "Position actions" column → menu: Buy, Sell, Dividend, Edit position, Research, Remove position.
- [x] Wire Research route, Remove (DELETE endpoint), Buy/Sell/Dividend/Edit dialogs (positions/transactions endpoints).
- [x] Row polish: logo + "(US) Stock" label, Market Value cost sub-line, footer Total row.
- [x] E2e: menu opens and actions work. Commit. — `2d3ff28`

## Step 4 — Research full tabs + charts (complaint #4)
- [ ] Expand tabs: Overview, News, Fundamentals, Investor Relations, Ownership, Projections, Compare, Calendar, Dividends (all functional).
- [ ] Overview: description + Show more, key facts, Latest Earnings Call, Price Chart (timeframes 1D–MAX, Price/%/Drawdowns, comparison, Fullscreen, Download), Seasonality (3Y/5Y/10Y/20Y × Avg/Med/Min/Max).
- [ ] Header: "Add to Watchlist" + symbol logo row.
- [ ] New subviews: Fundamentals, Ownership, Compare, Calendar, Dividends.
- [ ] E2e: charts render with clean console, tabs navigate. Commit.

## Step 5 — Charting module (complaint #5)
- [ ] New `/en/charting` route + `ChartingView.vue`.
- [ ] Stocks selector (0/10), Add stock via search modal, Popular comparisons presets.
- [ ] Fundamentals comparison charts from `/api/charting/compare` with metric picker.
- [ ] E2e: add stocks → charts appear. Commit.
