import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioPerformanceTab from "@/modules/portfolios/PortfolioPerformanceTab.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"
import * as fxApi from "@/api/fx"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioAnalytics: vi.fn().mockResolvedValue({} as never),
    getPortfolioRiskMetrics: vi.fn().mockResolvedValue({} as never),
    recomputePortfolio: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 4.3, asOf: "2026-08-25" }),
}))

const mockedFx = vi.mocked(fxApi)

/** §36.4 — position fixture factory (PLN instrument by default). */
function position(overrides: Record<string, unknown> = {}) {
  return {
    id: "pos-pln",
    portfolioId: "p1",
    symbol: "SNT.WA",
    companyName: "Synektik Sa",
    assetType: "STOCK",
    quantity: 400,
    averageCostBasis: 100,
    instrumentCurrency: "PLN",
    isOpen: true,
    currentPrice: 102.4,
    marketValue: 40960,
    unrealizedGainLoss: 960,
    percentageChange: 2.4,
    ...overrides,
  } as never
}

async function mountTab(positions: never[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePortfolioStore()
  store.positions = positions
  return mount(PortfolioPerformanceTab, {
    global: { plugins: [pinia] },
  })
}

describe("PortfolioPerformanceTab — §36.4 performers currency", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("renders P/L in the instrument currency with a converted display sub-line", async () => {
    const wrapper = await mountTab([position()])
    await flushPromises()

    // Primary line: native PLN amount (not hardcoded USD "$").
    expect(wrapper.text()).toContain("960.00")
    expect(wrapper.text()).toContain("PLN")
    // 960 PLN × 4.3 = 4,128 USD converted sub-line.
    expect(wrapper.text()).toContain("$4,128.00")

    // Rate fetched for the cross-currency pair only.
    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("PLN", "USD")
  })

  it("same-currency position: no conversion, no FX fetch", async () => {
    const wrapper = await mountTab([position({ symbol: "META", instrumentCurrency: "USD", unrealizedGainLoss: 902.22 })])
    await flushPromises()

    expect(wrapper.text()).toContain("$902.22")
    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
  })
})
