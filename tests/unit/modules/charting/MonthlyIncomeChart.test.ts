import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi, beforeEach } from "vitest"
import MonthlyIncomeChart from "@/modules/charting/MonthlyIncomeChart.vue"
import { getChartIncome } from "@/api/charting"

vi.mock("@/api/charting", () => ({
  getChartIncome: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

const mockedIncome = vi.mocked(getChartIncome)

function dataset() {
  return {
    currency: "USD",
    scope: { accountIds: [], labelIds: [], currency: "USD", from: null, to: null },
    coverage: { generation: 1, asOf: new Date().toISOString(), status: "complete", partial: false, currentPeriod: false, stale: false, missing: [] },
    monthly: [
      { period: "2026-01", dividends: 100, interest: 20, options: 30, total: 150, partial: false },
      { period: "2026-02", dividends: 0, interest: 0, options: 0, total: 0, partial: false },
      { period: "2026-03", dividends: 200, interest: 0, options: 0, total: 200, partial: false },
    ],
    cumulative: [],
    annual: [],
    quarterly: [],
    dailyAverageByYear: [],
    monthlyAverageByYear: [],
    payerCoverage: [],
  }
}

function mountChart() {
  return mount(MonthlyIncomeChart, { global: { stubs: { apexchart: true } } })
}

describe("MonthlyIncomeChart", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renders a row per month with dividends, interest and options", async () => {
    mockedIncome.mockResolvedValue(dataset() as never)
    const wrapper = mountChart()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain("2026-01")
    expect(text).toContain("2026-03")
    // A month with no receipts is shown as zero, not hidden.
    expect(wrapper.findAll("tbody tr")).toHaveLength(3)
  })

  it("fetches with the shared scope", async () => {
    mockedIncome.mockResolvedValue(dataset() as never)
    const wrapper = mountChart()
    await flushPromises()
    // The old assertions were `toHaveBeenCalled()` plus the existence of the
    // root `<div data-testid="monthly-income-chart">`, which renders
    // unconditionally — neither checked the scope or the rendered data.
    // useChartScope's default query is empty accounts/labels and kind "normal";
    // what proves the scope is wired is that this is what the fetcher receives.
    expect(mockedIncome).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "normal", accounts: undefined, labels: undefined }),
    )
    // The rows come from the mocked response, so the render is what proves the
    // response reached the table.
    expect(wrapper.findAll("tbody tr")).toHaveLength(3)
  })

  it("thins dense month labels so the axis does not overlap", async () => {
    const monthly = Array.from({ length: 24 }, (_, i) => ({
      period: "2026-" + String((i % 12) + 1).padStart(2, "0"),
      dividends: 1,
      interest: 0,
      options: 0,
      total: 1,
      partial: false,
    }))
    mockedIncome.mockResolvedValue({ ...dataset(), monthly } as never)
    const ApexStub = { name: "ApexStub", props: ["options", "series"], template: '<div class="apex-stub" />' }
    const wrapper = mount(MonthlyIncomeChart, { global: { stubs: { apexchart: ApexStub } } })
    await flushPromises()
    const options = wrapper.findComponent(ApexStub).props("options") as {
      xaxis: { labels: { formatter: (v: string) => string } }
    }
    const shown = monthly.filter((m) => options.xaxis.labels.formatter(m.period) !== "").length
    // 24 months -> every 2nd label, so ~12 remain (not all 24).
    expect(shown).toBeLessThan(monthly.length)
    expect(shown).toBeGreaterThanOrEqual(10)
    expect(options.xaxis.labels.formatter(monthly[0]!.period)).toBe(monthly[0]!.period)
  })

  it("shows an empty state when there is no income", async () => {
    mockedIncome.mockResolvedValue({ ...dataset(), monthly: [] } as never)
    const wrapper = mountChart()
    await flushPromises()
    expect(wrapper.text()).toContain("No income data")
  })
})