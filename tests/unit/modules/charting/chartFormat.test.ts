import { describe, expect, it } from "vitest"
import { axisCurrency, axisPercent, labelCurrency, labelPercent } from "@/modules/charting/chartFormat"

describe("chartFormat", () => {
  it("formats axis currency compactly without float noise", () => {
    const pln = axisCurrency(80, "PLN")
    expect(pln).toContain("80")
    expect(pln).not.toContain(".")
    expect(axisCurrency(1234567, "USD")).toBe("$1.2M")
  })

  it("formats percent ticks to at most one decimal with the unit", () => {
    expect(axisPercent(80)).toBe("80%")
    expect(axisPercent(69.72577697)).toBe("69.7%")
    expect(axisPercent(-24.97272669)).toBe("-25%")
  })

  it("rounds data labels and adds an explicit positive sign", () => {
    expect(labelCurrency(1234.5678, "USD")).toBe("$1.2K")
    expect(labelPercent(8.13340118)).toBe("+8.1%")
    expect(labelPercent(-1.24805828)).toBe("-1.2%")
    expect(labelPercent(0)).toBe("0%")
  })
})