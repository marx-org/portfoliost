import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioPerformanceTab from "@/modules/portfolios/PortfolioPerformanceTab.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import * as portfoliosApi from "@/api/portfolios"
import { getLatestRate } from "@/api/fx"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioAnalytics: vi.fn(),
    getPortfolioRiskMetrics: vi.fn(),
    recomputePortfolio: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({ getLatestRate: vi.fn() }))

const mocked = vi.mocked(portfoliosApi)
const mockedRate = vi.mocked(getLatestRate)

function analytics(overrides: Record<string, unknown> = {}) {
  return {
    timeframe: "ALL",
    backfillStatus: "complete",
    performance: {
      timeSeries: [
        { date: "2026-01-01", value: 1000, invested: 900, cumulativeTwr: 100 },
        { date: "2026-01-02", value: 1200, invested: 900, cumulativeTwr: 110 },
      ],
      totalValue: 1200,
      totalInvested: 900,
      totalReturn: 300,
      totalReturnPercent: 33.33,
      monthlyReturns: [{ month: "2026-01", returnPercent: 10 }],
      timeWeightedReturn: 10,
      moneyWeightedReturn: 14.5,
      simpleReturnPercent: 33.33,
      annualizedReturn: 11.25,
      annualizedReturnWithheldReason: null,
      ...overrides,
    },
    benchmarks: [],
  }
}

function makeEnv(baseCurrency = "USD") {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePortfolioStore()
  store.detail = { id: "p1", baseCurrency, isMarginEnabled: false } as never
  store.analytics = analytics() as never
  store.positions = [] as never
  return pinia
}

