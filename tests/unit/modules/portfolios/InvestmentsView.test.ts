import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia, type Pinia } from "pinia"
import { useCurrenciesStore } from "@/stores/currencies"
import { beforeEach, describe, expect, it, vi } from "vitest"
import InvestmentsView from "@/modules/portfolios/InvestmentsView.vue"
import * as portfoliosApi from "@/api/portfolios"
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

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn(),
}))

const mocked = vi.mocked(portfoliosApi)
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
      baseCurrency: "USD",
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
        // Keeps `to` on the stub, so the target route is assertable here.
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
      cashValue: 0,
      instrumentsValue: 1200,
      cashBreakdown: [],
    } as never)
    mocked.getPortfolioAnalytics.mockResolvedValue({
      performance: { timeSeries: [{ date: "2026-01-01", value: 100 }], monthlyReturns: [] },
    } as never)
    mocked.getMergedAnalytics.mockResolvedValue({
      performance: { timeSeries: [{ date: "2026-01-01", value: 1000 }], monthlyReturns: [] },
    } as never)
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-09-21" })
  })

  it("renders the total metrics cards", async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get("h1").text()).toBe("Portfolios")
    expect(wrapper.text()).toContain("Total value")
    expect(wrapper.text()).toContain("1,200.00")
    expect(wrapper.text()).toContain("+$200.00")
    expect(wrapper.text()).toContain("20.00%")
  })

  /**
   * §68.4 — the four headline tiles, and the identity that makes the section
   * worth having: Total = Cash + Instruments, in the rendered output.
   */
  it("renders the four §68 tiles and Total == Cash + Instruments", async () => {
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: 800,
      cashValue: 400,
      totalValue: 1200,
      totalInvested: 1000,
      baseCurrency: "USD",
      portfolioBreakdown: [],
      cashBreakdown: [],
    } as never)
    const wrapper = mountView()
    await flushPromises()

    const tiles = wrapper.get('[data-testid="headline-tiles"]')
    expect(tiles.text()).toContain("Cash value")
    expect(tiles.text()).toContain("Instruments value")
    expect(tiles.text()).toContain("Total value")
    expect(tiles.text()).toContain("Total invested")

    const num = (id: string) =>
      Number(wrapper.get(`[data-testid="${id}"]`).text().replace(/[^0-9.-]/g, ""))
    const cash = num("tile-cash-value")
    const instruments = num("tile-instruments-value")
    const total = num("tile-total-value")
    expect(cash).toBe(400)
    expect(instruments).toBe(800)
    expect(total).toBe(1200)
    // the identity, asserted on what was actually rendered
    expect(cash + instruments).toBe(total)
  })

  it("derives gain/loss and return from the same pair as the tiles (§68.4)", async () => {
    // deliberately inconsistent response fields: the tiles and the derived pair
    // must come from (totalValue, totalInvested), not from totalGainLoss /
    // returnPercentage, or they could disagree.
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: 800,
      cashValue: 400,
      totalValue: 1200,
      totalInvested: 1000,
      totalGainLoss: 999999,
      returnPercentage: 55555,
      baseCurrency: "USD",
      portfolioBreakdown: [],
      cashBreakdown: [],
    } as never)
    const wrapper = mountView()
    await flushPromises()

    const num = (id: string) =>
      Number(wrapper.get(`[data-testid="${id}"]`).text().replace(/[^0-9.-]/g, ""))
    // 1200 - 1000
    expect(num("tile-gainloss-value")).toBe(200)
    expect(wrapper.get('[data-testid="tile-return-value"]').text()).toContain("20.00%")
  })

  it("renders a NEGATIVE cash tile rather than an em dash (§68.3)", async () => {
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: 0,
      cashValue: -1200,
      totalValue: -1200,
      totalInvested: 0,
      baseCurrency: "USD",
      portfolioBreakdown: [],
      cashBreakdown: [],
    } as never)
    const wrapper = mountView()
    await flushPromises()
    const cash = wrapper.get('[data-testid="tile-cash-value"]').text()
    expect(cash).not.toBe("\u2014")
    expect(cash).toContain("1,200")
  })

  it("renders the investment and cash sections with the portfolio-native cash total (§62)", async () => {
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      totalValue: 1200,
      totalInvested: 1000,
      totalGainLoss: 200,
      returnPercentage: 20,
      baseCurrency: "USD",
      portfolioBreakdown: [],
      cashValue: 720,
      instrumentsValue: 1200,
      cashBreakdown: [
        { currency: "USD", balance: 500, weight: 69.44 },
        { currency: "EUR", balance: 200, weight: 30.56 },
      ],
    } as never)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain("Investment Portfolios")
    expect(wrapper.text()).toContain("Cash")
    expect(wrapper.text()).toContain("Top10")
    expect(wrapper.text()).toContain("GROWTH")
    expect(wrapper.text()).toContain("10 open positions")
    expect(wrapper.text()).toContain("Total Balance")
    expect(wrapper.text()).toContain("$720.00")
    expect(wrapper.text()).toContain("USD 69%")
    expect(wrapper.text()).toContain("EUR 31%")
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
    })
  })

  it("shows the display currency menu", async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find("button.btn-secondary").trigger("click")
    expect(wrapper.text()).toContain("EUR")
  })

  // §83.6 — the merged chart and its timeframe selector MOVED to
  // TotalPerformanceView. The conversion and switching cases live in
  // TotalPerformanceView.test.ts now, against the same endpoint and the same
  // chart component; what stays here is that the dashboard points at the tab
  // rather than rendering the curve a second time.
  it("links to the cumulative performance tab instead of repeating the curve (§83.6)", async () => {
    localStorage.removeItem("portfoliost_display_currency")
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="combined-chart"]').exists()).toBe(false)
    const link = wrapper.get('[data-testid="combined-chart-link"]')
    expect(link.attributes("href")).toBe("/en/investments/performance")
    expect(link.text()).toContain("Open performance")
  })
})

