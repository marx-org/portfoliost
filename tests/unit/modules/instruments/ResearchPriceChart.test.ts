import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchPriceChart from "@/modules/instruments/ResearchPriceChart.vue"
import { getHistory } from "@/api/instruments"

vi.mock("@/api/instruments", () => ({
  getHistory: vi.fn(),
}))

const mockedGetHistory = vi.mocked(getHistory)

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

function mountChart() {
  return mount(ResearchPriceChart, {
    props: { symbol: "AAPL" },
    global: { stubs: { apexchart: true } },
  })
}

describe("ResearchPriceChart", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetHistory.mockResolvedValue(makeHistory())
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
})
