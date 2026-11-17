import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import ReturnsChart from "@/modules/charting/ReturnsChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const points = [
  { quarter: "2026-Q1", endingValue: 100, cumulativeNetContributions: 100, twr: 0, netGainChange: 0, partial: false },
  { quarter: "2026-Q2", endingValue: 150, cumulativeNetContributions: 120, twr: 25, netGainChange: 20, partial: true },
]

describe("ReturnsChart", () => {
  it("defaults to TWR and renders the quarterly rows", () => {
    const wrapper = mount(ReturnsChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ name: string; data: Array<number | null> }>
    expect(series[0].name).toBe("TWR")
    expect(series[0].data).toEqual([0, 25])

    const rows = wrapper.findAll('[data-testid="charting-quarterly-returns-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[1].text()).toContain("20")
  })

  it("switches to net-gain change on the same boundaries", async () => {
    const wrapper = mount(ReturnsChart, {
      props: { points, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    await wrapper.get('[data-testid="charting-quarterly-returns-mode-net-gain"]').trigger("click")
    const chart = wrapper.findComponent(ApexStub)
    const series = chart.props("series") as Array<{ name: string; data: Array<number | null> }>
    expect(series[0].name).toBe("Net-gain change / ending value")
    expect(series[0].data).toEqual([0, 20])
  })

  it("shows an empty state when there are no quarters", () => {
    const wrapper = mount(ReturnsChart, {
      props: { points: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No quarterly returns for this scope")
  })
})