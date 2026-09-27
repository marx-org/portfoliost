import { defineStore } from "pinia"
import { ref } from "vue"

export const useDisplayCurrencyStore = defineStore("displayCurrency", () => {
  // §66.2 — this is a *display preference* the user picks (fed exclusively by the
  // /api/currencies registry, per AGENTS.md), so defaulting it to USD is a
  // deliberate product choice and not a guess about any amount. It must never be
  // used as a stand-in for the real currency of a value: amounts are converted
  // with toDisplay() from their own base currency first, and a value whose
  // currency is unknown renders without a symbol rather than borrowing this one.
  const currency = ref(localStorage.getItem("portfoliost_display_currency") || "USD")

  function setCurrency(next: string): void {
    currency.value = next
    localStorage.setItem("portfoliost_display_currency", next)
  }

  return { currency, setCurrency }
})
