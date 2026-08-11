import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchOverview from "@/modules/instruments/ResearchOverview.vue"
import * as instrumentsApi from "@/api/instruments"
import type { HistoryDaily, InstrumentsMetrics, InstrumentsOverviewMetrics, InstrumentsProfile, QuoteAapl } from "@/api/types"

vi.mock("@/api/instruments", () => ({
  getInstrumentProfile: vi.fn(),
  getInstrumentMetrics: vi.fn(),
  getInstrumentOverviewMetrics: vi.fn(),
  getQuote: vi.fn(),
  getEpsSurprises: vi.fn(),
  getHistory: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL" } }),
}))

const mocked = vi.mocked(instrumentsApi)

function makeProfile(): InstrumentsProfile {
  return {
    ticker: "AAPL",
    name: "Apple Inc",
    country: "US",
    currency: "USD",
    exchange: "NASDAQ",
    finnhubIndustry: "Technology",
    ipo: "1980-12-12",
    logo: "/logos/AAPL.svg",
    marketCapitalization: 2760501,
    marketCapCurrency: "USD",
    marketcapUSD: 2760501723161.16,
    phone: "14089961010",
    shareOutstanding: 8975490061,
    weburl: "https://www.apple.com",
    gicsSector: "Technology",
    gicsIndustryGroup: "Technology Hardware",
    gicsIndustry: "Consumer Electronics",
    gicsSubIndustry: "Consumer Electronics",
    description: "Apple designs, manufactures and markets smartphones.",
    address: "One Apple Park Way",
    city: "Cupertino",
    state: "CA",
    employeeTotal: 91479,
    ceo: "Tim Cook",
  }
}

function makeOverview(): InstrumentsOverviewMetrics {
  return {
    symbol: "AAPL",
    marketCap: 2760501723161.16,
    enterpriseValue: 2918883283815,
    revenue: 390528494639,
    sharesOutstanding: 8975490061,
    employees: 91479,
    cash: 132777845077,
    netDebt: -243218576880,
    revenueGrowth3yr: 22.71,
    revenueGrowth5yr: 15.7,
    revenueGrowthFwd: 14.31,
    epsGrowth5yr: 13.11,
    epsGrowthFwd: 21.35,
  } as unknown as InstrumentsOverviewMetrics
}

function makeMetrics(): InstrumentsMetrics {
  return {
    metrics: {
      symbol: "AAPL",
      metricType: "all",
      metric: {
        marketCapitalization: 2760501723161.16,
        enterpriseValue: 2918883283815,
        peRatio: 23.49,
        pegRatio: 2.36,
        psRatio: 7.07,
        pbRatio: 42.91,
        evToSales: 7.7,
        evToEBITDA: 29.76,
        dividendYield: 2.68,
        dividendPerShare: 1.41,
        payoutRatio: 41.52,
        grossMargin: 36.11,
        operatingMargin: 42.58,
        netProfitMargin: 28,
      },
    },
    trailingValuation: {
      marketCap: 2760501723161.16,
      enterpriseValue: 2918883283815,
      peRatio: 23.49,
      psRatio: 7.07,
      pbRatio: 42.91,
      evToSales: 7.7,
      evToEBITDA: 29.76,
      dividendYield: 2.68,
    },
    margins: { grossMargin: 36.11, operatingMargin: 42.58, ebitdaMargin: 27.02, netProfitMargin: 28 },
    capitalEfficiency: { returnOnAssets: 36.78, returnOnEquity: 74.62, assetTurnover: 1.1, inventoryTurnover: 46.78 },
    financialHealth: { currentRatio: 1.17, quickRatio: 1.07 },
    perShare: {
      revenuePerShare: 43.51,
      eps: 13.54,
      bookValuePerShare: 22.46,
      tangibleBookValuePerShare: 17.97,
      cashPerShare: 14.79,
      operatingCashFlowPerShare: 25.78,
    },
  } as InstrumentsMetrics
}

function makeQuote(): QuoteAapl {
  return {
    symbol: "AAPL",
    currentPrice: 307.56,
    highPrice: 307.56,
    lowPrice: 307.56,
    openPrice: 307.56,
    previousClose: 301.33,
    change: 6.23,
    percentChange: 2.07,
    timestamp: "2026-08-10T20:00:00Z",
    currency: "USD",
    regularMarketPrice: 307.56,
  } as unknown as QuoteAapl
}

function makeHistory(): HistoryDaily {
  return {
    symbol: "AAPL",
    closePrices: [307.56, 310.1],
    highPrices: [308, 311],
    lowPrices: [306, 309],
    openPrices: [307, 310],
    volumes: [100, 120],
    timestamps: [1754870400, 1754956800],
    status: "ok",
    currency: "USD",
  } as HistoryDaily
}

function mountOverview() {
  return mount(ResearchOverview, {
    global: {
      stubs: { apexchart: true },
    },
  })
}

describe("ResearchOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getInstrumentProfile.mockResolvedValue(makeProfile())
    mocked.getInstrumentMetrics.mockResolvedValue(makeMetrics())
    mocked.getInstrumentOverviewMetrics.mockResolvedValue(makeOverview())
    mocked.getQuote.mockResolvedValue(makeQuote())
    mocked.getEpsSurprises.mockResolvedValue({ annual: [] })
    mocked.getHistory.mockResolvedValue(makeHistory())
  })

  it("fetches research data for the route symbol", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(mocked.getInstrumentProfile).toHaveBeenCalledWith("AAPL")
    expect(mocked.getInstrumentMetrics).toHaveBeenCalledWith("AAPL")
    expect(mocked.getQuote).toHaveBeenCalledWith("AAPL")
    expect(wrapper.find("h2").text()).toContain("AAPL")
  })

  it("renders the current price from the quote", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("307.56")
  })

  it("renders company statistics", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Company Statistics")
    expect(wrapper.text()).toContain("Market Cap")
    expect(wrapper.text()).toContain("ROE")
    expect(wrapper.text()).toContain("P/E")
  })

  it("renders the company profile fields", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Apple Inc")
    expect(wrapper.text()).toContain("Consumer Electronics")
    expect(wrapper.text()).toContain("Tim Cook")
  })

  it("shows an error message when the profile request fails", async () => {
    mocked.getInstrumentProfile.mockRejectedValue(new Error("NotFound"))
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.find(".bg-red-50").exists()).toBe(true)
    expect(wrapper.find(".bg-red-50").text()).toContain("NotFound")
  })
})
