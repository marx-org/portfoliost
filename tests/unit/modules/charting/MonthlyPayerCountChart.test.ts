import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import MonthlyPayerCountChart from "@/modules/charting/MonthlyPayerCountChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const NOW = new Date()
const CURRENT_YEAR = NOW.getUTCFullYear()

function months(year: number, counts: number[]) {
  return counts.map((count, i) => ({ year, month: i + 1, count, partial: false }))
}

describe("MonthlyPayerCountChart", () => {
  it("renders Jan–Dec for the latest year with data", () => {
    const wrapper = mount(MonthlyPayerCountChart, {
      props: { months: months(CURRENT_YEAR - 1, [1, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0]) },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ data: Array<number | null> }>
    expect(series[0].data).toHaveLength(12)
    expect(series[0].data[0]).toBe(1)
    expect(series[0].data[2]).toBe(0)

    const rows = wrapper.findAll('[data-testid="charting-payer-coverage-table"] tbody tr')
    expect(rows).toHaveLength(12)
    expect(rows[0].text()).toContain("Jan")
    expect(rows[0].text()).toContain("1")
  })

  it("marks the current year partial", () => {
    const current = months(CURRENT_YEAR, [1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const wrapper = mount(MonthlyPayerCountChart, {
      props: { months: current },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.get('[data-testid="charting-payer-coverage-partial"]').text()).toContain("in progress")
  })

  it("shows an empty state when there is no data", () => {
    const wrapper = mount(MonthlyPayerCountChart, {
      props: { months: [] },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No dividend-payer data for this scope")
  })
})