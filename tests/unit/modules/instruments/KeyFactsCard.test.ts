import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import KeyFactsCard from "@/modules/instruments/KeyFactsCard.vue"
import type { InstrumentsProfile } from "@/api/types"
import type { components } from "../../../../generated/api-types"

type KeyFacts = NonNullable<components["schemas"]["InstrumentProfile"]["keyFacts"]>

/** Minimal profile; only the shared-identity fields matter for the row table. */
function profile(over: Partial<InstrumentsProfile> = {}): InstrumentsProfile {
  return {
    ticker: "X",
    name: "Some Name",
    country: "Poland",
    countryCode: "PL",
    currency: "PLN",
    exchange: "GPW",
    isin: "PL0000000000",
    weburl: "https://example.com/ir",
    ...over,
  } as InstrumentsProfile
}

function withKeyFacts(keyFacts: KeyFacts, over: Partial<InstrumentsProfile> = {}) {
  return profile({ keyFacts, ...over })
}

function render(p: InstrumentsProfile) {
  return mount(KeyFactsCard, { props: { profile: p } })
}

/** Every `<dt>` label the card renders, in order. */
function labels(wrapper: ReturnType<typeof render>): string[] {
  return wrapper.findAll("dt").map((dt) => dt.text())
}

describe("KeyFactsCard (§86) — the shared identity block", () => {
  it("renders Name, Country, ISIN and Exchange for every class", () => {
    const wrapper = render(profile())

    expect(labels(wrapper).slice(0, 4)).toEqual(["Name", "Country", "ISIN", "Exchange"])
  })

  it("keeps the country flag image and the weburl link", () => {
    const wrapper = render(profile())

    expect(wrapper.find("img").attributes("src")).toBe("https://flagcdn.com/w40/pl.png")
    expect(wrapper.find("a").attributes("href")).toBe("https://example.com/ir")
    // The link shows the host without its scheme, as before the move.
    expect(wrapper.find("a").text()).toBe("example.com/ir")
  })

  it("hides the card entirely when there is nothing to say", () => {
    const wrapper = render(profile({ name: undefined, country: undefined, isin: undefined, exchange: undefined }))

    expect(wrapper.find("[data-testid='key-facts-card']").exists()).toBe(false)
  })
})

