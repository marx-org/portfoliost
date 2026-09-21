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
})