import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import SectorAllocationChart from "@/modules/charting/SectorAllocationChart.vue"

const slices = [
  { key: "TECHNOLOGY", value: 60, percent: 60 },
  { key: "FINANCIALS", value: 40, percent: 40 },
]

describe("SectorAllocationChart", () => {
  it("renders one ranked row per sector with value and weight", () => {
    const wrapper = mount(SectorAllocationChart, {
      props: { slices, currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll('[data-testid="charting-sector-allocation-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("TECHNOLOGY")
    expect(rows[0].text()).toContain("60")
    expect(rows[1].text()).toContain("FINANCIALS")
    expect(rows[1].text()).toContain("40")
  })

  it("derives the weight from values when the server omits percent", () => {
    const wrapper = mount(SectorAllocationChart, {
      props: { slices: [{ key: "TECHNOLOGY", value: 60 }, { key: "FINANCIALS", value: 40 }], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const cells = wrapper.findAll('[data-testid="charting-sector-allocation-table"] tbody tr td')
    expect(cells[2].text()).toContain("60")
    expect(cells[5].text()).toContain("40")
  })

  it("shows an empty state when there is no sector data", () => {
    const wrapper = mount(SectorAllocationChart, {
      props: { slices: [], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No sector data for this scope")
    expect(wrapper.find('[data-testid="charting-sector-allocation-table"]').exists()).toBe(false)
  })
})