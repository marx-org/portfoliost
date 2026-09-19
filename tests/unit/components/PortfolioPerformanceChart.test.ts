import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"

const ts = (date: string, extra: Record<string, number | null> = {}) => ({ date, value: 100, ...extra })

describe("PortfolioPerformanceChart (§27.4)", () => {
  it("indexes the TWR series starting at 100", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", { cumulativeTwr: 100 }), ts("2026-07-02", { cumulativeTwr: 102.5 })],
        returnType: "timeWeighted",
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = (w.vm as unknown as { options: { series: Array<{ name: string; data: [number, number][] }> } }).options
    expect(opts.series[0].data.map(([, v]) => v)).toEqual([100, 102.5])
  })

  it("indexes the MWR series starting at 100", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", { cumulativeMwr: 100 }), ts("2026-07-02", { cumulativeMwr: 99.1 })],
        returnType: "moneyWeighted",
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = (w.vm as unknown as { options: { series: Array<{ data: [number, number][] }> } }).options
    expect(opts.series[0].data.map(([, v]) => v)).toEqual([100, 99.1])
  })

  it("falls back to raw-value normalisation (start = 100) when columns are null", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [{ date: "2026-07-01", value: 200, cumulativeTwr: null }, { date: "2026-07-02", value: 220, cumulativeTwr: null }],
        returnType: "timeWeighted",
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = (w.vm as unknown as { options: { series: Array<{ data: [number, number][] }> } }).options
    expect(opts.series[0].data.map(([, v]) => v)).toEqual([100, 110])
  })

  it("overlays benchmark series", () => {
    const w = mount(PortfolioPerformanceChart, {
      props: {
        timeSeries: [ts("2026-07-01", { cumulativeTwr: 100 }), ts("2026-07-02", { cumulativeTwr: 101 })],
        benchmarks: [
          { symbol: "SPY", name: "S&P 500", timeSeries: [{ date: "2026-07-01", value: 100 }, { date: "2026-07-02", value: 100.4 }] },
        ],
        returnType: "timeWeighted",
      },
      global: { stubs: { apexchart: true } },
    })
    const opts = (w.vm as unknown as { options: { series: Array<{ name: string; data: [number, number][] }> } }).options
    expect(opts.series).toHaveLength(2)
    expect(opts.series[1].name).toBe("S&P 500")
    expect(opts.series[1].data.map(([, v]) => v)).toEqual([100, 100.4])
  })

  it("shows the pending line only when backfillPending and emits recompute", async () => {
    const w = mount(PortfolioPerformanceChart, {
      props: { timeSeries: [ts("2026-07-01", { cumulativeTwr: 100 })], returnType: "timeWeighted", backfillPending: false },
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
