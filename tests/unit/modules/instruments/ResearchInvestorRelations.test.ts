import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchInvestorRelations from "@/modules/instruments/ResearchInvestorRelations.vue"
import * as instrumentsApi from "@/api/instruments"

vi.mock("@/api/instruments", () => ({
  getInvestorRelations: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL.US" } }),
}))

const mocked = vi.mocked(instrumentsApi)

function mountIr() {
  return mount(ResearchInvestorRelations, {
    global: {
      stubs: {
        "router-link": {
          props: ["to"],
          template: '<a class="route-link" :data-to="JSON.stringify(to)"><slot /></a>',
        },
      },
    },
  })
}

describe("ResearchInvestorRelations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists blended events (earnings calls + SEC filings)", async () => {
    mocked.getInvestorRelations.mockResolvedValue([
      {
        type: "transcript",
        id: "AAPL_2026-03-31",
        title: "AAPL - Earnings call Q1 2026",
        date: "2026-03-31 21:01:04",
        year: 2026,
        quarter: 1,
        symbol: "AAPL",
        audioUrl: null,
      },
      {
        type: "press-release",
        id: "AAPL_10-K_0000320193-25-000132",
        title: "AAPL - SEC Form 10-K (filed 2025-11-03)",
        date: "2025-11-03 00:00:00",
        year: 2025,
        quarter: null,
        symbol: "AAPL",
        audioUrl: null,
        reportUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000132/aapl-20250928.htm",
        formType: "10-K",
      },
    ])
    const wrapper = mountIr()
    await flushPromises()

    expect(wrapper.text()).toContain("AAPL - Earnings call Q1 2026")
    expect(wrapper.text()).toContain("AAPL - SEC Form 10-K (filed 2025-11-03)")
    expect(wrapper.text()).toContain("10-K")
  })

  it("renders a Filing link for SEC events and routes every event to the transcript view", async () => {
    mocked.getInvestorRelations.mockResolvedValue([
      {
        type: "press-release",
        id: "AAPL_8-K_0000320193-26-000045",
        title: "AAPL - SEC Form 8-K (filed 2026-07-30)",
        date: "2026-07-30 00:00:00",
        year: 2026,
        quarter: null,
        symbol: "AAPL",
        audioUrl: null,
        reportUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000045/aapl-20260730.htm",
        formType: "8-K",
      },
    ])
    const wrapper = mountIr()
    await flushPromises()

    const filing = wrapper.find("a[href]")
    expect(filing.exists()).toBe(true)
    expect(filing.attributes("href")).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000045/aapl-20260730.htm")
    expect(filing.text()).toBe("Filing")
  })

  it("filters events by type", async () => {
    mocked.getInvestorRelations.mockResolvedValue([
      {
        type: "transcript",
        id: "AAPL_2026-03-31",
        title: "AAPL - Earnings call Q1 2026",
        date: "2026-03-31 21:01:04",
        year: 2026,
        quarter: 1,
        symbol: "AAPL",
        audioUrl: null,
      },
      {
        type: "press-release",
        id: "AAPL_8-K_0000320193-26-000045",
        title: "AAPL - SEC Form 8-K (filed 2026-07-30)",
        date: "2026-07-30 00:00:00",
        year: 2026,
        quarter: null,
        symbol: "AAPL",
        audioUrl: null,
        reportUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000045/aapl-20260730.htm",
        formType: "8-K",
      },
    ])
    const wrapper = mountIr()
    await flushPromises()

    const transcriptBtn = wrapper.findAll("button").find((b) => b.text().includes("transcript"))!
    await transcriptBtn.trigger("click")
    await flushPromises()

    expect(wrapper.text()).toContain("AAPL - Earnings call Q1 2026")
    expect(wrapper.text()).not.toContain("SEC Form 8-K")
  })

  it("shows an error when the events request fails", async () => {
    mocked.getInvestorRelations.mockRejectedValue(new Error("NotFound"))
    const wrapper = mountIr()
    await flushPromises()
    expect(wrapper.find(".bg-red-50").exists()).toBe(true)
    expect(wrapper.find(".bg-red-50").text()).toContain("NotFound")
  })
})