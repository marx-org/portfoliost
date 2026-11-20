import { describe, expect, it } from "vitest"
import { chartRegistry, chartsByCategory, chartById } from "@/modules/charting/registry"

describe("chart registry", () => {
  it("has a stable, unique id per chart kind", () => {
    const ids = chartRegistry.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("groups charts by category", () => {
    // The old companion assertion `list.every(c => c.category === cat)` could
    // not fail: `chartsByCategory` is `chartRegistry.filter(c => c.category ===
    // category)`, so every returned element satisfies the predicate by
    // construction. What is worth pinning is which charts each category
    // resolves to, so a chart silently dropped from (or added to) a tab fails.
    const expected: Record<string, string[]> = {
      performance: ["performance-valuation", "performance-benchmark", "performance-quarterly", "performance-scatter"],
      income: ["income-monthly", "income-cumulative", "income-annual", "income-daily-average", "income-monthly-average", "income-quarterly", "income-quarterly-yoy", "income-payer-coverage"],
      allocation: ["allocation-currency", "allocation-asset-type", "allocation-sector", "allocation-category", "allocation-cost-basis", "allocation-composition"],
      cash: ["cash-balance", "cash-contributions", "cash-cumulative-contributions"],
      categories: ["stock-categories"],
    }
    for (const [cat, ids] of Object.entries(expected)) {
      expect(chartsByCategory(cat as "performance").map((c) => c.id)).toEqual(ids)
    }
  })

  it("resolves a chart by id", () => {
    expect(chartById("income-monthly")?.dataset).toBe("income")
    expect(chartById("nope")).toBeUndefined()
  })
})