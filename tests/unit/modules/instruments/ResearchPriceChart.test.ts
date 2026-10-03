import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { createPinia } from "pinia"
import PriceChart from "@/components/PriceChart.vue"
import { getHistory, getPriceBars } from "@/api/instruments"
import { getAllTransactions, getPortfolioTransactions } from "@/api/portfolios"

vi.mock("@/api/instruments", () => ({
  getHistory: vi.fn(),
  getPriceBars: vi.fn().mockResolvedValue({
    symbol: "AAPL",
    timeframe: "daily",
    stale: false,
    currency: null,
    baseCurrency: null,
    fxFrom: null,
    dates: [],
    closes: [],
  }),
}))

vi.mock("@/api/portfolios", () => ({
  getAllTransactions: vi.fn(),
  getPortfolioTransactions: vi.fn(),
}))

// §48.5 — the title selector reads the shared currency registry; keep the
// unit test off the network (the e2e stack exercises the real registry).
// §56.3 — the mock is reactive + configurable (via __currenciesState) so
// currency-refusal tests can show the selector.
vi.mock("@/stores/currencies", async () => {
  const { reactive } = await import("vue")
  const state = reactive({ options: [] as unknown[], loaded: false, load: vi.fn().mockResolvedValue(undefined) })
  return {
    useCurrenciesStore: () => state,
    __currenciesState: state,
  }
})

const mockedGetHistory = vi.mocked(getHistory)
const mockedGetAllTransactions = vi.mocked(getAllTransactions)
const mockedGetPortfolioTransactions = vi.mocked(getPortfolioTransactions)
const mockedGetPriceBars = vi.mocked(getPriceBars)
const { __currenciesState: currenciesMock } = (await import("@/stores/currencies")) as unknown as {
  __currenciesState: { options: unknown[]; loaded: boolean }
}

function makeHistory() {
  return {
    symbol: "AAPL",
    closePrices: [100, 110, 121, 110, 132, 140],
    highPrices: [100, 110, 121, 110, 132, 140],
    lowPrices: [100, 110, 121, 110, 132, 140],
    openPrices: [100, 110, 121, 110, 132, 140],
    volumes: [1, 2, 3, 4, 5, 6],
    timestamps: [1754870400, 1754956800, 1755043200, 1755129600, 1755216000, 1755302400],
    status: "ok",
    currency: "USD",
  }
}

function makeTxPage(items: ReturnType<typeof makeTx>[] = []) {
  return { items, total: items.length, page: 1, limit: 500, totalPages: 1, hasNext: false, hasPrevious: false }
}

function mountChart(props = {}) {
  return mount(PriceChart, {
    props: { symbol: "AAPL", ...props },
    global: { plugins: [createPinia()], stubs: { apexchart: true } },
  })
}

async function checkTransactions(wrapper: ReturnType<typeof mountChart>) {
  const cb = wrapper.find('input[type="checkbox"]')
  await cb.setValue(true)
  await flushPromises()
}

function makeTx(tx: { id: string; type: string; executedAt: string; quantity?: number; price?: number; instrumentSymbol?: string }) {
  const qty = tx.quantity ?? 10
  const price = tx.price ?? 180
  return {
    id: tx.id,
    portfolioId: "p1",
    portfolioName: "P1",
    walletId: "w1",
    positionId: null,
    type: tx.type,
    instrumentSymbol: tx.instrumentSymbol ?? "AAPL",
    instrumentName: "Apple",
    quantity: qty,
    price,
    fees: 0,
    totalAmount: qty * price,
    currency: "USD",
    priceCurrency: "USD",
    instrumentCurrency: "USD",
    assetType: "equity",
    isGift: false,
    synthesizedOpeningLot: false,
    executedAt: tx.executedAt,
    createdAt: tx.executedAt,
    displayCurrency: "USD",
    convertedTotalAmount: qty * price,
    convertedPrice: price,
    convertedFees: 0,
    labels: undefined,
  }
}

async function mountTxChart(txs: { id: string; type: string; executedAt: string; quantity?: number; price?: number }[]) {
  mockedGetPortfolioTransactions.mockResolvedValue(makeTxPage(txs.map(makeTx)))
  const wrapper = mountChart({ portfolioId: "p1" })
  await flushPromises()
  await checkTransactions(wrapper)
  await flushPromises()
  return wrapper
}

