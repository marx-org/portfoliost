import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useCurrenciesStore } from "../../../src/stores/currencies"

const payload = {
  currencies: [
    { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
    { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
    { code: "CZK", name: "Czech Koruna", symbol: "Kč", minorUnits: 2, popular: false },
  ],
}

const httpMock = vi.fn()

vi.mock("../../../src/api/client", () => ({
  http: {
    get: (path: string) => httpMock(path),
  },
}))

describe("currencies store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    httpMock.mockReset().mockResolvedValue(payload)
  })

  it("loads once and caches (fetch-once per session)", async () => {
    const store = useCurrenciesStore()
    await store.load()
    await store.load()
    await store.load()
    expect(httpMock).toHaveBeenCalledTimes(1)
    expect(httpMock).toHaveBeenCalledWith("/api/currencies")
    expect(store.options.map((c) => c.code)).toEqual(["EUR", "USD", "CZK"])
  })

  it("concurrent loads share one request", async () => {
    const store = useCurrenciesStore()
    await Promise.all([store.load(), store.load(), store.load()])
    expect(httpMock).toHaveBeenCalledTimes(1)
  })

  it("force reloads on demand", async () => {
    const store = useCurrenciesStore()
    await store.load()
    await store.load(true)
    expect(httpMock).toHaveBeenCalledTimes(2)
  })

  it("minorUnits falls back to 2 for unknown codes", async () => {
    const store = useCurrenciesStore()
    await store.load()
    expect(store.minorUnits("JPY")).toBe(2) // not in mock payload
    expect(store.minorUnits("usd")).toBe(2)
  })

  it("info lookup is case-insensitive", async () => {
    const store = useCurrenciesStore()
    await store.load()
    expect(store.info("eur")?.symbol).toBe("€")
    expect(store.info("XXX")).toBeUndefined()
  })
})
