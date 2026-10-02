import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"

const ts = (date: string, value = 100) => ({ date, value })

type ChartOptions = {
  series: Array<{ name: string; data: [number, number][] }>
  yaxis: { labels: { formatter: (v: number) => string } }
  tooltip: { y: { formatter: (v: number) => string } }
  colors: string[]
  stroke: { dashArray: number[] }
}

function chartOptions(w: ReturnType<typeof mount>): ChartOptions {
  return (w.vm as unknown as { options: ChartOptions }).options
}

describe("PortfolioPerformanceChart (§41.1)", () => {
  it("plots raw absolute values (no index normalisation)", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500), ts("2026-07-02", 94000)],
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = chartOptions(w)
    expect(opts.series[0].data.map(([, v]) => v)).toEqual([500, 94000])
  })

  it("formats the y-axis as compact currency", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500)],
        currency: "USD",
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = chartOptions(w)
    expect(opts.yaxis.labels.formatter(94000)).toMatch(/\$/)
    expect(opts.yaxis.labels.formatter(94000)).toMatch(/K/i)
  })

  it("formats the tooltip as full currency (portfolio + benchmark)", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500)],
        benchmarks: [{ name: "S&P 500", timeSeries: [{ date: "2026-07-01", value: 100.31 }] }],
        currency: "USD",
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = chartOptions(w)
    expect(opts.tooltip.y.formatter(94508.33)).toBe("$94,508.33")
  })

  it("draws the 'Invested' line (same axis) when timeSeries carries invested", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        // value (portfolio) + invested (cumulative net money-in)
        timeSeries: [
          { date: "2026-07-01", value: 500, invested: 400 },
          { date: "2026-07-02", value: 94000, invested: 90000 },
        ],
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = chartOptions(w)
    expect(opts.series).toHaveLength(2)
    expect(opts.series[0].name).toBe("Portfolio")
    expect(opts.series[1].name).toBe("Invested")
    expect(opts.series[1].data.map(([, v]) => v)).toEqual([400, 90000])
    // invested is a solid (non-dashed) line, second slot
    expect(opts.stroke.dashArray[0]).toBe(0)
    expect(opts.stroke.dashArray[1]).toBe(0)
  })

  it("omits the 'Invested' line when timeSeries has no invested field", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [ts("2026-07-01", 500)] },
      global: { stubs: { apexchart: true } },
    })
    const opts = chartOptions(w)
    expect(opts.series).toHaveLength(1)
    expect(opts.series[0].name).toBe("Portfolio")
  })

  it("overlays the benchmark on the same axis, grey dashed", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500), ts("2026-07-02", 94000)],
        benchmarks: [
          { symbol: "SPY", name: "S&P 500", timeSeries: [{ date: "2026-07-01", value: 100 }, { date: "2026-07-02", value: 100.4 }] },
        ],
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = chartOptions(w)
    // Same axis: the raw indexed benchmark values are drawn on the absolute scale.
    expect(opts.series).toHaveLength(2)
    expect(opts.series[1].name).toBe("S&P 500")
    expect(opts.series[1].data.map(([, v]) => v)).toEqual([100, 100.4])
    expect(opts.stroke.dashArray).toEqual([0, 4])
  })

  it("applies a custom line colour for the combined chart", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500)],
        color: "#2563eb",
      },
      global: { stubs: { apexchart: true } },
    })
    expect(chartOptions(w).colors[0]).toBe("#2563eb")
  })

  it("keeps the config object data-free so refreshes take the updateSeries() path (§46.7)", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500), ts("2026-07-02", 94000)],
      },
      global: { stubs: { apexchart: true } },
    })
    const vm = w.vm as unknown as {
      chartOptions: Record<string, unknown>
      seriesData: Array<{ name: string; data: [number, number][] }>
    }
    // A data change must not recreate the whole options object (that
    // re-initialises the chart and drops the y-axis compact-currency
    // formatter); the series is bound separately.
    expect("series" in vm.chartOptions).toBe(false)
    expect(vm.seriesData[0].data.map(([, v]) => v)).toEqual([500, 94000])
  })

  it("shows the pending line only when backfillPending and emits recompute", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [ts("2026-07-01", 500)], backfillPending: false },
      global: { stubs: { apexchart: true } },
    })
    expect(w.text()).not.toContain("Historical data is loading")

    await w.setProps({ backfillPending: true })
    expect(w.text()).toContain("Historical data is loading")

    const btn = w.find('[data-testid="portfolio-chart-recompute"]')
    await btn.trigger("click")
    expect(w.emitted("recompute")).toHaveLength(1)
  })

  it("§63.8 — grays out + blocks the chart while a recompute is in flight", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [ts("2026-07-01", 500)], recomputing: false },
      global: { stubs: { apexchart: true } },
    })
    // idle: no overlay, chart wrapper is not dimmed, button active
    expect(w.find('[data-testid="portfolio-chart-recomputing-overlay"]').exists()).toBe(false)
    expect(w.find('[data-testid="portfolio-chart-recompute"]').attributes("disabled")).toBeUndefined()

    await w.setProps({ recomputing: true })
    // overlay shown, wrapper dimmed + pointer-events disabled, button blocked
    expect(w.find('[data-testid="portfolio-chart-recomputing-overlay"]').exists()).toBe(true)
    expect(w.find('[data-testid="portfolio-chart-recomputing-overlay"]').text()).toMatch(/Recomputing/i)
    // the pointer-events/opacity class is on the .relative wrapper
    expect(w.html()).toMatch(/pointer-events-none[^>]*opacity-50|opacity-50[^>]*pointer-events-none/)
    const btn = w.find('[data-testid="portfolio-chart-recompute"]')
    expect(btn.attributes("disabled")).toBeDefined()
    // clicking while blocked must NOT re-trigger recompute
    await btn.trigger("click")
    expect(w.emitted("recompute")).toBeUndefined()
  })

  it("§63.8 — shows a partial-sum warning when gapSymbols is non-empty", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [ts("2026-07-01", 500)], gapSymbols: null },
      global: { stubs: { apexchart: true } },
    })
    expect(w.find('[data-testid="portfolio-chart-gap-warning"]').exists()).toBe(false)

    await w.setProps({ gapSymbols: ["XTB.WA", "AMZN"], heldGapSymbols: ["XTB.WA", "AMZN"] })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toMatch(/2 positions?/)
    expect(warn.text()).toMatch(/no price history/i)
  })

  /**
   * §72.30 — a window-wide gap is not a claim about the LATEST value.
   *
   * This is the PROD defect, in the exact shape it had on 2026-10-01: IKE Beata's
   * response carried 7 gap symbols, every one of them a position already sold, and
   * the chart said "Value excludes 7 positions … total is a partial sum" about a
   * value that was complete. The history is genuinely partial and must still be
   * reported — silently dropping it would lose the signal §72.30 widened the scan
   * to produce — but it may not be phrased as a defect in the number on screen.
   */
  it("§72.30 — a sold-since gap warns about the HISTORY, not the current value", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500)],
        gapSymbols: ["BST0922", "INS0922", "NVA0624"],
        heldGapSymbols: null,
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]')
    expect(warn.exists()).toBe(true)
    // names the history, and states plainly that the latest value is complete
    expect(warn.text()).toMatch(/earlier in this period/i)
    expect(warn.text()).toMatch(/3 positions?/)
    expect(warn.text()).toMatch(/latest value is complete/i)
    // and, load-bearing: it does NOT claim the value is short
    expect(warn.text()).not.toMatch(/value excludes/i)
    expect(warn.text()).not.toMatch(/partial sum\.$/i)
  })

  it("§72.30 — a mixed response warns about the value only for the still-held part", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", 500)],
        gapSymbols: ["SOLD", "HELD"],
        heldGapSymbols: ["HELD"],
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]')
    // the urgent claim, scoped to the one symbol that still affects the value
    expect(warn.text()).toMatch(/value excludes 1 position/i)
    expect(warn.text()).not.toMatch(/2 positions/i)
  })

  it("§72.30 — a legacy response with no heldGapSymbols never claims a complete value is short", async () => {
    // A backend that has not shipped the split sends `gapSymbols` only. Reading
    // it as "held" would reproduce the false warning exactly; the safe direction
    // is to report it as history and let the next backfill fill in the subset.
    const w = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [ts("2026-07-01", 500)], gapSymbols: ["OLD"] },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]')
    expect(warn.text()).toMatch(/earlier in this period/i)
    expect(warn.text()).not.toMatch(/value excludes/i)
  })
})
/**
 * §78.5 — the warning has to carry the AMOUNT, not only the count.
 *
 * "7 positions" is bookkeeping; "up to 10,465.32 PLN of the value line is
 * missing" is the size of the problem. PROD is the reason: IKE Beata held an
 * unpriceable position on 1,016 of 1,801 days, peaking at 10,465.38, and the
 * chart showed a −34.1% day for it with nothing to explain it.
 */
