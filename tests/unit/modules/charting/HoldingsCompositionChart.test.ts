import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import HoldingsCompositionChart from "@/modules/charting/HoldingsCompositionChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    key: `H${i}`,
    label: `Holding ${i}`,
    value: 100 - i,
    percent: null,
    unknown: false,
  }))
}

describe("HoldingsCompositionChart", () => {
  it("shows the top holdings plus an aggregated Other slice", () => {
    const wrapper = mount(HoldingsCompositionChart, {
      props: { rows: rows(12), currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as number[]
    // 8 top + Other = 9 slices.
    expect(series).toHaveLength(9)
    // The full sorted table still lists every holding.
    const tableRows = wrapper.findAll('[data-testid="charting-holdings-composition-table"] tbody tr')
    expect(tableRows).toHaveLength(12)
  })

  it("keeps negative balances in the table and out of the pie", () => {
    const wrapper = mount(HoldingsCompositionChart, {
      props: {
        rows: [
          { key: "STOCK|AAPL|USD", label: "AAPL", value: 100 },
          { key: "CASH", label: "Cash", value: -30 },
        ],
        currency: "USD",
      },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as number[]
    expect(series).toEqual([100])
    const tableRows = wrapper.findAll('[data-testid="charting-holdings-composition-table"] tbody tr')
    expect(tableRows).toHaveLength(2)
    expect(tableRows[1].text()).toContain("Cash")
    expect(tableRows[1].text()).toContain("30.00")
  })

  it("shows an empty state when there are no holdings", () => {
    const wrapper = mount(HoldingsCompositionChart, {
      props: { rows: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No holdings for this scope")
  })
})