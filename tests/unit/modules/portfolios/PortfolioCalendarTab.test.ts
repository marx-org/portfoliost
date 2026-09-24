import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { defineComponent, h } from "vue"
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"
import PortfolioCalendarTab from "@/modules/portfolios/PortfolioCalendarTab.vue"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioCalendar: vi.fn(),
  }
})

const mockedCal = vi.mocked(portfoliosApi)

const RouterLinkStub = defineComponent({
  name: "RouterLinkStub",
  props: { to: { type: [String, Object] as never, default: null } },
  setup(props, { slots }) {
    return () => h("a", { "data-to": JSON.stringify(props.to) }, slots.default?.())
  },
})

function holdingsFixture() {
  return {
    holdings: [
      {
        symbol: "AAPL",
        companyName: "Apple Inc.",
        currency: "USD",
        earnings: [{ date: "2026-11-04", title: "Earnings Report", year: 2026, quarter: 4 }],
        exDividend: [{ date: "2026-10-10", title: "Ex-Dividend", year: 2026, amount: 0.26 }],
      },
      {
        symbol: "MSFT",
        currency: "USD",
        dividend: [
          { date: "2026-10-05", title: "Dividend", year: 2026, amount: 3.32 },
          { date: "2026-10-05", title: "Dividend", year: 2026, amount: 1.0 },
          { date: "2026-10-05", title: "Dividend", year: 2026, amount: 2.0 },
          { date: "2026-10-05", title: "Dividend", year: 2026, amount: 4.0 },
          { date: "2026-10-05", title: "Dividend", year: 2026, amount: 5.0 },
        ],
      },
    ],
  } as never
}

function flatFixture() {
  return {
    upcoming: [{ symbol: "AAPL", companyName: "Apple Inc.", type: "exDividend", date: "2026-10-10", title: "Ex-Dividend", amount: 0.26, quarter: null }],
    past: [{ symbol: "MSFT", type: "earnings", date: "2026-08-01", title: "Earnings Report", amount: null, quarter: 2 }],
    total: 2,
  } as never
}

async function mountTab(payload: unknown): Promise<VueWrapper> {
  mockedCal.getPortfolioCalendar.mockResolvedValue(payload as never)
  const wrapper = mount(PortfolioCalendarTab, {
    global: {
      components: { RouterLink: RouterLinkStub },
    },
  })
  await flushPromises()
  return wrapper
}

function dayCells(wrapper: VueWrapper) {
  return wrapper.findAll("[data-testid='pf-cal-day']")
}

describe("PortfolioCalendarTab — §54.3 month grid", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Today = 2026-09-15 (local), so the initial view is September 2026.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the 42-day grid with a SUN-SAT header, the month label and no Impact control", async () => {
    const wrapper = await mountTab(holdingsFixture())
    expect(wrapper.text()).toContain("Calendar")
    expect(wrapper.text()).toContain("September 2026")
    expect(dayCells(wrapper)).toHaveLength(42)
    for (const dow of ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]) {
      expect(wrapper.text()).toContain(dow)
    }
    expect(wrapper.find("[data-testid='pf-cal-impact']").exists()).toBe(false)
    expect(wrapper.text().toLowerCase()).not.toContain("impact")
    // September has no fixture events — the grid still renders + empty state.
    expect(wrapper.text()).toContain("No events in this month.")
  })

  it("prev/next navigation changes the month label and the rendered day set", async () => {
    const wrapper = await mountTab(holdingsFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click")
    expect(wrapper.text()).toContain("October 2026")
    // October 2026: the grid starts on Sun Sep 27 (first cell muted, out-of-month).
    expect(dayCells(wrapper).at(0)?.text()).toMatch(/^27/)
    await wrapper.find("[data-testid='pf-cal-prev-month']").trigger("click")
    expect(wrapper.text()).toContain("September 2026")
    await wrapper.find("[data-testid='pf-cal-prev-month']").trigger("click")
    expect(wrapper.text()).toContain("August 2026")
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click")
    expect(wrapper.text()).toContain("September 2026")
  })

  it("Today resets the view to the current month", async () => {
    const wrapper = await mountTab(holdingsFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click")
    expect(wrapper.text()).toContain("October 2026")
    await wrapper.find("[data-testid='pf-cal-today']").trigger("click")
    expect(wrapper.text()).toContain("September 2026")
  })

  it("renders chips on the right days in the instrument currency, linking to research", async () => {
    const wrapper = await mountTab(holdingsFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click") // October 2026
    expect(wrapper.text()).toContain("AAPL Ex-Div: $0.26")
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((c) => c.text().includes("AAPL Ex-Div"))
    expect(link?.vm.$props.to).toEqual({ name: "research-overview", params: { symbol: "AAPL" } })
    // November: AAPL earnings chip (no amount on earnings)
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click")
    expect(wrapper.text()).toContain("AAPL Earnings")
  })

  it("caps chips at 3 per day with a '+N more' hint", async () => {
    const wrapper = await mountTab(holdingsFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click") // October 2026
    const oct5 = dayCells(wrapper).find((c) => c.text().startsWith("5"))
    expect(oct5?.text()).toContain("+2 more")
    expect(oct5?.findAllComponents(RouterLinkStub).length).toBe(3)
  })

  it("the filter hides other event types", async () => {
    const wrapper = await mountTab(holdingsFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click") // October 2026
    expect(wrapper.text()).toContain("AAPL Ex-Div: $0.26")

    await wrapper.find("[data-testid='pf-cal-filter']").setValue("earnings")
    expect(wrapper.text()).not.toContain("AAPL Ex-Div")
    expect(wrapper.text()).toContain("No events in this month.")

    await wrapper.find("[data-testid='pf-cal-filter']").setValue("exDividend")
    expect(wrapper.text()).toContain("AAPL Ex-Div: $0.26")

    await wrapper.find("[data-testid='pf-cal-filter']").setValue("dividend")
    expect(wrapper.text()).not.toContain("AAPL Ex-Div")
    expect(wrapper.text()).toContain("MSFT Div: $3.32")
  })

  it("derives holdings from the flat upcoming/past shape (mock compat), omitting amounts", async () => {
    const wrapper = await mountTab(flatFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click") // October 2026
    expect(wrapper.text()).toContain("AAPL Ex-Div")
    expect(wrapper.text()).not.toContain("AAPL Ex-Div: $0.26")
    // past event from August
    await wrapper.find("[data-testid='pf-cal-prev-month']").trigger("click")
    await wrapper.find("[data-testid='pf-cal-prev-month']").trigger("click")
    expect(wrapper.text()).toContain("MSFT Earnings")
  })

  it("renders no macro-economic events or holidays", async () => {
    const wrapper = await mountTab(holdingsFixture())
    await wrapper.find("[data-testid='pf-cal-next-month']").trigger("click")
    const text = wrapper.text()
    for (const banned of ["ISM", "CPI", "FOMC", "Memorial Day", "Holiday"]) {
      expect(text).not.toContain(banned)
    }
  })
})
