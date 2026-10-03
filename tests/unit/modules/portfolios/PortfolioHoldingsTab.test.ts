import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioHoldingsTab from "@/modules/portfolios/PortfolioHoldingsTab.vue"
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
    getPortfolioPositions: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" }),
}))

const mockedFx = vi.mocked(fxApi)
const mockedPortfolios = vi.mocked(portfoliosApi)

/**
 * §48.6e B2 — backend `converted*` fields are denominated in the portfolio
 * base currency (wallets D21b); the tab converts them to the user's display
 * currency client-side (getLatestRate).
 */
function position(overrides: Record<string, unknown> = {}) {
  return {
    id: "pos-1",
    portfolioId: "p1",
    symbol: "SNT.WA",
    companyName: "Synektik Sa",
    assetType: "STOCK",
    quantity: 400,
    averageCostBasis: 100,
    totalCostBasis: 40000,
    instrumentCurrency: "PLN",
    purchaseCurrency: "PLN",
    isOpen: true,
    currentPrice: 102.4,
    marketValue: 40960,
    unrealizedGainLoss: 960,
    percentageChange: 2.4,
    percentOfPortfolio: 100,
    // backend converted* — identity here (instrument ccy = portfolio base ccy)
    convertedAverageCostBasis: 100,
    convertedCurrentPrice: 102.4,
    convertedMarketValue: 40960,
    convertedTotalCostBasis: 40000,
    convertedUnrealizedGainLoss: 960,
    displayCurrency: "PLN",
    labels: [],
    ...overrides,
  } as never
}

async function mountTab(detail: { currency: string } | null, positions: never[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePortfolioStore()
  store.detail = detail as never
  store.positions = positions
  mockedPortfolios.getPortfolioPositions.mockResolvedValue(positions as never)
  return mount(PortfolioHoldingsTab, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a href="#"><slot /></a>' } },
    },
  })
}

describe("PortfolioHoldingsTab — §48.6e B2 display-currency conversion", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" })
  })

  it("converts portfolio-base converted* values to the display currency", async () => {
    const wrapper = await mountTab({ currency: "PLN" }, [position()])
    await flushPromises()

    // Rate resolved for the portfolio→display pair.
    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("PLN", "USD")

    // Market value cell: native PLN primary + converted USD sub-line
    // (40,960 × 0.25 = 10,240) — NOT the identity value with a $ label.
    expect(wrapper.text()).toContain("40,960.00")
    expect(wrapper.text()).toContain("$10,240.00")
    expect(wrapper.text()).not.toContain("$40,960.00")

    // P/L sub-line converted too (960 × 0.25 = 240).
    expect(wrapper.text()).toContain("$240.00")

    // Total row (tfoot) converted to the display currency.
    expect(wrapper.find("tfoot").text()).toContain("$10,240.00")
    expect(wrapper.find("tfoot").text()).toContain("$240.00")
  })

  it("same-currency portfolio: no FX fetch, values rendered as-is", async () => {
    const usdPosition = position({
      symbol: "META",
      instrumentCurrency: "USD",
      purchaseCurrency: "USD",
      displayCurrency: "USD",
    })
    const wrapper = await mountTab({ currency: "USD" }, [usdPosition])
    await flushPromises()

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("$40,960.00")
    expect(wrapper.find("tfoot").text()).toContain("$40,960.00")
  })

  it("no open positions: no FX fetch, no sub-lines, plain totals", async () => {
    const wrapper = await mountTab({ currency: "PLN" }, [])
    await flushPromises()

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("No open positions.")
    expect(wrapper.text()).not.toContain("$10,240.00")
    expect(wrapper.text()).not.toContain("$40,960.00")
    expect(wrapper.find("tfoot").exists()).toBe(false)
  })

  it("converts from the position-declared base currency, not the portfolio currency", async () => {
    // Portfolio `currency` is PLN but the backend base (position.displayCurrency)
    // is USD (API-created portfolios default to a USD base): the converted*
    // values are already USD, so no FX fetch and a $ sub-line as-is.
    const wrapper = await mountTab({ currency: "PLN" }, [position({ displayCurrency: "USD" })])
    await flushPromises()

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("$40,960.00")
    expect(wrapper.find("tfoot").text()).toContain("$40,960.00")
  })
})

