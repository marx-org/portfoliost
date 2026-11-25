import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Component } from "vue"
import AnnualContributionsChart from "@/modules/charting/AnnualContributionsChart.vue"
import AnnualIncomeAverageChart from "@/modules/charting/AnnualIncomeAverageChart.vue"
import AnnualIncomeChart from "@/modules/charting/AnnualIncomeChart.vue"
import AssetTypeAllocationChart from "@/modules/charting/AssetTypeAllocationChart.vue"
import CashHistoryChart from "@/modules/charting/CashHistoryChart.vue"
import ChartingView from "@/modules/charting/ChartingView.vue"
import CumulativeContributionsChart from "@/modules/charting/CumulativeContributionsChart.vue"
import CumulativeIncomeChart from "@/modules/charting/CumulativeIncomeChart.vue"
import CurrencyAllocationChart from "@/modules/charting/CurrencyAllocationChart.vue"
import HoldingsCompositionChart from "@/modules/charting/HoldingsCompositionChart.vue"
import LabelCostValueChart from "@/modules/charting/LabelCostValueChart.vue"
import MonthlyIncomeChart from "@/modules/charting/MonthlyIncomeChart.vue"
import MonthlyPayerCountChart from "@/modules/charting/MonthlyPayerCountChart.vue"
import ProfitValueScatterChart from "@/modules/charting/ProfitValueScatterChart.vue"
import QuarterlyIncomeChart from "@/modules/charting/QuarterlyIncomeChart.vue"
import QuarterlyIncomeGrowthChart from "@/modules/charting/QuarterlyIncomeGrowthChart.vue"
import ReturnsChart from "@/modules/charting/ReturnsChart.vue"
import SectorAllocationChart from "@/modules/charting/SectorAllocationChart.vue"
import StockCategoryAllocationChart from "@/modules/charting/StockCategoryAllocationChart.vue"
import ValuationChart from "@/modules/charting/ValuationChart.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"
import { getChartIncome, getChartingCompare, getChartingPresets } from "@/api/charting"

