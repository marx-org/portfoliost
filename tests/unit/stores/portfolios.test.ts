import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolios: vi.fn(),
    getPortfolioTotalMetrics: vi.fn(),
    getPortfolioDetail: vi.fn(),
    getPortfolioSummaryMetrics: vi.fn(),
    getPortfolioPositions: vi.fn(),
    getPortfolioAnalytics: vi.fn(),
    createPortfolio: vi.fn(),
  }
})

const mocked = vi.mocked(portfoliosApi)

function summary() {
  return [
    {
      id: "p1",
      userId: "u1",
      name: "Top10",
      description: "Growth",
      currency: "USD",
      walletId: "w1",
      capitalBasis: 1000,
      currentValue: 1200,
      isPublic: false,
      isMarginEnabled: false,
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
        capitalBasis: 1000,
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

describe("portfolios store", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it("starts empty", () => {
    const store = usePortfolioStore()
    expect(store.portfolios).toEqual([])
    expect(store.totalMetrics).toBeNull()
  })

  it("loads portfolios and total metrics", async () => {
    mocked.getPortfolios.mockResolvedValue(summary())
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      totalValue: 1200,
      capitalBasis: 1000,
      totalGainLoss: 200,
      returnPercentage: 20,
      baseCurrency: "USD",
      portfolioBreakdown: [],
    } as never)

    const store = usePortfolioStore()
    await store.fetchAll()

    expect(store.portfolios).toHaveLength(1)
    expect(store.portfolios[0].name).toBe("Top10")
    expect(store.totalMetrics?.totalValue).toBe(1200)
  })

  it("loads only the portfolio header data on entry; tab data stays lazy", async () => {
    mocked.getPortfolioDetail.mockResolvedValue({ id: "p1", name: "Top10" } as never)
    mocked.getPortfolioSummaryMetrics.mockResolvedValue({ totalValue: 1200 } as never)
    mocked.getPortfolioPositions.mockResolvedValue([])
    mocked.getPortfolioAnalytics.mockResolvedValue({} as never)

    const store = usePortfolioStore()
    await store.fetchDetail("p1")

    expect(mocked.getPortfolioDetail).toHaveBeenCalledWith("p1")
    expect(mocked.getPortfolioSummaryMetrics).toHaveBeenCalledWith("p1")
    expect(mocked.getPortfolioPositions).not.toHaveBeenCalled()
    expect(mocked.getPortfolioAnalytics).not.toHaveBeenCalled()
  })

  it("fetches analytics only when the performance tab requests them", async () => {
    const result = { timeframe: "1Y" }
    mocked.getPortfolioAnalytics.mockResolvedValue(result as never)
    const store = usePortfolioStore()

    await store.fetchAnalytics("p1")

    expect(mocked.getPortfolioAnalytics).toHaveBeenCalledWith("p1", "1Y", ["SPY"], "timeWeighted")
    expect(store.analytics).toEqual(result)
  })

  it("records the error when loading fails", async () => {
    mocked.getPortfolios.mockRejectedValue(new Error("boom"))

    const store = usePortfolioStore()
    await expect(store.fetchAll()).rejects.toThrow("boom")
    expect(store.error).toBe("boom")
  })

  it("creates a portfolio then refetches the list", async () => {
    mocked.createPortfolio.mockResolvedValue({ id: "p2" } as never)
    mocked.getPortfolios.mockResolvedValue(summary())
    mocked.getPortfolioTotalMetrics.mockResolvedValue({} as never)

    const store = usePortfolioStore()
    await store.createPortfolio({ name: "New" })

    expect(mocked.createPortfolio).toHaveBeenCalledWith({ name: "New" })
    expect(mocked.getPortfolios).toHaveBeenCalled()
  })
})
