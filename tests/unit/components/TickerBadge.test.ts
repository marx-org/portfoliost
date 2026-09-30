import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import TickerBadge, { countryCodeOrNull, formatAssetType, tickerDetails } from "@/components/TickerBadge.vue"

const mountBadge = (props: Record<string, unknown>) =>
  mount(TickerBadge, { props: props as never })

describe("TickerBadge (§61.1)", () => {
  it("renders logo + ticker + name + details", () => {
    const w = mountBadge({
      symbol: "SAP",
      name: "SAP SE",
      countryCode: "PL",
      assetType: "STOCK",
    })
    expect(w.find("img").attributes("src")).toBe("/api/logos/SAP")
    expect(w.find("img").attributes("alt")).toBe("SAP")
    expect(w.text()).toContain("SAP")
    expect(w.text()).toContain("SAP SE")
    expect(w.get('[data-testid="ticker-badge-details"]').text()).toBe("(PL) Stock")
    expect(w.find('[data-testid="ticker-badge-name"]').exists()).toBe(true)
  })

  it("omits the name line when no name is given", () => {
    const w = mountBadge({ symbol: "SAP", countryCode: "PL", assetType: "STOCK" })
    expect(w.find('[data-testid="ticker-badge-name"]').exists()).toBe(false)
  })

  it("omits the details span when both country and type are missing", () => {
    const w = mountBadge({ symbol: "SAP", name: "SAP SE" })
    expect(w.find('[data-testid="ticker-badge-details"]').exists()).toBe(false)
  })

  it("renders a country-only or a type-only details line", () => {
    expect(mountBadge({ symbol: "SAP", countryCode: "PL" }).get('[data-testid="ticker-badge-details"]').text()).toBe("(PL)")
    expect(mountBadge({ symbol: "SAP", assetType: "STOCK" }).get('[data-testid="ticker-badge-details"]').text()).toBe("Stock")
  })

  it("uppercases the country code", () => {
    expect(mountBadge({ symbol: "SAP", countryCode: "pl" }).get('[data-testid="ticker-badge-details"]').text()).toBe("(PL)")
  })

  // Found by the PROD browser pass: the import writes the literal "Other" into
  // `country` when the sheet has none, and the badge rendered `(OTHER) Bond` —
  // a confident-looking label for a value that is not a country code.
  it("refuses to render a country that is not a 2-letter code (§61 PROD)", () => {
    for (const bogus of ["Other", "OTHER", "unknown", "N/A", "-", "PLN", "Poland", "12", ""]) {
      expect(countryCodeOrNull(bogus), `${bogus} should not pass as a country`).toBeNull()
      expect(tickerDetails(bogus, "BOND")).toBe("Bond")
    }
  })

  it("still renders a real code, and still omits the part it cannot vouch for", () => {
    expect(countryCodeOrNull("pl")).toBe("PL")
    expect(countryCodeOrNull(" us ")).toBe("US")
    expect(tickerDetails("PL", "BOND")).toBe("(PL) Bond")
    expect(tickerDetails("Other", null)).toBeNull()
  })

  it("swaps the logo class with size", () => {
    expect(mountBadge({ symbol: "A", size: "sm" }).find("img").classes()).toContain("h-5")
    expect(mountBadge({ symbol: "A" }).find("img").classes()).toContain("h-6")
    expect(mountBadge({ symbol: "A", size: "lg" }).find("img").classes()).toContain("h-8")
    // example-service parity: a rounded square, never a circle
    expect(mountBadge({ symbol: "A" }).find("img").classes()).toContain("rounded-[9px]")
  })

  it("aligns right with a row-reverse wrapper", () => {
    const w = mountBadge({ symbol: "A", align: "right" })
    expect(w.classes()).toContain("flex-row-reverse")
    expect(w.classes()).toContain("text-right")
  })

  it("renders the ticker in the requested heading element, at that element's size", () => {
    expect(mountBadge({ symbol: "SAP" }).find("h1").exists()).toBe(false)
    expect(mountBadge({ symbol: "SAP" }).find("div.truncate").classes()).toContain("text-sm")
    // measured against example-service 2026-09-30: its research ticker is 20px (text-xl)
    expect(mountBadge({ symbol: "SAP", titleAs: "h1" }).find("h1").classes()).toEqual(
      expect.arrayContaining(["truncate", "text-xl", "font-semibold"]),
    )
    expect(mountBadge({ symbol: "SAP", titleAs: "h1" }).find("h1").text()).toBe("SAP")
    expect(mountBadge({ symbol: "SAP", titleAs: "h2" }).find("h2").text()).toBe("SAP")
    expect(mountBadge({ symbol: "SAP", titleAs: "h2" }).find("h2").classes()).toContain("text-lg")
  })

  it("prefixes the root and detail testids with a custom testid", () => {
    const w = mountBadge({ symbol: "SAP", countryCode: "DE", testid: "research-ticker" })
    expect(w.find('[data-testid="research-ticker"]').exists()).toBe(true)
    expect(w.get('[data-testid="research-ticker-details"]').text()).toBe("(DE)")
  })
})

describe("formatAssetType", () => {
  it("maps the contract enum to display words", () => {
    expect(formatAssetType("STOCK")).toBe("Stock")
    expect(formatAssetType("ETF")).toBe("ETF")
    expect(formatAssetType("FUND")).toBe("Fund")
    expect(formatAssetType("BOND")).toBe("Bond")
    expect(formatAssetType("CORP_BOND")).toBe("Bond")
    expect(formatAssetType("CRYPTO")).toBe("Crypto")
  })

  it("accepts the mixed-case forms the tiers emit", () => {
    expect(formatAssetType("corp_bond")).toBe("Bond")
    expect(formatAssetType("tfi")).toBe("Fund")
  })

  it("title-cases an unknown class rather than guessing a label", () => {
    expect(formatAssetType("WARRANT")).toBe("Warrant")
  })

  it("returns an empty string for nothing", () => {
    expect(formatAssetType(null)).toBe("")
    expect(formatAssetType(undefined)).toBe("")
    expect(formatAssetType("  ")).toBe("")
  })
})

describe("tickerDetails", () => {
  it("joins the two parts", () => {
    expect(tickerDetails("PL", "STOCK")).toBe("(PL) Stock")
  })

  it("omits a missing part rather than guessing one", () => {
    expect(tickerDetails("PL", null)).toBe("(PL)")
    expect(tickerDetails(null, "ETF")).toBe("ETF")
  })

  it("is null when there is nothing to say", () => {
    expect(tickerDetails(null, null)).toBeNull()
    expect(tickerDetails(undefined, undefined)).toBeNull()
  })
})
