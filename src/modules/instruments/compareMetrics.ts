import type { components } from "@/api/types"
import { formatAmount, formatCompact, formatCurrency, formatNumber, formatPercent } from "@/utils/format"

type ResearchCompare = components["schemas"]["ResearchCompare"]

export interface CompareMetric {
  key: keyof ResearchCompare
  label: string
  fmt: (r: ResearchCompare) => string
  chartFmt: (v: number) => string
}

export const COMPARE_METRICS: CompareMetric[] = [
  { key: "price", label: "Price", fmt: (r) => formatAmount(r.price, r.currency ?? null), chartFmt: (v) => formatCurrency(v) },
  { key: "marketCap", label: "Market Cap", fmt: (r) => formatCompact(r.marketCap), chartFmt: (v) => formatCompact(v) },
  { key: "peRatio", label: "P/E (TTM)", fmt: (r) => formatNumber(r.peRatio), chartFmt: (v) => formatNumber(v) },
  { key: "forwardPe", label: "Forward P/E", fmt: (r) => formatNumber(r.forwardPe), chartFmt: (v) => formatNumber(v) },
  { key: "pbRatio", label: "P/B", fmt: (r) => formatNumber(r.pbRatio), chartFmt: (v) => formatNumber(v) },
  { key: "psRatio", label: "P/S", fmt: (r) => formatNumber(r.psRatio), chartFmt: (v) => formatNumber(v) },
  { key: "dividendYield", label: "Dividend Yield", fmt: (r) => formatPercent(r.dividendYield), chartFmt: (v) => formatPercent(v) },
  { key: "revenueGrowth", label: "Revenue Growth", fmt: (r) => formatPercent(r.revenueGrowth), chartFmt: (v) => formatPercent(v) },
  { key: "netMargin", label: "Net Margin", fmt: (r) => formatPercent(r.netMargin), chartFmt: (v) => formatPercent(v) },
  { key: "roe", label: "ROE", fmt: (r) => formatPercent(r.roe), chartFmt: (v) => formatPercent(v) },
  { key: "grossMargin", label: "Gross Margin", fmt: (r) => formatPercent(r.grossMargin), chartFmt: (v) => formatPercent(v) },
  { key: "operatingMargin", label: "Operating Margin", fmt: (r) => formatPercent(r.operatingMargin), chartFmt: (v) => formatPercent(v) },
  { key: "evToEbitda", label: "EV/EBITDA", fmt: (r) => formatNumber(r.evToEbitda), chartFmt: (v) => formatNumber(v) },
  { key: "evToSales", label: "EV/Sales", fmt: (r) => formatNumber(r.evToSales), chartFmt: (v) => formatNumber(v) },
  { key: "fcfMargin", label: "FCF Margin", fmt: (r) => formatPercent(r.fcfMargin), chartFmt: (v) => formatPercent(v) },
  { key: "netIncome", label: "Net Income", fmt: (r) => formatCompact(r.netIncome), chartFmt: (v) => formatCompact(v) },
  { key: "revenue", label: "Revenue", fmt: (r) => formatCompact(r.revenue), chartFmt: (v) => formatCompact(v) },
]
