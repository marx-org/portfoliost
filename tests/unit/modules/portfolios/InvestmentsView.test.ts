import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia, type Pinia } from "pinia"
import { useCurrenciesStore } from "@/stores/currencies"
import { beforeEach, describe, expect, it, vi } from "vitest"
import InvestmentsView from "@/modules/portfolios/InvestmentsView.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"
import * as portfoliosApi from "@/api/portfolios"
import * as walletsApi from "@/api/wallets"
import * as fxApi from "@/api/fx"

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolios: vi.fn(),
    getPortfolioTotalMetrics: vi.fn(),
    getPortfolioAnalytics: vi.fn(),
    getPortfolioPositions: vi.fn(),
    createPortfolio: vi.fn(),
    getMergedAnalytics: vi.fn(),
    recomputePortfolio: vi.fn(),
  }
})

vi.mock("@/api/wallets", () => ({
  getWallets: vi.fn(),
  getWalletTotalBalance: vi.fn(),
}))

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn(),
}))

const mocked = vi.mocked(portfoliosApi)
const mockedWallets = vi.mocked(walletsApi)
const mockedFx = vi.mocked(fxApi)

let pinia: Pinia

function summary() {
  return [
    {
      id: "p1",
      userId: "u1",
      name: "Top10",
      description: "Big US growth stocks",
      strategy: "GROWTH",
      type: "regular",
      currency: "USD",
      walletId: "w1",
      totalInvested: 1000,
      currentValue: 1200,
      isPublic: false,
      isMarginEnabled: false,
      marginRate: 0.5,
      maintenanceMarginRate: 0.25,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-02T08:00:00.000Z",
      metrics: {
        totalReturn: 20,
        totalReturnAmount: 200,
        dayChange: 1,
        dayChangeAmount: 10,
        dayChangeDate: "2026-08-10",
        asOf: "2026-08-10",
        positionCount: 10,
        openPositions: 10,
        closedPositions: 0,
        realizedGainLoss: 0,
        unrealizedGainLoss: 200,
        totalInvested: 1000,
        income: 0,
        returnBasis: 1000,
        externalCapitalReturnPercent: 20,
        externalCapitalReturnAmount: 200,
        externalCapitalBasis: 1000,
        externalCapitalBasisSource: "externalFlows",
        externalCapitalSuppressedReason: null,
        externalCapitalReturnBasisKind: "inception",
      },
      positions: [],
      positionCount: 10,
      performance: { returnPercentage: 20, totalGainLoss: 200, dailyChange: 1, dailyChangePercentage: 0.1 },
    },
  ]
}

