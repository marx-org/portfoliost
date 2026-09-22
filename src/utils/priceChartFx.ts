/**
 * Plan §48.5 — chart currency-selector helpers (pure, unit-tested).
 *
 * The Price Chart title carries a currency `<select>` (options from the shared
 * `/api/currencies` registry — never hardcoded). Selecting a currency re-fetches
 * the series with `?currency=` (plan §48.2 server-side conversion) and renders
 * the converted closes. Bars older than the FX floor stay in the base currency
 * (no carry-forward) and the chart caveats via `fxFrom`.
 */

/**
 * Map the selected display currency to the API `?currency=` param.
 * Empty selections and same-currency selections (selected === base) map to
 * null — the server short-circuits those to the plain base series anyway
 * (plan §48.2 identity rule), so no redundant refetch is issued.
 */
export function currencyQueryParam(
  selected: string | null | undefined,
  base: string | null | undefined,
): string | null {
  const s = (selected ?? "").trim().toUpperCase()
  if (!s) return null
  const b = (base ?? "").trim().toUpperCase()
  return s === b ? null : s
}

/**
 * `fxFrom` caveat predicate + text (plan §48.5a). The caveat is visible while
 * the *visible window* starts before the first converted bar: the earlier bars
 * were served unconverted, in the instrument's base currency.
 *
 * `fxFrom` is the first in-window date that actually converted (null when the
 * conversion applied to no bar); `windowStartIso` is the first visible bar's
 * ISO date. Both are YYYY-MM-DD, so lexicographic comparison is chronological.
 */
export function fxCaveat(
  fxFrom: string | null | undefined,
  baseCcy: string | null | undefined,
  windowStartIso: string | null | undefined,
): string | null {
  if (!fxFrom || !baseCcy || !windowStartIso) return null
  if (!(windowStartIso < fxFrom)) return null
  return `FX rates from ${fxFrom}; earlier bars in ${baseCcy.toUpperCase()}`
}