vi.mock("@/api/charting", () => ({
  getChartIncome: vi.fn(),
  getChartingCompare: vi.fn(),
  getChartingPresets: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, fullPath: "/en/charting/research" }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const mockedIncome = vi.mocked(getChartIncome)
const mockedCompare = vi.mocked(getChartingCompare)
const mockedPresets = vi.mocked(getChartingPresets)

const ApexStub = {
  name: "apexchart",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

type AxisTitle = { text?: string }
type Options = {
  title?: AxisTitle
  xaxis?: AxisTitle & { title?: AxisTitle }
  yaxis?: (AxisTitle & { title?: AxisTitle }) | Array<AxisTitle & { title?: AxisTitle }>
}

function optionsOf(wrapper: ReturnType<typeof mount>): Options {
  return wrapper.findComponent(ApexStub).props("options") as Options
}

function axisTitles(options: Options): string[] {
  const y = Array.isArray(options.yaxis) ? options.yaxis : options.yaxis ? [options.yaxis] : []
  return [options.xaxis?.title?.text, ...y.map((axis) => axis.title?.text)].filter(
    (text): text is string => Boolean(text),
  )
}

interface Case {
  name: string
  component: Component
  props: Record<string, unknown>
  title: string
  axes: string[]
}

const cases: Case[] = [
  {
    name: "AnnualContributionsChart",
    component: AnnualContributionsChart,
    props: {
      points: [{ year: 2025, contributions: 100, withdrawals: 0, net: 100, transfers: 0 }],
      currency: "USD",
    },
    title: "Annual External Contributions",
    axes: ["Year", "External funding (USD)"],
  },
  {
    name: "AnnualIncomeAverageChart",
    component: AnnualIncomeAverageChart,
    props: {
      unit: "day",
      points: [{ year: 2025, amount: 1, divisor: 365, basis: "days", partial: false }],
      currency: "USD",
    },
    title: "Annual-equivalent Income per day",
    axes: ["Year", "Income (USD/day)"],
  },
  {
    name: "AnnualIncomeChart",
    component: AnnualIncomeChart,
    props: {
      points: [{ year: 2025, dividends: 100, interest: 0, options: 0, total: 100, priorYearTotal: null, yoyChangePercent: null }],
      currency: "USD",
    },
    title: "Annual totals",
    axes: ["Year", "Income (USD)", "YoY (%)"],
  },
  {
    name: "AssetTypeAllocationChart",
    component: AssetTypeAllocationChart,
    props: { slices: [{ key: "STOCK", value: 100 }], currency: "USD" },
    title: "By Asset Type",
    axes: [],
  },
  {
    name: "CashHistoryChart",
    component: CashHistoryChart,
    props: {
      series: [{ key: "a", label: "A", points: [{ date: "2026-01-01", balance: 100 }] }],
      currency: "USD",
    },
    title: "Broker Cash Balances",
    axes: ["Date", "Cash balance (USD)"],
  },
  {
    name: "CumulativeContributionsChart",
    component: CumulativeContributionsChart,
    props: {
      series: [{ key: "a", label: "A", points: [{ date: "2026-01-01", net: 100 }] }],
      currency: "USD",
    },
    title: "Cumulative External Contributions",
    axes: ["Date", "Net funding (USD)"],
  },
  {
    name: "CumulativeIncomeChart",
    component: CumulativeIncomeChart,
    props: {
      points: [{ date: "2026-01-01", dividends: 20, interest: 0, options: 0, total: 120, openingBalance: 100 }],
      currency: "USD",
    },
    title: "Cumulative income",
    axes: ["Date", "Cumulative income (USD)"],
  },
  {
    name: "CurrencyAllocationChart",
    component: CurrencyAllocationChart,
    props: { slices: [{ key: "USD", value: 100 }], currency: "USD" },
    title: "By Currency (denomination)",
    axes: [],
  },
  {
    name: "HoldingsCompositionChart",
    component: HoldingsCompositionChart,
    props: { rows: [{ key: "AAPL", value: 100 }], currency: "USD" },
    title: "Current Holdings",
    axes: [],
  },
  {
    name: "LabelCostValueChart",
    component: LabelCostValueChart,
    props: {
      rows: [{ key: "growth", costBasis: 50, value: 100 }],
      currency: "USD",
    },
    title: "Cost Basis vs Market Value by Label",
    axes: ["Cost basis / market value (USD)", "Label"],
  },
  {
    name: "MonthlyPayerCountChart",
    component: MonthlyPayerCountChart,
    props: { months: [{ year: 2025, month: 1, count: 2 }] },
    title: "Dividend Payers by Month — 2025",
    axes: ["Month", "Payers (count)"],
  },
  {
    name: "ProfitValueScatterChart",
    component: ProfitValueScatterChart,
    props: {
      points: [{ symbol: "STOCK|AAPL|USD", name: "Apple", marketValue: 150, totalProfit: 25 }],
      currency: "USD",
    },
    title: "Market Value vs Total Profit",
    axes: ["Market value (USD)", "Total profit (USD)"],
  },
  {
    name: "QuarterlyIncomeChart",
    component: QuarterlyIncomeChart,
    props: {
      points: [{ quarter: "2025-Q1", dividends: 100, interest: 0, options: 0, total: 100 }],
      currency: "USD",
    },
    title: "Quarterly Receipts by Year",
    axes: ["Quarter", "Receipts (USD)"],
  },
  {
    name: "QuarterlyIncomeGrowthChart",
    component: QuarterlyIncomeGrowthChart,
    props: {
      points: [{ quarter: "2025-Q1", total: 100, priorYearQuarterTotal: 80, yoyChangePercent: 25 }],
      currency: "USD",
    },
    title: "Quarterly Income Growth",
    axes: ["Quarter", "YoY change (%)"],
  },
  {
    name: "ReturnsChart",
    component: ReturnsChart,
    props: {
      points: [{ quarter: "2025-Q1", endingValue: 100, cumulativeNetContributions: 100, twr: 0, netGainChange: 0 }],
      currency: "USD",
    },
    title: "Quarterly Returns — TWR",
    axes: ["Quarter", "Return (%)"],
  },
  {
    name: "SectorAllocationChart",
    component: SectorAllocationChart,
    props: { slices: [{ key: "TECHNOLOGY", value: 100 }], currency: "USD" },
    title: "Sector Weights",
    axes: ["Market value (USD)", "Sector"],
  },
  {
    name: "StockCategoryAllocationChart",
    component: StockCategoryAllocationChart,
    props: { slices: [{ key: "balanced", value: 100 }], currency: "USD" },
    title: "By Stock Category",
    axes: [],
  },
]

function mountCase(c: Case) {
  return mount(c.component, {
    props: c.props,
    global: { stubs: { apexchart: ApexStub } },
  })
}

describe("Charting built-in titles and axis titles (#150)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPresets.mockResolvedValue([])
  })

  it.each(cases)("$name sets a built-in title and unit-qualified axes", (c) => {
    const options = optionsOf(mountCase(c))

    expect(options.title?.text).toBe(c.title)
    expect(axisTitles(options)).toEqual(c.axes)
  })

  it("MonthlyIncomeChart sets a built-in title and unit-qualified axes", async () => {
    mockedIncome.mockResolvedValue({
      currency: "USD",
      monthly: [{ period: "2026-01", dividends: 100, interest: 20, options: 30, total: 150, partial: false }],
    } as never)

    const wrapper = mount(MonthlyIncomeChart, {
      global: { stubs: { apexchart: ApexStub } },
    })
    await flushPromises()

    const options = optionsOf(wrapper)
    expect(options.title?.text).toBe("Monthly income")
    expect(axisTitles(options)).toEqual(["Month", "Income (USD)"])
  })

  it("ChartingView sets a built-in title and a metric-qualified value axis", async () => {
    mockedCompare.mockResolvedValue([
      { symbol: "AAPL", name: "Apple", price: 100, marketCap: 1e12, peRatio: 23.5, currency: "USD" },
      { symbol: "MSFT", name: "Microsoft", price: 100, marketCap: 1e12, peRatio: 31.2, currency: "USD" },
    ] as never)

    const wrapper = mount(ChartingView, {
      global: {
        stubs: {
          apexchart: ApexStub,
          InstrumentSearchModal: true,
          RouterLink: { props: ["to"], template: "<a><slot /></a>" },
        },
      },
    })
    const search = wrapper.findComponent({ name: "InstrumentSearchModal" })
    await search.vm.$emit("add", "AAPL", "Apple")
    await search.vm.$emit("add", "MSFT", "Microsoft")
    await flushPromises()

    const options = optionsOf(wrapper)
    expect(options.title?.text).toBe("Fundamentals comparison")
    expect(axisTitles(options)).toEqual(["Stock", "P/E (TTM) (ratio)"])
  })

  it("ValuationChart passes the built-in title to the shared renderer", () => {
    const wrapper = mount(ValuationChart, {
      props: {
        points: [{ date: "2026-01-01", value: 1000 }],
        currency: "USD",
      },
      global: {
        stubs: {
          PortfolioPerformanceChart: {
            name: "PortfolioPerformanceChart",
            props: ["timeSeries", "currency", "title", "xaxisTitle", "yaxisTitle", "showOverlays", "height", "benchmarks"],
            template: '<div class="perf-stub" />',
          },
        },
      },
    })

    const chart = wrapper.findComponent({ name: "PortfolioPerformanceChart" })
    expect(chart.props("title")).toBe("Valuation, capital and cumulative income")
    expect(chart.props("xaxisTitle")).toBe("Date")
    expect(chart.props("yaxisTitle")).toBe("Value (USD)")
  })

  it("PortfolioPerformanceChart renders the title and axis titles when supplied", () => {
    const wrapper = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [{ date: "2026-01-01", value: 1000 }],
        currency: "USD",
        title: "Valuation, capital and cumulative income",
        xaxisTitle: "Date",
        yaxisTitle: "Value (USD)",
      },
      global: { stubs: { apexchart: true } },
    })

    const options = (wrapper.vm as unknown as { chartOptions: Options }).chartOptions
    expect(options.title?.text).toBe("Valuation, capital and cumulative income")
    expect(options.xaxis?.title?.text).toBe("Date")
    expect(axisTitles(options)).toEqual(["Date", "Value (USD)"])
  })

  it("keeps the portfolio performance chart title-free by default", () => {
    const wrapper = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [{ date: "2026-01-01", value: 1000 }] },
      global: { stubs: { apexchart: true } },
    })

    const options = (wrapper.vm as unknown as { chartOptions: Options }).chartOptions
    expect(options.title).toBeUndefined()
    expect(axisTitles(options)).toEqual([])
  })
})