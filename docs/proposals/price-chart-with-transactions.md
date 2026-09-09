# Proposal: Price Chart with Transaction Overlay (shared component)

**Status**: draft (2026-09-08)
**Scope**: Extract `ResearchPriceChart` into a shared `PriceChart` component that optionally overlays a user's own buy/sell transactions on the price line, and embed it in two places: the Research overview page and the Portfolio Holdings tab.

---

## Context

- **Chart**: `src/modules/instruments/ResearchPriceChart.vue` — ApexCharts area chart, used only in the Research overview today. Tooltip is `{ shared: true }` (plain price values).
- **Holdings**: `src/modules/portfolios/PortfolioHoldingsTab.vue` — 3-dot menu per row with actions: Buy / Sell / Dividend / Edit / Research / Set labels / Remove. No in-place chart view exists today.
- **Transactions API**:
  - `getPortfolioTransactions(portfolioId, ...)` — `GET /api/portfolios/{id}/transactions`, filterable by `positionId` (`src/api/portfolios.ts:145`).
  - `getAllTransactions(...)` — `GET /api/portfolios/transactions`, all portfolios (`src/api/portfolios.ts:185`).
  - Neither endpoint currently accepts an `instrumentSymbol` filter. Both return `components["schemas"]["Transaction"][]` from `@marx2/contracts`.
- **Transaction fields** used by this feature: `id`, `portfolioId`, `portfolioName`, `positionId`, `instrumentSymbol`, `type`, `quantity`, `price`, `fees`, `totalAmount`, `currency`, `executedAt`.
- **Contract**: `portfoliost-contracts/openapi.yaml` is the source of truth. All changes to API shape must start there, be published as a new `@marx2/contracts` version, and be consumed via `npm install @marx2/contracts@<version>` + `npm run gen:types` before any frontend code references the new fields.
- **Dividends**: out of scope — dividend transaction recording is not yet implemented and will be addressed in a separate proposal. Only `buy` and `sell` transaction types are handled here.

---

## Design decisions

### D1 — Shared component: `src/components/PriceChart.vue`

`ResearchPriceChart.vue` is moved to `src/components/PriceChart.vue` and extended with optional props:

```ts
interface Props {
  symbol: string
  // When provided: fetch only from this portfolio (Holdings context).
  // When omitted: fetch across all portfolios (Research context).
  portfolioId?: string | null
  // When true, the "Transactions" checkbox initialises as checked.
  defaultShowTransactions?: boolean
  // Maximum number of transactions to fetch. Defaults to 500.
  maxTransactions?: number
}
```

`positionId` is **dropped** from props — the chart always operates in the context of an `instrumentSymbol` (passed as `symbol`). When opened from the Holdings tab the `instrumentSymbol` filter on the API (D2) is sufficient to scope transactions to that instrument within the given portfolio; a redundant `positionId` scope would exclude transactions recorded against the instrument directly (not via a position).

`ResearchOverview.vue` uses `<PriceChart :symbol="symbol" />` (no portfolio props).
`PortfolioHoldingsTab.vue` passes `:symbol` and `:portfolio-id`.

### D2 — Contract: add `instrumentSymbol` query param to both transaction endpoints

Both `GET /api/portfolios/transactions` (`getAllTransactions`) and `GET /api/portfolios/{id}/transactions` (`getPortfolioTransactions`) gain an optional `instrumentSymbol` query parameter. The name matches the field name on `Transaction` schema exactly — no aliasing:

```yaml
- name: instrumentSymbol
  in: query
  schema: { type: string }
  description: Filter by instrument symbol (e.g. AAPL). Case-insensitive.
```

