import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioPerformanceTab from "@/modules/portfolios/PortfolioPerformanceTab.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"
import { usePortfolioStore } from "@/stores/portfolios"
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
    getPortfolioRiskMetrics: vi.fn().mockResolvedValue({}),
    getPortfolioAnalytics: vi.fn().mockResolvedValue(null),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 0.26, asOf: "2026-08-25" }),
}))

const mockedFx = vi.mocked(fxApi)

const DATE = "2026-08-01"
const TS = new Date(DATE).getTime()

interface Plotted {
  name: string
  data: [number, number][]
}

/**
 * §48.6e B3 — the analytics series + benchmark overlays are denominated in
 * the portfolio BASE currency (`baseCurrency`, not `currency` — API-created
 * portfolios default to a USD `currency` while their positions declare a
 * different base). The tab must convert to the display currency from
 * `baseCurrency`.
 */
function analytics() {
  return {
    backfillStatus: "complete",
    performance: { timeSeries: [{ date: DATE, value: 119190 }] },
    benchmarks: [{ symbol: "SPY", name: "S&P 500", timeSeries: [{ date: DATE, value: 5000 }] }],
  } as never
}

async function mountTab(detail: Record<string, unknown> | null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePortfolioStore()
  store.detail = detail as never
  store.analytics = analytics()
  store.positions = []
  const wrapper = mount(PortfolioPerformanceTab, {
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

function plottedSeries(wrapper: ReturnType<typeof mount>): Plotted[] {
  const chart = wrapper.findComponent(PortfolioPerformanceChart)
  return (chart.vm as unknown as { seriesData: Plotted[] }).seriesData
}

function lastValue(series: Plotted[]): number {
  const s = series[0]
  const last = s.data[s.data.length - 1]
  return last ? last[1] : NaN
}

describe("PortfolioPerformanceTab — §48.6e B3 display-currency conversion", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.26, asOf: "2026-08-25" })
  })

  it("converts from baseCurrency (NOT currency) — the prod Obligacje shape", async () => {
    const wrapper = await mountTab({ currency: "USD", baseCurrency: "PLN" })

    // The FX fetch pairs the BASE currency against the display — with the old
    // code (currency) this same-currency pair would short-circuit and no
    // fetch would happen at all.
    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("PLN", "USD")

    const [portfolio, benchmark] = plottedSeries(wrapper)
    expect(portfolio.data).toContainEqual([TS, 119190 * 0.26])
    expect(benchmark.data).toContainEqual([TS, 5000 * 0.26])
  })

  it("defaults to USD when baseCurrency is absent (no FX fetch)", async () => {
    const wrapper = await mountTab({ baseCurrency: "USD" })

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(lastValue(plottedSeries(wrapper))).toBeCloseTo(119190, 6)
  })

  it("same-currency base: no FX fetch, values plotted as-is", async () => {
    const wrapper = await mountTab({ currency: "USD", baseCurrency: "USD" })

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(lastValue(plottedSeries(wrapper))).toBeCloseTo(119190, 6)
  })

  it("switching the display currency in place re-converts the series", async () => {
    const wrapper = await mountTab({ currency: "USD", baseCurrency: "PLN" })
    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("PLN", "USD")
    expect(lastValue(plottedSeries(wrapper))).toBeCloseTo(119190 * 0.26, 6)

    // Display → PLN: base === display, the rate resets to identity and the
    // raw series is plotted again (no stale converted values under a zł axis).
    useDisplayCurrencyStore().setCurrency("PLN")
    await flushPromises()

    expect(lastValue(plottedSeries(wrapper))).toBeCloseTo(119190, 6)
  })
})