/**
 * §70.2 — the headline must SAY when it is incomplete or stale, not just be
 * small. An understated total that looks complete is the failure mode.
 */
describe("§70.2: price completeness and freshness", () => {
  const setMetrics = (over: Record<string, unknown> = {}) => {
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: 800, cashValue: 400, totalValue: 1200, totalInvested: 1000,
      baseCurrency: "USD", portfolioBreakdown: [], cashBreakdown: [],
      ...over,
    } as never)
  }

  it("warns and counts unpriced positions, and says they are not valued at cost", async () => {
    setMetrics({ unpricedPositions: 12 })
    const w = mountView(); await flushPromises()
    const note = w.get('[data-testid="price-freshness-note"]').text()
    expect(note).toContain("12")
    expect(note).toContain("could not be priced")
    expect(note).toContain("not")
  })

  it("says nothing when the total is complete and fresh", async () => {
    setMetrics({ unpricedPositions: 0, priceAsOf: new Date().toISOString(), priceSource: "quote" })
    const w = mountView(); await flushPromises()
    expect(w.find('[data-testid="price-freshness-note"]').exists()).toBe(false)
  })

  it("flags a price that is more than 6 hours old, reporting the OLDEST", async () => {
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30 h
    setMetrics({ priceAsOf: old, priceSource: "quote" })
    const w = mountView(); await flushPromises()
    expect(w.get('[data-testid="price-freshness-note"]').text()).toContain("oldest price")
  })

  it("flags a carried-over (fallback) price as not live", async () => {
    setMetrics({ priceAsOf: new Date().toISOString(), priceSource: "fallback" })
    const w = mountView(); await flushPromises()
    const note = w.get('[data-testid="price-freshness-note"]').text()
    expect(note).toContain("not live")
  })
})

/**
 * The per-card note depends on `/total-metrics` arriving AFTER the cards are
 * rendered — which is the normal order, since the portfolio list resolves first.
 * A freshness map built from a snapshot taken at setup is empty forever, and the
 * symptom is a silent absence of warnings, not an error.
 */
it("badges a card whose portfolio has unpriced positions, once metrics arrive", async () => {
  const pfs = await summary()
  mocked.getPortfolios.mockResolvedValue(pfs)
  mocked.getPortfolioTotalMetrics.mockResolvedValue({
    instrumentsValue: 100, cashValue: 0, totalValue: 100, totalInvested: 100,
    baseCurrency: "PLN", cashBreakdown: [],
    unpricedPositions: 3,
    portfolioBreakdown: [
      { id: pfs[0].id, name: pfs[0].name, instrumentsValue: 100, cashValue: 0,
        totalValue: 100, totalInvested: 100, unpricedPositions: 3, priceAsOf: null, priceSource: null },
    ],
  } as never)
  const w = mountView()
  await flushPromises()
  const notes = w.findAll('[data-testid="card-freshness-note"]')
  expect(notes.length).toBe(1)
  expect(notes[0].text()).toContain("3 positions unpriced")
})

