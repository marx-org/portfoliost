import { describe, expect, it } from "vitest"
import { labelColors, labelPaletteHexes } from "@/utils/labelColors"

describe("labelColors (3.8)", () => {
  it("exposes exactly the 10 palette hexes", () => {
    expect(labelPaletteHexes).toHaveLength(10)
    expect(labelPaletteHexes[0]).toBe("#64748b")
  })

  it("maps each palette hex to a bg + text pair", () => {
    for (const hex of labelPaletteHexes) {
      const style = labelColors(hex)
      expect(style.bg).toMatch(/^rgba\(/)
      expect(style.text).toMatch(/^#/)
    }
  })

  it("falls back to the slate style for unknown hexes", () => {
    expect(labelColors("#000000")).toEqual(labelColors("#64748b"))
  })
})