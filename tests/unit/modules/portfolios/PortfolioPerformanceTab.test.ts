import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioPerformanceTab, {
  benchmarkYearlyReturns,
  yearlyReturns,
  yearlyTotals,
} from "@/modules/portfolios/PortfolioPerformanceTab.vue"
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
/**
 * §82.3 / D88 — the per-year derivation. Fixtures use `invested = 100_000` and
 * `value = 100_000 + netGain`, so `value − invested` IS the net gain at each
 * point and the gain column is readable straight off the fixture.
 *
 * `cumulativeTwr` carries the stored 2 dp the backend writes
 * (`returnColumns.buildTwr` rounds `v * 10000 / 100`), so the fixture is built
 * at that precision rather than at the proposal's rounded percentages.
 */
const INVESTED = 100_000
const point = (date: string, twr: number, net: number) => ({
  date,
  value: INVESTED + net,
  invested: INVESTED,
  cumulativeTwr: twr,
})

/** The proposal's worked example: +24.1 / +18.2 / +11.4 / +4.3 %, gains 5,300 / 4,100 / 2,950 / 890. */
const WORKED = [
  point("2023-01-01", 100, 0),
  point("2023-06-30", 110, 2000), // mid-year: proves the row takes the LAST point of the year
  point("2023-12-31", 124.1, 5300),
  point("2024-06-30", 135, 7000),
  point("2024-12-31", 146.69, 9400),
  point("2025-12-31", 163.41, 12350),
  point("2026-09-30", 170.44, 13240),
]
const TODAY = new Date("2026-10-02T12:00:00")

