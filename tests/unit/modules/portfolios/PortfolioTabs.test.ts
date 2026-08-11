import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioHoldingsTab from "@/modules/portfolios/PortfolioHoldingsTab.vue"
import PortfolioTransactionsTab from "@/modules/portfolios/PortfolioTransactionsTab.vue"
import * as portfoliosApi from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return { ...actual, getPortfolioTransactions: vi.fn(), getPortfolioAllocation: vi.fn() }
})

const mocked = vi.mocked(portfoliosApi)

function position() {
  return {
    id: "pos1",
    portfolioId: "p1",
    symbol: "META",
    companyName: "Meta Platforms Inc",
    assetType: "STOCK",
    quantity: 22,
    averageCostBasis: 553.91,
    avgCostBasis: 553.91,
    instrumentAvgCostBasis: 553.91,
    totalCostBasis: 12186.02,
    costBasis: 12186.02,
    isOpen: true,
    currentPrice: 594.92,
    marketValue: 13088.24,
    unrealizedGainLoss: 902.22,
    percentageChange: 7.4,
    percentOfPortfolio: 11.9,
  }
}

describe("PortfolioHoldingsTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = usePortfolioStore()
    store.positions = [position() as never]
  })

  it("renders the positions table", () => {
    const wrapper = mount(PortfolioHoldingsTab)
    expect(wrapper.text()).toContain("Positions")
    expect(wrapper.text()).toContain("META")
    expect(wrapper.text()).toContain("Meta Platforms Inc")
    expect(wrapper.text()).toContain("13,088.24")
  })

  it("shows an empty state without positions", () => {
    const store = usePortfolioStore()
    store.positions = []
    const wrapper = mount(PortfolioHoldingsTab)
    expect(wrapper.text()).toContain("No open positions")
  })
})

describe("PortfolioTransactionsTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("renders the transaction list", async () => {
    mocked.getPortfolioTransactions.mockResolvedValue({
      items: [
        {
          id: "tx1",
          portfolioId: "p1",
          type: "BUY",
          instrumentSymbol: "META",
          instrumentName: "Meta Platforms Inc",
          executedAt: "2026-08-02T00:00:00.000Z",
          quantity: 10,
          price: 550,
          totalAmount: 5500,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    } as never)

    const wrapper = mount(PortfolioTransactionsTab)
    await flushPromises()

    expect(wrapper.text()).toContain("BUY")
    expect(wrapper.text()).toContain("META")
    expect(wrapper.text()).toContain("5,500.00")
    expect(mocked.getPortfolioTransactions).toHaveBeenCalledWith("p1", 1, 20)
  })
})
