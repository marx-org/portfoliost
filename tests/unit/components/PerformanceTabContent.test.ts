import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PerformanceTabContent from "@/components/PerformanceTabContent.vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { getLatestRate } from "@/api/fx"

// §83.1 — the tab body mounted directly, with no route, no store fetch and no
// router: everything it used to reach for is a prop or an emit now. The
// per-portfolio cases stay in PortfolioPerformanceTab.test.ts (they exercise the
// wrapper's fetch/poll/recompute); this file covers the three things the
// extraction itself puts at risk — the tiles reading PROPS, the withheld tile
// hiding Timing, and the display-currency switch surviving without a remount.

vi.mock("@/api/fx", () => ({ getLatestRate: vi.fn() }))
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

async function mountContent(
  props: Partial<InstanceType<typeof PerformanceTabContent>["$props"]> = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PerformanceTabContent, {
    props: {
      analytics: analytics() as never,
      riskMetrics: { maxDrawdown: -0.1 },
      positions: [] as never,
      baseCurrency: "USD",
      selectedBenchmarks: [],
      timeframe: "ALL",
      loading: false,
      backfillPending: false,
      recomputing: false,
      ...props,
    },
    global: {
      plugins: [pinia],
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

function tile(wrapper: Awaited<ReturnType<typeof mountContent>>, id: string) {
  return wrapper.get(`[data-testid="perf-overview-${id}"]`).text()
}

describe("PerformanceTabContent — §83.1 prop-driven tab body", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRate.mockResolvedValue({ rate: 1, asOf: "2026-10-02" } as never)
  })

  it("renders every tile from its props", async () => {
    const wrapper = await mountContent()
    expect(tile(wrapper, "net-gain")).toContain("300")
    expect(tile(wrapper, "net-invested")).toContain("900")
    expect(tile(wrapper, "xirr")).toContain("14.50%")
    expect(tile(wrapper, "twr-pa")).toContain("11.25%")
    expect(tile(wrapper, "timing")).toContain("+3.25%")
    // Drawdown reads the `riskMetrics` prop, not a fetch.
    expect(wrapper.get('[data-testid="performance-max-drawdown"]').text()).toContain("10.00%")
  })

  it("renders — and hides Timing — when the TWR p.a. is withheld", async () => {
    // §82.2's rule: a withheld rate must not become a confident Timing reading,
    // because Timing is a difference of two rates and one of them is absent.
    const wrapper = await mountContent({
      analytics: analytics({
        annualizedReturn: null,
        annualizedReturnWithheldReason: "insufficient_history",
      }) as never,
    })
    expect(tile(wrapper, "twr-pa")).toContain("—")
    // The plain-language reason sits beside the tile, inside the card.
    expect(wrapper.get('[data-testid="perf-overview"]').text()).toContain("not enough history yet")
    expect(wrapper.find('[data-testid="perf-overview-timing"]').exists()).toBe(false)
  })

  it("re-renders the money tiles on a display-currency switch without a remount", async () => {
    // §48.6e B3 — ref, not snapshot. A remount would re-fetch the chart and drop
    // the selection; the tiles must follow the store in place.
    const wrapper = await mountContent()
    const before = wrapper.get('[data-testid="perf-overview-net-gain"]').element
    expect(tile(wrapper, "net-gain")).toContain("$300")

    mockedRate.mockResolvedValue({ rate: 0.25, asOf: "2026-10-02" } as never)
    useDisplayCurrencyStore().currency = "EUR"
    await flushPromises()

    expect(wrapper.get('[data-testid="perf-overview-net-gain"]').text()).toContain("€75")
    // Same DOM node: the component was updated, not torn down.
    expect(wrapper.get('[data-testid="perf-overview-net-gain"]').element).toBe(before)
  })

  it("emits update:timeframe instead of writing per-portfolio store state", async () => {
    const wrapper = await mountContent({ timeframe: "1Y" })
    // §82.3 — Yearly is unavailable off ALL, and the hint says why.
    expect(wrapper.get('[data-testid="perf-returns-mode-yearly"]').attributes("disabled")).toBeDefined()

    const all = wrapper.findAll("button").find((b) => b.text() === "ALL")!
    await all.trigger("click")
    expect(wrapper.emitted("update:timeframe")).toEqual([["ALL"]])
  })

  it("prefixes every testid only when a prefix is passed", async () => {
    // The per-portfolio mount must keep its ids byte-identical — three existing
    // specs select on them.
    const plain = await mountContent()
    expect(plain.find('[data-testid="perf-overview"]').exists()).toBe(true)
    expect(plain.find('[data-testid="total-perf-overview"]').exists()).toBe(false)

    const prefixed = await mountContent({ testid: "total" })
    expect(prefixed.find('[data-testid="perf-overview"]').exists()).toBe(false)
    expect(prefixed.find('[data-testid="total-perf-overview"]').exists()).toBe(true)
    expect(prefixed.find('[data-testid="total-perf-overview-net-gain"]').exists()).toBe(true)
    expect(prefixed.find('[data-testid="total-performance-max-drawdown"]').exists()).toBe(true)
    // The templated per-year ids prefix the same way.
    expect(prefixed.find('[data-testid="total-perf-returns-yearly-hint"]').exists()).toBe(false)
  })
})