describe("PortfolioPerformanceChart (§78.5 — unpricedValue)", () => {
  const series = (peak: number) => [
    { date: "2022-06-12", value: 32182, unpricedValue: 0 },
    { date: "2022-06-13", value: 21201, unpricedValue: peak },
    { date: "2022-06-14", value: 21104, unpricedValue: peak },
  ]

  it("names the amount alongside the count on a held gap", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: series(10465.38),
        gapSymbols: ["BST0922"],
        heldGapSymbols: ["BST0922"],
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/up to\s*PLN\s*10,465\.38/i)
  })

  it("reports the PEAK, not the sum, and says which days are affected", async () => {
    // 10,465.38 held for two days sums to 20,930.76 and would double-count the
    // same money by its holding period. The peak is what a single day was short
    // by, which is comparable to the drop it explains.
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: series(10465.38),
        gapSymbols: ["BST0922"],
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/up to\s*PLN\s*10,465\.38/i)
    expect(warn).not.toMatch(/20,930/)
    // §78.5: the amount path does NOT also claim a count — see the "count and
    // amount stay separate" block below for the measurement behind that.
    expect(warn).toMatch(/missing/i)
    expect(warn).toMatch(/latest value is complete/i)
  })

  it("says nothing about an amount when unpricedValue is ABSENT, not zero", async () => {
    // A row written before the column existed omits the field. Reading that as
    // "nothing withheld" would understate exactly the series that need it, so
    // the count-only wording is used and no amount is invented.
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [{ date: "2022-06-12", value: 32182 }, { date: "2022-06-13", value: 21201 }],
        gapSymbols: ["BST0922"],
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/held with no price history/i)
    expect(warn).not.toMatch(/up to/i)
  })

  it("no gapSymbols means no warning even when unpricedValue is positive", async () => {
    // Belt and braces: the amount annotates an existing gap report, it never
    // invents one. A stale unpricedValue with no gapSymbols would otherwise
    // warn about a series the scan says is complete.
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: series(10465.38),
        gapSymbols: null,
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    expect(w.find('[data-testid="portfolio-chart-gap-warning"]').exists()).toBe(false)
  })
})

