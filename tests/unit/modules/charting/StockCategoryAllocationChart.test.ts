import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import StockCategoryAllocationChart from "@/modules/charting/StockCategoryAllocationChart.vue"

const slices = [
  { key: "balanced", label: "Balanced", value: 90, percent: 90 },
  { key: "high_yield", label: "High yield", value: 10, percent: 10 },
]

describe("StockCategoryAllocationChart", () => {
  it("renders one row per category with value and weight", () => {
    const wrapper = mount(StockCategoryAllocationChart, {
      props: { slices, currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll('[data-testid="charting-stock-category-allocation-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("Balanced")
    expect(rows[0].text()).toContain("90")
    expect(rows[1].text()).toContain("High yield")
    expect(rows[1].text()).toContain("10")
  })

  it("derives the weight from values when the server omits percent", () => {
    const wrapper = mount(StockCategoryAllocationChart, {
      props: { slices: [{ key: "balanced", value: 30 }, { key: "high_growth", value: 10 }], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const cells = wrapper.findAll('[data-testid="charting-stock-category-allocation-table"] tbody tr td')
    // 30 / 40 = 75%, 10 / 40 = 25% — weights are over the stock-only denominator.
    expect(cells[2].text()).toContain("75")
    expect(cells[5].text()).toContain("25")
  })

  it("shows an empty state when no stock is classified", () => {
    const wrapper = mount(StockCategoryAllocationChart, {
      props: { slices: [], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No stock categories for this scope")
    expect(wrapper.find('[data-testid="charting-stock-category-allocation-table"]').exists()).toBe(false)
  })
})