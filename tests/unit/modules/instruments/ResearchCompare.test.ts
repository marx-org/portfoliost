import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ResearchCompare from "@/modules/instruments/ResearchCompare.vue"
import * as instrumentsApi from "@/api/instruments"

// §85.2 — the Compare tab's column headers render a TickerBadge per peer. Peers
// link to their own research page; the PRIMARY column deliberately does not,
// because `researchRoute` hard-codes the research overview and linking the
// column the user is already looking at would silently navigate away from the
// tab. `r.symbol` is also nullable, and the old `:symbol="r.symbol ?? ''"`
// proves it — an empty badge must not become a link either.

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { symbol: "AAPL" }, fullPath: "/en/research/AAPL/compare" }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/instruments", async (importOriginal) => {
  const actual = await importOriginal<typeof instrumentsApi>()
  return { ...actual, getInstrumentPeers: vi.fn() }
})

const mocked = vi.mocked(instrumentsApi)

const PEER = (symbol: string | null, over: Record<string, unknown> = {}) => ({
  symbol,
  name: symbol === "MSFT" ? "Microsoft Corp" : "Apple Inc",
  countryCode: "US",
  assetType: "STOCK",
  ...over,
})

async function mountCompare(items: unknown[]) {
  mocked.getInstrumentPeers.mockResolvedValue({ items } as never)
  const wrapper = mount(ResearchCompare, {
    global: {
      stubs: {
        TickerBadge: true,
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

function linkTargets(wrapper: Awaited<ReturnType<typeof mountCompare>>) {
  return wrapper
    .findAll('[data-testid="research-link"]')
    .map((l) => JSON.parse(l.attributes("data-to")!) as { params: { symbol: string } })
}

describe("ResearchCompare — §85.2 peer columns link, the primary column does not", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("links each peer column to that peer's research page", async () => {
    const wrapper = await mountCompare([PEER("AAPL"), PEER("MSFT"), PEER("GOOG")])
    const targets = linkTargets(wrapper)
    // Two peers only — AAPL is the primary column and must stay plain.
    expect(targets.map((t) => t.params.symbol)).toEqual(["MSFT", "GOOG"])
  })

  it("carries the compare tab as `from` so 'Go back' returns to it", async () => {
    const wrapper = await mountCompare([PEER("AAPL"), PEER("MSFT")])
    const link = wrapper.get('[data-testid="research-link"]')
    expect(JSON.parse(link.attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "MSFT" },
      query: { from: "/en/research/AAPL/compare" },
    })
  })

  it("leaves the primary column a plain badge", async () => {
    const wrapper = await mountCompare([PEER("AAPL"), PEER("MSFT")])
    const symbols = wrapper.findAll("ticker-badge-stub").map((b) => b.attributes("symbol"))
    expect(symbols).toEqual(["AAPL", "MSFT"])
    // Exactly one link, and it is not the AAPL one.
    expect(linkTargets(wrapper).map((t) => t.params.symbol)).not.toContain("AAPL")
  })

  it("renders a nullable symbol as a plain badge, not a link", async () => {
    const wrapper = await mountCompare([PEER(null, { name: null }), PEER("MSFT")])
    expect(linkTargets(wrapper).map((t) => t.params.symbol)).toEqual(["MSFT"])
    // The badge still renders, so nothing is lost from the header.
    expect(wrapper.findAll("ticker-badge-stub")).toHaveLength(2)
  })
})
