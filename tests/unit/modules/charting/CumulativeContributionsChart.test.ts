import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import CumulativeContributionsChart from "@/modules/charting/CumulativeContributionsChart.vue"

const ApexStub = {
  name: "ApexStub",
  props: ["options", "series"],
  template: '<div class="apex-stub" />',
}

const series = [
  {
    key: "a",
    label: "Broker A",
    points: [
      { date: "2026-01-01", net: 1000, contributions: 1000, withdrawals: 0, unknown: false },
      { date: "2026-02-01", net: 800, contributions: 1000, withdrawals: 200, unknown: false },
    ],
  },
  {
    key: "__total__",
    label: "Total",
    points: [
      { date: "2026-01-01", net: 1000, contributions: 1000, withdrawals: 0, unknown: false },
      { date: "2026-02-01", net: 800, contributions: 1000, withdrawals: 200, unknown: false },
    ],
  },
]

describe("CumulativeContributionsChart", () => {
  it("renders one line per account plus the total and a latest-net table", () => {
    const wrapper = mount(CumulativeContributionsChart, {
      props: { series, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    const chart = wrapper.findComponent(ApexStub)
    const lines = chart.props("series") as Array<{ name: string }>
    expect(lines.map((l) => l.name)).toEqual(["Broker A", "Total"])

    const rows = wrapper.findAll('[data-testid="charting-cumulative-contributions-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("Broker A")
    expect(rows[0].text()).toContain("800")
  })

  it("flags incomplete cumulative totals when an amount is unconverted", () => {
    const unknown = [
      {
        key: "a",
        label: "Broker A",
        points: [{ date: "2026-01-01", net: 0, contributions: 0, withdrawals: 0, unknown: true }],
      },
      {
        key: "__total__",
        label: "Total",
        points: [{ date: "2026-01-01", net: 0, contributions: 0, withdrawals: 0, unknown: true }],
      },
    ]
    const wrapper = mount(CumulativeContributionsChart, {
      props: { series: unknown, currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.find('[data-testid="charting-cumulative-contributions-unknown"]').exists()).toBe(true)
  })

  it("shows an empty state when there is no series", () => {
    const wrapper = mount(CumulativeContributionsChart, {
      props: { series: [], currency: "USD" },
      global: { stubs: { apexchart: ApexStub } },
    })
    expect(wrapper.text()).toContain("No cumulative contributions for this scope")
  })
})