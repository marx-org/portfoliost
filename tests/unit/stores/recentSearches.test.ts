import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRecentSearchesStore } from "@/stores/recentSearches"
import * as usersApi from "@/api/users"

vi.mock("@/api/users", () => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
}))

const mocked = vi.mocked(usersApi)

function makeProfile(recentSearches: string[] = []) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "demo@example.com",
    firstName: "",
    lastName: "",
    avatarUrl: null,
    groups: [],
    language: "en",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    isDemoUser: false,
    recentSearches,
  }
}

describe("recentSearches store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("loads the user's recent searches from profile", async () => {
    mocked.getUserProfile.mockResolvedValue(makeProfile(["MSFT", "AAPL"]))
    const store = useRecentSearchesStore()
    await store.load()
    expect(store.symbols).toEqual(["MSFT", "AAPL"])
  })

  it("defaults to empty when the profile has no recentSearches", async () => {
    mocked.getUserProfile.mockResolvedValue(makeProfile())
    const store = useRecentSearchesStore()
    await store.load()
    expect(store.symbols).toEqual([])
  })

  it("records a search most-recent-first with dedup", async () => {
    mocked.getUserProfile.mockResolvedValue(makeProfile(["MSFT", "AAPL"]))
    const store = useRecentSearchesStore()
    await store.load()
    await store.record("MSFT")
    expect(store.symbols[0]).toBe("MSFT")
    expect(store.symbols).toEqual(["MSFT", "AAPL"])
    expect(mocked.updateUserProfile).toHaveBeenCalledWith({ recentSearches: ["MSFT", "AAPL"] })
  })

  it("caps the list at 10 most recent", async () => {
    const many = Array.from({ length: 10 }, (_, i) => `S${i}`)
    mocked.getUserProfile.mockResolvedValue(makeProfile(many))
    const store = useRecentSearchesStore()
    await store.load()
    await store.record("NEW")
    expect(store.symbols.length).toBe(10)
    expect(store.symbols[0]).toBe("NEW")
    expect(store.symbols).not.toContain("S9")
  })

  it("uppercases and trims symbols when recording", async () => {
    mocked.getUserProfile.mockResolvedValue(makeProfile([]))
    const store = useRecentSearchesStore()
    await store.load()
    await store.record(" msft ")
    expect(store.symbols[0]).toBe("MSFT")
  })

  it("loads only once", async () => {
    mocked.getUserProfile.mockResolvedValue(makeProfile(["AAPL"]))
    const store = useRecentSearchesStore()
    await store.load()
    await store.load()
    expect(mocked.getUserProfile).toHaveBeenCalledTimes(1)
  })
})
