import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchCalendar from "@/modules/instruments/ResearchCalendar.vue"
import * as instrumentsApi from "@/api/instruments"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL" } }),
}))

vi.mock("@/api/instruments", async (importOriginal) => {
  const actual = await importOriginal<typeof instrumentsApi>()
  return {
    ...actual,
    getInstrumentCalendar: vi.fn(),
  }
})

function calendarData() {
  return {
    currency: "USD",
    earnings: [{ date: "2026-10-28", title: "Q4 2026 Earnings Call", year: 2026, quarter: 4 }],
    exDividend: [
      { date: "2026-11-10", title: "Ex-Dividend Nov 2026", year: 2026, amount: 0.29 },
      { date: "2026-02-10", title: "Ex-Dividend Feb 2026", year: 2026, amount: 0.33 },
    ],
    dividend: [
      { date: "2026-12-15", title: "Dividend Dec 2026", year: 2026, amount: 0.29 },
      { date: "2026-03-15", title: "Dividend Mar 2026", year: 2026, amount: 0.25 },
    ],
  }
}

async function mountWith(response: unknown) {
  vi.mocked(instrumentsApi.getInstrumentCalendar).mockResolvedValue(response as never)
  const wrapper = mount(ResearchCalendar)
  await flushPromises()
  return wrapper
}

describe("ResearchCalendar — §49.9 upcoming sections", () => {
  it("shows both the ex-dividend and the payment-date card (live dividend[])", async () => {
    const wrapper = await mountWith(calendarData())
    const ex = wrapper.findAll(".card").filter((c) => c.text().includes("Upcoming Ex-Dividend"))
    const pay = wrapper.findAll(".card").filter((c) => c.text().includes("Upcoming Dividend"))
    expect(ex).toHaveLength(1)
    expect(pay).toHaveLength(1)
    expect(ex[0].text()).toContain("Nov 10, 2026")
    expect(ex[0].text()).not.toContain("Feb 10, 2026")
    expect(pay[0].text()).toContain("Dec 15, 2026")
    expect(pay[0].text()).not.toContain("Mar 15, 2026")
    expect(pay[0].text()).toContain("$0.29")
  })

  it("keeps the Upcoming Dividend card visible with an empty state when nothing is upcoming", async () => {
    const data = calendarData()
    data.dividend = []
    const wrapper = await mountWith(data)
    const pay = wrapper.findAll(".card").filter((c) => c.text().includes("Upcoming Dividend"))
    expect(pay).toHaveLength(1)
    expect(pay[0].text()).toContain("No upcoming dividends.")
  })
})