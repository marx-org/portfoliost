# plan.md — example-service.ai parity (5 reported gaps + parity audit)

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
- [x] 4.1 Header + tab expansion: ResearchView header gets logo row + "Add to Watchlist"; add Fundamentals, Ownership, Compare, Calendar, Dividends routes (shells).
- [x] 4.2 Overview upgrade: description + Show more, key facts, Latest Earnings Call, price-target banner.
- [x] 4.3 Price chart: timeframes 1D–MAX, Price/%/Drawdowns modes, comparison overlay (mock `?compare=`), Fullscreen + CSV Download.
- [x] 4.4 Seasonality: controls (3Y/5Y/10Y/20Y × Avg/Med/Min/Max) + chart (mock years/metric transforms).
- [x] 4.5 Fundamentals subview: income statement / balance sheet / cash flow tables.
- [x] 4.6 Ownership subview: institutional / mutual fund holder tables.
- [x] 4.7 Compare subview: fundamentals comparison table for the symbol.
- [x] 4.8 Calendar + Dividends subviews.
- [x] 4.9 Tests: e2e tab navigation + charts with clean console, unit coverage, lint/typecheck. Commit.

## Step 5 — Charting module (complaint #5)
- [x] New `/en/charting` route + `ChartingView.vue`.
- [x] Stocks selector (0/10), Add stock via search modal, Popular comparisons presets.
- [x] Fundamentals comparison charts from `/api/charting/compare` with metric picker.
- [x] E2e: add stocks → charts appear. Commit.

## Step 6 — Parity audit (page-by-page diff vs example-service.ai)
Compared every page/button of `app.example-service.ai` (authenticated) to this app. Skipped per user (see AGENTS.md): news dashboard, premium plan description, send error, Copilot, import from broker, alerts, payments/billing. Gaps to implement, grouped:

### 6.1 Sidebar / navigation
- [x] Remove/relocate "Wallets" — example-service has NO Wallets item; cash lives as "Cash Portfolios" on the Portfolios page.
- [x] Wire dead links: News → real news page (no route today), Settings → `/en/settings/profile`. (Alerts link removed — alerts skipped per user.)
- [x] Remove "Report bug" link (bottom of sidebar) — was added earlier, then removed: the send-error form is on the skip list.
- [ ] Research quick-switch logo row (MSFT/NVDA/META/...) — example-service shows it on the research page too.

### 6.2 Portfolios page (investments)
- [x] "Display currency" button (USD $ dropdown) in page header.
- [x] Investment Portfolios + Cash Portfolios sections; return metrics: Total Value / Total Invested / Total Return %.
- [x] Portfolio card actions: mini chart w/ timeframes (incl. ALL), Add Position, Analytics, News, Calendar.
- [x] "Manage" menu per portfolio → Edit / Export CSV / Export XML / Export JSON / Delete.
- [x] Cash wallet card actions: Deposit / Withdraw / Transfer / History / Manage.
- Skipped per user: "Import from Broker" (see AGENTS.md).

### 6.3 Portfolio detail page
- [x] Metric strip gains Unrealized / Realized / Income (ours: Total Value/Invested/Return only).
- [x] "Rename" + "Delete" buttons (rename exists; delete missing).
- [x] Tabs: rename Analytics→"Performance" (`/performance`), Risk→"Risk Analysis" (`/risk-analysis`), keep route aliases.
- [x] AI Insight premium banner on Holdings tab ("Premium feature — upgrade to unlock AI portfolio insights").
- [x] Holdings table: "Export" button, "Customize 7" column picker, sortable headers.
- [x] Performance tab: Drawdown (max/current + Add custom timeframe), Returns Chart (Day/Month/Year), Top/Bottom Performers.
- [x] Position actions: Buy/Sell/Dividend/Edit/Research/Remove already match example-service.

Portfolio screen gaps (user-reported):
- [x] "Add Position" button does nothing (in the page header / card) — now opens a dialog (symbol/quantity/price) → `POST /portfolios/:id/positions`. e2e-covered.
- [x] Delete button is not styled (in the page header) — now `btn-red-ghost`.
- [x] No currency switcher ("Display currency") on the portfolio detail header — shared `useDisplayCurrencyStore` (also used by Investments page) feeds the metric strip + holdings table; reactive via `storeToRefs`; persists to localStorage. e2e-covered.
- [x] No export button near "Positions" on the holdings screen — already present (Export CSV), verified.
- [x] No grouping switch (none / type / sector / country) for the holdings table — group header + subtotal rows. e2e-covered.

### 6.4 Research page
- [ ] Route format `AAPL.US` (exchange suffix) instead of `AAPL`; header "Go back" + "Search for a stock… ⌘K" + "Add to Watchlist" (header items done; route format deferred).
- [x] Research quick-switch logo row (MSFT/NVDA/META/...) on the research page.
- [x] Company Statistics adds: Returns (ROA/ROTA/ROE), Financial Health (Current/Quick ratio), P/FCF + EV/Gross Profit (Valuation TTM), PEG + Price Target (Valuation NTM), Dividends stats (Yield/Payout/DPS/DPS Growth), Growth CAGR (3/5/10yr + fwd).
- [x] EPS Surprises + 5Q timeframe combobox; Latest Earnings Call.
- [x] Price chart: add 5D/3Y/5Y/10Y timeframes; "Add comparison" button (replaces SPY/QQQ/IWM dropdown); Total Chg + CAGR stat; "Powered by Example service".
- [x] Seasonality: add 20Y option (already present, verified).
- [x] News tab: Timeline Events count + "Analyzed Articles" count (premium banner skipped per user).

### 6.5 Charting page
- [x] Heading "Stocks" + "X/10 selected" counter (ours: "Stocks" only).
- [x] Presets: replace with example-service's five — Tech Giants, Social Media, EVs, Banks, Streaming (added JPM/BAC/WFC/GS/RIVN/NIO/LCID/SNAP/DIS/CMCSA/SPOT to the seeded universe so all five have real data).
- [x] Modal title "Add Stock to Chart".

### 6.6 Transactions page
- [x] Sub-tabs "Portfolio Transactions" / "Wallet Transactions" (route `/en/investments/transactions/cash`).
- [x] Column "Instrument Currency" + Fees + P&L; sortable headers; row Edit/Delete.
- [x] Pagination w/ rows-per-page 5/10/20/50.
- [x] Wallet transactions: `GET /api/wallets/recent-transactions` (server-side sort date/walletName/type/amount, `{data, meta}`), `PATCH|DELETE /api/wallets/transactions/:txId` (recomputes displayLabel + signs amount). All-transactions API gains `sortBy`/`sortOrder`.

### 6.7 Watchlists page
- [x] Description line ("Track symbols you don't own — prices, news and fundamentals in one place.").
- [x] Empty state "No watchlists yet" + "Create First Watchlist".

### 6.8 Settings module (new, stubbed links)
- [ ] Routes `/en/settings/profile`, `/en/settings/shared-portfolios`, `/en/settings/broker-connections` (Alerts + Billing tabs removed — skipped per user, see AGENTS.md).
- [ ] Profile: first/last name, email (disabled), Save Changes, Language Preference, Change password, Danger Zone (Clear All Data / Delete Account).
- [ ] Shared Portfolios: Active Shares 1/10, share card (views, Copy link, View shared portfolio, Delete).

### 6.9 Alerts
- Skipped per user (see AGENTS.md skip list). The mock keeps `/api/notifications/*` endpoints, but no UI is wired (no sidebar Alerts link, no Alerts settings tab).
