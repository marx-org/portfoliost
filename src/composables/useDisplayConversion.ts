import { computed, ref, watchEffect } from "vue"
import { storeToRefs } from "pinia"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { getLatestRate } from "@/api/fx"

/**
 * §66.3 — one implementation of "render this base-currency amount in the user's
 * display currency".
 *
 * Two rules that were previously implicit in each caller and are now explicit:
 *
 *  1. **Never convert without a rate.** `convert()` returns null while the rate
 *     is unknown, and `displayCurrencyOr()` falls back to the amount's OWN
 *     currency for the label. A number is never multiplied by a guess.
 *  2. **Never label with a currency we do not have.** If even the source
 *     currency is unknown, `displayCurrencyOr()` returns null and the formatters
 *     (§66.2) render a bare number.
 *
 * `sourceCurrency` is a ref so a caller can pass a per-portfolio base (the
 * summary metrics' `currency`) rather than one global.
 */
export function useDisplayConversion(sourceCurrency: () => string | null | undefined) {
  const displayStore = useDisplayCurrencyStore()
  const { currency: displayCurrency } = storeToRefs(displayStore)

  const source = computed(() => (sourceCurrency() ?? "").toUpperCase())
  const target = computed(() => (displayCurrency.value ?? "").toUpperCase())
  const rate = ref<number | null>(null)

  watchEffect(() => {
    const src = source.value
    const dst = target.value
    if (!src || !dst) { rate.value = null; return }
    if (src === dst) { rate.value = 1; return }
    rate.value = null
    void getLatestRate(src, dst).then((r) => {
      if (r && typeof r.rate === "number" && r.rate > 0) rate.value = r.rate
    })
  })

  /** base-currency amount → display currency, or null while the rate is unknown. */
  function convert(v: number | null | undefined): number | null {
    if (v == null) return null
    return rate.value == null ? null : Math.round(v * rate.value * 100) / 100
  }

  /** The currency a converted amount is denominated in: the display currency once
   * a rate is known, otherwise the amount's own, otherwise nothing. */
  function displayCurrencyOr(): string | null {
    if (rate.value != null) return target.value || null
    return source.value || null
  }

  return { displayCurrency, rate, convert, displayCurrencyOr }
}
