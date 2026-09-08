import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import CurrencyRatesView from "@/modules/admin/CurrencyRatesView.vue"
import { fetchFxRates } from "@/api/admin"

vi.mock("@/api/admin", () => ({
  fetchFxRates: vi.fn(),
}))

const mocked = vi.mocked(fetchFxRates)
const httpMock = vi.fn()

vi.mock("@/api/client", () => ({
  http: {
    get: (path: string) => httpMock(path),
  },
}))

const currenciesPayload = {
  currencies: [
    { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
    { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
    { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
  ],
}

function makeRate(date: string, quoteCurrency: string, rate: number) {
  return { date, baseCurrency: "EUR", quoteCurrency, rate }
}

function makeResponse(items: ReturnType<typeof makeRate>[]) {
  return { items, pagination: { total: items.length, page: 1, per_page: 50, total_pages: 1 } }
}

describe("CurrencyRatesView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    httpMock.mockReset().mockResolvedValue(currenciesPayload)
    mocked.mockResolvedValue(makeResponse([makeRate("2024-01-02", "USD", 1.0952)]))
  })

  it("renders rows and a registry-fed quote currency selector", async () => {
    const wrapper = mount(CurrencyRatesView)
    await flushPromises()

    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({ per_page: "50" }))
    expect(wrapper.text()).toContain("2024-01-02")
    expect(wrapper.text()).toContain("Quote currency")

    const options = wrapper.get('[data-testid="fx-quote"]').findAll("option")
    const codes = options.map((o) => o.text())
    expect(codes).toContain("All currencies")
    expect(codes).toContain("EUR")
    expect(codes).toContain("USD")
  })

  it("applies currency + date filters only on Apply", async () => {
    mocked.mockResolvedValue(makeResponse([makeRate("2024-01-05", "USD", 1.0960)]))
    const wrapper = mount(CurrencyRatesView)
    await flushPromises()
    mocked.mockClear()

    await wrapper.get('[data-testid="fx-quote"]').setValue("USD")
    await wrapper.get('[data-testid="fx-date-from"]').setValue("2024-01-01")
    await wrapper.get('[data-testid="fx-date-to"]').setValue("2024-01-31")
    await flushPromises()

    expect(mocked).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="fx-apply"]').trigger("click")
    await flushPromises()

    expect(mocked).toHaveBeenCalledWith(
      expect.objectContaining({ quote_currency: "USD", date_from: "2024-01-01", date_to: "2024-01-31", page: "1" }),
    )
  })

  it("supports a from-only date filter (dates independent)", async () => {
    const wrapper = mount(CurrencyRatesView)
    await flushPromises()
    mocked.mockClear()

    await wrapper.get('[data-testid="fx-date-from"]').setValue("2024-01-01")
    await wrapper.get('[data-testid="fx-apply"]').trigger("click")
    await flushPromises()

    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({ date_from: "2024-01-01" }))
    expect(mocked.mock.calls[0][0]).not.toHaveProperty("date_to")
  })

  it("reset clears the filters and reloads", async () => {
    const wrapper = mount(CurrencyRatesView)
    await flushPromises()

    await wrapper.get('[data-testid="fx-quote"]').setValue("USD")
    await wrapper.get('[data-testid="fx-date-from"]').setValue("2024-01-01")
    await wrapper.get('[data-testid="fx-apply"]').trigger("click")
    await flushPromises()

    mocked.mockClear()
    await wrapper.get('[data-testid="fx-reset"]').trigger("click")
    await flushPromises()

    const lastCall = mocked.mock.calls[0][0] ?? {}
    expect(lastCall).not.toHaveProperty("quote_currency")
    expect(lastCall).not.toHaveProperty("date_from")
    expect(lastCall).not.toHaveProperty("date_to")
    expect((wrapper.get('[data-testid="fx-quote"]').element as HTMLSelectElement).value).toBe("")
  })
})