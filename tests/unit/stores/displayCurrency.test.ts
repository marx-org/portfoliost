import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { getUserPreferences, patchUserPreferences } from "@/api/preferences"

vi.mock("@/api/preferences", () => ({
  getUserPreferences: vi.fn(),
  patchUserPreferences: vi.fn(),
}))

const KEY = "portfoliost_display_currency"
const getPrefs = vi.mocked(getUserPreferences)
const patchPrefs = vi.mocked(patchUserPreferences)

describe("displayCurrency (§67.1 — the selector IS the base-currency preference)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    getPrefs.mockResolvedValue({ uiPreferences: {} } as never)
    patchPrefs.mockResolvedValue({ uiPreferences: {} } as never)
  })

  it("writes the choice through to the server on selection", () => {
    const s = useDisplayCurrencyStore()
    s.setCurrency("PLN")
    expect(s.currency).toBe("PLN")
    expect(patchPrefs).toHaveBeenCalledWith({ baseCurrency: "PLN" })
  })

  it("adopts the server preference when this browser has never chosen one", async () => {
    getPrefs.mockResolvedValue({ uiPreferences: { baseCurrency: "eur" } } as never)
    const s = useDisplayCurrencyStore()
    await s.hydrateFromServer()
    expect(s.currency).toBe("EUR")
  })

  /**
   * The direction the first version of §67.1 missed. It only wrote on a selection
   * event, so a currency the user had ALREADY chosen before the write-through
   * shipped was never sent — PROD had PLN in localStorage and `uiPreferences: {}`
   * on the server, and the backend went on denominating the aggregate in USD.
   * A deploy that adds write-through has to push the value that already exists.
   */
  it("pushes an already-chosen LOCAL currency through when the server has none", async () => {
    localStorage.setItem(KEY, "PLN")
    getPrefs.mockResolvedValue({ uiPreferences: {} } as never)
    const s = useDisplayCurrencyStore()
    expect(s.currency).toBe("PLN") // read from localStorage
    await s.hydrateFromServer()
    expect(patchPrefs).toHaveBeenCalledWith({ baseCurrency: "PLN" })
  })

  it("does not overwrite the local value when the server already has a different one", async () => {
    localStorage.setItem(KEY, "PLN")
    getPrefs.mockResolvedValue({ uiPreferences: { baseCurrency: "USD" } } as never)
    const s = useDisplayCurrencyStore()
    await s.hydrateFromServer()
    // what the user is looking at right now wins; the next pick resyncs the server
    expect(s.currency).toBe("PLN")
    expect(patchPrefs).not.toHaveBeenCalled()
  })

  it("keeps the local value when the server is unreachable, and does not throw", async () => {
    localStorage.setItem(KEY, "PLN")
    getPrefs.mockRejectedValue(new Error("offline"))
    patchPrefs.mockRejectedValue(new Error("offline"))
    const s = useDisplayCurrencyStore()
    await expect(s.hydrateFromServer()).resolves.toBeUndefined()
    expect(s.currency).toBe("PLN")
  })

  it("a failed write never blocks choosing a currency", async () => {
    patchPrefs.mockRejectedValue(new Error("nope"))
    const s = useDisplayCurrencyStore()
    s.setCurrency("GBP")
    expect(s.currency).toBe("GBP")
    expect(localStorage.getItem(KEY)).toBe("GBP")
  })
})
