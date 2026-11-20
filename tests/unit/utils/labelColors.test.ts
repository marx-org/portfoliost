import { describe, expect, it } from "vitest"
import { labelColors, labelPaletteHexes } from "@/utils/labelColors"

/**
 * labelColors is a pure hex → {bg, text} lookup. The suite used to assert the
 * palette length and its first element (which only restates the module's own
 * constant) and then, for the mapping, only that bg looks like `rgba(` and text
 * like `#` — so any bg/text pair would pass. These cases pin the actual style
 * each palette entry resolves to, so a wrong or missing mapping fails.
 */
describe("labelColors (3.8)", () => {
  const expected: Record<string, { bg: string; text: string }> = {
    "#64748b": { bg: "rgba(100,116,139,0.18)", text: "#334155" },
    "#ef4444": { bg: "rgba(239,68,68,0.15)", text: "#991b1b" },
    "#f59e0b": { bg: "rgba(245,158,11,0.16)", text: "#92400e" },
    "#10b981": { bg: "rgba(16,185,129,0.14)", text: "#065f46" },
    "#3b82f6": { bg: "rgba(59,130,246,0.14)", text: "#1e40af" },
    "#a855f7": { bg: "rgba(168,85,247,0.14)", text: "#6b21a8" },
    "#ec4899": { bg: "rgba(236,72,153,0.14)", text: "#9d174d" },
    "#06b6d4": { bg: "rgba(6,182,212,0.14)", text: "#155e75" },
    "#f97316": { bg: "rgba(249,115,22,0.15)", text: "#9a3412" },
    "#14b8a6": { bg: "rgba(20,184,166,0.14)", text: "#115e59" },
  }

  it("exposes exactly the 10 palette hexes", () => {
    expect(labelPaletteHexes).toHaveLength(10)
  })

  it.each(Object.entries(expected))("maps %s to its bg + text pair", (hex, style) => {
    expect(labelColors(hex)).toEqual(style)
  })

  it("falls back to the slate style for unknown hexes", () => {
    expect(labelColors("#000000")).toEqual(expected["#64748b"])
  })
})