describe("KeyFactsCard (§86) — one label set per asset class", () => {
  it("stock keeps the eight rows the hard-coded card showed", () => {
    const wrapper = render(
      withKeyFacts({
        kind: "stock",
        sector: "Technology",
        industry: "Consumer Electronics",
        employees: 164000,
        ceo: "Tim Cook",
        ipo: "1980-12-12",
        sharesOutstanding: 8975490061,
        marketCap: 2760501,
      }),
    )

    expect(labels(wrapper)).toEqual([
      "Name",
      "Country",
      "ISIN",
      "Exchange",
      "Sector",
      "Industry",
      "Employees",
      "CEO",
    ])
    expect(wrapper.text()).toContain("Consumer Electronics")
    expect(wrapper.text()).toContain("Tim Cook")
    expect(wrapper.text()).toContain("164,000")
  })

  it("falls back to the profile's own equity fields when there is no keyFacts", () => {
    // The proof that a stock's card is unchanged by the move: the same four
    // labels, read from the profile instead of from keyFacts.
    const wrapper = render(
      profile({
        gicsSector: "Technology",
        gicsIndustry: "Consumer Electronics",
        employeeTotal: 164000,
        ceo: "Tim Cook",
      }),
    )

    expect(labels(wrapper)).toEqual([
      "Name",
      "Country",
      "ISIN",
      "Exchange",
      "Sector",
      "Industry",
      "Employees",
      "CEO",
    ])
    expect(wrapper.text()).toContain("Consumer Electronics")
    expect(wrapper.text()).toContain("Tim Cook")
  })

  it("corp_bond renders its own ten rows and no equity ones", () => {
    const wrapper = render(
      withKeyFacts({
        kind: "corp_bond",
        issuer: "Best S.A.",
        series: "W3",
        market: "GPW RR",
        status: "Notowane",
        nominalValue: 100,
        nominalCurrency: "PLN",
        secured: "NIE",
        couponType: "zmienne WIBOR 3M + 4%",
        currentRate: 7.83,
        maturityDate: "2027-03-07",
      }),
    )

    expect(labels(wrapper)).toEqual([
      "Name",
      "Country",
      "ISIN",
      "Exchange",
      "Issuer",
      "Series",
      "Market",
      "Status",
      "Nominal",
      "Nominal currency",
      "Secured",
      "Coupon type",
      "Current rate",
      "Maturity",
    ])
    const text = wrapper.text()
    expect(text).not.toContain("Employees")
    expect(text).not.toContain("CEO")
    // Provider strings verbatim; numbers formatted once, with no doubled unit.
    expect(text).toContain("NIE")
    expect(text).toContain("Notowane")
    expect(text).toContain("zmienne WIBOR 3M + 4%")
    expect(text).toContain("7.83%")
    expect(text).not.toContain("7.83%%")
  })

  it("bond renders its own rows and never the label Margin", () => {
    const wrapper = render(
      withKeyFacts({
        kind: "bond",
        seriesCode: "ROS",
        issueDate: "2026-09-01",
        maturityDate: "2032-09-01",
        termMonths: 72,
        rateRule: "cpi_12m+margin",
        margin: 2,
        redemptionFee: 2,
        nominal: 100,
      }),
    )

    expect(labels(wrapper)).toEqual([
      "Name",
      "Country",
      "ISIN",
      "Exchange",
      "Series",
      "Issue date",
      "Term",
      "Rate rule",
      "Inflation margin",
      "Maturity",
      "Nominal",
      "Redemption fee",
    ])
    // The overloaded column is labelled after what it means for this rate rule.
    expect(labels(wrapper)).not.toContain("Margin")
    expect(wrapper.text()).toContain("72 months")
    expect(wrapper.text()).toContain("2.00%")
  })

  it("crypto renders its own rows", () => {
    const wrapper = render(
      withKeyFacts({
        kind: "crypto",
        name: "Bitcoin USD",
        exchange: "CCC",
        icoDate: "2014-09-17",
        circulatingSupply: 19972590,
        totalSupply: 19972590,
      }),
    )

    expect(labels(wrapper)).toEqual([
      "Name",
      "Country",
      "ISIN",
      "Exchange",
      "Name",
      "Exchange",
      "ICO",
      "Circulating supply",
      "Total supply",
    ])
    expect(wrapper.text()).toContain("Bitcoin USD")
    expect(wrapper.text()).toContain("19,972,590")
  })

  it("etf renders the category the backend already filled", () => {
    const wrapper = render(withKeyFacts({ kind: "etf", category: "Fixed Income" }))

    expect(labels(wrapper)).toEqual(["Name", "Country", "ISIN", "Exchange", "Category"])
    expect(wrapper.text()).toContain("Fixed Income")
  })

  it("fund renders its one field", () => {
    const wrapper = render(withKeyFacts({ kind: "fund", categoryCode: "ARK01" }))

    expect(labels(wrapper)).toEqual(["Name", "Country", "ISIN", "Exchange", "Category code"])
    expect(wrapper.text()).toContain("ARK01")
  })
})

describe("KeyFactsCard (§86) — the margin label switch", () => {
  const savingsBond = (rateRule: string | null) =>
    ({
      kind: "bond",
      seriesCode: "ROS",
      issueDate: "2026-09-01",
      maturityDate: "2032-09-01",
      termMonths: 72,
      rateRule,
      margin: 2,
      redemptionFee: 2,
      nominal: 100,
    }) as KeyFacts

  it("labels the same stored number Rate under a fixed rule", () => {
    const wrapper = render(withKeyFacts(savingsBond("fixed")))

    expect(labels(wrapper)).toContain("Rate")
    expect(labels(wrapper)).not.toContain("Inflation margin")
  })

  it("labels it Inflation margin under the CPI rule, from the same number", () => {
    const wrapper = render(withKeyFacts(savingsBond("cpi_12m+margin")))

    expect(labels(wrapper)).toContain("Inflation margin")
    expect(labels(wrapper)).not.toContain("Rate")
    expect(wrapper.text()).toContain("2.00%")
  })

  it("labels it NBP margin under the NBP rule", () => {
    expect(labels(render(withKeyFacts(savingsBond("nbp_ref+margin"))))).toContain("NBP margin")
  })

  it("defaults to Rate when the rule is absent", () => {
    expect(labels(render(withKeyFacts(savingsBond(null))))).toContain("Rate")
  })
})

describe("KeyFactsCard (§86) — null rendering", () => {
  it("renders a dash for every null class field and keeps the keys", () => {
    const wrapper = render(
      withKeyFacts({
        kind: "crypto",
        name: "Bitcoin USD",
        exchange: null,
        icoDate: null,
        circulatingSupply: null,
        totalSupply: null,
      }),
    )

    expect(labels(wrapper)).toHaveLength(9)
    const dashes = wrapper.findAll("dd").filter((dd) => dd.text() === "—")
    // exchange, ico, circulating supply, total supply — and the name row below
    // the identity block still renders, so a null field costs a dash, not a row.
    expect(dashes.length).toBe(4)
    expect(wrapper.text()).toContain("Bitcoin USD")
  })
})