/**
 * §81.3 — drawdown arithmetic shared between the Performance tab and its tests.
 *
 * A drawdown is only meaningful on a *flow-neutral* series. Taking the peak
 * over raw portfolio value makes the denominator "peak including money that
 * was never at risk": every deposit raises the running maximum, so a deposit
 * made during a drawdown shrinks the reported drawdown by roughly the amount
 * of the deposit.
 *
 * The analytics payload already carries `cumulativeTwr`, which is the
 * flow-neutral index (100 = start), so that is the series this reads. It is
 * preferred over re-deriving a TWR chain in the SPA: the backend pre-computes
 * it, and 2 dp of rounding is ample for a peak lookup.
 *
 * The raw-`value` path is kept as a fallback for a pre-migration snapshot row
 * that has no TWR column, so the card renders rather than blanking.
 */

export interface DrawdownPoint {
  /** Raw portfolio value — the fallback series. */
  value?: number | null
  /** Flow-neutral index, 100-based. */
  cumulativeTwr?: number | null
}

/**
 * Current drawdown as a percentage (negative, e.g. -50), or null when there is
 * not enough data to say.
 */
export function currentDrawdownPercent(points: DrawdownPoint[]): number | null {
  if (points.length < 2) return null

  const twr = points.map((p) => (typeof p.cumulativeTwr === "number" ? p.cumulativeTwr : NaN))
  const hasTwr = twr.some((v) => isFinite(v))
  const series = (hasTwr ? twr : points.map((p) => (typeof p.value === "number" ? p.value : NaN)))
    // A gap must not silently become the new peak, so drop unreadable points.
    .filter((v) => isFinite(v))

  if (series.length < 2) return null
  const max = Math.max(...series)
  if (!max) return null
  return (series[series.length - 1] / max - 1) * 100
}
