import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import QuarterlyIncomeGrowthChart from "@/modules/charting/QuarterlyIncomeGrowthChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const points = [
  { quarter: "2025-Q1", total: 100, priorYearQuarterTotal: null, yoyChangePercent: null },
  { quarter: "2026-Q1", total: 125, priorYearQuarterTotal: 100, yoyChangePercent: 25 },
  { quarter: "2026-Q2", total: 80, priorYearQuarterTotal: 100, yoyChangePercent: -20 },
  { quarter: "2026-Q3", total: 50, priorYearQuarterTotal: 0, yoyChangePercent: null },
  { quarter: "2026-Q4", total: 50, priorYearQuarterTotal: null, yoyChangePercent: null },
]

describe("QuarterlyIncomeGrowthChart", () => {
  it("picks the latest year with a comparison and shows four quarters", () => {
    const wrapper = mount(QuarterlyIncomeGrowthChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ data: Array<number | null> }>
    expect(series[0].data).toEqual([25, -20, null, null])

    const rows = wrapper.findAll('[data-testid="charting-quarterly-yoy-table"] tbody tr')
    expect(rows).toHaveLength(4)
    expect(rows[0].text()).toContain("125")
    expect(rows[0].text()).toContain("100")
    expect(rows[0].text()).toContain("25")
    // Zero/missing prior quarter is undefined, never 0%.
    expect(rows[2].text()).toContain("—")
  })

  it("labels the compared years", () => {
    const wrapper = mount(QuarterlyIncomeGrowthChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("2026 vs 2025")
  })

  it("shows an empty state without a comparison year", () => {
    const wrapper = mount(QuarterlyIncomeGrowthChart, {
      props: { points: [{ quarter: "2026-Q1", total: 10, priorYearQuarterTotal: null, yoyChangePercent: null }], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No year-over-year quarterly income")
  })
})