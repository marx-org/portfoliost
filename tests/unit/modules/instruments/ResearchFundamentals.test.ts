import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchFundamentals from "@/modules/instruments/ResearchFundamentals.vue"
import * as instrumentsApi from "@/api/instruments"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL" } }),
}))

vi.mock("@/api/instruments", async (importOriginal) => {
  const actual = await importOriginal<typeof instrumentsApi>()
  return {
    ...actual,
    getInstrumentFundamentals: vi.fn(),
  }
})

const row = { year: 2025, revenue: 416161000000, freeCashFlowPerShare: 6.58 }

async function mountWith(response: unknown) {
  vi.mocked(instrumentsApi.getInstrumentFundamentals).mockResolvedValue(response as never)
  const wrapper = mount(ResearchFundamentals, {
    global: { stubs: { apexchart: true } },
  })
  await flushPromises()
  return wrapper
}

const base = {
  currency: "USD",
  currencySource: "provider",
  sources: { incomeStatement: "fmp", balanceSheet: "fmp", cashFlow: "fmp" },
  financialHighlights: {
    incomeStatement: [row],
    balanceSheet: [{ year: 2025, totalAssets: 359241000000 }],
    cashFlow: [row],
  },
}

describe("ResearchFundamentals — §79.2 currency and source labels", () => {
  it("labels the currency on all three cards", async () => {
    const wrapper = await mountWith(base)
    const labels = wrapper.findAll('[data-testid="fundamentals-currency"]')
    expect(labels).toHaveLength(3)
    for (const label of labels) expect(label.text()).toBe("USD")
  })

  it("spells out an estimated currency rather than presenting it as declared", async () => {
    // "EUR" and "EUR (estimated)" are different claims: one says the upstream
    // said EUR, the other says we resolved EUR from the venue. A reader
    // reconciling these against a broker has to know which.
    const wrapper = await mountWith({
      ...base,
      currency: "EUR",
      currencySource: "estimated",
    })
    expect(wrapper.find('[data-testid="fundamentals-currency"]').text()).toBe("EUR (estimated)")
  })

  it("says so when the currency could not be determined", async () => {
    const wrapper = await mountWith({
      ...base,
      currency: null,
      currencySource: "unknown",
    })
    expect(wrapper.find('[data-testid="fundamentals-currency"]').text()).toBe("Currency unknown")
  })

  it("marks a mixed-provider table", async () => {
    // The defect §79.2 exists for: income from one provider, a balance sheet
    // from another, merged into one table with nothing to say so.
    const wrapper = await mountWith({
      ...base,
      currency: "EUR",
      currencySource: "estimated",
      sources: { incomeStatement: "fmp", balanceSheet: "yfinance", cashFlow: "fmp" },
    })
    const marker = wrapper.find('[data-testid="fundamentals-mixed-sources"]')
    expect(marker.exists()).toBe(true)
    expect(marker.text()).toContain("fmp, yfinance")
    expect(marker.text()).toContain("may not share a currency")
  })

  it("shows no marker when all three statements came from one provider", async () => {
    const wrapper = await mountWith(base)
    expect(wrapper.find('[data-testid="fundamentals-mixed-sources"]').exists()).toBe(false)
  })

  it("shows no marker when no attribution survived the hop", async () => {
    // A body cached before the envelope existed: numbers are real, provenance
    // is not. Silence is the right rendering — a marker naming nothing would be
    // noise, and inventing a provider would be a lie.
    const wrapper = await mountWith({
      ...base,
      sources: { incomeStatement: null, balanceSheet: null, cashFlow: null },
    })
    expect(wrapper.find('[data-testid="fundamentals-mixed-sources"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="fundamentals-currency"]')[0].text()).toBe("USD")
  })

  it("still marks a disagreement when only two statements name a provider", async () => {
    const wrapper = await mountWith({
      ...base,
      sources: { incomeStatement: "fmp", balanceSheet: "fmp", cashFlow: null },
    })
    const marker = wrapper.find('[data-testid="fundamentals-mixed-sources"]')
    expect(marker.exists()).toBe(true)
    // The unnamed statement is not named in the marker — the marker lists what
    // is known, and does not imply the third was fmp.
    expect(marker.text()).toContain("fmp")
    expect(marker.text()).not.toContain("null")
  })
})