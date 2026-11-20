import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import type { Component } from "vue"
import AssetTypeAllocationChart from "@/modules/charting/AssetTypeAllocationChart.vue"
import CurrencyAllocationChart from "@/modules/charting/CurrencyAllocationChart.vue"
import SectorAllocationChart from "@/modules/charting/SectorAllocationChart.vue"
import StockCategoryAllocationChart from "@/modules/charting/StockCategoryAllocationChart.vue"

/**
 * The four allocation charts are one contract with four fixtures.
 *
 * `AssetTypeAllocationChart`, `CurrencyAllocationChart`, `SectorAllocationChart`
 * and `StockCategoryAllocationChart` were each tested in a file of their own
 * with the same three cases, so a change to the shared table/percent/label
 * shape had to be made in four places and a change to one component could be
 * masked by its siblings. They differ only in the testid prefix, the empty-state
 * sentence, and — for currency — the `unknown` marker. This file drives all
 * four from one table.
 *
 * Each row's percent fallback is deliberately discriminating: the values do not
 * equal the percentages, so replacing `percent()` with `return s.value` (which
 * would still satisfy a fixture where value === percent, as the old 60/40 and
 * 80/20 cases did) fails here. `AssetType` uses 30/10 → 75/25 and
 * `StockCategory` the same, because both weight over a stock-only denominator.
 */

interface Slice {
  key: string
  label?: string
  value: number
  percent?: number
  unknown?: boolean
}

interface Case {
  name: string
  component: Component
  testid: string
  emptyText: string
  /** Row labels rendered in the first column, in order. */
  labels: string[]
}

const cases: Case[] = [
  {
    name: "AssetTypeAllocationChart",
    component: AssetTypeAllocationChart,
    testid: "charting-asset-allocation-table",
    emptyText: "No asset-type data for this scope",
    labels: ["STOCK", "FUND"],
  },
  {
    name: "CurrencyAllocationChart",
    component: CurrencyAllocationChart,
    testid: "charting-currency-allocation-table",
    emptyText: "No currency data for this scope",
    labels: ["USD", "PLN"],
  },
  {
    name: "SectorAllocationChart",
    component: SectorAllocationChart,
    testid: "charting-sector-allocation-table",
    emptyText: "No sector data for this scope",
    labels: ["TECHNOLOGY", "FINANCIALS"],
  },
  {
    name: "StockCategoryAllocationChart",
    component: StockCategoryAllocationChart,
    testid: "charting-stock-category-allocation-table",
    emptyText: "No stock categories for this scope",
    labels: ["Balanced", "High yield"],
  },
]

function mountChart(c: Case, slices: Slice[]) {
  return mount(c.component, {
    props: { slices, currency: "USD" },
    global: { stubs: { apexchart: true } },
  })
}

const tableRows = (c: Case, wrapper: ReturnType<typeof mountChart>) =>
  wrapper.findAll(`[data-testid="${c.testid}"] tbody tr`)

const tableCells = (c: Case, wrapper: ReturnType<typeof mountChart>) =>
  wrapper.findAll(`[data-testid="${c.testid}"] tbody tr td`)

describe.each(cases)("$name", (c) => {
  it("renders one row per slice with its label, value and weight", () => {
    const slices: Slice[] = [
      { key: c.labels[0]!, label: c.labels[0], value: 80, percent: 80 },
      { key: c.labels[1]!, label: c.labels[1], value: 20, percent: 20 },
    ]
    const rows = tableRows(c, mountChart(c, slices))

    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain(c.labels[0]!)
    expect(rows[0]!.text()).toContain("80")
    expect(rows[1]!.text()).toContain(c.labels[1]!)
    expect(rows[1]!.text()).toContain("20")
  })

  it("derives the weight from values when the server omits percent", () => {
    // 30/40 = 75%, 10/40 = 25%. Not equal to the raw values, so a `percent()`
    // that returns `s.value` cannot pass.
    const slices: Slice[] = [
      { key: c.labels[0]!, label: c.labels[0], value: 30 },
      { key: c.labels[1]!, label: c.labels[1], value: 10 },
    ]
    const cells = tableCells(c, mountChart(c, slices))

    expect(cells[2]!.text()).toContain("75")
    expect(cells[5]!.text()).toContain("25")
  })

  it("shows an empty state when there is no data", () => {
    const wrapper = mountChart(c, [])

    expect(wrapper.text()).toContain(c.emptyText)
    expect(wrapper.find(`[data-testid="${c.testid}"]`).exists()).toBe(false)
  })
})

describe("CurrencyAllocationChart unknown-rate marker", () => {
  // Currency is the only one of the four that carries an `unknown` flag on a
  // slice, so it keeps a test of its own rather than a column in the table.
  it("marks an unresolved rate as unknown", () => {
    const wrapper = mountChart(cases[1]!, [{ key: "USD", value: 0, unknown: true }])
    expect(wrapper.text()).toContain("unknown rate")
  })
})