**Workflow** (must be done before any frontend code that uses the new param):
1. Edit `portfoliost-contracts/openapi.yaml` — add `instrumentSymbol` param to both `getAllTransactions` and `getPortfolioTransactions` operations.
2. Push to `main` → CI auto-bumps the patch version, creates a GitHub Release, publishes `@marx2/contracts@<new-version>`.
3. In `portfoliost`: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new-version>` + `npm run gen:types` → commit updated `package-lock.json` and `generated/api-types.d.ts`.
4. In `portfoliost-wallets`: implement the filter in the route handler (`WHERE UPPER(instrument_symbol) = UPPER(?)`).
5. In `portfoliost/mocks/portfolios/index.js`: add `if (ctx.query.instrumentSymbol) { ... filter by instrumentSymbol case-insensitively ... }` to both mock endpoints.

After this, `src/api/portfolios.ts` adds `instrumentSymbol?: string` to both `getAllTransactions` and `getPortfolioTransactions`, typed against the freshly generated operation query types via `components["schemas"]` / operation parameter types — never a hand-written local type.

### D3 — "Transactions" checkbox

A checkbox labelled **"Transactions"** is added to the chart toolbar (same `flex` row as the mode toggle group). Default: `false` (or `true` when `defaultShowTransactions` prop is set). When checked:

1. The component fetches transactions via the strategy in D4.
2. Results are stored in `transactions = ref<components["schemas"]["Transaction"][]>([])`.
3. Transaction markers and reference lines appear on the chart.

Re-fetches automatically when: `symbol` prop changes, `timeframe` changes while checkbox is checked.

When unchecked: `transactions.value = []`, annotations cleared.

### D4 — Transaction fetch strategy

The chart always operates in the context of a given `instrumentSymbol` — passed as `symbol` prop and forwarded as the `instrumentSymbol` query param on every fetch. `sortBy` is always `date` and `sortOrder` always `asc` (chronological order is required for FIFO computation in D8). The limit defaults to `maxTransactions` prop (default 500) and is configurable.

| Context | Props present | API call |
|---|---|---|
| Research overview | `portfolioId` absent | `getAllTransactions({ instrumentSymbol: symbol, limit: maxTransactions, sortBy: 'date', sortOrder: 'asc' })` |
| Research + specific portfolio selected | `portfolioId` absent, user picks from dropdown | `getPortfolioTransactions(txPortfolioId, { instrumentSymbol: symbol, limit: maxTransactions, sortBy: 'date', sortOrder: 'asc' })` |
| Holdings modal | `portfolioId` present | `getPortfolioTransactions(portfolioId, { instrumentSymbol: symbol, limit: maxTransactions, sortBy: 'date', sortOrder: 'asc' })` |

If `response.hasNext === true`, a notice is shown inside the chart: _"Showing first {maxTransactions} transactions — some may be missing."_

Return type is always `components["schemas"]["Transaction"][]` — never a local hand-written type.

### D5 — Portfolio selector in Research context

When `portfolioId` is not passed (Research context), the toolbar shows a portfolio selector **only while "Transactions" is checked**. Options:

- "All portfolios" (default)
- One entry per portfolio from `usePortfolioStore().portfolios` (already loaded in the store)

Selected value stored in `txPortfolioId = ref<string | 'all'>('all')`. Changes trigger a re-fetch.

### D6 — Transaction markers (ApexCharts point annotations)

Transactions within the visible date range are grouped by date and mapped to `annotations.points` entries. Multiple transactions on the same date — including mixed types (e.g. a buy and a sell on the same day) — are each represented by their own annotation object; ApexCharts stacks multiple point annotations at the same x-category.

| Transaction `type` | Marker fill | Label |
|---|---|---|
| `buy` | `#16a34a` (green-600) | `▲` |
| `sell` | `#dc2626` (red-600) | `▼` |

**Date matching**: `executedAt` is parsed to ISO date (`yyyy-mm-dd`). A lookup map `dateIndexMap: Map<string, number>` is built from `series.value.dates` (the `toLocaleDateString`-formatted strings mapped back to their array index) to resolve the category efficiently.

