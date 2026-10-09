import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioDetailView from "@/modules/portfolios/PortfolioDetailView.vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
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
    getPortfolioDetail: vi.fn(),
    getPortfolioSummaryMetrics: vi.fn(),
    getPortfolioPositions: vi.fn(),
    getPortfolioAnalytics: vi.fn(),
    deletePortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" }),
}))

// The detail view warms the currency registry on mount (D26) — keep it inert.
vi.mock("@/api/client", () => ({
  http: {
    get: vi.fn(async (url: string) => (url.includes("/api/currencies") ? { currencies: [] } : null)),
  },
}))

const mockedFx = vi.mocked(fxApi)
const mockedPortfolios = vi.mocked(portfoliosApi)

/** Intl renders currency CODES with a non-breaking space — normalize for assertions. */
const txt = (w: { text: () => string }) => w.text().replace(/\u00a0/g, " ")

// §48.6e B3 umbrella (B2 residual) — the summary cards render
// summaryMetrics, which wallets denominates in the portfolio baseCurrency
// (Obligacje PKO: 119,190 PLN must never show as "$119,190.00").
const DETAIL = {
  id: "p1",
  name: "Obligacje PKO SA Beata",
  description: null,
  currency: "PLN",
  baseCurrency: "PLN",
  walletId: null,
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as never

const METRICS = {
  totalValue: 119190,
  capitalBasis: 115000,
  simpleReturnPercent: 3.64,
  investmentReturnPercent: 3.64,
  currencyImpactPercent: 0,
  cumulativeDividends: 0,
  totalDividends: 0,
  positionValue: 119190,
  realizedGain: 0,
  costBasis: 115000,
  unrealizedGainLoss: 4190,
  dayChangeAmount: 0,
  dayChangePercent: 0,
  dayChangeDate: "2026-01-01T00:00:00.000Z",
} as never

async function mountDetail(display: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useDisplayCurrencyStore().currency = display
  mockedPortfolios.getPortfolioDetail.mockResolvedValue(DETAIL)
  mockedPortfolios.getPortfolioSummaryMetrics.mockResolvedValue(METRICS)
  mockedPortfolios.getPortfolioPositions.mockResolvedValue([])
  mockedPortfolios.getPortfolioAnalytics.mockResolvedValue({
    performance: { timeSeries: [] },
    benchmarks: [],
  } as never)
  return mount(PortfolioDetailView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: '<a href="#"><slot /></a>' },
        AddPositionDialog: true,
      },
    },
  })
}

describe("PortfolioDetailView — §48.6e B3 umbrella: summary cards in the display currency", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" })
  })

  it("converts portfolio-base summaryMetrics to the display currency", async () => {
    const wrapper = await mountDetail("USD")
    await flushPromises()

    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("PLN", "USD")
    // 119,190 × 0.25 = 29,797.50 — never "$119,190.00" (the B2 mislabel).
    expect(wrapper.text()).toContain("$29,797.50")
    expect(wrapper.text()).not.toContain("$119,190.00")
    // P/L converted too (4,190 × 0.25 = 1,047.50); return % untouched.
    expect(wrapper.text()).toContain("$1,047.50")
    expect(wrapper.text()).toContain("3.64%")
  })

  it("same-currency portfolio: no FX fetch, values rendered as-is", async () => {
    const wrapper = await mountDetail("PLN")
    await flushPromises()

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(txt(wrapper)).toContain("PLN 119,190.00")
    expect(txt(wrapper)).toContain("PLN 115,000.00")
  })

  it("switching the display currency in place re-converts the cards", async () => {
    const wrapper = await mountDetail("PLN")
    await flushPromises()
    expect(txt(wrapper)).toContain("PLN 119,190.00")

    const pinia = wrapper.vm.$.appContext.app.config.globalProperties.$pinia
    useDisplayCurrencyStore(pinia).currency = "USD"
    await flushPromises()

    expect(wrapper.text()).toContain("$29,797.50")
    expect(txt(wrapper)).not.toContain("PLN 119,190.00")
  })
})
