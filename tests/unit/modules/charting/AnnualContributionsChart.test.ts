import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import AnnualContributionsChart from "@/modules/charting/AnnualContributionsChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

function point(year: number, contributions: number, withdrawals: number, transfers = 0, partial = false, unknown = false) {
  return { year, contributions, withdrawals, net: contributions - withdrawals, transfers, partial, unknown }
}

describe("AnnualContributionsChart", () => {
  it("renders contributions, withdrawals, net and boundary transfers per year", () => {
    const wrapper = mount(AnnualContributionsChart, {
      props: {
        points: [point(2025, 1000, 200), point(2026, 500, 100, -50, true)],
        currency: "USD",
      },
      global: { stubs: { apexchart: ApexStub } },
    })
    const rows = wrapper.findAll('[data-testid="charting-annual-contributions-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("$1,000.00")
    expect(rows[0].text()).toContain("$200.00")
    expect(rows[0].text()).toContain("$800.00")
    expect(rows[1].text()).toContain("-$50.00")
  })

  it("plots deposits above zero, withdrawals below zero, and net as the signed line", () => {
    const wrapper = mount(AnnualContributionsChart, {
      props: { points: [point(2026, 500, 100)], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ name: string; type: string; data: number[] }>
    expect(series.map((s) => s.name)).toEqual(["Contributions", "Withdrawals", "Net"])
    expect(series[0].data).toEqual([500])
    expect(series[1].data).toEqual([-100])
    expect(series[2].data).toEqual([400])
  })

  it("marks a year-to-date total and an incomplete conversion", () => {
    const wrapper = mount(AnnualContributionsChart, {
      props: { points: [point(2026, 500, 100, 0, true, true)], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.get('[data-testid="charting-annual-contributions-partial"]').text()).toContain("year-to-date")
    expect(wrapper.get('[data-testid="charting-annual-contributions-unknown"]').text()).toContain("incomplete")
  })

  it("shows an empty state when there are no annual contributions", () => {
    const wrapper = mount(AnnualContributionsChart, {
      props: { points: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No annual external contributions")
  })
})