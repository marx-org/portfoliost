import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import ResearchInvestorRelationsTranscript from "@/modules/instruments/ResearchInvestorRelationsTranscript.vue"
import * as instrumentsApi from "@/api/instruments"

vi.mock("@/api/instruments", () => ({
  getTranscript: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL.US", eventId: "AAPL_10-K_0000320193-25-000132" } }),
}))

const mocked = vi.mocked(instrumentsApi)

function mountTranscript() {
  return mount(ResearchInvestorRelationsTranscript, {
    global: {
      stubs: { "router-link": { template: "<a><slot /></a>" } },
    },
  })
}

describe("ResearchInvestorRelationsTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders MD&A body paragraphs from the transcript document", async () => {
    mocked.getTranscript.mockResolvedValue({
      id: "AAPL_10-K_0000320193-25-000132",
      symbol: "AAPL",
      year: 2025,
      quarter: null,
      title: "AAPL - Management Discussion & Analysis",
      time: "2025-09-27 00:00:00",
      participant: [],
      audio: null,
      transcript: [],
      body: "First paragraph of MD&A.\n\nSecond paragraph of MD&A.",
    })
    const wrapper = mountTranscript()
    await flushPromises()

    expect(wrapper.text()).toContain("AAPL - Management Discussion & Analysis")
    expect(wrapper.text()).toContain("Management Discussion & Analysis")
    expect(wrapper.text()).toContain("First paragraph of MD&A.")
    expect(wrapper.text()).toContain("Second paragraph of MD&A.")
  })

  it("renders legacy Q&A transcript blocks when no body exists", async () => {
    mocked.getTranscript.mockResolvedValue({
      id: "AAPL_2026-03-31",
      symbol: "AAPL",
      year: 2026,
      quarter: 1,
      title: "AAPL - Earnings call Q1 2026",
      time: "2026-07-30 21:01:00",
      participant: [{ name: "Tim Cook" }, { name: "Jane Q. Analyst" }],
      audio: null,
      transcript: [
        { name: "Tim Cook", speech: ["Revenue grew 8% this quarter."] },
        { name: "Jane Q. Analyst", speech: ["How is demand holding up?"] },
      ],
    })
    const wrapper = mountTranscript()
    await flushPromises()

    expect(wrapper.text()).toContain("Participants")
    expect(wrapper.text()).toContain("Tim Cook")
    expect(wrapper.text()).toContain("Revenue grew 8% this quarter.")
    expect(wrapper.text()).toContain("How is demand holding up?")
  })

  it("fetches the transcript for the route symbol and eventId", async () => {
    mocked.getTranscript.mockResolvedValue({ id: "x", symbol: "AAPL", title: "x", participant: [], transcript: [] })
    const wrapper = mountTranscript()
    await flushPromises()
    expect(mocked.getTranscript).toHaveBeenCalledWith("AAPL.US", "AAPL_10-K_0000320193-25-000132")
    expect(wrapper.text()).toContain("x")
  })

  it("shows an error when the transcript request fails", async () => {
    mocked.getTranscript.mockRejectedValue(new Error("NotFound"))
    const wrapper = mountTranscript()
    await flushPromises()
    expect(wrapper.find(".bg-red-50").exists()).toBe(true)
    expect(wrapper.find(".bg-red-50").text()).toContain("NotFound")
  })
})