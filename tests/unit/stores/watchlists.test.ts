import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useWatchlistsStore } from "@/stores/watchlists"
import * as watchlistsApi from "@/api/watchlists"

vi.mock("@/api/watchlists", async (importOriginal) => {
  const actual = await importOriginal<typeof watchlistsApi>()
  return {
    ...actual,
    getWatchlists: vi.fn(),
    createWatchlist: vi.fn(),
    deleteWatchlist: vi.fn(),
    addWatchlistItem: vi.fn(),
    removeWatchlistItem: vi.fn(),
  }
})

const mocked = vi.mocked(watchlistsApi)

function watchlist() {
  return {
    id: "wl1",
    name: "Tech",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    items: [{ symbol: "AAPL", name: "Apple Inc", type: "Common Stock", addedAt: "2026-08-01T10:00:00.000Z" }],
  }
}

describe("watchlists store", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it("starts empty", () => {
    const store = useWatchlistsStore()
    expect(store.watchlists).toEqual([])
  })

  it("loads watchlists", async () => {
    mocked.getWatchlists.mockResolvedValue([watchlist()])
    const store = useWatchlistsStore()
    await store.fetchAll()

    expect(store.watchlists).toHaveLength(1)
    expect(store.watchlists[0].name).toBe("Tech")
  })

  it("creates a watchlist and appends it", async () => {
    mocked.createWatchlist.mockResolvedValue(watchlist())
    const store = useWatchlistsStore()
    await store.create("Tech")

    expect(mocked.createWatchlist).toHaveBeenCalledWith("Tech", undefined)
    expect(store.watchlists).toHaveLength(1)
  })

  it("creates a watchlist with a description", async () => {
    mocked.createWatchlist.mockResolvedValue({ ...watchlist(), description: "Track semis" })
    const store = useWatchlistsStore()
    await store.create("Chips", "Track semis")

    expect(mocked.createWatchlist).toHaveBeenCalledWith("Chips", "Track semis")
    expect(store.watchlists[0].description).toBe("Track semis")
  })

  it("removes a watchlist", async () => {
    mocked.deleteWatchlist.mockResolvedValue(undefined)
    const store = useWatchlistsStore()
    store.watchlists.push(watchlist())
    await store.remove("wl1")

    expect(store.watchlists).toEqual([])
  })

  it("adds an item and replaces the watchlist entry", async () => {
    mocked.addWatchlistItem.mockResolvedValue({
      ...watchlist(),
      items: [...watchlist().items, { symbol: "MSFT", name: "Microsoft", type: "Common Stock", addedAt: "2026-08-02T00:00:00.000Z" }],
    })
    const store = useWatchlistsStore()
    store.watchlists.push(watchlist())
    await store.addItem("wl1", "MSFT")

    expect(store.watchlists[0].items).toHaveLength(2)
  })

  it("removes an item", async () => {
    mocked.removeWatchlistItem.mockResolvedValue({ ...watchlist(), items: [] })
    const store = useWatchlistsStore()
    store.watchlists.push(watchlist())
    await store.removeItem("wl1", "AAPL")

    expect(store.watchlists[0].items).toEqual([])
  })
})