describe("yearlyReturns (§82.3 / D88)", () => {
  it("reproduces the proposal's worked example", () => {
    const rows = yearlyReturns(WORKED, TODAY)
    expect(rows.map((r) => r.year)).toEqual([2023, 2024, 2025, 2026])
    expect(rows[0].twrPercent).toBeCloseTo(24.1, 1)
    expect(rows[1].twrPercent).toBeCloseTo(18.2, 1)
    expect(rows[2].twrPercent).toBeCloseTo(11.4, 1)
    expect(rows[3].twrPercent).toBeCloseTo(4.3, 1)
    expect(rows.map((r) => r.gain)).toEqual([5300, 4100, 2950, 890])
  })

  it("compounds to × 1.7044 and sums the gains to 13,240", () => {
    const t = yearlyTotals(yearlyReturns(WORKED, TODAY))
    expect(t.compounded).toBeCloseTo(1.7044, 4)
    expect(t.gain).toBeCloseTo(13240, 6)
  })

  /**
   * `Π(1 + twr)` reconciles exactly, and this is the property that catches a
   * wrong base year: it is the telescoping ratio of the stored index.
   */
  /**
   * §82.5 (PROD) — `Σ gains` reconciles to `totalReturn` ONLY when the series
   * opens at net 0. It telescopes to `net(last) − net(first)`, so on a series
   * that already carries a gain or a loss on its first snapshot day the two
   * differ by exactly that opening net.
   *
   * D88 asserted the two are equal. That is false in PROD: 6 of 10 portfolios
   * open non-zero (IKE Marek by −2 610.72, of which 2 605.72 is `unpriced_value`
   * — day-1 positions with no price bar), so the gap reaches 7% there and 45% on
   * Crypto. Every fixture opened at 0, which is why the original assertion passed
   * and the e2e passed, and why only a deploy to real data exposed it.
   *
   * The opening-net values are the data defect §78.1/§78.2 already own (XTB's
   * missing `Wpłata` row, IBKR / IKE Marek / IKE Beata's missing ledger rows).
   * §82 does not paper over it — but it must not assert it away either.
   */
  it("reconciles: Σ gains equals totalReturn MINUS the series' opening net", () => {
    const netOf = (p: { value: number; invested: number }) => p.value - p.invested
    const openingNet = netOf(WORKED[0])
    const totalReturn = netOf(WORKED[WORKED.length - 1])
    // WORKED opens at net 0, so the two coincide here — which is precisely why
    // this fixture could never have caught the false invariant.
    expect(openingNet).toBe(0)
    expect(yearlyTotals(yearlyReturns(WORKED, TODAY)).gain).toBeCloseTo(totalReturn - openingNet, 6)
  })

  it("shows the gap on a PROD-shaped series whose first day already carries a net loss", () => {
    // IKE Marek's shape: opens 2 610.72 under water, closes 37 314.36 over.
    const marek = [point("2021-10-22", 100, -2610.72), point("2021-12-31", 120, 10000), point("2022-12-31", 150, 37314.36)]
    const rows = yearlyReturns(marek, new Date("2026-10-02T12:00:00"))
    const sum = yearlyTotals(rows).gain
    const totalReturn = 37314.36 - 0
    expect(rows.map((r) => r.year)).toEqual([2021, 2022])
    // The Σ measures the change ACROSS the series …
    expect(sum).toBeCloseTo(37314.36 - -2610.72, 6)
    // … so it is 2 610.72 ABOVE the tile, which reports gain since inception.
    expect(sum - totalReturn).toBeCloseTo(2610.72, 6)
    // This is the assertion the old suite would have failed on.
    expect(sum).not.toBeCloseTo(totalReturn, 2)
  })

  it("reconciles: Π(1 + twr) equals cumulativeTwr(last) / cumulativeTwr(first)", () => {
    const compounded = yearlyTotals(yearlyReturns(WORKED, TODAY)).compounded
    const ratio = WORKED[WORKED.length - 1].cumulativeTwr! / WORKED[0].cumulativeTwr!
    expect(compounded).toBeCloseTo(ratio, 10)
  })

  it("marks only the current calendar year YTD", () => {
    const rows = yearlyReturns(WORKED, TODAY)
    expect(rows.map((r) => r.isYtd)).toEqual([false, false, false, true])
    // The same series read in 2027 has no YTD row — "current" is not a property
    // of the data.
    expect(yearlyReturns(WORKED, new Date("2027-01-05T12:00:00")).every((r) => !r.isYtd)).toBe(true)
  })

  /**
   * D88: the first year is based on the series' own FIRST point, so a series
   * that starts mid-year reports a partial year rather than against a base the
   * series does not contain.
   */
  it("bases the first year on the series' own first point", () => {
    const rows = yearlyReturns([point("2023-07-01", 100, 500), point("2023-12-31", 120, 2000)], TODAY)
    expect(rows).toHaveLength(1)
    // +20% from the first point, and the gain is measured from that point too —
    // not from a hypothetical 100 at 1 Jan that the series never contained.
    expect(rows[0].twrPercent).toBeCloseTo(20, 6)
    expect(rows[0].gain).toBe(1500)
  })

  it("differences the stored index — it does not re-chain or average monthly bars", () => {
    // +10% then −10% is −1%, not 0% and not +10%: the single most likely wrong
    // implementation of a yearly column (sum or average of the sub-periods).
    const rows = yearlyReturns(
      [point("2023-01-01", 100, 0), point("2023-06-30", 110, 500), point("2023-12-31", 99, 400)],
      TODAY,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].twrPercent).toBeCloseTo(-1, 6)
    // An averaging implementation would have printed +0.00% here.
    expect(rows[0].twrPercent).not.toBeCloseTo(0, 3)
  })

  it("skips a year with no TWR index rather than reporting 0.00%", () => {
    const series = [point("2023-01-01", 100, 0), point("2023-12-31", 110, 500), { date: "2024-12-31", value: 1200, invested: 1000 }]
    const rows = yearlyReturns(series, TODAY)
    expect(rows.map((r) => r.year)).toEqual([2023])
  })

  it("returns nothing for an empty or undated series", () => {
    expect(yearlyReturns([], TODAY)).toEqual([])
    expect(yearlyReturns([{ value: 1 }], TODAY)).toEqual([])
  })

  it("sorts unordered input rather than trusting arrival order", () => {
    const rows = yearlyReturns([...WORKED].reverse(), TODAY)
    expect(rows.map((r) => r.year)).toEqual([2023, 2024, 2025, 2026])
    expect(rows[0].twrPercent).toBeCloseTo(24.1, 1)
  })
})

