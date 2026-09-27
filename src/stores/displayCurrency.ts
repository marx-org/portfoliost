import { defineStore } from "pinia"
import { ref } from "vue"
import { getUserPreferences, patchUserPreferences } from "@/api/preferences"

const STORAGE_KEY = "portfoliost_display_currency"

export const useDisplayCurrencyStore = defineStore("displayCurrency", () => {
  // §66.2 — this is a *display preference* the user picks (fed exclusively by the
  // /api/currencies registry, per AGENTS.md), so defaulting it to USD is a
  // deliberate product choice and not a guess about any amount. It must never be
  // used as a stand-in for the real currency of a value: amounts are converted
  // from their own base currency first, and a value whose currency is unknown
  // renders without a symbol rather than borrowing this one.
  const currency = ref(localStorage.getItem(STORAGE_KEY) || "USD")

  function persist(next: string): void {
    currency.value = next
    localStorage.setItem(STORAGE_KEY, next)
  }

  /**
   * §67.1 — the Display-currency selector IS the user's `baseCurrency`
   * preference, so it is written through to users_auth. Until this existed the
   * choice lived only in this browser's localStorage, so `preferredBaseCurrency()`
   * on the backend could never read it and `total-metrics` always fell back to
   * its USD default — the aggregate was denominated in a currency the user does
   * not use, which is why the headline could not reconcile with the cards.
   *
   * Best-effort by design: a failed write must not break choosing a currency, so
   * the local value stands and the next pick retries.
   */
  async function syncToServer(next: string): Promise<void> {
    try {
      await patchUserPreferences({ baseCurrency: next })
    } catch {
      // deliberately silent — see above
    }
  }

  function setCurrency(next: string): void {
    persist(next)
    void syncToServer(next)
  }

  /**
   * Adopt the server's preference when this browser has never chosen one, so the
   * display currency follows the user across devices. An explicit local choice
   * always wins.
   */
  async function hydrateFromServer(): Promise<void> {
    if (localStorage.getItem(STORAGE_KEY)) return
    try {
      const prefs = await getUserPreferences()
      const base = prefs?.uiPreferences?.baseCurrency
      if (typeof base === "string" && /^[A-Za-z]{3}$/.test(base)) {
        persist(base.toUpperCase())
      }
    } catch {
      // no server preference yet — keep the default
    }
  }

  return { currency, setCurrency, hydrateFromServer }
})
