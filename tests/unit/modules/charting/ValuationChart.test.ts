import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import ValuationChart from "@/modules/charting/ValuationChart.vue"

const points = [
  { date: "2026-01-01", value: 1000, invested: 1000, capitalBasis: 900, cumulativeIncome: 0, cumulativeOptions: 0 },
  { date: "2026-02-01", value: 1100, invested: 1000, capitalBasis: 900, cumulativeIncome: 100, cumulativeOptions: 40 },
]

function mountChart(props: Record<string, unknown> = {}) {
  return mount(ValuationChart, {
    props: { points, currency: "USD", ...props },
    global: {
      stubs: {
        PortfolioPerformanceChart: {
          name: "PortfolioPerformanceChart",
          props: ["timeSeries", "currency", "showOverlays", "height", "benchmarks"],
          template: '<div class="perf-stub" />',
        },
      },
    },
  })
}

describe("ValuationChart", () => {
  it("maps the scoped points onto the shared renderer", () => {
    const wrapper = mountChart()
    const chart = wrapper.findComponent({ name: "PortfolioPerformanceChart" })
    // The old companion assertion `showOverlays === true` could not fail: the
    // template hardcodes `:show-overlays="true"` (ValuationChart.vue:75), so it
    // is true for every mount regardless of input.
    const series = chart.props("timeSeries") as Array<Record<string, unknown>>
    expect(series).toHaveLength(2)
    expect(series[1]).toMatchObject({
      date: "2026-02-01",
      value: 1100,
      invested: 1000,
      capitalBasis: 900,
      cumulativeIncome: 100,
      cumulativeOptions: 40,
    })
  })

  it("passes the shared benchmark series to the renderer", () => {
    const benchmarks = [
      {
        symbol: "SPY",
        name: "S&P 500",
        returnPercent: 4,
        volatility: 12,
        timeSeries: [{ date: "2026-01-01", value: 100 }],
        absoluteTimeSeries: [{ date: "2026-01-01", value: 1000 }],
      },
    ]
    const wrapper = mountChart({ benchmarks })
    const chart = wrapper.findComponent({ name: "PortfolioPerformanceChart" })
    expect(chart.props("benchmarks")).toEqual(benchmarks)
  })

  it("shows an empty state when there is no performance data", () => {
    const wrapper = mountChart({ points: [] })
    expect(wrapper.text()).toContain("No performance data for this scope")
    expect(wrapper.findComponent({ name: "PortfolioPerformanceChart" }).exists()).toBe(false)
  })
})