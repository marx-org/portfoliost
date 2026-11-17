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
          props: ["timeSeries", "currency", "showOverlays", "height"],
          template: '<div class="perf-stub" />',
        },
      },
    },
  })
}

describe("ValuationChart", () => {
  it("maps the scoped points onto the shared renderer and enables overlays", () => {
    const wrapper = mountChart()
    const chart = wrapper.findComponent({ name: "PortfolioPerformanceChart" })
    expect(chart.props("showOverlays")).toBe(true)
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

  it("shows an empty state when there is no performance data", () => {
    const wrapper = mountChart({ points: [] })
    expect(wrapper.text()).toContain("No performance data for this scope")
    expect(wrapper.findComponent({ name: "PortfolioPerformanceChart" }).exists()).toBe(false)
  })
})