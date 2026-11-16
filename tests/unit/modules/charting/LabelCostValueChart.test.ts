import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import LabelCostValueChart from "@/modules/charting/LabelCostValueChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const rows = [
  { key: "core", label: "Core", costBasis: 100, value: 150 },
  { key: "growth", label: "Growth", costBasis: 40, value: 90 },
]

describe("LabelCostValueChart", () => {
  it("renders one paired row per label with cost basis and market value", () => {
    const wrapper = mount(LabelCostValueChart, {
      props: { rows, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const tableRows = wrapper.findAll('[data-testid="charting-label-cost-value-table"] tbody tr')
    expect(tableRows).toHaveLength(2)
    expect(tableRows[0].text()).toContain("Core")
    expect(tableRows[0].text()).toContain("100")
    expect(tableRows[0].text()).toContain("150")
    expect(tableRows[1].text()).toContain("Growth")
    expect(tableRows[1].text()).toContain("40")
  })

  it("labels the first series Cost basis, not deposits", () => {
    const wrapper = mount(LabelCostValueChart, {
      props: { rows, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    // The two series are always Cost basis then Market value, in that order.
    const chart = wrapper.findComponent(ApexStub)
    const series = (chart.props("series") as Array<{ name: string }>) ?? []
    expect(series.map((s) => s.name)).toEqual(["Cost basis", "Market value"])
  })

  it("states that overlapping labels are not a portfolio total", () => {
    const wrapper = mount(LabelCostValueChart, {
      props: { rows, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("not a portfolio total")
  })

  it("shows an empty state when there is no cost-basis data", () => {
    const wrapper = mount(LabelCostValueChart, {
      props: { rows: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No cost-basis data for this scope")
    expect(wrapper.find('[data-testid="charting-label-cost-value-table"]').exists()).toBe(false)
  })
})