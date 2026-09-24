/** PortfolioCard.test.ts (§53.3/§53.4) — sparkline remount key, failed-backfill state, shape-only guard */
import { flushPromises, mount } from "@vue/test-utils"
import { h } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioCard from "@/modules/portfolios/PortfolioCard.vue"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioAnalytics: vi.fn(),
    recomputePortfolio: vi.fn(),
    getPortfolioPositions: vi.fn(),
    deletePortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
  }
})

const mockedPortfolios = vi.mocked(portfoliosApi)

const PORTFOLIO = {
  id: "p1",
  name: "Test PF",
  strategy: "GROWTH",
  description: null,
  currentValue: 100,
  totalInvested: 100,
  metrics: { totalReturn: 0, openPositions: 1, unrealizedGainLoss: 0 },
} as never

const analytics = (values: number[], backfillStatus: "pending" | "complete" | "failed" | null = "complete") =>
  ({
    backfillStatus,
    performance: { timeSeries: values.map((v) => ({ date: "2026-01-01", value: v })) },
  }) as never

async function mountCard() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const w = mount(PortfolioCard, {
    props: { portfolio: PORTFOLIO },
    global: {
      plugins: [pinia],
      stubs: {
        apexchart: true,
        RouterLink: { template: '<a href="#"><slot /></a>' },
      },
    },
  })
  await flushPromises()
  return w
}

const key = (w: ReturnType<typeof mount>) => (w.vm as unknown as { chartKey: string }).chartKey

describe("PortfolioCard sparkline (§53.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("remount key changes when the series fingerprint changes (timeframe swap)", async () => {
    mockedPortfolios.getPortfolioAnalytics
      .mockResolvedValueOnce(analytics([100, 101, 102, 103]))
      .mockResolvedValue(analytics([50, 55, 60, 62, 66, 71, 75, 80, 84, 90, 95, 100]))
    const w = await mountCard()
    const k1 = key(w)
    expect(k1).not.toBe("")

    const oneYear = w.findAll("button").find((b) => b.text() === "1Y")
    expect(oneYear).toBeDefined()
    await oneYear!.trigger("click")
    await flushPromises()

    expect(key(w)).not.toBe(k1)
  })

  it("shows 'Chart unavailable' + Recompute (not eternal 'Loading chart…') when the backfill failed", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(analytics([], "failed"))
    const w = await mountCard()

    expect(w.text()).toContain("Chart unavailable")
    expect(w.text()).not.toContain("Loading chart...")
    expect(w.find('[data-testid="card-chart-recompute"]').exists()).toBe(true)
  })

  it("Recompute calls recomputePortfolio and repaints once the backfill succeeds", async () => {
    mockedPortfolios.getPortfolioAnalytics
      .mockResolvedValueOnce(analytics([], "failed"))
      .mockResolvedValue(analytics([100, 102, 105]))
    mockedPortfolios.recomputePortfolio.mockResolvedValue({ backfillStatus: "pending" } as never)
    const w = await mountCard()
    expect(w.text()).toContain("Chart unavailable")

    await w.find('[data-testid="card-chart-recompute"]').trigger("click")
    await flushPromises()

    expect(mockedPortfolios.recomputePortfolio).toHaveBeenCalledWith("p1")
    expect(w.text()).not.toContain("Chart unavailable")
    expect(w.findComponent({ name: "apexchart" }).exists()).toBe(true)
  })

  it("sparkline is shape-only: no data labels, tooltip or axis text (§53.4)", async () => {
    // User decision 2026-09-23: the card sparkline renders the series shape
    // only — never converted to the display currency, so it must never carry
    // numbers (value labels / tooltip / axis labels). Guard against a later
    // "nice to have" re-introducing unconverted values on the card.
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(analytics([100, 102, 105]))
    const captured: { options?: Record<string, unknown> } = {}
    const pinia = createPinia()
    setActivePinia(pinia)
    mount(PortfolioCard, {
      props: { portfolio: PORTFOLIO },
      global: {
        plugins: [pinia],
        stubs: {
          apexchart: (props: { options?: Record<string, unknown> }) => {
            if (props.options) captured.options = props.options
            return h("div")
          },
          RouterLink: { template: '<a href="#"><slot /></a>' },
        },
      },
    })
    await flushPromises()
    const opts = captured.options as {
      dataLabels: { enabled: boolean }
      tooltip: { enabled: boolean }
      xaxis: { labels: { show: boolean } }
    }
    expect(opts.dataLabels.enabled).toBe(false)
    expect(opts.tooltip.enabled).toBe(false)
    expect(opts.xaxis.labels.show).toBe(false)
  })
})
