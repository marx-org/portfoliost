import { computed, type Ref } from "vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"

export interface TargetCurrencyContext {
  /** Explicit leg target — wallet currency for cash movements and transaction settlement; portfolio currency as fallback */
  contextCurrency?: string | Ref<string | null | undefined>
}

/**
 * D40 — conversion-target precedence for FX legs:
 * portfolio/wallet currency > user display base currency.
 * Returns a ref so reactive context (wallet switch, portfolio switch) is tracked.
 */
export function useTargetCurrency(contextCurrency?: TargetCurrencyContext["contextCurrency"]) {
  const display = useDisplayCurrencyStore()
  return computed(() => {
    const explicit = contextCurrency
      ? typeof contextCurrency === "object"
        ? contextCurrency.value
        : contextCurrency
      : null
    return explicit || display.currency || "USD"
  })
}
