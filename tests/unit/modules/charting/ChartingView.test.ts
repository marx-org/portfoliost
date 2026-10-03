import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ChartingView from "@/modules/charting/ChartingView.vue"
import { getChartingCompare, getChartingPresets } from "@/api/charting"

vi.mock("@/api/charting", () => ({
  getChartingCompare: vi.fn(),
  getChartingPresets: vi.fn(),
}))

// §85.4 — the chips and the comparison headers link into research, so the view
// reads `useRoute()` and renders `router-link`. No router in this suite, so both
// are provided here; the link stub renders its slot so the Remove button inside
// the chip survives.
vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: "/en/investments/charting" }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mockedCompare = vi.mocked(getChartingCompare)
const mockedPresets = vi.mocked(getChartingPresets)

function makeCompare(symbol: string, name: string, peRatio: number) {
  return { symbol, name, price: 100, marketCap: 1e12, peRatio, forwardPe: 20, pbRatio: 10, psRatio: 5, dividendYield: 1, revenueGrowth: 10, netMargin: 20, roe: 30, grossMargin: 40, operatingMargin: 25, evToEbitda: 15, evToSales: 6, fcfMargin: 18, netIncome: 1e10, revenue: 1e11, sharesOutstanding: 1e9, currency: "USD" }
}

function mountView() {
  return mount(ChartingView, {
    global: {
      stubs: {
        apexchart: true,
        InstrumentSearchModal: true,
        RouterLink: {
          props: ["to"],
          template: "<a data-testid='research-link' :data-to='JSON.stringify(to)'><slot /></a>",
        },
      },
    },
  })
}

describe("ChartingView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPresets.mockResolvedValue([
      { name: "Mega-cap tech", symbols: ["AAPL", "MSFT", "NVDA"], metric: "peRatio" },
    ])
    mockedCompare.mockResolvedValue([
      makeCompare("AAPL", "Apple Inc", 23.5),
      makeCompare("MSFT", "Microsoft Corp", 31.2),
    ])
  })

  it("shows an empty state before stocks are added", async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain("No stocks added yet")
    expect(wrapper.text()).toContain("Add at least two stocks to build a comparison chart")
    expect(wrapper.text()).toContain("0/10 selected")
  })

  it("adds a stock through the add event and fetches comparison", async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "AAPL", "Apple Inc")
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "MSFT", "Microsoft Corp")
    await flushPromises()

    expect(mockedCompare).toHaveBeenCalledWith(["AAPL", "MSFT"])
    expect(wrapper.findAll('[data-testid="stock-chip"]').length).toBe(2)
    expect(wrapper.find('[data-testid="compare-chart"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("P/E (TTM)")
    expect(wrapper.text()).toContain("23.5")
  })

  it("removes a stock", async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "AAPL", "Apple Inc")
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "MSFT", "Microsoft Corp")
    await flushPromises()

    await wrapper.findAll('[data-testid="remove-stock"]')[0].trigger("click")
    await flushPromises()

    expect(wrapper.findAll('[data-testid="stock-chip"]').length).toBe(1)
  })

  it("applies a preset by setting symbols and metric", async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="preset-mega-cap-tech"]').trigger("click")
    await flushPromises()

    expect(mockedCompare).toHaveBeenCalledWith(["AAPL", "MSFT", "NVDA"])
    expect(wrapper.findAll('[data-testid="stock-chip"]').length).toBe(3)
    expect(wrapper.text()).toContain("3/10 selected")
  })

  it("links each chip's symbol and name to that symbol's research page (§85.4)", async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "AAPL", "Apple Inc")
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "MSFT", "Microsoft Corp")
    await flushPromises()

    const links = wrapper.findAll('[data-testid="research-link"]')
    // Chip link, then the two comparison headers.
    expect(JSON.parse(links[0]!.attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "AAPL" },
      query: { from: "/en/investments/charting" },
    })
    // The chip keeps its symbol + name, and its Remove button is still there.
    const chip = wrapper.get('[data-testid="stock-chip"]')
    expect(chip.text()).toContain("AAPL")
    expect(chip.find('[data-testid="remove-stock"]').exists()).toBe(true)
  })

  it("badges the comparison headers and keeps the row label uppercase (§85.4)", async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "AAPL", "Apple Inc")
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "MSFT", "Microsoft Corp")
    await flushPromises()

    const headers = wrapper.get('[data-testid="compare-chart"]').findAll("th")
    // The metric label stays uppercase; the per-stock headers carry a badge and
    // opt out of it, because `uppercase` on a company name is a bug.
    expect(headers[0]!.classes()).toContain("uppercase")
    for (const th of headers.slice(1)) {
      expect(th.classes()).toContain("normal-case")
      expect(th.find('[data-testid="ticker-badge"]').exists()).toBe(true)
    }
  })

  it("changes the metric via the picker", async () => {    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "AAPL", "Apple Inc")
    await wrapper.findComponent({ name: "InstrumentSearchModal" }).vm.$emit("add", "MSFT", "Microsoft Corp")
    await flushPromises()

    await wrapper.find('[data-testid="metric-picker"]').setValue("netMargin")
    await flushPromises()

    expect(wrapper.text()).toContain("Net Margin")
  })
})
