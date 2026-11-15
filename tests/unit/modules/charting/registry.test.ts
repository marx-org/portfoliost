import { describe, expect, it } from "vitest"
import { chartRegistry, chartsByCategory, chartById } from "@/modules/charting/registry"

describe("chart registry", () => {
  it("has a stable, unique id per chart kind", () => {
    const ids = chartRegistry.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("groups charts by category", () => {
    for (const cat of ["performance", "income", "allocation", "cash", "categories"] as const) {
      const list = chartsByCategory(cat)
      expect(list.length).toBeGreaterThan(0)
      expect(list.every((c) => c.category === cat)).toBe(true)
    }
  })

  it("resolves a chart by id", () => {
    expect(chartById("income-monthly")?.dataset).toBe("income")
    expect(chartById("nope")).toBeUndefined()
  })
})