import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import CumulativeIncomeChart from "@/modules/charting/CumulativeIncomeChart.vue"

const points = [
  { date: "2026-01-01", dividends: 20, interest: 0, options: 0, total: 120, openingBalance: 100 },
  { date: "2026-02-01", dividends: 20, interest: 0, options: 0, total: 120, openingBalance: 100 },
  { date: "2026-03-01", dividends: 25, interest: 0, options: 0, total: 125, openingBalance: 100 },
]

describe("CumulativeIncomeChart", () => {
  it("renders a row per month with cumulative totals", () => {
    const wrapper = mount(CumulativeIncomeChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll("tbody tr")
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain("2026-01")
    expect(rows[2].text()).toContain("125")
  })

  it("shows the lifetime opening balance when a narrow window is displayed", () => {
    const wrapper = mount(CumulativeIncomeChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const opening = wrapper.get('[data-testid="cumulative-opening"]')
    expect(opening.text()).toContain("Lifetime before window")
    expect(opening.text()).toContain("100")
  })

  it("omits the opening label when there is no pre-window income", () => {
    const wrapper = mount(CumulativeIncomeChart, {
      props: { points: [{ date: "2026-01-01", dividends: 20, interest: 0, options: 0, total: 20, openingBalance: 0 }], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.find('[data-testid="cumulative-opening"]').exists()).toBe(false)
  })

  it("shows an empty state when there is no income", () => {
    const wrapper = mount(CumulativeIncomeChart, {
      props: { points: [], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No income data")
  })
})