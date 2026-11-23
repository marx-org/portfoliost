import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import ProfitValueScatterChart from "@/modules/charting/ProfitValueScatterChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const points = [
  { symbol: "STOCK|AAPL|USD", name: "Apple", assetType: "STOCK", accounts: ["A"], marketValue: 150, totalProfit: 25, realized: 30, unrealized: -10, dividends: 5 },
  { symbol: "STOCK|OLD|USD", name: "Old", assetType: "STOCK", accounts: ["A"], marketValue: 0, totalProfit: 35, realized: 30, unrealized: 0, dividends: 5 },
]

describe("ProfitValueScatterChart", () => {
  it("renders the profit decomposition table and excludes zero from the plot by default", () => {
    const wrapper = mount(ProfitValueScatterChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const rows = wrapper.findAll('[data-testid="charting-profit-value-scatter-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("Apple")
    expect(rows[0].text()).toContain("25")

    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ data: Array<[number, number]> }>
    expect(series[0].data).toEqual([[150, 25]])
  })

  it("can toggle zero/closed holdings into the plot", async () => {
    const wrapper = mount(ProfitValueScatterChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    await wrapper.get('[data-testid="charting-profit-value-scatter-show-zero"]').setValue(true)
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ data: Array<[number, number]> }>
    expect(series[0].data).toContainEqual([0, 35])
  })

  it("searches holdings by name or symbol", async () => {
    const wrapper = mount(ProfitValueScatterChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    await wrapper.get('[data-testid="charting-profit-value-scatter-search"]').setValue("Apple")
    const rows = wrapper.findAll('[data-testid="charting-profit-value-scatter-table"] tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain("Apple")
  })

  it("enables zoom and can expand to a full-window chart", async () => {
    const wrapper = mount(ProfitValueScatterChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const options = chart.props("options") as { chart: { zoom: { enabled: boolean }; toolbar: { show: boolean } } }
    expect(options.chart.zoom.enabled).toBe(true)
    expect(options.chart.toolbar.show).toBe(true)

    await wrapper.get('[data-testid="charting-profit-value-scatter-expand"]').trigger("click")
    expect(wrapper.get('[data-testid="charting-profit-value-scatter-expand"]').text()).toContain("Close")
  })

  it("shows an empty state when there are no holdings", () => {
    const wrapper = mount(ProfitValueScatterChart, {
      props: { points: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No holdings for this scope")
  })
})