import { describe, it, expect } from "vitest"
import { formatFundamentalsCell } from "@/modules/instruments/fundamentalsFormat"

const cell = formatFundamentalsCell

describe("formatFundamentalsCell — percent branch (§79.1)", () => {
  it("renders the real ratios and growth columns as percentages", () => {
    expect(cell({ netIncomeMargin: 12.5 }, "netIncomeMargin")).toBe("12.5%")
    expect(cell({ debtEquityRatio: 1.52 }, "debtEquityRatio")).toBe("1.5%")
    expect(cell({ netIncomeGrowth: 15.48 }, "netIncomeGrowth")).toBe("15.5%")
    expect(cell({ earningsPerShareGrowth: -3.2 }, "earningsPerShareGrowth")).toBe("-3.2%")
    expect(cell({ freeCashFlowGrowth: 90.86 }, "freeCashFlowGrowth")).toBe("90.9%")
    expect(
      cell({ cashFlowFromOperatingActivitiesGrowth: 75.84 }, "cashFlowFromOperatingActivitiesGrowth"),
    ).toBe("75.8%")
  })

  it("renders FCF / Share as an amount, not a percentage", () => {
    // The bug: $33.67 read as "33.7%" because freeCashFlowPerShare sat in the
    // percent branch. It is currency per share.
    expect(cell({ freeCashFlowPerShare: 33.67 }, "freeCashFlowPerShare")).toBe("33.67")
    expect(cell({ freeCashFlowPerShare: 33.67 }, "freeCashFlowPerShare")).not.toBe("33.7%")
    expect(cell({ freeCashFlowPerShare: 6.1 }, "freeCashFlowPerShare")).toBe("6.10")
    expect(cell({ freeCashFlowPerShare: -2.5 }, "freeCashFlowPerShare")).toBe("-2.50")
  })

  it("still returns a percent for netIncomeMargin, so the two are not conflated", () => {
    expect(cell({ netIncomeMargin: 12.5 }, "netIncomeMargin")).toBe("12.5%")
  })
})

describe("formatFundamentalsCell — the numeric ladder", () => {
  it("compacts at and above 1e6", () => {
    expect(cell({ revenue: 416161000000 }, "revenue")).toBe("416.16B")
    expect(cell({ totalAssets: 1000000 }, "totalAssets")).toBe("1M")
  })

  it("groups thousands with no decimals between 1000 and 1e6", () => {
    expect(cell({ totalAssets: 999999 }, "totalAssets")).toBe("999,999")
    expect(cell({ retainedEarnings: -17674000000 }, "retainedEarnings")).toBe("-17.67B")
    expect(cell({ netIncome: 12345 }, "netIncome")).toBe("12,345")
  })

  it("keeps two decimals below 1000, which is where per-share figures live", () => {
    expect(cell({ earningsPerShare: 7.46 }, "earningsPerShare")).toBe("7.46")
    expect(cell({ dilutedSharesOutstanding: 999 }, "dilutedSharesOutstanding")).toBe("999.00")
  })

  it("uses the magnitude, so a large negative is compacted too", () => {
    expect(cell({ capitalExpenditures: -12715000000 }, "capitalExpenditures")).toBe("-12.72B")
    expect(cell({ dividendPayment: -6850000000 }, "dividendPayment")).toBe("-6.85B")
  })
})

describe("formatFundamentalsCell — absent values", () => {
  it("renders a dash for missing and null alike", () => {
    expect(cell({}, "workingCapital")).toBe("—")
    expect(cell({ workingCapital: null }, "workingCapital")).toBe("—")
    expect(cell({ workingCapital: undefined }, "workingCapital")).toBe("—")
  })

  it("passes a non-number through rather than coercing it", () => {
    // Only reachable if a statement ever grows a string column; asserted so the
    // String() branch is covered rather than dead. `year` is not one — the
    // template renders it directly and never routes it through cell().
    expect(cell({ reportingCurrency: "EUR" }, "reportingCurrency")).toBe("EUR")
    expect(cell({ reportingCurrency: "" }, "reportingCurrency")).toBe("")
  })
})