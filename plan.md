# plan.md — example-service.ai parity (5 reported gaps)

Long-running plan. Each step is implemented, verified (build + unit + mock + e2e), committed, and then marked here.

Legend: `[ ]` pending · `[x]` done

## Step 0 — Fix chart rendering crashes (foundation)
- [ ] Apexcharts crashes with `JSON.parse: "undefined" is not valid JSON` whenever a series contains `null`/`undefined` points — this is why research shows "no charts at all".
- [ ] Sanitize null points in all chart series (`ResearchOverview.vue` EPS + price charts, `PortfolioDetailView.vue` equity curve + monthly returns).
- [ ] Verify: `npm run build`, docker rebuild, browser console has 0 errors on research + portfolio pages; e2e passes.
- [ ] Commit.

## Step 1 — Main screen tabs (complaint #1)
- [ ] New `InvestmentsTabs.vue` (Portfolios | Transactions | Watchlists) with active state, rendered on the 3 investments views.
- [ ] Heading → "Portfolios"; add "Import from Broker" placeholder button.
- [ ] E2e tab-switching test passes. Commit.

## Step 2 — Portfolio detail with 9 tabs (complaint #2)
- [ ] Mock: add `GET /api/portfolios/:id/{allocation,dividends,calendar,news,compare}` derived from holdings + research; performance reuses analytics.
- [ ] Router: `/en/portfolios/:id` → `/holdings` + 8 more child tab routes.
- [ ] Layout: header (Go back, Rename, metric strip Total Value/Invested/Return/Unrealized/Realized/Income, Display currency/Share/Add Position/Delete) + tab nav.
- [ ] Views: Holdings, Transactions, Performance, Allocation, Risk Analysis, Dividends, Calendar, News, Compare.
- [ ] E2e: each tab loads. Commit.

## Step 3 — Position row actions (complaint #3)
- [ ] Trailing three-dots "Position actions" column → menu: Buy, Sell, Dividend, Edit position, Research, Remove position.
- [ ] Wire Research route, Remove (DELETE endpoint), Buy/Sell/Dividend/Edit dialogs (positions/transactions endpoints).
- [ ] Row polish: logo + "(US) Stock" label, Market Value cost sub-line, footer Total row.
- [ ] E2e: menu opens and actions work. Commit.

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
