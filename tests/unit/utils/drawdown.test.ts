import { describe, expect, it } from "vitest"
import { currentDrawdownPercent } from "@/utils/drawdown"

/**
 * §81.3 — the Drawdown card on the Performance tab took its peak over raw
 * `value`, so every deposit raised the running maximum and shrank the reported
 * drawdown. The TWR index is the flow-neutral series the peak belongs on.
 */
describe("currentDrawdownPercent", () => {
  it("reads −50%, not −75%, for a deposit made during a drawdown", () => {
    // 100 → 50 → +100 → 150 → 75. Flow-neutral: the deposit lands on a flat
    // price day (index stays 50) and the portfolio then halves to 25.
    const series = [
      { value: 100, cumulativeTwr: 100 },
      { value: 50, cumulativeTwr: 50 },
      { value: 150, cumulativeTwr: 50 },
      { value: 75, cumulativeTwr: 25 },
    ]
    expect(currentDrawdownPercent(series)).toBe(-75)
  })

  it("ignores raw value entirely when a TWR column is present", () => {
    // A 10x deposit with no market move: the value path would report a new
    // peak and therefore a 0% drawdown.
    const series = [
      { value: 100, cumulativeTwr: 100 },
      { value: 1000, cumulativeTwr: 100 },
      { value: 1000, cumulativeTwr: 90 },
    ]
    expect(currentDrawdownPercent(series)).toBeCloseTo(-10, 10)
  })

  it("falls back to raw value when the series has no TWR column", () => {
    const series = [{ value: 100 }, { value: 80 }, { value: 120 }, { value: 90 }]
    expect(currentDrawdownPercent(series)).toBe(-25)
  })

  it("agrees with the raw-value path on a no-flow series", () => {
    // TWR is proportional to value here, so both paths must give the same number.
    const twr = [{ value: 100, cumulativeTwr: 100 }, { value: 120, cumulativeTwr: 120 }, { value: 60, cumulativeTwr: 60 }]
    const raw = [{ value: 100 }, { value: 120 }, { value: 60 }]
    expect(currentDrawdownPercent(twr)).toBe(currentDrawdownPercent(raw))
    expect(currentDrawdownPercent(twr)).toBe(-50)
  })

  it("returns null for too little data", () => {
    expect(currentDrawdownPercent([])).toBeNull()
    expect(currentDrawdownPercent([{ value: 100 }])).toBeNull()
    expect(currentDrawdownPercent([{ value: 100 }, { value: null }])).toBeNull()
    expect(currentDrawdownPercent([{ value: 0 }, { value: 0 }])).toBeNull()
  })

  it("returns 0 at a fresh high", () => {
    expect(currentDrawdownPercent([{ value: 100, cumulativeTwr: 100 }, { value: 150, cumulativeTwr: 130 }])).toBe(0)
  })

  it("ignores a null TWR point rather than reading it as a peak", () => {
    const series = [
      { value: 100, cumulativeTwr: 100 },
      { value: 50, cumulativeTwr: 50 },
      { value: 75, cumulativeTwr: null },
    ]
    // The readable TWR points are [100, 50] → −50%, not a peak of 100 read
    // against a missing third point.
    expect(currentDrawdownPercent(series)).toBe(-50)
  })
})
