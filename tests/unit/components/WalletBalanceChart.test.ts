import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import WalletBalanceChart from "@/components/WalletBalanceChart.vue"

describe("WalletBalanceChart (§27.4)", () => {
  const points = [
    { date: "2026-07-01", balance: 100 },
    { date: "2026-07-02", balance: 250.5 },
  ]

  it("renders the area chart with the given points", () => {
    const w = mount(WalletBalanceChart, { props: { points }, global: { stubs: { apexchart: true } } })
    expect(w.findComponent({ name: "apexchart" }).exists()).toBe(true)
    const opts = (w.vm as unknown as { chartOptions: { series: Array<{ data: number[] }>; xaxis: { categories: string[] } } }).chartOptions
    expect(opts.series[0].data).toEqual([100, 250.5])
    expect(opts.xaxis.categories).toHaveLength(2)
  })

  it("shows the empty state when there are no points", () => {
    const w = mount(WalletBalanceChart, { props: { points: [] }, global: { stubs: { apexchart: true } } })
    expect(w.findComponent({ name: "apexchart" }).exists()).toBe(false)
    expect(w.text()).toContain("No balance history available.")
  })

  it("emits recompute when the button is clicked and disables it while busy", async () => {
    const w = mount(WalletBalanceChart, { props: { points, busy: false }, global: { stubs: { apexchart: true } } })
    const btn = w.find('[data-testid="wallet-chart-recompute"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes("disabled")).toBeUndefined()
    await btn.trigger("click")
    expect(w.emitted("recompute")).toHaveLength(1)

    const busy = mount(WalletBalanceChart, { props: { points, busy: true }, global: { stubs: { apexchart: true } } })
    expect(busy.find('[data-testid="wallet-chart-recompute"]').attributes("disabled")).toBeDefined()
  })
})