/**
 * §78.5 — the count and the amount must not be merged into one sentence.
 *
 * Measured on IKE Beata against the real endpoint:
 *   1Y  → gapSymbols 7, days with unpricedValue 0  (none held in the window)
 *   ALL → gapSymbols 7, days with unpricedValue 1016, peak 10,465.38
 *
 * `gapSymbols` is window-wide by design (§72.30) and the series is
 * timeframe-filtered, so "7 positions, up to 10,465 PLN" asserts a count
 * about a period the amount does not describe — and in 1Y, about a window
 * in which none of the 7 were held at all.
 */
describe("PortfolioPerformanceChart (§78.5 — count and amount stay separate)", () => {
  const withAmount = [
    { date: "2022-06-12", value: 32182, unpricedValue: 0 },
    { date: "2022-06-13", value: 21201, unpricedValue: 10465.38 },
  ]

  it("uses the amount alone when the visible window withheld some", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: withAmount,
        gapSymbols: ["BST0922", "INS0922", "NVA0624", "VOX0224", "ARH0324", "KIN1025", "S2B.WA"],
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/up to\s*PLN\s*10,465\.38/i)
    expect(warn).not.toMatch(/7 position/i)
  })

  it("falls back to the count when the window withheld nothing", async () => {
    // The 1Y case: seven window-wide gap symbols, none of them in this window.
    // The count is then the only claim available, and it is the pre-existing one.
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [{ date: "2025-10-01", value: 500, unpricedValue: 0 }],
        gapSymbols: ["BST0922", "INS0922", "NVA0624", "VOX0224", "ARH0324", "KIN1025", "S2B.WA"],
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/7 positions were held/i)
    expect(warn).not.toMatch(/up to/i)
  })
})

/**
 * §72.31 — a day priced from a carried-forward close is partial, and nothing else
 * on the wire said so.
 *
 * `buildPriceMap` advances the last close onto every subsequent day, so a day with
 * no returned bar is priced from yesterday and `value` looks complete. That makes
 * `unpricedValue` structurally blind to it — carry-forward means a price exists.
 * Measured on PROD: Crypto reported `gapSymbols: ["BTC-USD"]`, 24 coverage days, and
 * `unpricedValue` of 0 on all 1,690.
 */
describe("PortfolioPerformanceChart (§72.31 — carriedValue)", () => {
  it("warns when days are priced from a carried-forward close and no gap note applies", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [
          { date: "2022-06-12", value: 500, carriedValue: 0 },
          { date: "2022-06-13", value: 498, carriedValue: 250 },
          { date: "2022-06-14", value: 501, carriedValue: 180 },
        ],
        gapSymbols: null,
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/2 days priced from a carried-forward close/i)
    expect(warn).not.toMatch(/up to/i)
  })

  it("stays silent when every day has a real bar", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [{ date: "2022-06-12", value: 500, carriedValue: 0 }],
        gapSymbols: null,
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    expect(w.find('[data-testid="portfolio-chart-gap-warning"]').exists()).toBe(false)
  })

  it("does not report a gap count it cannot scope — carried days are a window claim", async () => {
    // The count and the series are filtered differently, so pairing them asserts a
    // count about a period the number does not describe. Carried days are their own
    // claim and stand alone.
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [{ date: "2022-06-13", value: 500, carriedValue: 250 }],
        gapSymbols: ["BST0922", "INS0922", "VOX0224", "NVA0624", "ARH0324", "KIN1025", "S2B.WA"],
        heldGapSymbols: null,
        currency: "PLN",
      },
      global: { stubs: { apexchart: true } },
    })
    const warn = w.find('[data-testid="portfolio-chart-gap-warning"]').text()
    expect(warn).toMatch(/carried-forward close/i)
    expect(warn).not.toMatch(/7 position/i)
  })
})