describe("PortfolioHoldingsTab — dividend action routing (§49.4)", () => {
  async function mountTabWithDividend() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = usePortfolioStore()
    store.detail = { currency: "PLN" } as never
    store.positions = [position()] as never
    mockedPortfolios.getPortfolioPositions.mockResolvedValue([position()] as never)
    return mount(PortfolioHoldingsTab, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { template: '<a href="#"><slot /></a>' } },
      },
      shallow: true,
    })
  }

  it("'Dividend' action opens RecordDividendDialog (not AddPositionDialog) with the held position (§49.4)", async () => {
    const wrapper = await mountTabWithDividend()
    await flushPromises()

    await wrapper.findAll("button[aria-label='Position actions']")[0].trigger("click")
    const dividendBtn = [...wrapper.findAll("button")].find((b) => b.text() === "Dividend")
    expect(dividendBtn).toBeTruthy()
    await dividendBtn!.trigger("click")
    await flushPromises()

    const rdd = wrapper.findComponent({ name: "RecordDividendDialog" })
    const apd = wrapper.findComponent({ name: "AddPositionDialog" })
    expect(rdd.exists()).toBe(true)
    expect(rdd.props("open")).toBe(true)
    expect((rdd.props("position") as { id: string }).id).toBe("pos-1")
    expect(apd.props("open")).toBe(false)
  })
})

// §85.3 — the full-screen chart modal's `<h2>` was the last place on this tab
// where a symbol was bare text. It now carries a TickerBadge *beside* the
// existing wording rather than replacing it: that `h2` is also the
// role="heading" the e2e suite locates, so the text has to stay.
//
// The badge here is deliberately not a link. This is a full-screen overlay, not
// a dialog sitting on top of the page — nothing needs closing first, so the
// §85.2 emit-then-push reasoning does not apply, and a link inside it would be
// the one place a research navigation has no way back.
describe("PortfolioHoldingsTab — §85.3 chart-modal heading badge", () => {
  async function openChartModal() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = usePortfolioStore()
    store.detail = { currency: "PLN" } as never
    store.positions = [position()] as never
    mockedPortfolios.getPortfolioPositions.mockResolvedValue([position()] as never)
    const wrapper = mount(PortfolioHoldingsTab, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          PriceChart: { template: "<div data-testid='price-chart-stub' />" },
        },
      },
    })
    await flushPromises()

    await wrapper.findAll("button[aria-label='Position actions']")[0].trigger("click")
    const viewChart = [...wrapper.findAll("button")].find((b) => b.text() === "View chart")
    expect(viewChart).toBeTruthy()
    await viewChart!.trigger("click")
    await flushPromises()
    return wrapper
  }

  /** The chart modal's `<h2>` — not the "Pozycje"/"Positions" card heading. */
  function chartModalHeading(wrapper: Awaited<ReturnType<typeof openChartModal>>) {
    const heading = wrapper.findAll("h2").find((h) => h.text().includes("Synektik Sa"))
    if (!heading) throw new Error("the chart modal did not open")
    return heading
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" })
  })

  it("puts a TickerBadge in the heading, keeping the wording the e2e locates", async () => {
    const heading = chartModalHeading(await openChartModal())
    expect(heading.text()).toContain("SNT.WA — Synektik Sa")
    expect(heading.find('[data-testid="ticker-badge"]').exists()).toBe(true)
  })

  it("does not link the badge and leaves the modal open", async () => {
    const wrapper = await openChartModal()
    expect(chartModalHeading(wrapper).find("a").exists()).toBe(false)
    expect(wrapper.find('[data-testid="price-chart-stub"]').exists()).toBe(true)
  })
})
