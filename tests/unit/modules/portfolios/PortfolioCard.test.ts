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
  // Every real portfolio has one, and §78.5's amount is denominated in it —
  // without it `formatCurrency` correctly falls back to a bare number, which
  // would make the currency assertion untestable rather than wrong.
  baseCurrency: "PLN",
  currentValue: 100,
  totalInvested: 100,
  metrics: { totalReturn: 0, openPositions: 1, unrealizedGainLoss: 0 },
} as never

const analytics = (values: number[], backfillStatus: "pending" | "complete" | "failed" | null = "complete") =>
  ({
    backfillStatus,
    performance: { timeSeries: values.map((v) => ({ date: "2026-01-01", value: v })) },
  }) as never

/** §72.30 — a response carrying the two gap lists separately. */
const analyticsWithGaps = (
  gapSymbols: string[] | null,
  heldGapSymbols: string[] | null,
  values: number[] = [100, 110],
  unpricedValues?: number[] | null,
) =>
  ({
    backfillStatus: "complete",
    gapSymbols,
    heldGapSymbols,
    performance: {
      timeSeries: values.map((v, i) => ({
        date: "2026-01-01",
        value: v,
        // Omitted entirely when the caller does not pass it, which is what a
        // pre-§78.5 backend looks like — see the "absent is not zero" test.
        ...(unpricedValues ? { unpricedValue: unpricedValues[i] } : {}),
      })),
    },
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

  it("shows 'No data' (not eternal 'Loading chart…') when the backfill completed but the window is empty (§53.7)", async () => {
    // PROD 2026-09-24: fully-liquidated portfolios (XTB, Equate+) had a
    // complete backfill with zero points in the default 6M window — the card
    // sat on "Loading chart…" forever.
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(analytics([], "complete"))
    const w = await mountCard()

    expect(w.text()).toContain("No data")
    expect(w.text()).not.toContain("Loading chart...")
    expect(w.find('[data-testid="card-chart-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="card-chart-recompute"]').exists()).toBe(false)
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

/**
 * §72.30 — the card's gap notice must describe the value the card is showing.
 *
 * PROD, 2026-10-01: three of the four portfolios carrying a gap warning had every
 * flagged symbol already CLOSED, and the card said "Value excludes 7 positions
 * without price history" about a value that was counting them in full. The gap is
 * real — it is the stored history that is partial — but the claim about the
 * current number was not, and a warning that is wrong about the figure next to it
 * is worse than none.
 */
describe("§72.30: the card's gap notice matches the claim it can support", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("says the value is short only for symbols still held", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(
      analyticsWithGaps(["BST0922", "INS0922", "VOX0224"], null),
    )
    const w = await mountCard()

    // NOT the amber "value is short" banner …
    expect(w.find('[data-testid="card-chart-gap-warning"]').exists()).toBe(false)
    // … a quieter note about the history, which still reports the gap
    const note = w.find('[data-testid="card-chart-history-gap-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain("3 earlier positions")
    expect(note.text()).toMatch(/today's value is complete/i)
  })

  it("keeps the urgent banner when a gap symbol is still held", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(
      analyticsWithGaps(["SOLD", "ROD0335"], ["ROD0335"]),
    )
    const w = await mountCard()

    const warn = w.find('[data-testid="card-chart-gap-warning"]')
    expect(warn.exists()).toBe(true)
    // scoped to the one still held — not the 2 in the window-wide list
    expect(warn.text()).toContain("Value excludes 1 position")
    expect(warn.text()).not.toContain("2 positions")
    // and the history note does not double-report the same symbol
    expect(w.find('[data-testid="card-chart-history-gap-note"]').text()).toContain("1 earlier position")
  })

  it("shows nothing at all when every held symbol is priced", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(analyticsWithGaps(null, null))
    const w = await mountCard()
    expect(w.find('[data-testid="card-chart-gap-warning"]').exists()).toBe(false)
    expect(w.find('[data-testid="card-chart-history-gap-note"]').exists()).toBe(false)
  })

  it("treats a legacy response (no heldGapSymbols) as history, never as a short value", async () => {
    // A backend without the split sends `gapSymbols` only. Reading it as "held"
    // would reproduce the exact PROD false warning, so the card degrades to the
    // history note until the next backfill on a current backend fills it in.
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(analyticsWithGaps(["OLD"], null))
    const w = await mountCard()
    expect(w.find('[data-testid="card-chart-gap-warning"]').exists()).toBe(false)
    expect(w.find('[data-testid="card-chart-history-gap-note"]').text()).toContain("1 earlier position")
  })
})

/**
 * §78.5 — the card's notice has to name the amount too, not only the count.
 *
 * The card and `PortfolioPerformanceChart` each carry their own copy of this
 * message, which is how the wording had already drifted once before: shipping
 * the amount to the chart alone left the card saying "7 earlier positions" while
 * the chart said "up to 10,465.32 PLN", on the same portfolio. Both now say it.
 */
describe("§78.5: the card's gap notice names the amount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("leads with the PEAK when the visible window has withheld value", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(
      analyticsWithGaps(["BST0922", "INS0922"], null, [32182, 21201], [0, 10465.38]),
    )
    const w = await mountCard()
    const note = w.find('[data-testid="card-chart-history-gap-note"]').text()
    expect(note).toMatch(/up to\s*PLN\s*10,465\.38/i)
    expect(note).toMatch(/today's value is complete/i)
    // 78.5: the count and the amount describe DIFFERENT windows, so the count
    // is dropped rather than merged. `gapSymbols` is window-wide (7, ever) while
    // the series here is timeframe-filtered - on 1Y none of those 7 were held in
    // the visible window, so "7 positions, up to 10,465 PLN" would be false.
    expect(note).not.toMatch(/2 earlier positions/)
  })

  it("puts the peak in the urgent banner when the gap is still held", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(
      analyticsWithGaps(["ROD0335"], ["ROD0335"], [100, 110], [16, 16]),
    )
    const w = await mountCard()
    const warn = w.find('[data-testid="card-chart-gap-warning"]').text()
    expect(warn).toContain("Value excludes 1 position")
    expect(warn).toMatch(/up to\s*PLN\s*16\.00/i)
  })

  it("says no amount at all when unpricedValue is absent — unknown, not zero", async () => {
    // A backend before §78.5 omits the field. Rendering "up to PLN 0.00" would
    // tell the user nothing is missing about a series that is short by 10,465.
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(
      analyticsWithGaps(["BST0922"], null, [100, 110], null),
    )
    const w = await mountCard()
    const note = w.find('[data-testid="card-chart-history-gap-note"]').text()
    expect(note).toContain("1 earlier position")
    expect(note).not.toMatch(/up to/i)
  })

  it("says no amount when every day is zero", async () => {
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue(
      analyticsWithGaps(["BST0922"], null, [100, 110], [0, 0]),
    )
    const w = await mountCard()
    expect(w.find('[data-testid="card-chart-history-gap-note"]').text()).not.toMatch(/up to/i)
  })
})