describe("PortfolioPerformanceTab — §82.3 Monthly | Yearly toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getPortfolioRiskMetrics.mockResolvedValue({ maxDrawdown: -0.1 } as never)
    mocked.getPortfolioAnalytics.mockResolvedValue(analytics() as never)
    mockedRate.mockResolvedValue({ rate: 1, asOf: "2026-10-02" } as never)
  })

  async function mountWithSeries(timeframe: "ALL" | "1Y" | "3M") {
    const env = makeEnv("USD")
    const store = usePortfolioStore()
    store.analyticsTimeframe = timeframe
    store.analytics = {
      ...analytics(),
      timeframe,
      performance: {
        ...analytics().performance,
        timeSeries: WORKED,
        totalReturn: 13240,
        totalInvested: INVESTED,
        totalValue: INVESTED + 13240,
      },
    } as never
    const wrapper = await mountTab(env)
    return { wrapper, store }
  }

  it("defaults to Monthly and shows the bar chart", async () => {
    const { wrapper } = await mountWithSeries("ALL")
    expect(wrapper.get('[data-testid="perf-returns-mode-monthly"]').attributes("aria-pressed")).toBe("true")
    expect(wrapper.find('[data-testid="perf-returns-yearly"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: "apexchart" }).exists()).toBe(true)
  })

  it("switches to the yearly table", async () => {
    const { wrapper } = await mountWithSeries("ALL")
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.find('[data-testid="perf-returns-yearly"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: "apexchart" }).exists()).toBe(false)
    expect(wrapper.get('[data-testid="perf-returns-yearly-row-2023"]').text()).toContain("2023")
  })

  it("marks the current year YTD and never annualises it", async () => {
    const { wrapper } = await mountWithSeries("ALL")
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.get('[data-testid="perf-returns-yearly-row-2026"]').text()).toContain("YTD")
    expect(wrapper.get('[data-testid="perf-returns-yearly-row-2025"]').text()).not.toContain("YTD")
  })

  it("shows the Σ row as a compounded product, not a sum of percentages", async () => {
    const { wrapper } = await mountWithSeries("ALL")
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-product"]').text()).toBe("× 1.7044")
    // A sum would read "+58.00%" — the exact misreading the Σ row exists to prevent.
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-product"]').text()).not.toContain("58")
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-gain"]').text()).toContain("13,240")
  })

  it("makes the Σ gain footer equal the Net gain tile on screen", async () => {
    const { wrapper } = await mountWithSeries("ALL")
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-gain"]').text()).toBe(
      wrapper.get('[data-testid="perf-overview-net-gain"]').text(),
    )
  })

  it("keeps the Σ footer equal to the Net gain tile after a display-currency switch", async () => {
    // They share one rate on purpose (§82.3) — a regression in either is one
    // assertion away, which is the point of pinning them to each other.
    const { wrapper } = await mountWithSeries("ALL")
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    mockedRate.mockResolvedValue({ rate: 4, asOf: "2026-10-02" } as never)
    useDisplayCurrencyStore().setCurrency("PLN")
    await flushPromises()
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-gain"]').text()).toBe(
      wrapper.get('[data-testid="perf-overview-net-gain"]').text(),
    )
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-gain"]').text()).toContain("52,960")
  })

  it("converts each year's gain through the same rate", async () => {
    mockedRate.mockResolvedValue({ rate: 4, asOf: "2026-10-02" } as never)
    const env = makeEnv("USD")
    useDisplayCurrencyStore().setCurrency("PLN")
    const store = usePortfolioStore()
    store.analyticsTimeframe = "ALL"
    store.analytics = { ...analytics(), performance: { ...analytics().performance, timeSeries: WORKED } } as never
    const wrapper = await mountTab(env)
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.get('[data-testid="perf-returns-yearly-gain-2023"]').text()).toContain("21,200")
  })

  it("disables Yearly off ALL and says why", async () => {
    const { wrapper } = await mountWithSeries("3M")
    expect(wrapper.get('[data-testid="perf-returns-mode-yearly"]').attributes("disabled")).toBeDefined()
    expect(wrapper.get('[data-testid="perf-returns-yearly-hint"]').text()).toContain("ALL")
    expect(wrapper.find('[data-testid="perf-returns-yearly"]').exists()).toBe(false)
  })

  it("forces Monthly on a non-ALL timeframe even if Yearly was chosen", async () => {
    // `analytics` is timeframe-filtered server-side, so a 3M window holds no year.
    const { wrapper, store } = await mountWithSeries("ALL")
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.find('[data-testid="perf-returns-yearly"]').exists()).toBe(true)

    store.analyticsTimeframe = "3M"
    await flushPromises()
    expect(wrapper.find('[data-testid="perf-returns-yearly"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="perf-returns-mode-monthly"]').attributes("aria-pressed")).toBe("true")

    // ...and restores it on the way back, with no second fetch.
    store.analyticsTimeframe = "ALL"
    await flushPromises()
    expect(wrapper.find('[data-testid="perf-returns-yearly"]').exists()).toBe(true)
  })

  it("issues no second ALL fetch to satisfy Yearly", async () => {
    const { wrapper } = await mountWithSeries("ALL")
    mocked.getPortfolioAnalytics.mockClear()
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    await flushPromises()
    expect(mocked.getPortfolioAnalytics).not.toHaveBeenCalled()
  })
})

