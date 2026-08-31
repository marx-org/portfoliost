import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RecentSearchesBar from "@/modules/instruments/RecentSearchesBar.vue"
import { useRecentSearchesStore } from "@/stores/recentSearches"
import * as usersApi from "@/api/users"

vi.mock("@/api/users", () => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
}))

const mocked = vi.mocked(usersApi)

function makeProfile(recentSearches: string[]) {
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

describe("RecentSearchesBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(useRecentSearchesStore(), "load").mockResolvedValue()
    mocked.getUserProfile.mockResolvedValue(makeProfile(["MSFT", "NVDA", "AAPL"]))
  })

  it("renders each recent search as a button for the bar variant", async () => {
    const wrapper = mount(RecentSearchesBar)
    const store = useRecentSearchesStore()
    store.symbols = ["MSFT", "NVDA", "AAPL"]
    await flushPromises()
    const buttons = wrapper.findAll("[data-testid^='recent-search-']")
    expect(buttons).toHaveLength(3)
    expect(buttons[0].text()).toBe("MSFT")
    expect(wrapper.classes()).toContain("overflow-x-auto")
  })

  it("renders chips styling for the chips variant", async () => {
    const wrapper = mount(RecentSearchesBar, { props: { variant: "chips" } })
    const store = useRecentSearchesStore()
    store.symbols = ["MSFT"]
    await flushPromises()
    expect(wrapper.find("[data-testid='recent-search-MSFT']").classes()).toContain("btn-secondary")
  })

  it("renders nothing when there are no recent searches", async () => {
    const wrapper = mount(RecentSearchesBar)
    const store = useRecentSearchesStore()
    store.symbols = []
    await flushPromises()
    expect(wrapper.findAll("[data-testid^='recent-search-']")).toHaveLength(0)
    expect(wrapper.attributes("aria-label")).toBeUndefined()
  })

  it("emits select on click", async () => {
    const wrapper = mount(RecentSearchesBar)
    const store = useRecentSearchesStore()
    store.symbols = ["MSFT"]
    await flushPromises()
    await wrapper.find("[data-testid='recent-search-MSFT']").trigger("click")
    const emitted = wrapper.emitted("select")
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(["MSFT"])
  })

  it("does not render an empty bar when no symbols have loaded yet", async () => {
    const wrapper = mount(RecentSearchesBar)
    await flushPromises()
    expect(wrapper.find("[data-testid^='recent-search-']").exists()).toBe(false)
  })
})
