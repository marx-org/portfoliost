import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import AnnualIncomeChart from "@/modules/charting/AnnualIncomeChart.vue"

const CURRENT = new Date().getUTCFullYear()

function point(year: number, total: number, yoy: number | null, prior: number | null) {
  return { year, dividends: total, interest: 0, options: 0, total, priorYearTotal: prior, yoyChangePercent: yoy }
}

describe("AnnualIncomeChart", () => {
  it("renders a row per year with the YoY percentage", () => {
    const wrapper = mount(AnnualIncomeChart, {
      props: { points: [point(2025, 100, null, null), point(2026, 125, 25, 100)], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll("tbody tr")
    expect(rows).toHaveLength(2)
    expect(rows[1].text()).toContain("25.0%")
    expect(rows[1].text()).toContain("100")
  })

  it("shows an em dash for an undefined YoY (zero/missing prior)", () => {
    const wrapper = mount(AnnualIncomeChart, {
      props: { points: [point(2026, 125, null, 0)], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const cells = wrapper.findAll("tbody tr").at(0)!.findAll("td")
    expect(cells.at(-1)!.text()).toBe("—")
  })

  it("labels the current year YTD and discloses the partial comparison", () => {
    const wrapper = mount(AnnualIncomeChart, {
      props: { points: [point(CURRENT, 125, 25, 100)], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.get('[data-testid="annual-ytd-note"]').text()).toContain("year-to-date")
    expect(wrapper.get('[data-testid="annual-ytd-note"]').text()).toContain(String(CURRENT))
    expect(wrapper.findAll("tbody tr").at(0)!.text()).toContain("YTD")
  })

  it("shows an empty state when there is no income", () => {
    const wrapper = mount(AnnualIncomeChart, {
      props: { points: [], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No income data")
  })
})