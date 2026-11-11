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

// The calendar cards filter to dates after today, so the fixture is anchored to
// the clock the suite runs on. Absolute dates here are a time bomb: the "upcoming"
// rows silently age out of the window and the test fails for a reason no diff
// explains (#67).
function iso(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function displayDate(offsetDays: number): string {
  return new Date(iso(offsetDays)).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })
}

function calendarData() {
  return {
    currency: "USD",
    earnings: [{ date: iso(3), title: "Upcoming Earnings Call", year: new Date().getFullYear(), quarter: 4 }],
    exDividend: [
      { date: iso(5), title: "Upcoming Ex-Dividend", year: new Date().getFullYear(), amount: 0.29 },
      { date: iso(-90), title: "Past Ex-Dividend", year: new Date().getFullYear(), amount: 0.33 },
    ],
    dividend: [
      { date: iso(60), title: "Upcoming Dividend", year: new Date().getFullYear(), amount: 0.29 },
      { date: iso(-30), title: "Past Dividend", year: new Date().getFullYear(), amount: 0.25 },
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
    expect(ex[0].text()).toContain(displayDate(5))
    expect(ex[0].text()).not.toContain(displayDate(-90))
    expect(pay[0].text()).toContain(displayDate(60))
    expect(pay[0].text()).not.toContain(displayDate(-30))
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