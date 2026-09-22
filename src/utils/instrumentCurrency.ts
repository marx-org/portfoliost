import type { components } from "@/api/types"

type S = components["schemas"]

export type CurrencySource = S["CurrencySource"]

export interface ResolvedInstrumentCurrency {
  currency: string | null
  currencySource: CurrencySource
}

interface CurrencyCarrier {
  currency?: string | null
  currencySource?: CurrencySource | null
}

/** §47.5 — pick the instrument's currency + sourcing signal from the carriers
 * (profile, then quote). No "USD" fallback: when nothing declares a currency
 * the result is null + "unknown" so the view can red-flag it instead of
 * rendering a fake label.
 *
 * The currency always comes from the first carrier that declares one; the
 * sourcing signal is the strongest one among carriers that agree on that
 * currency — a provider declaration (e.g. on the quote) upgrades an
 * "estimated" local resolution on another carrier.
 */
export function resolveInstrumentCurrency(
  primary: CurrencyCarrier | null | undefined,
  secondary: CurrencyCarrier | null | undefined,
): ResolvedInstrumentCurrency {
  const carriers = [primary, secondary]
  const first = carriers.find((c) => c?.currency)
  const currency = first?.currency
  if (!currency) return { currency: null, currencySource: "unknown" }
  const upper = currency.toUpperCase()
  const sources = carriers
    .filter((c) => c?.currency?.toUpperCase() === upper)
    .map((c) => c!.currencySource ?? "provider")
  return {
    currency: upper,
    currencySource: sources.includes("provider") ? "provider" : sources.includes("estimated") ? "estimated" : "unknown",
  }
}
