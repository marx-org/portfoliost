import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import AssetTypeAllocationChart from "@/modules/charting/AssetTypeAllocationChart.vue"

const slices = [
  { key: "STOCK", value: 80, percent: 80 },
  { key: "BOND", value: 20, percent: 20 },
]

describe("AssetTypeAllocationChart", () => {
  it("renders one row per asset type with value and weight", () => {
    const wrapper = mount(AssetTypeAllocationChart, {
      props: { slices, currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll('[data-testid="charting-asset-allocation-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("STOCK")
    expect(rows[0].text()).toContain("80")
    expect(rows[1].text()).toContain("BOND")
    expect(rows[1].text()).toContain("20")
  })

  it("derives the weight from values when the server omits percent", () => {
    const wrapper = mount(AssetTypeAllocationChart, {
      props: { slices: [{ key: "STOCK", value: 30 }, { key: "FUND", value: 10 }], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const cells = wrapper.findAll('[data-testid="charting-asset-allocation-table"] tbody tr td')
    expect(cells[2].text()).toContain("75")
    expect(cells[5].text()).toContain("25")
  })

  it("shows an empty state when there is no data", () => {
    const wrapper = mount(AssetTypeAllocationChart, {
      props: { slices: [], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No asset-type data for this scope")
    expect(wrapper.find('[data-testid="charting-asset-allocation-table"]').exists()).toBe(false)
  })
})