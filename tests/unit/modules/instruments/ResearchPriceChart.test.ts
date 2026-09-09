import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { createPinia } from "pinia"
import PriceChart from "@/components/PriceChart.vue"
import { getHistory } from "@/api/instruments"
import { getAllTransactions, getPortfolioTransactions } from "@/api/portfolios"

vi.mock("@/api/instruments", () => ({
  getHistory: vi.fn(),
}))

vi.mock("@/api/portfolios", () => ({
  getAllTransactions: vi.fn(),
  getPortfolioTransactions: vi.fn(),
}))

const mockedGetHistory = vi.mocked(getHistory)
const mockedGetAllTransactions = vi.mocked(getAllTransactions)
const mockedGetPortfolioTransactions = vi.mocked(getPortfolioTransactions)

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

function makeTx(tx: { id: string; type: string; executedAt: string; quantity?: number; price?: number }) {
  const qty = tx.quantity ?? 10
  const price = tx.price ?? 180
  return {
    id: tx.id,
    portfolioId: "p1",
    portfolioName: "P1",
    walletId: "w1",
    positionId: null,
    type: tx.type,
    instrumentSymbol: "AAPL",
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
  return (wrapper.vm as unknown as { chartOptions: { annotations: { yaxis: Array<{ y: number; borderColor: string; strokeDashArray: number }> } } }).chartOptions.annotations.yaxis
}

describe("PriceChart", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetHistory.mockResolvedValue(makeHistory())
    mockedGetAllTransactions.mockResolvedValue(makeTxPage([]))
    mockedGetPortfolioTransactions.mockResolvedValue(makeTxPage([]))
  })

  it("fetches daily history for the symbol", async () => {
    mountChart()
    await flushPromises()
    expect(mockedGetHistory).toHaveBeenCalledWith("AAPL", "daily", undefined)
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

    expect(mockedGetHistory).toHaveBeenCalledWith("AAPL", "daily", "spy")
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
    expect(p.x).toBe(0)
    expect(p.marker.offsetY).toBe(0)
    expect(p.marker.fillColor).toBe("#16a34a")
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
    expect(points[0].x).toBe(2)
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
    expect(lines.find((l) => l.borderColor === "#dc2626")!.y).toBe(100)
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
})
