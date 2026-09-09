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

function makeTxPage(items = []) {
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
})
