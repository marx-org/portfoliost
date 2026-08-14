import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useThemeStore } from "@/stores/theme"

function mockMatchMedia(dark: boolean) {
  const mql = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql))
  return mql
}

describe("theme store", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    document.documentElement.className = ""
    document.documentElement.style.colorScheme = ""
    vi.unstubAllGlobals()
  })

  it("defaults to light and applies no dark class", () => {
    const store = useThemeStore()
    store.init()
    expect(store.preference).toBe("light")
    expect(store.isDark).toBe(false)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("switches to dark and persists the preference", () => {
    const store = useThemeStore()
    store.init()
    store.setPreference("dark")
    expect(store.isDark).toBe(true)
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(localStorage.getItem("portfoliost_theme")).toBe("dark")
  })

  it("switches back to light and removes the dark class", () => {
    const store = useThemeStore()
    store.init()
    store.setPreference("dark")
    store.setPreference("light")
    expect(store.isDark).toBe(false)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(localStorage.getItem("portfoliost_theme")).toBe("light")
  })

  it("restores a persisted dark preference on init", () => {
    localStorage.setItem("portfoliost_theme", "dark")
    const store = useThemeStore()
    store.init()
    expect(store.preference).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("follows the system preference in system mode", () => {
    mockMatchMedia(true)
    const store = useThemeStore()
    store.setPreference("system")
    expect(store.isDark).toBe(true)
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("portfoliost_theme")).toBe("system")

    mockMatchMedia(false)
    store.setPreference("system")
    expect(store.isDark).toBe(false)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("ignores an unknown stored value and falls back to light", () => {
    localStorage.setItem("portfoliost_theme", "neon")
    const store = useThemeStore()
    store.init()
    expect(store.preference).toBe("light")
    expect(store.isDark).toBe(false)
  })
})