async function mountTab(env = makeEnv()) {
  const wrapper = mount(PortfolioPerformanceTab, {
    global: {
      plugins: [env],
      stubs: {
        apexchart: true,
        PortfolioPerformanceChart: { template: "<div data-testid='chart-stub' />" },
        InstrumentSearchModal: true,
        TickerBadge: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

function tile(wrapper: Awaited<ReturnType<typeof mountTab>>, id: string) {
  return wrapper.get(`[data-testid="perf-overview-${id}"]`).text()
}

describe("PortfolioPerformanceTab — §82.2 overview tiles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getPortfolioRiskMetrics.mockResolvedValue({ maxDrawdown: -0.1 } as never)
    mocked.getPortfolioAnalytics.mockResolvedValue(analytics() as never)
    mockedRate.mockResolvedValue({ rate: 1, asOf: "2026-10-02" } as never)
  })

  it("renders the four tiles from the payload it already holds — no new API call", async () => {
    mocked.getPortfolioAnalytics.mockClear()
    const wrapper = await mountTab()
    expect(tile(wrapper, "net-gain")).toContain("300")
    expect(tile(wrapper, "net-invested")).toContain("900")
    expect(tile(wrapper, "xirr")).toContain("14.50%")
    expect(tile(wrapper, "twr-pa")).toContain("11.25%")
    expect(mocked.getPortfolioAnalytics).not.toHaveBeenCalled()
  })

  it("computes Timing as XIRR − TWR p.a. and reads it in plain language", async () => {
    const wrapper = await mountTab()
    // 14.50 − 11.25 = +3.25 pp → "adding money helped"
    expect(tile(wrapper, "timing")).toContain("+3.25%")
    expect(wrapper.get('[data-testid="perf-overview-timing"]').text()).toContain("adding money helped")
  })

  it("reads the other direction when the user's timing lagged the investments", async () => {
    const env = makeEnv()
    usePortfolioStore().analytics = analytics({
      moneyWeightedReturn: 4,
      annualizedReturn: 13,
    }) as never
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "timing")).toContain("-9.00%")
    expect(wrapper.get('[data-testid="perf-overview-timing"]').text()).toContain("adding money hurt")
  })

  it("calls a sub-1pp gap 'roughly neutral' rather than pretending to 2 dp of precision", async () => {
    const env = makeEnv()
    usePortfolioStore().analytics = analytics({
      moneyWeightedReturn: 11.6,
      annualizedReturn: 11.25,
    }) as never
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "timing")).toContain("+0.35%")
    expect(wrapper.get('[data-testid="perf-overview-timing"]').text()).toContain("roughly neutral")
  })

  /**
   * The rule that matters: a withheld TWR p.a. and a genuine 0.00% are different
   * facts and must not look alike. `formatPercent(null)` returns "—", so the
   * em-dash is what keeps "we don't know" from reading as "nothing happened".
   */
  it("renders — (never 0) for a withheld TWR p.a., and hides the Timing line entirely", async () => {
    const env = makeEnv()
    usePortfolioStore().analytics = analytics({
      annualizedReturn: null,
      annualizedReturnWithheldReason: "insufficient_history",
    }) as never
    const wrapper = await mountTab(env)

    expect(tile(wrapper, "twr-pa")).toBe("—")
    expect(wrapper.get('[data-testid="perf-overview-twr-pa"]').text()).not.toContain("0.00%")
    // The reason is shown, so the em-dash is explained rather than mysterious.
    expect(wrapper.text()).toContain("not enough history yet")
    // Timing is a difference of two rates — with one withheld it means nothing.
    expect(wrapper.find('[data-testid="perf-overview-timing"]').exists()).toBe(false)
  })

  it("renders — for a withheld XIRR and hides Timing", async () => {
    const env = makeEnv()
    usePortfolioStore().analytics = analytics({
      moneyWeightedReturn: null,
      moneyWeightedReturnWithheldReason: "insufficient_history",
      annualizedReturn: 11.25,
    }) as never
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "xirr")).toBe("—")
    expect(wrapper.find('[data-testid="perf-overview-timing"]').exists()).toBe(false)
  })

  it("renders — for absent fields rather than 0", async () => {
    const env = makeEnv()
    usePortfolioStore().analytics = analytics({
      totalReturn: undefined,
      totalInvested: undefined,
      moneyWeightedReturn: undefined,
      annualizedReturn: undefined,
      annualizedReturnWithheldReason: undefined,
    }) as never
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "net-gain")).toBe("—")
    expect(tile(wrapper, "net-invested")).toBe("—")
    expect(tile(wrapper, "xirr")).toBe("—")
    expect(tile(wrapper, "twr-pa")).toBe("—")
    expect(wrapper.find('[data-testid="perf-overview-timing"]').exists()).toBe(false)
  })

  it("renders a genuine 0.00% as 0.00%, not as the withheld —", async () => {
    const env = makeEnv()
    usePortfolioStore().analytics = analytics({ annualizedReturn: 0, moneyWeightedReturn: 0 }) as never
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "twr-pa")).toBe("0.00%")
    expect(tile(wrapper, "xirr")).toBe("0.00%")
    expect(tile(wrapper, "timing")).toContain("0.00%")
    expect(tile(wrapper, "timing")).not.toContain("—")
  })

  it("converts the money tiles through the shared display-currency path", async () => {
    // §67.2 — a fifth bare `× rate` that degrades an unresolvable pair to 1:1 is
    // what plotted native values under a foreign symbol. Reuse `convert()`.
    mockedRate.mockResolvedValue({ rate: 4, asOf: "2026-10-02" } as never)
    const env = makeEnv("USD")
    useDisplayCurrencyStore().setCurrency("PLN")
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "net-gain")).toContain("1,200")
    expect(tile(wrapper, "net-invested")).toContain("3,600")
  })

  it("shows no money figure while the rate is unknown — never a guess at 1:1", async () => {
    mockedRate.mockResolvedValue(null as never)
    const env = makeEnv("USD")
    useDisplayCurrencyStore().setCurrency("PLN")
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "net-gain")).toBe("—")
  })

  it("re-converts the money tiles on a display-currency switch without remounting", async () => {
    // §48.6e B3 — the chart's rate is a ref, not a snapshot, so switching in
    // place must update the tiles too. A `computed` on a copied rate would go
    // stale and the card would silently show the old currency.
    const env = makeEnv("USD")
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "net-gain")).toContain("300")

    mockedRate.mockResolvedValue({ rate: 4, asOf: "2026-10-02" } as never)
    useDisplayCurrencyStore().setCurrency("PLN")
    await flushPromises()

    expect(wrapper.find('[data-testid="perf-overview"]').exists()).toBe(true)
    expect(tile(wrapper, "net-gain")).toContain("1,200")
    expect(tile(wrapper, "net-invested")).toContain("3,600")
  })

  it("leaves the rate tiles unconverted — a percentage is not money", async () => {
    mockedRate.mockResolvedValue({ rate: 4, asOf: "2026-10-02" } as never)
    const env = makeEnv("USD")
    useDisplayCurrencyStore().setCurrency("PLN")
    const wrapper = await mountTab(env)
    expect(tile(wrapper, "xirr")).toBe("+14.50%")
    expect(tile(wrapper, "twr-pa")).toBe("+11.25%")
    expect(tile(wrapper, "timing")).toContain("+3.25%")
    // 4× on a rate would read +58.00% — the category error this asserts against.
    expect(tile(wrapper, "timing")).not.toContain("58")
  })

  it("places the overview card above the Performance Chart card", async () => {
    const wrapper = await mountTab()
    const cards = wrapper.findAll(".card")
    expect(cards[0].attributes("data-testid")).toBe("perf-overview")
    expect(wrapper.html().indexOf("perf-overview")).toBeLessThan(
      wrapper.html().indexOf("Performance Chart:"),
    )
  })
})