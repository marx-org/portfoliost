import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"
import { useTargetCurrency } from "@/composables/useTargetCurrency"

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe("useTargetCurrency (§10a D40)", () => {
  it("prefers the explicit portfolio/wallet context currency", () => {
    const t = useTargetCurrency("PLN")
    expect(t.value).toBe("PLN")
  })

  it("falls back to the user display base currency", async () => {
    localStorage.setItem("portfoliost_display_currency", "EUR")
    const { useDisplayCurrencyStore } = await import("@/stores/displayCurrency")
    useDisplayCurrencyStore().setCurrency("EUR")
    const t = useTargetCurrency(undefined)
    expect(t.value).toBe("EUR")
  })

  it("reacts to context changes (wallet switch)", async () => {
    const { ref } = await import("vue")
    const walletCcy = ref<string | null>("USD")
    const t = useTargetCurrency(walletCcy)
    expect(t.value).toBe("USD")
    walletCcy.value = "PLN"
    expect(t.value).toBe("PLN")
    walletCcy.value = null
    expect(t.value).toBe("USD") // falls back once context cleared
  })
})
