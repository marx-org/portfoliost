import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchOverview from "@/modules/instruments/ResearchOverview.vue"
import * as instrumentsApi from "@/api/instruments"
import { ApiError } from "@/api/client"
import type { InstrumentsMetrics, InstrumentsOverviewMetrics, InstrumentsProfile, QuoteAapl } from "@/api/types"
import type { components } from "../../../../generated/api-types"

vi.mock("@/api/instruments", () => ({
  getInstrumentProfile: vi.fn(),
  getInstrumentMetrics: vi.fn(),
  getInstrumentOverviewMetrics: vi.fn(),
  getQuote: vi.fn(),
  getEpsSurprises: vi.fn(),
  getHistory: vi.fn(),
  getInvestorRelations: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL.US" } }),
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
    description:
      "Apple designs, manufactures and markets smartphones.\n\nThe company generated revenue of $390.53B over the trailing twelve months.",
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
    priceTarget: {
      symbol: "AAPL",
      targetHigh: 436.37,
      targetLow: 215.29,
      targetMean: 338.32,
      targetMedian: 332.16,
      numberAnalysts: 35,
      lastUpdated: "2026-08-01 00:00:00",
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

function mountOverview() {
  return mount(ResearchOverview, {
    global: {
      stubs: { apexchart: true, PriceChart: true, ResearchSeasonality: true },
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
    mocked.getInvestorRelations.mockResolvedValue([] as components["schemas"]["InvestorRelationEvent"][])
  })

  it("fetches research data for the route symbol", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    // full venue-qualified route symbol is passed through to the API
    expect(mocked.getInstrumentProfile).toHaveBeenCalledWith("AAPL.US")
    expect(mocked.getInstrumentMetrics).toHaveBeenCalledWith("AAPL.US")
    expect(mocked.getQuote).toHaveBeenCalledWith("AAPL.US")
    // §61.8 — the ticker lives in the shared identity block, not a bare h2
    // (the first h2 on the page is the "About" heading).
    const badge = wrapper.get('[data-testid="overview-ticker"]')
    // the route symbol is the venue-qualified `AAPL.US`; the logo strips the suffix
    expect(badge.find("h2").text()).toBe("AAPL.US")
    expect(badge.find("img").attributes("src")).toContain("/api/logos/AAPL")
  })

  it("renders the current price from the quote", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("307.56")
  })

  it("renders company statistics", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Key Statistics")
    expect(wrapper.text()).toContain("Market Cap")
    expect(wrapper.text()).toContain("ROE")
    expect(wrapper.text()).toContain("P/E")
  })

  it("renders the analyst price target banner", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Analyst Price Target")
    expect(wrapper.text()).toContain("Low")
    expect(wrapper.text()).toContain("High")
  })

  it("expands the description with show more", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Apple designs, manufactures and markets smartphones.")
    expect(wrapper.text()).not.toContain("$390.53B")
    await wrapper.findAll("button").find((b) => b.text() === "Show more")!.trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("$390.53B")
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

  it("degrades to the coverage banner, not an error page, when the profile 404s", async () => {
    // §78 — a fund category (`ING01W`) has no provider profile at all: the
    // backend answered 404 with the cachest URL as its message, and this page
    // treated that as fatal, so `v-if="!loading && !error"` blanked the whole
    // body — including the quote and the NAV chart, which both work. A 404 is
    // "this tier has no profile", not "this page cannot render".
    mocked.getInstrumentProfile.mockRejectedValue(
      new ApiError(404, {
        error: "NotFound",
        message: "upstream 404 for http://cachest:8080/equity/profile/ING01W",
      }),
    )
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.find(".bg-red-50").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("cachest")
    expect(wrapper.text()).toContain("Limited data availability")
    // The quote is a separate request and still answered.
    expect(wrapper.text()).toContain("307.56")
  })

  it("still fails the page when the profile errors with anything but a 404", async () => {
    mocked.getInstrumentProfile.mockRejectedValue(
      new ApiError(502, { error: "BadGateway", message: "upstream 502 for http://cachest:8080" }),
    )
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.find(".bg-red-50").exists()).toBe(true)
    expect(wrapper.text()).toContain("upstream 502")
  })

  it("§47.5: no currency badge when the profile declares one (provider)", async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.find("[data-testid='currency-warning']").exists()).toBe(false)
    expect(wrapper.text()).toContain("$307.56")
  })

  it("§47.5: red Currency unknown badge + plain price when nothing declares a currency", async () => {
    mocked.getInstrumentProfile.mockResolvedValue({ ...makeProfile(), currency: null } as unknown as InstrumentsProfile)
    mocked.getQuote.mockResolvedValue({ ...makeQuote(), currency: null } as unknown as QuoteAapl)
    const wrapper = mountOverview()
    await flushPromises()

    const badge = wrapper.find("[data-testid='currency-warning']")
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe("Currency unknown")
    // price renders without a currency code — no "$" anywhere on the page
    expect(wrapper.text()).toContain("307.56")
    expect(wrapper.text()).not.toContain("$")
  })

  it("§47.5: amber 'PLN (estimated)' hint when the backend resolved the currency locally", async () => {
    mocked.getInstrumentProfile.mockResolvedValue({
      ...makeProfile(),
      currency: "PLN",
      currencySource: "estimated",
    } as unknown as InstrumentsProfile)
    mocked.getQuote.mockResolvedValue({ ...makeQuote(), currency: "PLN", currencySource: "estimated" } as unknown as QuoteAapl)
    const wrapper = mountOverview()
    await flushPromises()

    const badge = wrapper.find("[data-testid='currency-warning']")
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe("PLN (estimated)")
    expect(wrapper.text()).toContain("PLN\u00A0307.56")
  })
})
