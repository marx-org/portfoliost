import { http } from "./client"
import type { components } from "../../generated/api-types"

type ResearchCompare = components["schemas"]["ResearchCompare"]
type ChartIncomeData = components["schemas"]["ChartIncomeData"]
type ChartAllocationData = components["schemas"]["ChartAllocationData"]
type ChartPerformanceData = components["schemas"]["ChartPerformanceData"]
type ChartCashData = components["schemas"]["ChartCashData"]
type StockChartCategoryAssignment = components["schemas"]["StockChartCategoryAssignment"]
type StockChartCategoryUpdate = components["schemas"]["StockChartCategoryUpdate"]

export interface ChartingPreset {
  name: string
  description?: string
  symbols: string[]
  metric: keyof ResearchCompare
}

/**
 * Chart scope for the shared investment charts (feature #253).
 *
 * Accounts and labels are multiselect, default All. An empty/omitted selection
 * means "all owned real accounts". Several accounts AND any selected label: the
 * accounts intersect the labels, and the labels match any one of them.
 */
export interface ChartScopeQuery {
  /** Real portfolio (account) IDs. Empty/absent = All. */
  accounts?: string[]
  /** Current position-label IDs, combined with OR. Empty/absent = All. */
  labels?: string[]
  /** Which side of the account filter is active: real or virtual portfolios. */
  kind?: "normal" | "virtual"
  /** ISO-4217 display currency for comparable values. */
  currency?: string
  /** Inclusive window start (YYYY-MM-DD). */
  from?: string
  /** Inclusive window end (YYYY-MM-DD). */
  to?: string
  /** Chart-specific metric selector (e.g. twr | net_gain_change). */
  metric?: string
  /** Benchmark symbols to mirror into (e.g. SPY, QQQ). */
  benchmarks?: string[]
}

function scopeQuery(scope: ChartScopeQuery = {}): string {
  const q = new URLSearchParams()
  if (scope.accounts?.length) q.set("accounts", scope.accounts.join(","))
  if (scope.labels?.length) q.set("labels", scope.labels.join(","))
  if (scope.kind === "virtual") q.set("kind", "virtual")
  if (scope.currency) q.set("currency", scope.currency)
  if (scope.from) q.set("from", scope.from)
  if (scope.to) q.set("to", scope.to)
  if (scope.metric) q.set("metric", scope.metric)
  if (scope.benchmarks?.length) q.set("benchmarks", scope.benchmarks.join(","))
  const s = q.toString()
  return s ? `?${s}` : ""
}

export async function getChartingCompare(symbols: string[]): Promise<ResearchCompare[]> {
  const q = new URLSearchParams({ symbols: symbols.join(",") })
  return http.get<ResearchCompare[]>(`/api/charting/compare?${q}`)
}

export async function getChartingPresets(): Promise<ChartingPreset[]> {
  return http.get<ChartingPreset[]>(`/api/charting/presets`)
}

export async function getChartIncome(scope?: ChartScopeQuery): Promise<ChartIncomeData> {
  return http.get<ChartIncomeData>(`/api/portfolios/charting/income${scopeQuery(scope)}`)
}

export async function getChartAllocation(scope?: ChartScopeQuery): Promise<ChartAllocationData> {
  return http.get<ChartAllocationData>(`/api/portfolios/charting/allocation${scopeQuery(scope)}`)
}

export async function getChartPerformance(scope?: ChartScopeQuery): Promise<ChartPerformanceData> {
  return http.get<ChartPerformanceData>(`/api/portfolios/charting/performance${scopeQuery(scope)}`)
}

export async function getChartCash(scope?: ChartScopeQuery): Promise<ChartCashData> {
  return http.get<ChartCashData>(`/api/portfolios/charting/cash${scopeQuery(scope)}`)
}

export async function getStockChartCategories(scope?: ChartScopeQuery): Promise<StockChartCategoryAssignment[]> {
  return http.get<StockChartCategoryAssignment[]>(`/api/portfolios/charting/stock-categories${scopeQuery(scope)}`)
}

export async function setStockChartCategory(input: StockChartCategoryUpdate): Promise<StockChartCategoryAssignment> {
  return http.put<StockChartCategoryAssignment>("/api/portfolios/charting/stock-categories", input)
}