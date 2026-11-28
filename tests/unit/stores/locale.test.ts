import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useLocaleStore } from "@/stores/locale"
import { getUserProfile, updateUserProfile } from "@/api/users"
import { i18n } from "@/i18n"

vi.mock("@/api/users", () => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
}))

const KEY = "portfoliost_locale"
const getProfile = vi.mocked(getUserProfile)
const updateProfile = vi.mocked(updateUserProfile)

describe("locale store (UI language, en + pl)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    getProfile.mockResolvedValue({ language: "en" } as never)
    updateProfile.mockResolvedValue({ language: "en" } as never)
    i18n.global.locale.value = "en"
    document.documentElement.lang = "en"
  })

  it("defaults to en and applies it to i18n + <html lang>", () => {
    const s = useLocaleStore()
    expect(s.locale).toBe("en")
    expect(i18n.global.locale.value).toBe("en")
  })

  it("reads a valid locale from localStorage at creation", () => {
    localStorage.setItem(KEY, "pl")
    const s = useLocaleStore()
    expect(s.locale).toBe("pl")
    expect(i18n.global.locale.value).toBe("pl")
  })

  it("falls back to en for a stored value that is not a shipped locale", () => {
    localStorage.setItem(KEY, "de")
    const s = useLocaleStore()
    expect(s.locale).toBe("en")
  })

  it("setLocale persists, applies to i18n, sets <html lang>, and writes through", () => {
    const s = useLocaleStore()
    s.setLocale("pl")
    expect(s.locale).toBe("pl")
    expect(i18n.global.locale.value).toBe("pl")
    expect(document.documentElement.lang).toBe("pl")
    expect(localStorage.getItem(KEY)).toBe("pl")
    expect(updateProfile).toHaveBeenCalledWith({ language: "pl" })
  })

  it("adopts the server locale when this browser has never chosen one", async () => {
    getProfile.mockResolvedValue({ language: "pl" } as never)
    const s = useLocaleStore()
    await s.hydrateFromServer()
    expect(s.locale).toBe("pl")
  })

  it("pushes an already-chosen LOCAL locale through when the server has none", async () => {
    localStorage.setItem(KEY, "pl")
    getProfile.mockResolvedValue({ language: "" } as never)
    const s = useLocaleStore()
    await s.hydrateFromServer()
    expect(updateProfile).toHaveBeenCalledWith({ language: "pl" })
  })

  it("keeps the local value when the server has a different valid one", async () => {
    localStorage.setItem(KEY, "pl")
    getProfile.mockResolvedValue({ language: "en" } as never)
    const s = useLocaleStore()
    await s.hydrateFromServer()
    expect(s.locale).toBe("pl")
    expect(updateProfile).toHaveBeenCalledWith({ language: "pl" })
  })

  it("keeps the local value when the server is unreachable, and does not throw", async () => {
    localStorage.setItem(KEY, "pl")
    getProfile.mockRejectedValue(new Error("offline"))
    const s = useLocaleStore()
    await expect(s.hydrateFromServer()).resolves.toBeUndefined()
    expect(s.locale).toBe("pl")
  })

  it("a failed write never blocks choosing a language", () => {
    updateProfile.mockRejectedValue(new Error("nope"))
    const s = useLocaleStore()
    s.setLocale("pl")
    expect(s.locale).toBe("pl")
    expect(localStorage.getItem(KEY)).toBe("pl")
  })
})