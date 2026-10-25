import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PerformanceTabContent from "@/components/PerformanceTabContent.vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { getLatestRate } from "@/api/fx"

// §83.1 — the tab body mounted directly, with no store fetch and no router:
// everything it used to reach for is a prop or an emit. The per-portfolio cases
// stay in PortfolioPerformanceTab.test.ts (they exercise the wrapper's
// fetch/poll/recompute); this file covers the three things the extraction itself
// puts at risk — the tiles reading PROPS, the withheld tile hiding Timing, and
// the display-currency switch surviving without a remount.
// §85.2 adds one exception to "no router": the performer badges now link into
// research, so the component reads `useRoute()` for `from`. The route is mocked
// and RouterLink stubbed, and the test below asserts the wrapping link's `to`.

vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: "/en/portfolios/p1/performance" }),
  useRouter: () => ({ push: vi.fn() }),
}))

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
      capitalBasis: 900,
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
        // §149 — the capability has to reach the chart from the tab body, so
        // the stub surfaces both props it decides the overlay with: the flag
        // itself, and the `invested` value on the series it forwards.
        PortfolioPerformanceChart: {
          props: ["showInvested", "timeSeries", "benchmarks", "currency"],
          template:
            "<div data-testid='chart-stub' :data-show-invested='String(showInvested)' :data-invested='String(timeSeries?.[0]?.invested)' :data-benchmark='String(benchmarks?.[0]?.absoluteTimeSeries?.[0]?.value)' :data-currency='String(currency)' />",
        },
        InstrumentSearchModal: true,
        TickerBadge: true,
        // §85.2 — assert the wrapping link's `to`, not the badge (which is
        // stubbed to nothing). Rendering the slot keeps TickerBadge findable.
        RouterLink: {
          props: ["to"],
          template: "<a data-testid='research-link' :data-to='JSON.stringify(to)'><slot /></a>",
        },
      },
    },
  })
  await flushPromises()
  return wrapper
}

function tile(wrapper: Awaited<ReturnType<typeof mountContent>>, id: string) {
  return wrapper.get(`[data-testid="perf-overview-${id}"]`).text()
}

/**
 * The symbols in a performer card, IN RENDER ORDER. Ordering is the whole
 * subject of #171, so it is read back from the DOM rather than inferred.
 */
