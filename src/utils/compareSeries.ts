/**
 * §36 — cross-currency chart comparison helpers.
 *
 * A price series is denominated in the instrument's trading currency. Overlaying
 * a benchmark priced in a *different* currency on the same axis is meaningless
 * (PLN stock vs USD SPY), and there is no FX recalculation here — the only
 * honest generic comparison is percent-normalized (each series re-based to 0%
 * at the start of the window). These helpers decide and apply that.
 */

/** True when the overlay must be percent-normalized because currencies differ. */
export function needsPercentComparison(instrumentCcy: string | null | undefined, benchmarkCcy: string | null | undefined): boolean {
  // §66.2 — the two series are comparable only when BOTH currencies are known
  // and equal. An unknown side (including both unknown, which would otherwise
  // compare "" === "" and silently agree) is reported as a difference, so the
  // chart falls back to percent-normalized rather than overlaying two series
  // that may not share a unit.
  const a = (instrumentCcy || "").trim().toUpperCase()
  const b = (benchmarkCcy || "").trim().toUpperCase()
  if (!a || !b) return true
  return a !== b
}

/**
 * Re-base a price slice so its first point is 0 and the rest are percent
 * change from that point. Non-finite / missing first value → zeros.
 */
export function percentNormalize(prices: number[]): number[] {
  const base = prices.find((p) => typeof p === "number" && isFinite(p) && p !== 0) ?? 0
  if (!base) return prices.map(() => 0)
  return prices.map((p) => (typeof p === "number" && isFinite(p) ? ((p - base) / base) * 100 : 0))
}

/** Caption shown when the benchmark is percent-normalized due to a currency gap. */
export function crossCurrencyCaption(instrumentCcy: string | null | undefined, benchmarkCcy: string | null | undefined): string {
  const a = (instrumentCcy || "").toUpperCase() || "unknown"
  const b = (benchmarkCcy || "").toUpperCase() || "unknown"
  return `Percent — currencies differ (${a} vs ${b})`
}
