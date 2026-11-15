/**
 * Chart registry (feature #253, sub-issue #256).
 *
 * One entry per chart kind: a stable id, a title, the page it lives on
 * (`category`), the dataset adapter it reads (`dataset`) and an optional metric
 * selector. Existing Performance/Allocation tabs mount the same entries rather
 * than forking a renderer, so there is one renderer/calculation per kind.
 */

export type ChartCategory = "performance" | "income" | "allocation" | "cash" | "categories"

export type ChartDataset = "performance" | "income" | "allocation" | "cash" | "categories"

export interface ChartKind {
  id: string
  title: string
  category: ChartCategory
  dataset: ChartDataset
  /** Optional chart-specific metric selector (e.g. twr | net_gain_change). */
  metric?: string
}

export const chartRegistry: readonly ChartKind[] = [
  // ── Performance ─────────────────────────────────────────────
  { id: "performance-valuation", title: "Valuation, capital and cumulative income", category: "performance", dataset: "performance" },
  { id: "performance-benchmark", title: "Portfolio vs S&P 500 / NASDAQ", category: "performance", dataset: "performance" },
  { id: "performance-quarterly", title: "Quarterly TWR and net-gain change", category: "performance", dataset: "performance", metric: "quarterly" },
  { id: "performance-scatter", title: "Holding market value vs total profit", category: "performance", dataset: "performance" },

  // ── Income ──────────────────────────────────────────────────
  { id: "income-monthly", title: "Monthly dividends/interest with options", category: "income", dataset: "income" },
  { id: "income-cumulative", title: "Cumulative dividends and interest", category: "income", dataset: "income" },
  { id: "income-annual", title: "Annual dividends/interest and YoY", category: "income", dataset: "income" },
  { id: "income-daily-average", title: "Daily-equivalent received income by year", category: "income", dataset: "income" },
  { id: "income-monthly-average", title: "Monthly-equivalent received income by year", category: "income", dataset: "income" },
  { id: "income-quarterly", title: "Quarterly receipts compared across years", category: "income", dataset: "income" },
  { id: "income-quarterly-yoy", title: "Quarterly year-over-year growth", category: "income", dataset: "income" },
  { id: "income-payer-coverage", title: "Monthly dividend-payer coverage", category: "income", dataset: "income" },

  // ── Allocation ──────────────────────────────────────────────
  { id: "allocation-currency", title: "Currency proportions", category: "allocation", dataset: "allocation" },
  { id: "allocation-asset-type", title: "Asset-type proportions", category: "allocation", dataset: "allocation" },
  { id: "allocation-sector", title: "Sector weights and values", category: "allocation", dataset: "allocation" },
  { id: "allocation-category", title: "Dividend-stock categories by market value", category: "allocation", dataset: "allocation" },
  { id: "allocation-cost-basis", title: "Remaining cost basis vs value by label", category: "allocation", dataset: "allocation" },
  { id: "allocation-composition", title: "Current composition of all holdings", category: "allocation", dataset: "allocation" },

  // ── Cash & funding ──────────────────────────────────────────
  { id: "cash-balance", title: "Broker cash balances through time", category: "cash", dataset: "cash" },
  { id: "cash-contributions", title: "Annual net external contributions", category: "cash", dataset: "cash" },

  // ── Stock categories ────────────────────────────────────────
  { id: "stock-categories", title: "Stock categories", category: "categories", dataset: "categories" },
]

export function chartsByCategory(category: ChartCategory): ChartKind[] {
  return chartRegistry.filter((c) => c.category === category)
}

export function chartById(id: string): ChartKind | undefined {
  return chartRegistry.find((c) => c.id === id)
}