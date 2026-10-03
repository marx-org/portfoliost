import { describe, expect, it } from "vitest"
import { RESEARCH_FALLBACK_PATH, researchBackTarget, researchRoute, researchSymbol } from "@/utils/research"

describe("researchSymbol", () => {
  it("uppercases the symbol", () => {
    expect(researchSymbol("sap")).toBe("SAP")
  })

  it("does not strip or add a venue suffix", () => {
    // §85.7 — researchSymbol never rewrites venues, and must not start now.
    // Stripping is `venueFreeSymbol`'s job on the backend (portfoliost-instruments
    // src/adapters/symbol.ts), which cuts at the LAST dot; `providerSymbol` there
    // strips only a trailing ".US". Duplicating either rule here would make the
    // URL disagree with what the instruments service resolves.
    expect(researchSymbol("snt.wa")).toBe("SNT.WA")
    expect(researchSymbol("SNT.WA.US")).toBe("SNT.WA.US")
    expect(researchSymbol("aapl")).toBe("AAPL")
    expect(researchSymbol("rod1033")).toBe("ROD1033")
  })
})

describe("researchRoute", () => {
  it("carries the origin as the `from` query param and normalizes the symbol", () => {
    expect(researchRoute("aapl", "/en/portfolios/abc/holdings?x=1")).toEqual({
      name: "research-overview",
      params: { symbol: "AAPL" },
      query: { from: "/en/portfolios/abc/holdings?x=1" },
    })
  })

  it("omits the query entirely when there is no origin", () => {
    const r = researchRoute("aapl") as { query?: unknown }
    expect(r).toEqual({ name: "research-overview", params: { symbol: "AAPL" } })
    expect("query" in r).toBe(false)
  })

  it("omits the query for a null/empty origin", () => {
    expect("query" in (researchRoute("AAPL", null) as object)).toBe(false)
    expect("query" in (researchRoute("AAPL", "") as object)).toBe(false)
  })
})

describe("researchBackTarget", () => {
  it("passes a valid internal path through", () => {
    expect(researchBackTarget({ from: "/en/portfolios/abc/holdings" })).toBe("/en/portfolios/abc/holdings")
    expect(researchBackTarget({ from: "/en/investments/transactions?type=BUY" })).toBe(
      "/en/investments/transactions?type=BUY",
    )
  })

  it("passes a public share path through (§85.1)", () => {
    expect(researchBackTarget({ from: "/public/portfolio/abc123" })).toBe("/public/portfolio/abc123")
  })

  it("rejects the prefix lookalikes, so the two allowlisted prefixes stay literal", () => {
    expect(researchBackTarget({ from: "/publicsomething" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "//public" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "/logout" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "public/portfolio/abc123" })).toBe(RESEARCH_FALLBACK_PATH)
  })

  it("rejects a bare prefix without its trailing slash", () => {
    expect(researchBackTarget({ from: "/en" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "/public" })).toBe(RESEARCH_FALLBACK_PATH)
  })

  it("rejects anything that is not an allowlisted internal path", () => {
    expect(researchBackTarget({})).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "http://evil.example/en/investments" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "http://evil.example/public/portfolio/abc123" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "//evil.example/en/x" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "investments" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "/pl/investments" })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: "" })).toBe(RESEARCH_FALLBACK_PATH)
  })

  it("rejects a non-string `from` (repeated query params arrive as arrays)", () => {
    expect(researchBackTarget({ from: ["/en/investments"] })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: 42 })).toBe(RESEARCH_FALLBACK_PATH)
    expect(researchBackTarget({ from: null })).toBe(RESEARCH_FALLBACK_PATH)
  })
})