function refLinesOf(wrapper: ReturnType<typeof mountChart>) {
  return (
    wrapper.vm as unknown as {
      chartOptions: {
        annotations: {
          yaxis: Array<{ y: number; borderColor: string; strokeDashArray: number; label: { text: string } }>
        }
      }
    }
  ).chartOptions.annotations.yaxis
}

describe("PriceChart", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetHistory.mockResolvedValue(makeHistory())
    mockedGetAllTransactions.mockResolvedValue(makeTxPage([]))
    mockedGetPortfolioTransactions.mockResolvedValue(makeTxPage([]))
    mockedGetPriceBars.mockResolvedValue({
      symbol: "AAPL",
      timeframe: "daily",
      stale: false,
      currency: "USD",
      baseCurrency: "USD",
      fxFrom: null,
      dates: ["2026-08-18", "2026-08-19"],
      closes: [180, 182],
    })
    currenciesMock.options = [{ code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true }]
    currenciesMock.loaded = false
  })

  it("fetches daily history for the symbol", async () => {
    mountChart()
    await flushPromises()
    expect(mockedGetHistory).toHaveBeenCalledWith("AAPL", "daily", undefined, null)
  })

  it("switches between price and percent modes", async () => {
    const wrapper = mountChart()
    await flushPromises()

    const percent = wrapper.findAll("button").find((b) => b.text() === "Percent")!
    await percent.trigger("click")
    await flushPromises()

    const options = wrapper.vm.$data
    expect(options).toBeDefined()
  })

  it("fetches a benchmark when comparison is selected", async () => {
    const wrapper = mountChart()
    await flushPromises()

    await wrapper.findAll("button").find((b) => b.text().includes("Add comparison"))!.trigger("click")
    await flushPromises()

    await wrapper.findAll("button").find((b) => b.text().includes("S&P 500"))!.trigger("click")
    await flushPromises()

    expect(mockedGetHistory).toHaveBeenCalledWith("AAPL", "daily", "spy", null)
  })

  it("renders timeframe buttons", async () => {
    const wrapper = mountChart()
    await flushPromises()

    for (const t of ["1D", "5D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "YTD", "MAX"]) {
      expect(wrapper.findAll("button").some((b) => b.text() === t)).toBe(true)
    }
  })

  it("shows Total Chg and CAGR for the default 1Y range", async () => {
    const wrapper = mountChart()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain("Total Chg")
    expect(text).toContain("CAGR")
    expect(text).toContain("Powered by Example service")
  })

  it("renders a Transactions checkbox that is unchecked by default", async () => {
    const wrapper = mountChart()
    await flushPromises()
    const cb = wrapper.find('input[type="checkbox"]')
    expect(cb.exists()).toBe(true)
    expect((cb.element as HTMLInputElement).checked).toBe(false)
  })

  it("checks the Transactions checkbox when defaultShowTransactions is true", async () => {
    const wrapper = mountChart({ defaultShowTransactions: true })
    await flushPromises()
    const cb = wrapper.find('input[type="checkbox"]')
    expect((cb.element as HTMLInputElement).checked).toBe(true)
  })

  it("fetches across all portfolios when no portfolioId is given (Research context)", async () => {
    const wrapper = mountChart()
    await flushPromises()
    await checkTransactions(wrapper)
    expect(mockedGetAllTransactions).toHaveBeenCalledWith(1, 500, "date", "asc", undefined, "AAPL")
    expect(mockedGetPortfolioTransactions).not.toHaveBeenCalled()
  })

  it("fetches from the given portfolio when portfolioId prop is present", async () => {
    const wrapper = mountChart({ portfolioId: "p1" })
    await flushPromises()
    await checkTransactions(wrapper)
    expect(mockedGetPortfolioTransactions).toHaveBeenCalledWith("p1", 1, 500, "date", "asc", undefined, undefined, "AAPL")
    expect(mockedGetAllTransactions).not.toHaveBeenCalled()
  })

  it("unchecking the Transactions checkbox clears transactions", async () => {
    const wrapper = mountChart()
    await flushPromises()
    await checkTransactions(wrapper)
    expect(mockedGetAllTransactions).toHaveBeenCalledTimes(1)

    const cb = wrapper.find('input[type="checkbox"]')
    await cb.setValue(false)
    await flushPromises()

    expect((wrapper.vm as unknown as { transactions: unknown[] }).transactions).toEqual([])
  })

  it("renders transaction markers when transactions are checked", async () => {
    const date = makeHistory().timestamps[0]
    const wrapper = await mountTxChart([
      { id: "t1", type: "BUY", executedAt: new Date(date * 1000).toISOString() },
    ])
    const opts = (wrapper.vm as unknown as { chartOptions: { annotations: { points: unknown[] } } }).chartOptions
    expect(opts.annotations.points.length).toBe(1)
    const p = opts.annotations.points[0] as { x: number; marker: { fillColor: string; offsetY: number } }
    // The x-axis is numeric and 1-based, so bar 0 is x=1. A raw 0-based index
    // here is what ApexCharts used to read as a pixel offset from the grid's
    // left edge (and then drop the marker once the index passed the width).
    expect(p.x).toBe(1)
    expect(p.marker.offsetY).toBe(0)
    expect(p.marker.fillColor).toBe("#16a34a")
  })

  it("addresses the x-axis numerically, with dates only as tick labels", async () => {
    const wrapper = await mountTxChart([])
    const opts = (wrapper.vm as unknown as {
      chartOptions: { xaxis: { type: string; categories?: unknown; labels: { formatter: (v: number) => string } } }
      series: { dates: string[] }
    })
    const xaxis = opts.chartOptions.xaxis
    // A category axis cannot place a numeric annotation x (see the note in
    // chartOptions), so the axis must be numeric and carry no `categories`.
    expect(xaxis.type).toBe("numeric")
    expect(xaxis.categories).toBeUndefined()
    const dates = opts.series.dates
    expect(dates.length).toBeGreaterThan(0)
    // Tick labels still read as dates, and out-of-range ticks stay blank.
    expect(xaxis.labels.formatter(1)).toBe(dates[0])
    expect(xaxis.labels.formatter(dates.length)).toBe(dates[dates.length - 1])
    expect(xaxis.labels.formatter(0)).toBe("")
    expect(xaxis.labels.formatter(dates.length + 5)).toBe("")
  })

  it("stacks multiple same-date transactions with vertical offsets", async () => {
    const date = makeHistory().timestamps[2]
    const iso = new Date(date * 1000).toISOString()
    const wrapper = await mountTxChart([
      { id: "t1", type: "BUY", executedAt: iso },
      { id: "t2", type: "SELL", executedAt: iso },
      { id: "t3", type: "BUY", executedAt: iso },
    ])
    const points = (wrapper.vm as unknown as { chartOptions: { annotations: { points: { marker: { offsetY: number } }[] } } }).chartOptions.annotations.points
    expect(points.length).toBe(3)
    expect(points.map((p) => p.marker.offsetY)).toEqual([0, -8, -16])
  })

  it("handles uppercase API transaction types for markers and FIFO lines", async () => {
    const date = makeHistory().timestamps[0]
    const iso = new Date(date * 1000).toISOString()
    const wrapper = await mountTxChart([
      { id: "t1", type: "BUY", executedAt: iso, quantity: 10, price: 180 },
      { id: "t2", type: "SELL", executedAt: iso, quantity: 5, price: 200 },
    ])
    const opts = (wrapper.vm as unknown as { chartOptions: { annotations: { points: { marker: { fillColor: string } }[]; yaxis: { y: number }[] } } }).chartOptions.annotations
    // Both transactions on the same date produce two markers (buys before sells).
    expect(opts.points.length).toBe(2)
    expect(opts.points[0].marker.fillColor).toBe("#16a34a")
    expect(opts.points[1].marker.fillColor).toBe("#dc2626")
    // FIFO on the visible range yields Avg + Low/High lines.
    expect(opts.yaxis.length).toBe(3)
  })

  it("brackets Low/High with sell prices too, not buys only", async () => {
    const ts = makeHistory().timestamps
    const wrapper = await mountTxChart([
      { id: "t1", type: "BUY", executedAt: new Date(ts[0] * 1000).toISOString(), quantity: 10, price: 180 },
      { id: "t2", type: "SELL", executedAt: new Date(ts[1] * 1000).toISOString(), quantity: 5, price: 220 },
    ])
    const texts = refLinesOf(wrapper).map((l) => l.label.text)
    // A sell above every buy used to be excluded, leaving "High $180.00" with a
    // red marker sitting above it (TSM in PROD: sold 101.75, line read 100.99).
    expect(texts).toContain("High $220.00")
    expect(texts).toContain("Low $180.00")
    expect(texts).not.toContain("High $180.00")
  })

  it("loads transactions on mount when the box starts ticked", async () => {
    mockedGetPortfolioTransactions.mockResolvedValue(
      makeTxPage([makeTx({ id: "t1", type: "BUY", executedAt: new Date(makeHistory().timestamps[0] * 1000).toISOString() })]),
    )
    // The holdings view passes defaultShowTransactions, so the box renders
    // ticked on mount. Nothing fetched them: markers and FIFO lines stayed
    // invisible until the timeframe changed or the box was cycled.
    const wrapper = mountChart({ portfolioId: "p1", defaultShowTransactions: true })
    await flushPromises()
    expect(mockedGetPortfolioTransactions).toHaveBeenCalled()
    expect((wrapper.vm as unknown as { transactions: unknown[] }).transactions.length).toBe(1)
    const points = (wrapper.vm as unknown as { chartOptions: { annotations: { points: unknown[] } } }).chartOptions.annotations.points
    expect(points.length).toBe(1)
  })

  it("does not render markers outside the visible range", async () => {
    const future = new Date("2030-01-01T12:00:00Z").toISOString()
    const wrapper = await mountTxChart([{ id: "t1", type: "BUY", executedAt: future }])
    const points = (wrapper.vm as unknown as { chartOptions: { annotations: { points: unknown[] } } }).chartOptions.annotations.points
    expect(points.length).toBe(0)
  })

  it("snaps transactions on non-trading days to the nearest bar", async () => {
    const timestamps = [1754870400, 1754956800, 1755043200, 1755216000, 1755302400]
    mockedGetHistory.mockResolvedValue({ ...makeHistory(), timestamps })
    const gapDate = new Date((timestamps[2] + 86400) * 1000).toISOString()
    const wrapper = await mountTxChart([{ id: "t1", type: "BUY", executedAt: gapDate }])
    const points = (wrapper.vm as unknown as { chartOptions: { annotations: { points: { x: number }[] } } }).chartOptions.annotations.points
    expect(points.length).toBe(1)
    expect(points[0].x).toBe(3)
    const vm = wrapper.vm as unknown as {
      chartOptions: { tooltip: { custom: (args: { series: number[][]; dataPointIndex: number; w: { config: { series: { name: string }[] } } }) => string } }
    }
    const html = vm.chartOptions.tooltip.custom({ series: [[100]], dataPointIndex: 2, w: { config: { series: [{ name: "AAPL" }] } } })
    expect(html).toContain("Transactions:")
  })

  it("wires a custom tooltip function", async () => {
    const wrapper = await mountTxChart([])
    const custom = (wrapper.vm as unknown as { chartOptions: { tooltip: { custom: unknown } } }).chartOptions.tooltip.custom
    expect(typeof custom).toBe("function")
  })

  it("renders transaction rows in the tooltip on dates with transactions", async () => {
    const date = makeHistory().timestamps[0]
    const wrapper = await mountTxChart([
      { id: "t1", type: "BUY", executedAt: new Date(date * 1000).toISOString() },
    ])
    const vm = wrapper.vm as unknown as {
      chartOptions: { tooltip: { custom: (args: { series: number[][]; dataPointIndex: number; w: { config: { series: { name: string }[] } } }) => string } }
    }
    const args = {
      series: [[100]],
      dataPointIndex: 0,
      w: { config: { series: [{ name: "AAPL" }] } },
    }
    const html = vm.chartOptions.tooltip.custom(args)
    expect(html).toContain("Transactions:")
    expect(html).toContain("Buy")
    expect(html).toContain("@")
  })

  it("does not render a transactions section on dates without transactions", async () => {
    const wrapper = await mountTxChart([])
    const vm = wrapper.vm as unknown as {
      chartOptions: { tooltip: { custom: (args: { series: number[][]; dataPointIndex: number; w: { config: { series: { name: string }[] } } }) => string } }
    }
    const args = {
      series: [[100]],
      dataPointIndex: 1,
      w: { config: { series: [{ name: "AAPL" }] } },
    }
    const html = vm.chartOptions.tooltip.custom(args)
    expect(html).toContain("AAPL")
    expect(html).not.toContain("Transactions:")
  })

  it("computes FIFO avg cost + Low/High lines for buys in the visible range", async () => {
    const d = makeHistory().timestamps
    const wrapper = await mountTxChart([
      { id: "b1", type: "BUY", executedAt: new Date(d[0] * 1000).toISOString(), quantity: 10, price: 100 },
      { id: "b2", type: "BUY", executedAt: new Date(d[1] * 1000).toISOString(), quantity: 10, price: 200 },
      { id: "s1", type: "SELL", executedAt: new Date(d[2] * 1000).toISOString(), quantity: 5, price: 150 },
    ])
    const lines = refLinesOf(wrapper)
    // FIFO: after buying 10@100 + 10@200, selling 5 -> sells 5 of the 100 lot first.
    // remaining: 5@100 + 10@200 = 15 qty, totalCost = 5*100 + 10*200 = 2500, avg = 2500/15 = 166.67
    const avg = lines.find((l) => l.borderColor === "#2563eb")
    expect(avg).toBeDefined()
    expect(avg!.y).toBeCloseTo(166.67, 1)
    expect(avg!.strokeDashArray).toBe(6)
    const low = lines.find((l) => l.borderColor === "#16a34a")
    const high = lines.find((l) => l.borderColor === "#dc2626")
    expect(low!.y).toBe(100)
    expect(low!.strokeDashArray).toBe(4)
    expect(high!.y).toBe(200)
    expect(high!.strokeDashArray).toBe(4)
  })

  it("omits the Avg line when the position is fully sold in range but keeps Low/High", async () => {
    const d = makeHistory().timestamps
    const wrapper = await mountTxChart([
      { id: "b1", type: "BUY", executedAt: new Date(d[0] * 1000).toISOString(), quantity: 10, price: 100 },
      { id: "s1", type: "SELL", executedAt: new Date(d[1] * 1000).toISOString(), quantity: 10, price: 150 },
    ])
    const lines = refLinesOf(wrapper)
    expect(lines.find((l) => l.borderColor === "#2563eb")).toBeUndefined()
    expect(lines.find((l) => l.borderColor === "#16a34a")!.y).toBe(100)
    // High spans the sell too (150), not just the buy (100).
    expect(lines.find((l) => l.borderColor === "#dc2626")!.y).toBe(150)
  })

  it("ignores transactions from other instruments for reference lines and markers", async () => {
    const d = makeHistory().timestamps
    const ownIso = new Date(d[0] * 1000).toISOString()
    const own = makeTx({ id: "own", type: "BUY", executedAt: ownIso, quantity: 10, price: 271.01, instrumentSymbol: "AAPL" })
    const other = makeTx({ id: "other", type: "BUY", executedAt: ownIso, quantity: 10, price: 89, instrumentSymbol: "SAP.DE" })
    mockedGetPortfolioTransactions.mockResolvedValue(makeTxPage([own, other]))
    const wrapper = mountChart({ portfolioId: "p1" })
    await flushPromises()
    await checkTransactions(wrapper)
    await flushPromises()

    const lines = refLinesOf(wrapper)
    // Only the AAPL buy counts -> Low === High === 271.01 (overlap).
    expect(lines.find((l) => l.borderColor === "#16a34a")!.y).toBe(271.01)
    expect(lines.find((l) => l.borderColor === "#dc2626")!.y).toBe(271.01)

    const points = (wrapper.vm as unknown as { chartOptions: { annotations: { points: unknown[] } } }).chartOptions.annotations.points
    expect(points.length).toBe(1)
  })

  it("hides reference lines in Percent mode", async () => {
    const d = makeHistory().timestamps
    const wrapper = await mountTxChart([
      { id: "b1", type: "BUY", executedAt: new Date(d[0] * 1000).toISOString(), quantity: 10, price: 100 },
    ])
    const percent = wrapper.findAll("button").find((b) => b.text() === "Percent")!
    await percent.trigger("click")
    await flushPromises()
    expect(refLinesOf(wrapper)).toEqual([])
  })

  it("shows no reference lines when Transactions is unchecked", async () => {
    const wrapper = mountChart()
    await flushPromises()
    expect(refLinesOf(wrapper)).toEqual([])
  })

  it("ignores transactions outside the visible range for reference lines", async () => {
    const wrapper = await mountTxChart([
      { id: "b1", type: "BUY", executedAt: new Date("2030-01-01T12:00:00Z").toISOString(), quantity: 10, price: 300 },
    ])
    // Buy date is outside the visible range -> no Low/High/Avg lines.
    expect(refLinesOf(wrapper)).toEqual([])
  })

  it("runs FIFO correctly across partial sells over multiple lots", async () => {
    const d = makeHistory().timestamps
    const wrapper = await mountTxChart([
      { id: "b1", type: "BUY", executedAt: new Date(d[0] * 1000).toISOString(), quantity: 10, price: 50 },
      { id: "b2", type: "BUY", executedAt: new Date(d[1] * 1000).toISOString(), quantity: 10, price: 100 },
      { id: "s1", type: "SELL", executedAt: new Date(d[2] * 1000).toISOString(), quantity: 12, price: 90 },
      { id: "s2", type: "SELL", executedAt: new Date(d[3] * 1000).toISOString(), quantity: 4, price: 95 },
    ])
    const lines = refLinesOf(wrapper)
    const avg = lines.find((l) => l.borderColor === "#2563eb")
    // Lots: 10@50, 10@100. Sell 12 -> drains 10@50 + 2@100 -> remaining 8@100.
    // Sell 4 -> drains 4@100 -> remaining 4@100. totalCost = 4*100 = 400, qty 4, avg = 100.
    expect(avg).toBeDefined()
    expect(avg!.y).toBe(100)
  })

  it("omits the currency selector while the base currency is unknown (plan §56.3)", async () => {
    // Ambiguous ticker: both legs return a native series with currency:null
    // — the resolver stayed silent, so a conversion can never be offered.
    mockedGetPriceBars.mockResolvedValue({
      symbol: "AMD", timeframe: "daily", stale: false,
      // Contract PriceBarSeries.currency is a non-nullable string; the real
      // 400-refusal path never returns a converted series, so the native leg
      // shape here only needs a falsy base (baseCurrency null → no selector).
      currency: "", baseCurrency: null, fxFrom: null,
      dates: ["2026-08-18", "2026-08-19"], closes: [180, 182],
    })
    mockedGetHistory.mockResolvedValue({ ...makeHistory(), currency: null })
    currenciesMock.loaded = true
    const wrapper = mountChart({ symbol: "AMD" })
    await flushPromises()
    expect(wrapper.find('[data-testid="chart-currency-select"]').exists()).toBe(false)
    expect(mockedGetHistory).toHaveBeenCalledWith("AMD", "daily", undefined, null)
  })

  it("keeps the native series + a refusal notice when the server 400s a conversion (plan §56.3)", async () => {
    // (beforeEach's getPriceBars mock supplies a resolved baseCurrency=USD so
    // the title selector is offered; the conversion itself is refused below.)
    currenciesMock.loaded = true
    currenciesMock.options = [
      { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
      { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
    ]
    const wrapper = mountChart({ symbol: "AMD" })
    await flushPromises()
    const select = wrapper.find('[data-testid="chart-currency-select"]')
    expect(select.exists()).toBe(true)
    // Switch the display currency; the server refuses (base currency unknown).
    mockedGetPriceBars.mockRejectedValue(new Error("400 base currency unknown; cannot convert"))
    mockedGetHistory.mockRejectedValue(new Error("400 base currency unknown; cannot convert"))
    await select.setValue("PLN")
    await flushPromises()
    expect(mockedGetPriceBars).toHaveBeenCalledWith("AMD", expect.any(String), expect.any(String), "PLN")
    // The native series from the initial load is kept, explicitly caveated in
    // the rendered banner — not a silently wrong-denomination series under a
    // PLN title, and not the misleading "full history unavailable" text.
    const vm = wrapper.vm as unknown as { prices: number[]; error: string | null }
    expect(vm.prices.length).toBeGreaterThan(0)
    expect(vm.error).toMatch(/Display currency unavailable/)
    expect(wrapper.text()).toMatch(/Display currency unavailable/)
    expect(wrapper.text()).not.toMatch(/Full history unavailable/)
  })
})
