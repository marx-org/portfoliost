import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import CurrencyAllocationChart from "@/modules/charting/CurrencyAllocationChart.vue"

const slices = [
  { key: "USD", value: 80, percent: 80 },
  { key: "PLN", value: 20, percent: 20 },
]

describe("CurrencyAllocationChart", () => {
  it("renders one row per denomination with value and weight", () => {
    const wrapper = mount(CurrencyAllocationChart, {
      props: { slices, currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const rows = wrapper.findAll('[data-testid="charting-currency-allocation-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("USD")
    expect(rows[0].text()).toContain("80")
    expect(rows[1].text()).toContain("PLN")
    expect(rows[1].text()).toContain("20")
  })

  it("derives the weight from values when the server omits percent", () => {
    const wrapper = mount(CurrencyAllocationChart, {
      props: { slices: [{ key: "USD", value: 80 }, { key: "PLN", value: 20 }], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    const cells = wrapper.findAll('[data-testid="charting-currency-allocation-table"] tbody tr td')
    expect(cells[2].text()).toContain("80")
    expect(cells[5].text()).toContain("20")
  })

  it("marks an unresolved rate as unknown", () => {
    const wrapper = mount(CurrencyAllocationChart, {
      props: { slices: [{ key: "USD", value: 0, unknown: true }], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("unknown rate")
  })

  it("shows an empty state when there is no data", () => {
    const wrapper = mount(CurrencyAllocationChart, {
      props: { slices: [], currency: "USD" },
      global: { stubs: { apexchart: true } },
    })
    expect(wrapper.text()).toContain("No currency data for this scope")
  })
})