/**
 * §63.3 — the reconciliation this section was opened for, asserted on the
 * rendered cards: Σ card Values == the headline.
 *
 * The fixture is the PROD shape that broke it (measured 2026-10-01): the
 * portfolio list carries a STORED `currentValue` written from backfill bars,
 * while the aggregate breakdown carries the LIVE value the headline sums. The
 * two differ — here 1,200 stored against 1,096.23 live — so a card rendering
 * the stored column cannot reconcile, and neither can a test that seeds both
 * paths from one number. That is why §63.3's old unit test passed while the
 * page did not add up.
 */
describe("§63.3: the cards sum to the headline", () => {
  const num = (w: ReturnType<typeof mountView>, id: string) =>
    Number(w.get(`[data-testid="${id}"]`).text().replace(/[^0-9.-]/g, ""))

  it("renders each card from the aggregate breakdown, not the stored column", async () => {
    // Stored `currentValue` 1200 (bars) vs live breakdown 1096.23 (quotes) —
    // the exact disagreement that made Σ cards 1,944.85 PLN short in PROD.
    // Base USD so the display conversion is 1:1 and this test is about which
    // number the card reads, not about FX (§66.3 covers the conversion).
    const pfs = await summary()
    // `cash` is what makes the card render its instruments/cash split at all, and
    // PROD carries it on every card — without it the split is not in the DOM.
    mocked.getPortfolios.mockResolvedValue([
      { ...pfs[0], cash: { total: 96.23, baseCurrency: "USD", balances: [{ currency: "USD", balance: 96.23 }] } },
    ] as never)
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: 1000, cashValue: 96.23, totalValue: 1096.23, totalInvested: 1000,
      baseCurrency: "USD", cashBreakdown: [],
      unpricedPositions: 0,
      portfolioBreakdown: [
        { id: pfs[0].id, name: pfs[0].name, instrumentsValue: 1000, cashValue: 96.23,
          totalValue: 1096.23, totalInvested: 1000, returnPercentage: 9.62,
          unpricedPositions: 0, priceAsOf: null, priceSource: "quote" },
      ],
    } as never)
    const w = mountView()
    await flushPromises()

    expect(num(w, "card-value")).toBe(1096.23)
    expect(num(w, "card-invested")).toBe(1000)
    expect(num(w, "card-instruments-value")).toBe(1000)
    // the load-bearing assertion: the card and the headline are the same number
    expect(num(w, "card-value")).toBe(num(w, "tile-total-value"))
  })

  it("keeps Σ cards equal to the headline across several portfolios", async () => {
    // The PROD shape at fleet scale: some portfolios disagree, some agree. A
    // one-card fixture would pass against a fix that only worked when the
    // breakdown happened to hold a single row.
    const base = await summary()
    const rows = [
      { id: "p1", name: "First", stored: 1200, live: 1096.23 },
      { id: "p2", name: "Second", stored: 500, live: 498.11 },
      { id: "p3", name: "Third", stored: 300, live: 300 },
    ]
    mocked.getPortfolios.mockResolvedValue(
      rows.map((r) => ({ ...base[0], id: r.id, name: r.name, currentValue: r.stored })),
    )
    const breakdown = rows.map((r) => ({
      id: r.id, name: r.name, instrumentsValue: r.live, cashValue: 0,
      totalValue: r.live, totalInvested: 1000, returnPercentage: 0,
      unpricedPositions: 0, priceAsOf: null, priceSource: "quote",
    }))
    const total = breakdown.reduce((s, r) => s + r.totalValue, 0)
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: total, cashValue: 0, totalValue: total, totalInvested: 3000,
      baseCurrency: "USD", cashBreakdown: [], unpricedPositions: 0,
      portfolioBreakdown: breakdown,
    } as never)
    const w = mountView()
    await flushPromises()

    const cards = w.findAll('[data-testid="card-value"]').map((el) => Number(el.text().replace(/[^0-9.-]/g, "")))
    expect(cards.length).toBe(3)
    expect(cards.reduce((s, v) => s + v, 0)).toBeCloseTo(num(w, "tile-total-value"), 2)
  })

  it("falls back to the stored figures when the breakdown has no row for the card", async () => {
    // `total-metrics` returns an empty breakdown when it cannot resolve an honest
    // aggregate base. The card must still show a number — stale but visible —
    // rather than an em dash that reads as "this portfolio is worth nothing".
    const pfs = await summary()
    mocked.getPortfolios.mockResolvedValue(pfs)
    mocked.getPortfolioTotalMetrics.mockResolvedValue({
      instrumentsValue: 0, cashValue: 0, totalValue: 0, totalInvested: 0,
      baseCurrency: null, cashBreakdown: [], portfolioBreakdown: [],
    } as never)
    const w = mountView()
    await flushPromises()
    expect(num(w, "card-value")).toBe(1200)
  })
})

