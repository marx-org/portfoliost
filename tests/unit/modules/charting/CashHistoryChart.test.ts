import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import CashHistoryChart from "@/modules/charting/CashHistoryChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const series = [
  { key: "a", label: "Broker A", points: [{ date: "2026-01-01", balance: 100 }, { date: "2026-02-01", balance: 70 }] },
  { key: "b", label: "Broker B", points: [{ date: "2026-01-01", balance: 50 }, { date: "2026-02-01", balance: 90 }] },
  { key: "__total__", label: "Total", points: [{ date: "2026-01-01", balance: 150 }, { date: "2026-02-01", balance: 160 }] },
]

describe("CashHistoryChart", () => {
  it("renders one line per account plus the total and a latest-balance table", () => {
    const wrapper = mount(CashHistoryChart, {
      props: { series, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const lines = chart.props("series") as Array<{ name: string }>
    expect(lines.map((l) => l.name)).toEqual(["Broker A", "Broker B", "Total"])

    const rows = wrapper.findAll('[data-testid="charting-cash-history-table"] tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain("Broker A")
    expect(rows[0].text()).toContain("70")
    expect(rows[2].text()).toContain("Total")
    expect(rows[2].text()).toContain("160")
  })

  it("shows an empty state when there is no series", () => {
    const wrapper = mount(CashHistoryChart, {
      props: { series: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No cash history for this scope")
  })
})