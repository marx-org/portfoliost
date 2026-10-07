import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MarketDataView from "@/modules/admin/MarketDataView.vue"
import * as adminApi from "@/api/admin"

// §85.6 — the three symbol cells in this operational view (pending splits,
// split history, overflow summary) now link into research, so an admin looking
// at a suspicious factor can go and read the instrument's page.
//
// These rows carry no name, so TickerBadge shows logo + ticker only. Nothing
// about the operational behaviour changes — the Apply/Dismiss actions and their
// per-symbol inputs are untouched.

vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: "/en/admin/market-data" }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof adminApi>()
  return {
    ...actual,
    fetchStooqImportLog: vi.fn().mockResolvedValue([]),
    fetchSplitCandidates: vi.fn().mockResolvedValue([]),
    fetchOverflowSummary: vi.fn().mockResolvedValue(null),
    applySplitCandidate: vi.fn(),
    dismissSplitCandidate: vi.fn(),
  }
})

const CANDIDATE = {
  symbol: "AAPL",
  detectedAt: "2026-09-01",
  effectiveDate: "2026-08-31",
  lastStooqClose: "100",
  firstOverflowClose: "50",
  ratio: "2",
  suggestedFactor: "2",
  providerFactor: "2",
  status: "pending",
} as never

const OVERFLOW = {
  total: 12,
  topSymbols: [
    { symbol: "MSFT", rowCount: 4000 },
    { symbol: "NVDA", rowCount: 2000 },
  ],
} as never

async function mountView(candidates: unknown[] = [], overflow: unknown = null) {
  vi.mocked(adminApi.fetchSplitCandidates).mockResolvedValue(candidates as never)
  vi.mocked(adminApi.fetchOverflowSummary).mockResolvedValue(overflow as never)
  const wrapper = mount(MarketDataView, {
    global: {
      stubs: {
        RouterLink: {
          props: ["to"],
          template: "<a data-testid='research-link' :data-to='JSON.stringify(to)'><slot /></a>",
        },
      },
    },
  })
  await flushPromises()
  return wrapper
}

/** `params.symbol` of every research link, in render order. */
function linkSymbols(wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper
    .findAll('[data-testid="research-link"]')
    .map((l) => (JSON.parse(l.attributes("data-to")!) as { params: { symbol: string } }).params.symbol)
}

describe("MarketDataView — §85.6 symbol cells link to research", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("links the pending-split symbol", async () => {
    const wrapper = await mountView([CANDIDATE])
    expect(linkSymbols(wrapper)).toContain("AAPL")
  })

  it("links the split-history symbol", async () => {
    // status: "applied" puts the row in the history table rather than pending.
    const applied = { ...(CANDIDATE as unknown as object), status: "applied" } as never
    const wrapper = await mountView([applied])
    expect(linkSymbols(wrapper)).toContain("AAPL")
  })

  it("links every symbol in the overflow summary", async () => {
    const wrapper = await mountView([], OVERFLOW)
    expect(linkSymbols(wrapper)).toEqual(["MSFT", "NVDA"])
  })

  it("carries the admin page as `from`, with the bare symbol in params", async () => {
    const wrapper = await mountView([], OVERFLOW)
    expect(JSON.parse(wrapper.get('[data-testid="research-link"]').attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "MSFT" },
      query: { from: "/en/admin/market-data" },
    })
  })

  it("leaves the Apply/Dismiss controls intact", async () => {
    const wrapper = await mountView([CANDIDATE])
    // The factor input is an untyped text input bound to applyFactor[symbol].
    expect(wrapper.find('input[placeholder="2"]').exists()).toBe(true)
    expect(wrapper.findAll("button").some((b) => b.text() === "Apply")).toBe(true)
    expect(wrapper.findAll("button").some((b) => b.text() === "Dismiss")).toBe(true)
  })
})
