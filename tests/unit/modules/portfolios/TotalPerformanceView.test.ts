import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import TotalPerformanceView from "@/modules/portfolios/TotalPerformanceView.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"
import * as portfoliosApi from "@/api/portfolios"
import * as fxApi from "@/api/fx"

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getMergedAnalytics: vi.fn(),
    getAllPositions: vi.fn(),
    getPortfolios: vi.fn(),
    getPortfolioTotalMetrics: vi.fn(),
    recomputePortfolio: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({ getLatestRate: vi.fn() }))

const mocked = vi.mocked(portfoliosApi)
const mockedFx = vi.mocked(fxApi)

let pinia: Pinia

/**
 * §83.6 — the cumulative tab's two cases carried over from `InvestmentsView`:
 * the display-currency conversion (§46.3) and the timeframe selector (§46.7).
 * They moved because the block moved; the endpoint, the chart component and both
 * numbers are the same, so the assertions are the same assertions.
 */
function mountView() {
  return mount(TotalPerformanceView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
        apexchart: { template: "<div class='apexchart-stub' />" },
        PortfolioPerformanceChart: {
          name: "PortfolioPerformanceChart",
          props: ["timeSeries", "currency", "color", "loading", "backfillPending", "height"],
          template: "<div class='perf-chart-stub' />",
        },
      },
    },
  })
}

describe("TotalPerformanceView", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-10-02" } as never)
    mocked.getAllPositions.mockResolvedValue([] as never)
    mocked.getPortfolios.mockResolvedValue([] as never)
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      totalValue: 1200,
      totalInvested: 1000,
      baseCurrency: "USD",
      portfolioBreakdown: [],
    } as never)
    mocked.recomputePortfolio.mockResolvedValue({} as never)
    mocked.getMergedAnalytics.mockResolvedValue({
      timeframe: "ALL",
      backfillStatus: "complete",
      performance: {
        timeSeries: [
          { date: "2026-01-01", value: 1000 },
          { date: "2026-01-02", value: 1200 },
        ],
        monthlyReturns: [],
      },
    } as never)
  })

  it("converts the merged series from totalMetrics.baseCurrency to the display currency (§46.3)", async () => {
    localStorage.setItem("portfoliost_display_currency", "EUR")
    const wrapper = mountView()
    await flushPromises()
    await flushPromises()

    // Source currency = totalMetrics.baseCurrency (the aggregate base the wallets
    // /merged route reports).
    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("USD", "EUR")
    const chart = wrapper.findComponent(PortfolioPerformanceChart)
    const series = chart.props("timeSeries") as Array<{ date: string; value: number }>
    expect(series).toHaveLength(2)
    expect(series[0].value).toBeCloseTo(900, 6) // 1000 × 0.9
    expect(series[1].value).toBeCloseTo(1080, 6) // 1200 × 0.9
    expect(chart.props("currency")).toBe("EUR")
  })

  it("switches the timeframe and re-fetches (§46.7)", async () => {
    localStorage.removeItem("portfoliost_display_currency")
    const wrapper = mountView()
    await flushPromises()

    const buttons = wrapper.findAll('[data-testid="total-perf-controls-customize"]').length
    expect(buttons).toBe(1)

    const allBtn = wrapper.findAll("button").find((b) => b.text() === "ALL")!
    const y1Btn = wrapper.findAll("button").find((b) => b.text() === "1Y")!
    expect(allBtn.attributes("aria-pressed")).toBe("true")

    await y1Btn.trigger("click")
    await flushPromises()

    expect(mocked.getMergedAnalytics).toHaveBeenLastCalledWith("1Y", [])
    expect(y1Btn.attributes("aria-pressed")).toBe("true")
    expect(allBtn.attributes("aria-pressed")).toBe("false")
  })

  it("states the constant-currency caveat on the Overview card (§83.6)", async () => {
    // The caveat is a prop, not a constant: on a single-base portfolio there is
    // nothing to disclose. Here the tab renders it.
    const wrapper = mountView()
    await flushPromises()
    const note = wrapper.get('[data-testid="total-perf-overview-fx-caveat"]').text()
    expect(note).toContain("Constant currency")
    // …and it sits ABOVE the money tiles, which are the numbers a reader checks
    // against a bank balance.
    const card = wrapper.get('[data-testid="total-perf-overview"]')
    expect(card.text().indexOf("Constant currency")).toBeLessThan(
      card.text().indexOf("Net gain"),
    )
  })

  it("prefixes every testid, so this tab cannot be confused with a portfolio's", async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="total-perf-overview"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="perf-overview"]').exists()).toBe(false)
  })
})