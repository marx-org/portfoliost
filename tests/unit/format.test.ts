import { describe, expect, it } from "vitest"
import {
  formatAmount,
  formatCompact,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatPercent,
  formatSignedCurrency,
} from "@/utils/format"

describe("format", () => {
  it("formats currency with thousands separators", () => {
    expect(formatCurrency(109916.76, "USD")).toBe("$109,916.76")
    expect(formatCurrency(1916.6, "USD")).toBe("$1,916.60")
    expect(formatCurrency(1000, "EUR")).toBe("€1,000.00")
  })

  it("handles null/undefined value", () => {
    expect(formatCurrency(null, "USD")).toBe("—")
    expect(formatCurrency(undefined, "USD")).toBe("—")
    expect(formatCurrency(NaN, "USD")).toBe("—")
  })

  // §66.2 — the whole point of the change: a currency is never guessed.
  it("§66.2: never guesses a currency — bare number, not a $", () => {
    for (const unknown of [null, undefined, "", "PL", "zł", "US", "EURO", "1234"]) {
      expect(formatCurrency(1234.5, unknown)).toBe("1,234.50")
    }
    expect(formatSignedCurrency(1234.5, null)).toBe("+1,234.50")
    expect(formatCompactCurrency(1234.5, "")).toBe("1.2K")
  })

  it("§66.2: a real ISO code is upper-cased, not passed through as typed", () => {
    expect(formatCurrency(1000, "pln")).toBe("PLN\u00A01,000.00")
    expect(formatCurrency(1000, "usd")).toBe("$1,000.00")
  })

  it("formatAmount: no guessed currency — plain number when currency is null (§47.5)", () => {
    expect(formatAmount(109916.76, null)).toBe("109,916.76")
    expect(formatAmount(109916.76, undefined)).toBe("109,916.76")
    expect(formatAmount(1916.6, null)).toBe("1,916.60") // §66.2: same 2dp as the symbolised form
    expect(formatAmount(1000, "EUR")).toBe("€1,000.00")
    expect(formatAmount(1000, "pln")).toBe("PLN\u00A01,000.00") // valid code is normalized, not guessed
    expect(formatAmount(1000, "US")).toBe("1,000.00") // not a 3-letter code → plain number
    expect(formatAmount(null, "USD")).toBe("—")
    expect(formatAmount(NaN, "USD")).toBe("—")
  })

  // §63.14 — the two cases the plan names, spelled out against the reported
  // bug (PortfolioCard rendering a PLN amount with a `$`). `Intl` under
  // `en-US` renders PLN as the code rather than `zł`; the `zł` glyph is the
  // currency registry's `symbol` (see `useCurrenciesStore`). What matters here
  // is that the label is PLN and never a dollar sign.
  it("§63.14: a PLN amount renders as PLN, never as $", () => {
    expect(formatCurrency(119250, "PLN")).toBe("PLN\u00A0119,250.00")
    expect(formatCurrency(119250, "PLN")).not.toContain("$")
  })

  it("§63.14: a null-currency amount renders with no currency symbol at all", () => {
    expect(formatCurrency(119250, null)).toBe("119,250.00")
    expect(formatCurrency(119250, null)).not.toContain("$")
    expect(formatCurrency(119250, undefined)).toBe("119,250.00")
  })

  it("formats percents", () => {
    expect(formatPercent(12.13)).toBe("12.13%")
    expect(formatPercent(3.36, 2, true)).toBe("+3.36%")
    expect(formatPercent(-1.5, 2, true)).toBe("-1.50%")
  })

  it("formats signed currency", () => {
    expect(formatSignedCurrency(11900.94, "USD")).toBe("+$11,900.94")
    expect(formatSignedCurrency(-5, "USD")).toBe("-$5.00")
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