function cardRows(wrapper: Awaited<ReturnType<typeof mountContent>>, heading: string) {
  const card = wrapper
    .findAll(".card")
    .find((c) => c.find("h2").exists() && c.find("h2").text() === heading)
  if (!card) throw new Error(`no card headed ${heading}`)
  return card.findAll("[data-symbol]").map((li) => li.attributes("data-symbol"))
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

  it("reads net invested from the capitalBasis contract field", async () => {
    const wrapper = await mountContent({
      analytics: analytics({
        capitalBasis: 850,
        timeSeries: [
          { date: "2026-01-01", value: 1000, invested: 900, cumulativeTwr: 100 },
          { date: "2026-01-02", value: 1200, invested: 900, cumulativeTwr: 110 },
        ],
      }) as never,
    })
    expect(tile(wrapper, "net-invested")).toContain("850")
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

  it("converts the absolute benchmark series with the display currency", async () => {
    const wrapper = await mountContent({
      analytics: {
        ...analytics(),
        benchmarks: [{
          symbol: "SPY",
          name: "S&P 500",
          timeSeries: [{ date: "2026-01-01", value: 100 }],
          absoluteTimeSeries: [{ date: "2026-01-01", value: 1000 }],
        }],
      } as never,
    })
    expect(wrapper.get('[data-testid="chart-stub"]').attributes("data-benchmark")).toBe("1000")
    expect(wrapper.get('[data-testid="chart-stub"]').attributes("data-currency")).toBe("USD")

    mockedRate.mockResolvedValue({ rate: 0.25, asOf: "2026-10-02" } as never)
    useDisplayCurrencyStore().currency = "EUR"
    await flushPromises()

    expect(wrapper.get('[data-testid="chart-stub"]').attributes("data-benchmark")).toBe("250")
    expect(wrapper.get('[data-testid="chart-stub"]').attributes("data-currency")).toBe("EUR")
  })

  /**
   * §149 — a virtual portfolio has no invested book of its own, so the tab body
   * has to withhold the Net invested tile AND stop forwarding `invested` to the
   * chart. Both directions are asserted here; the chart-level behaviour of the
   * flag lives in PortfolioPerformanceChart.test.ts.
   */
  it("§149 — hides Net invested and withholds the chart's invested data for a virtual portfolio", async () => {
    const wrapper = await mountContent({ showInvested: false })
    // the withheld tile is gone, not rendered as a zero or an em dash
    expect(wrapper.find('[data-testid="perf-overview-net-invested"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="perf-overview"]').text()).not.toContain("Net invested")
    // the tiles a virtual portfolio DOES support are all still there, with their
    // real values: net gain, XIRR/TWR and the drawdown on the card below
    expect(tile(wrapper, "net-gain")).toContain("300")
    expect(tile(wrapper, "xirr")).toContain("14.50%")
    expect(tile(wrapper, "twr-pa")).toContain("11.25%")
    expect(wrapper.get('[data-testid="performance-max-drawdown"]').text()).toContain("10.00%")
    // and the chart is told both ways: flag off, and the series carries no
    // invested value that could be drawn as a substitute.
    const chart = wrapper.get('[data-testid="chart-stub"]')
    expect(chart.attributes("data-show-invested")).toBe("false")
    expect(chart.attributes("data-invested")).toBe("null")
  })

  it("§149 — keeps Net invested and forwards the chart data for a casual portfolio", async () => {
    const wrapper = await mountContent({ showInvested: true })
    expect(tile(wrapper, "net-invested")).toContain("900")
    const chart = wrapper.get('[data-testid="chart-stub"]')
    expect(chart.attributes("data-show-invested")).toBe("true")
    expect(chart.attributes("data-invested")).toBe("900")
    // and that is the default mode — an unset prop is a casual mount
    const casual = await mountContent()
    expect(casual.get('[data-testid="chart-stub"]').attributes("data-show-invested")).toBe("true")
    expect(tile(casual, "net-invested")).toContain("900")
  })

  it("emits update:timeframe instead of writing per-portfolio store state", async () => {
    const wrapper = await mountContent({ timeframe: "1Y" })
    // §82.3 — Yearly is unavailable off ALL, and the hint says why.
    expect(wrapper.get('[data-testid="perf-returns-mode-yearly"]').attributes("disabled")).toBeDefined()

    const all = wrapper.findAll("button").find((b) => b.text() === "ALL")!
    await all.trigger("click")
    expect(wrapper.emitted("update:timeframe")).toEqual([["ALL"]])
  })

  it("labels each performer row with its portfolio, and omits the line when null", async () => {
    // §83.5 — the reason the aggregate tab needs its own positions call: the same
    // ticker can sit in two portfolios with very different results, and a card
    // that does not say which one is answering half the question.
    const pos = (over: Record<string, unknown>) =>
      ({
        id: "p1",
        symbol: "AAPL",
        companyName: "Apple",
        assetType: "STOCK",
        instrumentCurrency: "USD",
        isOpen: true,
        unrealizedGainLoss: 100,
        percentageChange: 10,
        country: "US",
        ...over,
      }) as never

    const labelled = await mountContent({
      positions: [
        pos({ id: "a", symbol: "AAPL", portfolioName: "Broker" }),
        pos({ id: "b", symbol: "AAPL", portfolioName: "Pension", unrealizedGainLoss: 250 }),
      ] as never,
    })
    expect(labelled.find('[data-testid="perf-performer-portfolio-a"]').text()).toBe("Broker")
    expect(labelled.find('[data-testid="perf-performer-portfolio-b"]').text()).toBe("Pension")
    // Both rows are in the Top card, i.e. the list spans portfolios rather than
    // deduplicating by ticker. (Scoped to the first `ul`: with only two positions
    // the Top and Bottom cards legitimately show the same two, which is existing
    // behaviour and not what this test is about.)
    expect(labelled.findAll("ul")[0].findAll('[data-testid^="perf-performer-portfolio-"]')).toHaveLength(2)

    // The per-portfolio route sends `portfolioName: null` (or omits it), and the
    // line must disappear rather than render an empty row of text.
    const bare = await mountContent({ positions: [pos({ id: "a", portfolioName: null })] as never })
    expect(bare.find('[data-testid="perf-performer-portfolio-a"]').exists()).toBe(false)
  })

  it("links each performer badge to that symbol's research page (§85.2)", async () => {
    // Top/Bottom Performers were the two surfaces the audit found rendering a
    // TickerBadge with no way out of the page. Both lists get the same wrap, so
    // one position is enough to prove it: it appears in the Top card.
    const wrapper = await mountContent({
      positions: [
        {
          id: "a",
          symbol: "AAPL",
          companyName: "Apple",
          assetType: "STOCK",
          instrumentCurrency: "USD",
          isOpen: true,
          unrealizedGainLoss: 100,
          percentageChange: 10,
          country: "US",
        },
      ] as never,
    })

    const links = wrapper.findAll('[data-testid="research-link"]')
    expect(links.length).toBeGreaterThan(0)
    const link = links[0]!
    expect(JSON.parse(link.attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "AAPL" },
      query: { from: "/en/portfolios/p1/performance" },
    })
    // The badge is still inside the link, not re-parented beside it.
    expect(link.find("ticker-badge-stub").exists()).toBe(true)
  })

  it("does not toggle the benchmark checkbox when its symbol link is clicked (§85.3)", async () => {
    // The Chart-controls row is a <label> wrapping the row's checkbox, so a
    // plain link inside it toggles the benchmark as a side effect of navigating
    // — the user adds a comparison by clicking a symbol. Asserted by triggering
    // the click, not by reading the attribute: `.prevent.stop` is exactly the
    // thing that has to survive a refactor, and only the behaviour proves it.
    const wrapper = await mountContent({ selectedBenchmarks: [] })
    await wrapper.get('[data-testid="perf-controls-customize"]').trigger("click")

    const row = wrapper.findAll("label").find((l) => l.text().includes("S&P 500"))!
    expect(row.exists()).toBe(true)
    const checkbox = row.get('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)

    await row.get("a").trigger("click")

    // The click did not reach the label, so the checkbox is untouched…
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('[data-testid="perf-controls-benchmarks"]').text()).toContain("None")
    // …and the link still points at that symbol's research page.
    expect(JSON.parse(row.get("a").attributes("data-to")!).params.symbol).toBe("SPY")
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

/**
 * #171 — Top/Bottom Performers ranked raw `unrealizedGainLoss`, which is in the
 * position's OWN currency. On the live account that made PLW.WA (-PLN 1,559.92)
 * the "worst" while CSN.L (-£1,399.13) sat third, purely because 1559.92 > 1399.13
 * numerically. Converted at the real 2026-10-16 rates, CSN.L is about -$1,865.78
 * against PLW.WA's -$401.69 — the actual worst by a wide margin. The rates below
 * are the production values from /api/fx/latest, not invented ones.
 */
describe("PerformanceTabContent — #171 currency-aware performer ranking", () => {
  const FX: Record<string, number> = {
    "PLN/USD": 0.2575057,
    "GBP/USD": 1.3335308,
    "PLN/EUR": 0.24,
    "GBP/EUR": 0.1,
  }

  const resolveRates = async (from: string, to: string) => {
    const r = FX[`${from.toUpperCase()}/${to.toUpperCase()}`]
    return r ? ({ rate: r, asOf: "2026-10-16" } as never) : (null as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockedRate.mockImplementation(resolveRates)
  })

  const pos = (over: Record<string, unknown>) =>
    ({
      id: "p1",
      symbol: "TEST",
      companyName: "Test Co",
      assetType: "STOCK",
      instrumentCurrency: "USD",
      isOpen: true,
      unrealizedGainLoss: 0,
      percentageChange: 0,
      country: "US",
      ...over,
    }) as never

  // The production trio, with the raw numbers that produced the wrong order.
  const plw = () =>
    pos({ id: "plw", symbol: "PLW.WA", instrumentCurrency: "PLN", unrealizedGainLoss: -1559.92 })
  const csn = () =>
    pos({ id: "csn", symbol: "CSN.L", instrumentCurrency: "GBP", unrealizedGainLoss: -1399.13 })
  const are = () => pos({ id: "are", symbol: "ARE", instrumentCurrency: "USD", unrealizedGainLoss: -1058.6 })

  it("ranks both cards by CONVERTED P/L, so CSN.L is worst rather than third", async () => {
    const wrapper = await mountContent({ positions: [plw(), csn(), are()] as never })

    // Raw numbers sort PLW first; converted USD reverses that completely.
    expect(cardRows(wrapper, "Bottom Performers")).toEqual(["CSN.L", "ARE", "PLW.WA"])
    // Both cards are cut from the same converted ordering, so Top is its mirror.
    expect(cardRows(wrapper, "Top Performers")).toEqual(["PLW.WA", "ARE", "CSN.L"])

    // And the sub-line that was missing on the live GBP row is now present,
    // because the GBP rate is fetched for a position regardless of which card
    // it lands on.
    const csnRow = wrapper.get('[data-testid="perf-performer-row-csn"]')
    expect(csnRow.text()).toContain("-£1,399.13")
    expect(csnRow.text()).toContain("-$1,865")
  })

  it("fetches a rate for every open position's currency, not only the top card", async () => {
    // Six large USD positions crowd CSN.L out of any Top-5 by raw value. Under
    // the old `performers.top` scope its GBP rate was never requested, so it
    // could never be converted, so it could never be ranked — a position locked
    // out of both cards by its own absence from one of them.
    const usdCrowd = Array.from({ length: 6 }, (_, i) =>
      pos({ id: `u${i}`, symbol: `U${i}`, unrealizedGainLoss: 1000 - i }),
    )
    await mountContent({ positions: [...usdCrowd, csn()] as never })

    expect(mockedRate).toHaveBeenCalledWith("GBP", "USD")
  })

  it("excludes and NAMES a position whose FX rate is unavailable, rather than silently ranking it", async () => {
    // GBP has no rate — the pair cannot be resolved. Silently dropping CSN.L
    // would leave a card that looks complete; coercing it to 0 would rank it as
    // a flat position. Either way the user would be shown an ordering that
    // quietly disagrees with the money.
    mockedRate.mockImplementation(async (from: string, to: string) => {
      if (from.toUpperCase() === "GBP") return null as never
      return resolveRates(from, to)
    })

    const wrapper = await mountContent({ positions: [plw(), csn(), are()] as never })

    expect(cardRows(wrapper, "Bottom Performers")).toEqual(["ARE", "PLW.WA"])
    expect(cardRows(wrapper, "Top Performers")).toEqual(["PLW.WA", "ARE"])
    expect(wrapper.find('[data-testid="perf-performer-row-csn"]').exists()).toBe(false)

    // The exclusion is stated, with the symbol, the currency and the reason.
    const note = wrapper.get('[data-testid="perf-performers-unranked-list"]').text()
    expect(note).toContain("CSN.L")
    expect(note).toContain("GBP")
    expect(note).toContain("no rate available")
  })

  it("renders no caveat when every open position converts cleanly", async () => {
    const wrapper = await mountContent({ positions: [plw(), csn(), are()] as never })
    expect(wrapper.find('[data-testid="perf-performers-unranked"]').exists()).toBe(false)
  })

  it("re-ranks when the display currency changes, without a remount", async () => {
    const wrapper = await mountContent({ positions: [plw(), csn()] as never })
    expect(cardRows(wrapper, "Bottom Performers")).toEqual(["CSN.L", "PLW.WA"])

    // In EUR the pair flips: PLN -374.38 against GBP -139.91, so PLW.WA becomes
    // the worse of the two. A source-keyed rate cache would keep serving the
    // USD rates here and leave the order stale.
    useDisplayCurrencyStore().currency = "EUR"
    await flushPromises()

    expect(cardRows(wrapper, "Bottom Performers")).toEqual(["PLW.WA", "CSN.L"])
  })
})