**Same-date stacking**: when N transactions share a date, N separate `annotations.points` entries are emitted for that x-category, one per transaction. ApexCharts renders them as overlapping markers at the same x position. To keep them visually distinguishable, each marker is offset vertically from the price line by a fixed pixel amount (ApexCharts `offsetY`) that increments per transaction on that date (e.g. `offsetY: -8 * i` where `i` is the 0-based index within the same-date group). Ordering within the group: buys before sells, then by `executedAt` time if available.

**`txByDate` map**: a `Map<string, Transaction[]>` keyed by ISO date string is computed alongside annotations and reused by the tooltip (D7) and FIFO calculation (D8) — built once per fetch, not recomputed per render.

### D7 — Extended tooltip

`tooltip.custom` replaces `tooltip: { shared: true }`. When a data point has one or more transactions on that date, the tooltip adds a section below the standard price values:

```
[standard ApexCharts series values]
────────────────────────────────────
Transactions:
  ▲ Buy    10 @ $182.34  = $1,823.40  (fees $4.99)
  ▼ Sell    5 @ $195.00  = $975.00
```

Fields per row: icon + type label, quantity, `price` (per share, in `priceCurrency`), `totalAmount`, fees (omitted when `fees === 0`). All amounts formatted via `formatCurrency` from `@/utils/format`.

When no transactions fall on a date, the tooltip renders exactly as before.

### D8 — Avg / Low / High reference lines with FIFO cost basis

When "Transactions" is checked and there is at least one `buy` in the **visible date range**, three horizontal `annotations.yaxis` entries are drawn (only in `Price` mode — hidden when `mode !== 'Price'`):

| Line | Colour | Style | Calculation |
|---|---|---|---|
| Avg cost (FIFO) | `#2563eb` blue-600 | dashed | FIFO running cost basis at end of visible range |
| Lowest buy | `#16a34a` green-600 | dotted | `Math.min(...buyPrices)` within visible range |
| Highest buy | `#dc2626` red-600 | dotted | `Math.max(...buyPrices)` within visible range |

**"Visible date range"** = transactions whose `executedAt` falls between `timestamps[startIdx]` and `timestamps[n-1]` (the same window as `slicePoints`).

**FIFO avg cost calculation** (applied in chronological order, `sortOrder: 'asc'` guaranteed by D4):

```
lots: Array<{ qty: number; price: number }> = []
remainingQty = 0
totalCost = 0

for each transaction in chronological order:
  if type === 'buy':
    lots.push({ qty: transaction.quantity, price: transaction.price })
    remainingQty += transaction.quantity
    totalCost += transaction.quantity * transaction.price

  if type === 'sell':
    sellQty = transaction.quantity
    while sellQty > 0 and lots.length > 0:
      lot = lots[0]  // oldest lot first (FIFO)
      if lot.qty <= sellQty:
        totalCost -= lot.qty * lot.price
        remainingQty -= lot.qty
        sellQty -= lot.qty
        lots.shift()
      else:
        totalCost -= sellQty * lot.price
        remainingQty -= sellQty
        lot.qty -= sellQty
        sellQty = 0

avgCost = remainingQty > 0 ? totalCost / remainingQty : null
```

If `remainingQty === 0` (full position sold within range), the Avg line is omitted; Low/High lines remain.

Each visible line has a right-edge label: `Avg $182.34`, `Low $165.00`, `High $201.50`.

### D9 — "View chart" menu item in Holdings tab

In `PortfolioHoldingsTab.vue`:

1. Add `chartPosition = ref<Position | null>(null)`.
2. Add `openChartView(pos: Position): void` — sets `chartPosition.value = pos`, closes the 3-dot menu.
3. Add **"View chart"** button in the 3-dot dropdown, between "Research" and "Set labels...".
4. Add a modal overlay at the template bottom:
   ```vue
   <div v-if="chartPosition" class="fixed inset-0 z-50 overflow-auto bg-white dark:bg-slate-900 p-6">
     <div class="mb-3 flex items-center justify-between">
       <h2 class="text-base font-semibold">{{ chartPosition.symbol }} — {{ chartPosition.companyName }}</h2>
       <button type="button" class="btn-secondary text-sm" @click="chartPosition = null">Close</button>
     </div>
     <PriceChart
       :symbol="chartPosition.symbol"
       :portfolio-id="id"
       :default-show-transactions="true"
     />
   </div>
   ```

