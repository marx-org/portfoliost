import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchDividends from "@/modules/instruments/ResearchDividends.vue"
import * as instrumentsApi from "@/api/instruments"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL" } }),
}))

vi.mock("@/api/instruments", async (importOriginal) => {
  const actual = await importOriginal<typeof instrumentsApi>()
  return {
    ...actual,
    getInstrumentDividends: vi.fn(),
  }
})

function historyRow(currency: string, paymentDate?: string) {
  return { date: "2026-05-12", year: 2026, amount: 0.26, currency, type: "regular", paymentDate: paymentDate ?? null }
}

async function mountWith(response: unknown) {
  vi.mocked(instrumentsApi.getInstrumentDividends).mockResolvedValue(response as never)
  const wrapper = mount(ResearchDividends)
  await flushPromises()
  return wrapper
}

describe("ResearchDividends — §49.6 instrCcy chain", () => {
  it("prefers the top-level resolved currency over the first row", async () => {
    const wrapper = await mountWith({
      history: [historyRow("USD")],
      currency: "PLN",
      currencySource: "estimated",
    })
    expect(wrapper.find('[data-testid="currency-warning"]').text()).toContain("PLN (estimated)")
    // summary cards use the top-level PLN, per-row table keeps its own USD
    expect(wrapper.text()).toMatch(/PLN\s0\.26/)
    expect(wrapper.text()).toContain("$0.26")
  })

  it("renders the plain amount + Currency unknown badge when nothing declares", async () => {
    const wrapper = await mountWith({
      history: [historyRow("USD")],
      currency: null as never,
      currencySource: "unknown",
    })
    expect(wrapper.find('[data-testid="currency-warning"]').text()).toContain("Currency unknown")
  })

  it("falls back to the first row currency when the response omits the top-level field", async () => {
    const wrapper = await mountWith({ history: [historyRow("PLN")] })
    expect(wrapper.text()).toContain("0.26")
  })
})

describe("ResearchDividends — §49.9 payment date column", () => {
  it("shows the payment date when present, an em dash when null", async () => {
    const wrapper = await mountWith({
      history: [historyRow("USD", "2026-05-15"), historyRow("USD")],
      currency: "USD",
      currencySource: "provider",
    })
    const rows = wrapper.findAll("tbody tr")
    expect(rows[0].text()).toContain("May 15, 2026")
    expect(rows[1].text()).toContain("—")
  })

  it("renders the Payment Date column header", async () => {
    const wrapper = await mountWith({ history: [historyRow("USD")] })
    expect(wrapper.findAll("th").some((th) => th.text() === "Payment Date")).toBe(true)
  })
})