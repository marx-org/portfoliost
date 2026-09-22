import { describe, expect, it } from "vitest"
import { resolveInstrumentCurrency } from "@/utils/instrumentCurrency"

describe("resolveInstrumentCurrency (§47.5)", () => {
  it("prefers the profile's declared currency (provider)", () => {
    expect(resolveInstrumentCurrency({ currency: "pln", currencySource: "provider" }, { currency: "USD" })).toEqual({
      currency: "PLN",
      currencySource: "provider",
    })
  })

  it("keeps the provider's sourcing signal (estimated)", () => {
    expect(resolveInstrumentCurrency({ currency: "PLN", currencySource: "estimated" }, null)).toEqual({
      currency: "PLN",
      currencySource: "estimated",
    })
  })

  it("falls back to the quote when the profile has no currency", () => {
    expect(resolveInstrumentCurrency({ currency: null }, { currency: "usd", currencySource: "provider" })).toEqual({
      currency: "USD",
      currencySource: "provider",
    })
    expect(resolveInstrumentCurrency(null, { currency: "USD" })).toEqual({
      currency: "USD",
      currencySource: "provider",
    })
  })

  it("surfaces unknown (never a USD guess) when nothing declares a currency", () => {
    expect(resolveInstrumentCurrency({ currency: null }, { currency: null })).toEqual({
      currency: null,
      currencySource: "unknown",
    })
    expect(resolveInstrumentCurrency(null, null)).toEqual({ currency: null, currencySource: "unknown" })
    expect(resolveInstrumentCurrency({ currency: "" }, undefined)).toEqual({
      currency: null,
      currencySource: "unknown",
    })
  })

  it("defaults a declared currency without a source to provider", () => {
    expect(resolveInstrumentCurrency({ currency: "GBP" }, null).currencySource).toBe("provider")
  })

  it("a provider declaration on one carrier upgrades an estimated local resolution", () => {
    // profile resolved locally (estimated) but the quote provider-declares the
    // same currency → the authoritative provider signal wins (SNT.WA: local
    // asset-class rule vs openst's PLN quote).
    expect(resolveInstrumentCurrency({ currency: "PLN", currencySource: "estimated" }, { currency: "PLN", currencySource: "provider" })).toEqual({
      currency: "PLN",
      currencySource: "provider",
    })
  })

  it("does not upgrade when carriers disagree on the currency", () => {
    expect(resolveInstrumentCurrency({ currency: "PLN", currencySource: "estimated" }, { currency: "USD", currencySource: "provider" })).toEqual({
      currency: "PLN",
      currencySource: "estimated",
    })
  })
})
