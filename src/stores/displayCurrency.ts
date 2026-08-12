import { defineStore } from "pinia"
import { ref } from "vue"

export const useDisplayCurrencyStore = defineStore("displayCurrency", () => {
  const currency = ref(localStorage.getItem("portfoliost_display_currency") || "USD")

  function setCurrency(next: string): void {
    currency.value = next
    localStorage.setItem("portfoliost_display_currency", next)
  }

  return { currency, setCurrency }
})
