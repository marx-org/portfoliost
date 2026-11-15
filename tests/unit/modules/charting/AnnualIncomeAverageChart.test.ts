import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import AnnualIncomeAverageChart from "@/modules/charting/AnnualIncomeAverageChart.vue"

const CURRENT = new Date().getUTCFullYear()

function point(year: number, amount: number, divisor: number, basis: "days" | "months", partial = false) {
  return { year, amount, divisor, basis, partial }
}

describe("AnnualIncomeAverageChart", () => {
  it("renders the daily equivalent (÷365) with the divisor shown", () => {
    const wrapper = mount(AnnualIncomeAverageChart, {
      props: {
        unit: "day",
        currency: "USD",
        points: [point(2025, 1, 365, "days"), point(2026, 2, 365, "days")],
      },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll("tbody tr")
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("365")
    expect(rows[1].text()).toContain("2")
    expect(wrapper.get('[data-testid="annual-income-average-day"]').text()).toContain("÷ 365")
  })

  it("renders the monthly equivalent (÷12)", () => {
    const wrapper = mount(AnnualIncomeAverageChart, {
      props: {
        unit: "month",
        currency: "USD",
        points: [point(2025, 100, 12, "months")],
      },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.get('[data-testid="annual-income-average-month"]').text()).toContain("÷ 12")
    expect(wrapper.get("tbody").text()).toContain("100")
  })

  it("marks the current partial year and says it is not a forecast", () => {
    const wrapper = mount(AnnualIncomeAverageChart, {
      props: {
        unit: "month",
        currency: "USD",
        points: [point(CURRENT, 50, 12, "months", true)],
      },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.get('[data-testid="annual-average-partial"]').text()).toContain("year-to-date")
    expect(wrapper.get("tbody").text()).toContain("YTD")
  })

  it("shows an empty state when there is no income", () => {
    const wrapper = mount(AnnualIncomeAverageChart, {
      props: { unit: "day", currency: "USD", points: [] },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No income data")
  })
})