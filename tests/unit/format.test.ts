import { describe, expect, it } from "vitest"
import {
  formatCompact,
  formatCurrency,
  formatDate,
  formatPercent,
  formatSignedCurrency,
} from "@/utils/format"

describe("format", () => {
  it("formats currency with thousands separators", () => {
    expect(formatCurrency(109916.76)).toBe("$109,916.76")
    expect(formatCurrency(1916.6)).toBe("$1,916.60")
    expect(formatCurrency(1000, "EUR")).toBe("€1,000.00")
  })

  it("handles null/undefined currency", () => {
    expect(formatCurrency(null)).toBe("—")
    expect(formatCurrency(undefined)).toBe("—")
    expect(formatCurrency(NaN)).toBe("—")
  })

  it("formats percents", () => {
    expect(formatPercent(12.13)).toBe("12.13%")
    expect(formatPercent(3.36, 2, true)).toBe("+3.36%")
    expect(formatPercent(-1.5, 2, true)).toBe("-1.50%")
  })

  it("formats signed currency", () => {
    expect(formatSignedCurrency(11900.94)).toBe("+$11,900.94")
    expect(formatSignedCurrency(-5)).toBe("-$5.00")
  })

  it("formats compact numbers", () => {
    expect(formatCompact(109984.34)).toBe("109.98K")
    expect(formatCompact(1500000000)).toBe("1.5B")
  })

  it("formats dates", () => {
    expect(formatDate("2026-08-01T10:14:16.111Z")).toBe("Aug 1, 2026")
    expect(formatDate(1786438131722)).toBe("Aug 11, 2026")
    expect(formatDate(null)).toBe("—")
  })
})
