import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useInstrumentsStore } from "@/stores/instruments"
import * as instrumentsApi from "@/api/instruments"

vi.mock("@/api/instruments", async (importOriginal) => {
  const actual = await importOriginal<typeof instrumentsApi>()
  return { ...actual, searchInstruments: vi.fn() }
})

const mocked = vi.mocked(instrumentsApi)

describe("instruments store", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it("starts empty", () => {
    const store = useInstrumentsStore()
    expect(store.searchResults).toEqual([])
    expect(store.searching).toBe(false)
    expect(store.searchError).toBeNull()
  })

  it("stores results after a successful search", async () => {
    mocked.searchInstruments.mockResolvedValue({
      count: 1,
      results: [{ symbol: "AAPL", name: "Apple Inc", type: "Common Stock", exchange: "NASDAQ", source: "FINNHUB" }],
    })

    const store = useInstrumentsStore()
    await store.search("AAPL")

    expect(mocked.searchInstruments).toHaveBeenCalledWith("AAPL")
    expect(store.searchResults).toHaveLength(1)
    expect(store.searchResults[0].symbol).toBe("AAPL")
    expect(store.searching).toBe(false)
  })

  it("records the error and clears results on failure", async () => {
    mocked.searchInstruments.mockRejectedValue(new Error("boom"))

    const store = useInstrumentsStore()
    await store.search("NOPE")

    expect(store.searchError).toBe("boom")
    expect(store.searchResults).toEqual([])
    expect(store.searching).toBe(false)
  })

  it("resets state", async () => {
    mocked.searchInstruments.mockResolvedValue({
      count: 1,
      results: [{ symbol: "MSFT", name: "Microsoft", type: "Common Stock", exchange: "NASDAQ", source: "FINNHUB" }],
    })

    const store = useInstrumentsStore()
    await store.search("MSFT")
    store.resetSearch()

    expect(store.searchResults).toEqual([])
    expect(store.searchError).toBeNull()
    expect(store.searching).toBe(false)
  })
})
