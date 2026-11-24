import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PerformanceSummaryCard from "@/components/PerformanceSummaryCard.vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { getLatestRate } from "@/api/fx"

vi.mock("@/api/fx", () => ({ getLatestRate: vi.fn() }))
const mockedRate = vi.mocked(getLatestRate)

function perf(overrides: Record<string, unknown> = {}) {
  return {
    totalValue: 1200,
    capitalBasis: 900,
    totalReturn: 300,
    totalReturnPercent: 33.33,
    realizedGains: 120,
    unrealizedGains: 180,
    income: 45,
    annualizedReturn: 11.25,
    annualizedReturnWithheldReason: null,
    moneyWeightedReturn: 14.5,
    xirr: 12.75,
    xirrWithheldReason: null,
    ...overrides,
  }
}

function mountCard(props: Record<string, unknown>) {
  // Use the pinia set active in beforeEach, so a store mutated by the test is
  // the same instance the component reads.
  return mount(PerformanceSummaryCard, {
    props: { performance: perf(), baseCurrency: "USD", ...props },
  })
}

describe("PerformanceSummaryCard", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedRate.mockReset()
    mockedRate.mockResolvedValue({ rate: 1 } as never)
  })

  it("renders all nine values from the payload", async () => {
    const w = mountCard({})
    await flushPromises()
    for (const id of [
      "total-value",
      "total-invested",
      "net-gain",
      "net-gain-percent",
      "realized",
      "unrealized",
      "income",
      "twr",
      "mwr",
      "xirr",
    ]) {
      expect(w.get(`[data-testid="perf-summary-${id}"]`).text().trim().length).toBeGreaterThan(0)
    }
  })

  it("formats currency and percent, and converts money via the rate", async () => {
    useDisplayCurrencyStore().currency = "PLN"
    mockedRate.mockResolvedValue({ rate: 2 } as never)
    const w = mountCard({ baseCurrency: "USD" })
    await flushPromises()
    // totalValue 1200 × 2 = 2400 in the display currency.
    expect(w.get('[data-testid="perf-summary-total-value"]').text()).toContain("2,400")
    // A rate is never converted: TWR stays 11.25%.
    expect(w.get('[data-testid="perf-summary-twr"]').text()).toContain("11.25")
  })

  it("shows the withheld reason, not 0, when xirr is null", async () => {
    const w = mountCard({ performance: perf({ xirr: null, xirrWithheldReason: "insufficient_history" }) })
    await flushPromises()
    expect(w.get('[data-testid="perf-summary-xirr-withheld"]').text()).toContain("not enough history")
  })

  it("puts a tooltip on each field", async () => {
    const w = mountCard({})
    await flushPromises()
    for (const id of [
      "total-value",
      "total-invested",
      "net-gain",
      "realized",
      "unrealized",
      "income",
      "twr",
      "mwr",
      "xirr",
    ]) {
      expect(w.find(`[data-testid="perf-summary-tip-${id}"]`).attributes("title")).toBeTruthy()
    }
  })

  it("hides Total invested for a virtual portfolio (showInvested=false)", async () => {
    const w = mountCard({ showInvested: false })
    await flushPromises()
    expect(w.find('[data-testid="perf-summary-total-invested"]').exists()).toBe(false)
  })
})