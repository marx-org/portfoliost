import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import QuarterlyIncomeChart from "@/modules/charting/QuarterlyIncomeChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const NOW = new Date()
const CURRENT_YEAR = NOW.getUTCFullYear()
const CURRENT_Q = `Q${Math.floor(NOW.getUTCMonth() / 3) + 1}`

const points = [
  { quarter: `${CURRENT_YEAR - 1}-Q1`, dividends: 100, interest: 0, options: 0, total: 100 },
  { quarter: `${CURRENT_YEAR - 1}-Q2`, dividends: 0, interest: 0, options: 0, total: 0 },
  { quarter: `${CURRENT_YEAR - 1}-Q3`, dividends: 300, interest: 0, options: 0, total: 300 },
  { quarter: `${CURRENT_YEAR}-Q1`, dividends: 50, interest: 0, options: 0, total: 50 },
]

describe("QuarterlyIncomeChart", () => {
  it("renders one series per year across Q1–Q4", () => {
    const wrapper = mount(QuarterlyIncomeChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ name: string; data: Array<number | null> }>
    expect(series.map((s) => s.name)).toEqual([String(CURRENT_YEAR - 1), String(CURRENT_YEAR)])
    // Q1=100, Q2=0 (covered zero), Q3=300, Q4 absent → null (no invented bar).
    expect(series[0].data).toEqual([100, 0, 300, null])
    expect(series[1].data).toEqual([50, null, null, null])
  })

  it("renders a companion table with one row per observed quarter", () => {
    const wrapper = mount(QuarterlyIncomeChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const rows = wrapper.findAll('[data-testid="charting-quarterly-income-table"] tbody tr')
    expect(rows).toHaveLength(4)
    expect(rows[1].text()).toContain(`${CURRENT_YEAR - 1}-Q2`)
    expect(rows[1].text()).toContain("0.00")
  })

  it("marks the current quarter as year-to-date", () => {
    const withCurrent = [...points, { quarter: `${CURRENT_YEAR}-${CURRENT_Q}`, dividends: 10, interest: 0, options: 0, total: 10 }]
    const wrapper = mount(QuarterlyIncomeChart, {
      props: { points: withCurrent, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.get('[data-testid="charting-quarterly-income-partial"]').text()).toContain("year-to-date")
  })

  it("shows an empty state when there are no quarters", () => {
    const wrapper = mount(QuarterlyIncomeChart, {
      props: { points: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No quarterly income for this scope")
    expect(wrapper.find('[data-testid="charting-quarterly-income-table"]').exists()).toBe(false)
  })
})