function mountView() {
  return mount(InvestmentsView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
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

describe("InvestmentsView", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    // registry-fed selectors: seed the currencies store (D26)
    const store = useCurrenciesStore()
    store.currencies = [
      { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
      { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
    ]
    store.loaded = true
    vi.clearAllMocks()
    mocked.getPortfolios.mockResolvedValue(summary())
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      totalValue: 1200,
      totalInvested: 1000,
      totalGainLoss: 200,
      returnPercentage: 20,
      baseCurrency: "USD",
      portfolioBreakdown: [],
    } as never)
    mocked.getPortfolioAnalytics.mockResolvedValue({
      performance: { timeSeries: [{ date: "2026-01-01", value: 100 }], monthlyReturns: [] },
    } as never)
    mocked.getMergedAnalytics.mockResolvedValue({
      performance: { timeSeries: [{ date: "2026-01-01", value: 1000 }], monthlyReturns: [] },
    } as never)
    mockedWallets.getWallets.mockResolvedValue([])
    mockedWallets.getWalletTotalBalance.mockResolvedValue({ totalBalance: 0, totalAvailableBalance: 0 } as never)
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-09-21" })
  })

  it("renders the total metrics cards", async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get("h1").text()).toBe("Portfolios")
    expect(wrapper.text()).toContain("Total Value")
    expect(wrapper.text()).toContain("1,200.00")
    expect(wrapper.text()).toContain("+$200.00")
    expect(wrapper.text()).toContain("20.00%")
  })

  it("renders investment and cash portfolio sections with cards", async () => {
    mockedWallets.getWallets.mockResolvedValue([
      { id: "w1", userId: "u1", name: "Portfel USD 1", currency: "USD", balance: 500, availableBalance: 500, isDefault: true, createdAt: "", updatedAt: "" },
      { id: "w2", userId: "u1", name: "Portfel EUR 1", currency: "EUR", balance: 200, availableBalance: 200, isDefault: false, createdAt: "", updatedAt: "" },
    ] as never)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain("Investment Portfolios")
    expect(wrapper.text()).toContain("Cash Portfolios")
    expect(wrapper.text()).toContain("Top10")
    expect(wrapper.text()).toContain("GROWTH")
    expect(wrapper.text()).toContain("10 open positions")
    expect(wrapper.text()).toContain("Portfel USD 1")
    expect(wrapper.text()).toContain("Total Balance")
    expect(wrapper.text()).toContain("USD 71%")
    expect(wrapper.text()).toContain("EUR 29%")
  })

  it("shows the create dialog and creates a portfolio", async () => {
    mocked.createPortfolio.mockResolvedValue({ id: "p2" } as never)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll("button").find((b) => b.text() === "Create Investment Portfolio")!.trigger("click")
    expect(wrapper.find("[aria-label='Create portfolio']").exists()).toBe(true)

    await wrapper.find("input[type=text]").setValue("My Portfolio")
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.createPortfolio).toHaveBeenCalledWith({
      name: "My Portfolio",
      description: undefined,
      strategy: "GROWTH",
      currency: "USD",
      walletId: undefined,
    })
  })

  it("shows the display currency menu", async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find("button.btn-secondary").trigger("click")
    expect(wrapper.text()).toContain("EUR")
  })

  it("converts the merged series from totalMetrics.baseCurrency to the display currency (§46.3), when the display currency changes", async () => {
    localStorage.setItem("portfoliost_display_currency", "EUR")
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      totalValue: 1200,
      totalInvested: 1000,
      totalGainLoss: 200,
      returnPercentage: 20,
      baseCurrency: "USD",
      portfolioBreakdown: [],
    } as never)
    mocked.getMergedAnalytics.mockResolvedValue({
      performance: {
        timeSeries: [
          { date: "2026-01-01", value: 1000 },
          { date: "2026-01-02", value: 1200 },
        ],
        monthlyReturns: [],
      },
    } as never)

    const wrapper = mountView()
    await flushPromises()
    await flushPromises()

    // Source currency = totalMetrics.baseCurrency (the wallets merged route's USD).
    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("USD", "EUR")
    const chart = wrapper.findComponent(PortfolioPerformanceChart)
    const series = chart.props("timeSeries") as Array<{ date: string; value: number }>
    expect(series).toHaveLength(2)
    expect(series[0].value).toBeCloseTo(900, 6) // 1000 × 0.9
    expect(series[1].value).toBeCloseTo(1080, 6) // 1200 × 0.9
    expect(chart.props("currency")).toBe("EUR")
  })

  it("shows the combined block currency and switches the merged timeframe (§46.7)", async () => {
    localStorage.removeItem("portfoliost_display_currency")
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain("Portfolio Value: USD")

    const timeframes = wrapper.find('[data-testid="combined-chart-timeframes"]')
    const buttons = timeframes.findAll("button")
    const allBtn = buttons.find((b) => b.text() === "ALL")!
    const y1Btn = buttons.find((b) => b.text() === "1Y")!
    expect(allBtn.attributes("aria-pressed")).toBe("true")

    await y1Btn.trigger("click")
    await flushPromises()

    expect(mocked.getMergedAnalytics).toHaveBeenLastCalledWith("1Y")
    expect(y1Btn.attributes("aria-pressed")).toBe("true")
    expect(allBtn.attributes("aria-pressed")).toBe("false")
  })
})