The `defaultShowTransactions` prop ensures the overlay opens pre-checked since seeing transactions is the primary reason to open the chart from Holdings.

---

## Implementation plan

Each step = one commit. Mark `[x]` when done.

```
[x] Step 1 — Contract: add `instrumentSymbol` query param to getAllTransactions and getPortfolioTransactions in openapi.yaml; publish new @marx2/contracts version
[x] Step 2 — Backend: implement `instrumentSymbol` WHERE filter in portfoliost-wallets route handler for both endpoints
[ ] Step 3 — Mock: add `instrumentSymbol` client-side filter to both mock endpoints in portfoliost/mocks/portfolios/index.js
[ ] Step 4 — Consumer update: npm install @marx2/contracts@<new-version> + npm run gen:types; add typed `instrumentSymbol?` param to getAllTransactions and getPortfolioTransactions in src/api/portfolios.ts; verify build
[ ] Step 5 — Extract shared component: copy ResearchPriceChart.vue → src/components/PriceChart.vue; add portfolioId/defaultShowTransactions/maxTransactions props; drop positionId; update ResearchOverview.vue import; delete old file; verify build
[ ] Step 6 — Add "Transactions" checkbox + portfolio selector (Research) + transaction fetch wiring (D3–D5)
[ ] Step 7 — Transaction markers: compute annotations.points from buy/sell transactions in visible range; integrate into chartOptions (D6)
[ ] Step 8 — Extended tooltip: replace shared tooltip with custom renderer showing buy/sell details (D7)
[ ] Step 9 — FIFO avg cost + Low/High reference lines: compute yaxis annotations from visible range; hide in Percent/Drawdowns modes (D8)
[ ] Step 10 — "View chart" in Holdings tab: menu item + modal + PriceChart with defaultShowTransactions=true (D9)
[ ] Step 11 — Tests & cleanup: vitest unit tests for FIFO cost basis logic, annotation computation, date-index mapping; full suite (npm run build && npm run test && npm run test:mock && npm run test:e2e)
```

---

## Files touched

| File | Change |
|---|---|
| `portfoliost-contracts/openapi.yaml` | add `instrumentSymbol` query param to `getAllTransactions` and `getPortfolioTransactions` |
| `portfoliost-wallets/src/routes/portfolio-transactions.ts` | implement `instrumentSymbol` WHERE filter |
| `portfoliost/mocks/portfolios/index.js` | add `instrumentSymbol` client-side filter to both mock endpoints |
| `portfoliost/generated/api-types.d.ts` | regenerated (never hand-edited) |
| `portfoliost/src/api/portfolios.ts` | add `instrumentSymbol?` param to `getAllTransactions` and `getPortfolioTransactions` |
| `portfoliost/src/components/PriceChart.vue` | new file (extracted + extended) |
| `portfoliost/src/modules/instruments/ResearchPriceChart.vue` | deleted |
| `portfoliost/src/modules/instruments/ResearchOverview.vue` | import path update |
| `portfoliost/src/modules/portfolios/PortfolioHoldingsTab.vue` | "View chart" menu item + modal |

---

## Open questions

1. **Pagination guard**: if `response.hasNext === true` after fetching `maxTransactions` results, a notice is shown in the chart. The `maxTransactions` prop (default 500) lets consumers tune this without a code change.
2. **sortBy/sortOrder coupling**: the chart always fetches with `sortBy='date'` and `sortOrder='asc'` — these are no longer exposed as parameters on the internal fetch call since they are invariant for this use case. The public `src/api/portfolios.ts` functions retain the params for other consumers.