/**
 * §82.4 / D89 — a benchmark mirroring the portfolio's years. `value` is the
 * route's normalised index (starts at 100), so it IS the benchmark's TWR.
 * Chosen so every year's excess is hand-computable from the portfolio's own
 * percentages in `WORKED`: +20 / +12 / +9 / +3 % → +4.1 / +6.2 / +2.4 / +1.3 pp.
 */
const BENCH_STRONG = [
  { date: "2023-01-01", value: 100 },
  { date: "2023-12-31", value: 140 },
  { date: "2024-12-31", value: 168 },
  { date: "2025-12-31", value: 201.6 },
  { date: "2026-09-30", value: 207.6 },
]
const BENCH = [
  { date: "2023-01-01", value: 100 },
  { date: "2023-12-31", value: 120 },  // +20% exactly
  { date: "2024-12-31", value: 144 },  // +20% exactly
  { date: "2025-12-31", value: 180 },  // +25% exactly
  { date: "2026-09-30", value: 189 },  // +5% exactly
]

describe("benchmarkYearlyReturns (§82.4 / D89)", () => {
  it("reads the benchmark's own index year by year", () => {
    const rows = benchmarkYearlyReturns(BENCH, TODAY)
    expect(rows.map((r) => r.year)).toEqual([2023, 2024, 2025, 2026])
    rows.forEach((r, i) => expect(r.twrPercent).toBeCloseTo([20, 20, 25, 5][i], 9))
  })

  it("ignores gain — the benchmark series has no invested line to difference", () => {
    // The shared walk computes a `gain` from `value − invested`; on a benchmark
    // `invested` is absent, so that number is meaningless and nothing reads it.
    const first = benchmarkYearlyReturns(BENCH, TODAY)[0]
    expect(Object.keys(first).sort()).toEqual(["twrPercent", "year"])
    expect(first.year).toBe(2023)
    expect(first.twrPercent).toBeCloseTo(20, 10)
  })

  it("returns nothing for an empty benchmark series", () => {
    expect(benchmarkYearlyReturns([], TODAY)).toEqual([])
  })
})

