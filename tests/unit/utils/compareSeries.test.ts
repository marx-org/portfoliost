import { describe, expect, it } from "vitest"
import { crossCurrencyCaption, needsPercentComparison, percentNormalize } from "@/utils/compareSeries"

describe("compareSeries (§36 cross-currency overlay)", () => {
  describe("needsPercentComparison", () => {
    it("is false when currencies match (case-insensitive)", () => {
      expect(needsPercentComparison("USD", "USD")).toBe(false)
      expect(needsPercentComparison("usd", "USD")).toBe(false)
      expect(needsPercentComparison("PLN", "pln")).toBe(false)
    })
    it("is true when currencies differ", () => {
      expect(needsPercentComparison("PLN", "USD")).toBe(true)
      expect(needsPercentComparison("USD", "EUR")).toBe(true)
    })
    it("§66.2: an unknown currency is never assumed to match a known one", () => {
      // previously "" was treated as USD, so a missing currency silently agreed
      // with a USD series; now an unknown side always reports a difference
      expect(needsPercentComparison("", "USD")).toBe(true)
      expect(needsPercentComparison("PLN", "")).toBe(true)
      expect(needsPercentComparison(null, null)).toBe(true)
      expect(needsPercentComparison("usd", "USD")).toBe(false)
    })
  })

  describe("percentNormalize", () => {
    it("re-bases the first valid point to 0", () => {
      expect(percentNormalize([100, 110, 99])).toEqual([0, 10, -1])
    })
    it("uses the first finite non-zero value as the base", () => {
      // leading points before the base are expressed relative to it
      expect(percentNormalize([0, 0, 100, 120])).toEqual([-100, -100, 0, 20])
    })
    it("returns zeros when there is no usable base", () => {
      expect(percentNormalize([0, 0, 0])).toEqual([0, 0, 0])
      expect(percentNormalize([])).toEqual([])
    })
    it("maps non-finite points to 0", () => {
      expect(percentNormalize([100, NaN, 200])).toEqual([0, 0, 100])
    })
  })

  describe("crossCurrencyCaption", () => {
    it("names both currencies upper-cased", () => {
      expect(crossCurrencyCaption("pln", "USD")).toBe("Percent — currencies differ (PLN vs USD)")
    })
  })
})
