import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PublicPortfolioView from "@/modules/settings/PublicPortfolioView.vue"
import * as portfoliosApi from "@/api/portfolios"

// §85.5 — the share page's holdings table rendered each symbol as bare text,
// which made it the one surface where a visitor could see a ticker and do
// nothing with it. The cell now links to that symbol's research page, carrying
// the share page as `from`.
//
// §85.1 is the prerequisite and it is worth stating here: `researchBackTarget`
// only accepted a `/en/` prefix, so a `from` of `/public/portfolio/abc` was
// silently discarded and "Go back" would have dropped the share context. This
// test pins the `from` that §85.1 made survivable.

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { shareId: "abc" }, fullPath: "/public/portfolio/abc" }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return { ...actual, getPublicPortfolioShare: vi.fn() }
})

const mocked = vi.mocked(portfoliosApi)

const SHARE = {
  portfolio: {
    id: "p1",
    name: "My portfolio",
    baseCurrency: "PLN",
    positions: [
      { symbol: "SNT.WA", quantity: 400, marketValue: 40960, currentPrice: 102.4 },
      { symbol: "CDR.WA", quantity: 10, marketValue: 320, currentPrice: 32 },
    ],
  },
  share: {
    id: "abc",
    privacySettings: { showHoldings: true, showValues: true },
  },
} as never

async function mountView(share = SHARE) {
  mocked.getPublicPortfolioShare.mockResolvedValue(share)
  const wrapper = mount(PublicPortfolioView, {
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

describe("PublicPortfolioView — §85.5 linked holdings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("links each holding's symbol to its research page, with the share as `from`", async () => {
    const wrapper = await mountView()
    const links = wrapper.findAll('[data-testid="research-link"]')
    expect(links.length).toBe(2)
    expect(JSON.parse(links[0]!.attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "SNT.WA" },
      // The `/public/` prefix is the whole point of §85.1 — without it this is
      // discarded on arrival and "Go back" lands on /en/investments.
      query: { from: "/public/portfolio/abc" },
    })
    expect(JSON.parse(links[1]!.attributes("data-to")!).params.symbol).toBe("CDR.WA")
  })

  it("renders the badge inside the link, and keeps the cell's own padding", async () => {
    const wrapper = await mountView()
    const cell = wrapper.get('[data-testid="research-link"]').element.closest("td")
    expect(cell).not.toBeNull()
    expect(cell!.className).toContain("px-6")
    expect(wrapper.get('[data-testid="research-link"]').find('[data-testid="ticker-badge"]').exists()).toBe(true)
  })

  it("links the symbol even though the share schema carries no name or country", async () => {
    // The share payload has only `symbol`; TickerBadge degrades to logo + ticker,
    // which is its documented behaviour for the optional props. Asserted as a
    // prop — `symbol` is never rendered as a DOM attribute.
    const wrapper = await mountView()
    const badge = wrapper.get('[data-testid="research-link"]').findComponent({ name: "TickerBadge" })
    expect(badge.props("symbol")).toBe("SNT.WA")
    expect(badge.props("name")).toBeUndefined()
    expect(badge.props("countryCode")).toBeUndefined()
    expect(badge.props("assetType")).toBeUndefined()
  })

  it("still honours the owner's privacy setting — no holdings, no links", async () => {
    const hidden = {
      ...(SHARE as unknown as { portfolio: unknown; share: unknown }),
      share: { id: "abc", privacySettings: { showHoldings: false, showValues: false } },
    } as never
    const wrapper = await mountView(hidden)
    expect(wrapper.findAll('[data-testid="research-link"]')).toHaveLength(0)
    expect(wrapper.text()).toContain("Holdings are hidden")
  })
})