describe("PortfolioPerformanceTab — §82.4 excess column", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getPortfolioRiskMetrics.mockResolvedValue({ maxDrawdown: -0.1 } as never)
    mocked.getPortfolioAnalytics.mockResolvedValue(analytics() as never)
    mockedRate.mockResolvedValue({ rate: 1, asOf: "2026-10-02" } as never)
  })

  async function mountWithBenchmarks(benchmarks: Array<Record<string, unknown>>) {
    const env = makeEnv("USD")
    const store = usePortfolioStore()
    store.analyticsTimeframe = "ALL"
    store.analytics = {
      ...analytics(),
      timeframe: "ALL",
      benchmarks,
      performance: { ...analytics().performance, timeSeries: WORKED, totalReturn: 13240 },
    } as never
    const wrapper = await mountTab(env)
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    return wrapper
  }

  const spy = () => [{ symbol: "SPY", name: "S&P 500", timeSeries: BENCH, returnPercent: 50.9 }]

  it("adds the column, headed with the benchmark's symbol", async () => {
    const wrapper = await mountWithBenchmarks(spy())
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-header"]').text()).toBe("vs SPY")
  })

  it("shows portfolio year TWR − benchmark year TWR per year", async () => {
    const wrapper = await mountWithBenchmarks(spy())
    // Portfolio 24.100 / 18.203 / 11.398 / 4.302 % minus the benchmark's exact
    // 20 / 20 / 25 / 5 % — the stored 2 dp index, differenced, then subtracted.
    // Hand-computed from the fixture, so a change in either derivation lands here.
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2023"]').text()).toBe("+4.10%")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2024"]').text()).toBe("-1.80%")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2025"]').text()).toBe("-13.60%")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2026"]').text()).toBe("-0.70%")
  })

  it("renders a negative excess as negative", async () => {
    // A UNIFORM scale-up would prove nothing: `value` is already normalised to
    // 100, so multiplying every point by 1.5 leaves every yearly return identical.
    // The benchmark has to be genuinely steeper, not merely bigger.
    const lagging = [{ symbol: "QQQ", timeSeries: BENCH_STRONG }]
    const wrapper = await mountWithBenchmarks(lagging)
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-header"]').text()).toBe("vs QQQ")
    // 24.100 − 40.0 = −15.90
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2023"]').text()).toBe("-15.90%")
  })

  it("uses the FIRST selected benchmark only", async () => {
    const wrapper = await mountWithBenchmarks([
      ...spy(),
      { symbol: "QQQ", timeSeries: BENCH.map((p) => ({ date: p.date, value: p.value * 1.5 })) },
    ])
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-header"]').text()).toBe("vs SPY")
    expect(wrapper.findAll('[data-testid^="perf-returns-yearly-excess-header"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2023"]').text()).toBe("+4.10%")
  })

  it("says 'no total' rather than rendering a Σ that would look additive", async () => {
    // Excess returns compound but do not sum: 4.1 + 6.2 + 2.4 + 1.3 = +14.0 pp is
    // not what the portfolio actually beat the benchmark by.
    const wrapper = await mountWithBenchmarks(spy())
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-total"]').text()).toBe("no total")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-total"]').text()).not.toContain("14")
  })

  it("omits the column entirely when no benchmark is selected", async () => {
    const wrapper = await mountWithBenchmarks([])
    expect(wrapper.find('[data-testid="perf-returns-yearly-excess-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="perf-returns-yearly-excess-2023"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="perf-returns-yearly-excess-total"]').exists()).toBe(false)
    // …and the rest of the table is unaffected.
    expect(wrapper.get('[data-testid="perf-returns-yearly-twr-2023"]').text()).toBe("+24.10%")
    expect(wrapper.get('[data-testid="perf-returns-yearly-total-product"]').text()).toBe("× 1.7044")
  })

  it("renders — for a year the benchmark has no row, not 0.00%", async () => {
    const partial = [{ symbol: "SPY", timeSeries: [BENCH[0], BENCH[1]] }] // 2023 only
    const wrapper = await mountWithBenchmarks(partial)
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2023"]').text()).toBe("+4.10%")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2024"]').text()).toBe("—")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2024"]').text()).not.toContain("0.00%")
  })

  it("does not convert the excess column — a percentage is not money", async () => {
    mockedRate.mockResolvedValue({ rate: 4, asOf: "2026-10-02" } as never)
    const env = makeEnv("USD")
    useDisplayCurrencyStore().setCurrency("PLN")
    const store = usePortfolioStore()
    store.analyticsTimeframe = "ALL"
    store.analytics = {
      ...analytics(),
      timeframe: "ALL",
      benchmarks: spy(),
      performance: { ...analytics().performance, timeSeries: WORKED },
    } as never
    const wrapper = await mountTab(env)
    await wrapper.get('[data-testid="perf-returns-mode-yearly"]').trigger("click")
    expect(wrapper.get('[data-testid="perf-returns-yearly-excess-2023"]').text()).toBe("+4.10%")
  })
})
