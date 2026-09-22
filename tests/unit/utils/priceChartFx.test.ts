import { describe, expect, it } from "vitest"
import { currencyQueryParam, fxCaveat } from "@/utils/priceChartFx"

describe("priceChartFx (plan §48.5 chart currency selector)", () => {
  describe("currencyQueryParam (selector → ?currency= param)", () => {
    it("maps a cross-currency selection to the upper-cased target", () => {
      expect(currencyQueryParam("USD", "PLN")).toBe("USD")
      expect(currencyQueryParam("usd", "pln")).toBe("USD")
      expect(currencyQueryParam("  usd ", "PLN")).toBe("USD")
    })
    it("short-circuits same-currency selections to null (identity, no refetch)", () => {
      expect(currencyQueryParam("PLN", "PLN")).toBeNull()
      expect(currencyQueryParam("pln", "PLN")).toBeNull()
      expect(currencyQueryParam("USD", "usd")).toBeNull()
    })
    it("maps empty/missing selections to null (native base series)", () => {
      expect(currencyQueryParam("", "PLN")).toBeNull()
      expect(currencyQueryParam(null, "PLN")).toBeNull()
      expect(currencyQueryParam(undefined, undefined)).toBeNull()
      expect(currencyQueryParam("   ", "PLN")).toBeNull()
    })
    it("never converts when the base currency is unknown", () => {
      // The server 400s a conversion with an unresolvable base; the selector
      // stays hidden in that case, but the mapping must still be a plain pass.
      expect(currencyQueryParam("USD", "")).toBe("USD")
      expect(currencyQueryParam("USD", null)).toBe("USD")
    })
  })

  describe("fxCaveat (fxFrom caveat predicate)", () => {
    it("shows the caveat while the visible window starts before fxFrom", () => {
      expect(fxCaveat("2026-08-24", "PLN", "2025-09-22")).toBe(
        "FX rates from 2026-08-24; earlier bars in PLN",
      )
      // the boundary itself is unconverted (window starts ON fxFrom's
      // predecessor day → bars before fxFrom are visible)
      expect(fxCaveat("2026-08-24", "pln", "2026-08-23")).toBe(
        "FX rates from 2026-08-24; earlier bars in PLN",
      )
    })
    it("hides the caveat once the visible window starts at/after fxFrom", () => {
      expect(fxCaveat("2026-08-24", "PLN", "2026-08-24")).toBeNull()
      expect(fxCaveat("2026-08-24", "PLN", "2026-08-25")).toBeNull()
      expect(fxCaveat("2026-08-24", "PLN", "2027-01-01")).toBeNull()
    })
    it("hides the caveat without an fxFrom (no conversion applied in window)", () => {
      expect(fxCaveat(null, "PLN", "2025-09-22")).toBeNull()
      expect(fxCaveat(undefined, "PLN", "2025-09-22")).toBeNull()
    })
    it("hides the caveat without a known base currency or window", () => {
      expect(fxCaveat("2026-08-24", null, "2025-09-22")).toBeNull()
      expect(fxCaveat("2026-08-24", "", "2025-09-22")).toBeNull()
      expect(fxCaveat("2026-08-24", "PLN", null)).toBeNull()
      expect(fxCaveat("2026-08-24", "PLN", undefined)).toBeNull()
    })
    it("compares ISO dates lexicographically (chronological)", () => {
      expect(fxCaveat("2025-01-01", "PLN", "2024-12-31")).toBe(
        "FX rates from 2025-01-01; earlier bars in PLN",
      )
      expect(fxCaveat("2024-12-31", "PLN", "2025-01-01")).toBeNull()
    })
  })
})
