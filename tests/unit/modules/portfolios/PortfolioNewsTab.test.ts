import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioNewsTab from "@/modules/portfolios/PortfolioNewsTab.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"
import type { components } from "@/api/types"

vi.mock("@/api/portfolios", () => ({
  getPortfolioNews: vi.fn(),
  getPortfolioPositions: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" }, fullPath: "/en/portfolios/p1/news" }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mocked = vi.mocked(portfoliosApi)

const article = (ticker: string, sentiment?: unknown) => ({
  id: `a-${ticker}`,
  ticker,
  article: { title: `Headline for ${ticker}`, url: "https://example.com/x" },
  published_at: "2026-09-01T00:00:00Z",
  ...(sentiment ? { sentiment } : {}),
}) as unknown as NonNullable<components["schemas"]["NewsArticleList"]["data"]>[number]

const META = {
  id: "pos-1",
  symbol: "META",
  companyName: "Meta Platforms Inc",
  country: "US",
  assetType: "STOCK",
} as never

async function mountTab(items: unknown[]) {
  mocked.getPortfolioNews.mockResolvedValue({
    data: items,
    pagination: { count: items.length, total_count: items.length },
  } as never)
  const store = usePortfolioStore()
  store.positions = [META] as never
  // §85.2 — RouterLink is stubbed because this suite mounts without a router.
  // The stub renders its slot, so the badge stays where it was.
  const w = mount(PortfolioNewsTab, {
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
  return w
}

describe("PortfolioNewsTab — the shared identity block (§61.7)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("enriches a held ticker from the portfolio's own position", async () => {
    const w = await mountTab([article("META")])
    const badge = w.get('[data-testid="ticker-badge"]')
    expect(badge.find("img").attributes("src")).toBe("/api/logos/META")
    expect(badge.text()).toContain("Meta Platforms Inc")
    expect(badge.get('[data-testid="ticker-badge-details"]').text()).toBe("(US) Stock")
  })

  it("degrades a ticker with no open position to logo + ticker, never a guess", async () => {
    const w = await mountTab([article("ZZZZ")])
    const badge = w.get('[data-testid="ticker-badge"]')
    expect(badge.text()).toContain("ZZZZ")
    expect(badge.find('[data-testid="ticker-badge-name"]').exists()).toBe(false)
    expect(badge.find('[data-testid="ticker-badge-details"]').exists()).toBe(false)
  })

  it("still renders the sentiment chip beside the badge when the data carries a tone", async () => {
    const w = await mountTab([article("META", { tone: "negative", score: -1 })])
    expect(w.text()).toContain("negative")
    // badge and chip live in the same header row
    expect(w.get("article > div").find('[data-testid="ticker-badge"]').exists()).toBe(true)
    expect(w.get("article > div").find("span.capitalize").exists()).toBe(true)
  })

  it("wraps the badge in a link to that symbol's research page (§85.2)", async () => {
    const w = await mountTab([article("META")])
    const link = w.get('[data-testid="research-link"]')
    expect(JSON.parse(link.attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "META" },
      query: { from: "/en/portfolios/p1/news" },
    })
    // The badge stays inside the link, and the link stays inside `article > div`
    // — the wrap must not re-parent it, which the sentiment test also needs.
    expect(link.find('[data-testid="ticker-badge"]').exists()).toBe(true)
  })

  it("fetches positions when the store is empty (the tab is directly routable)", async () => {
    mocked.getPortfolioNews.mockResolvedValue({
      data: [article("META")],
      pagination: { count: 1, total_count: 1 },
    } as never)
    mocked.getPortfolioPositions.mockResolvedValue([] as never)
    mount(PortfolioNewsTab)
    await flushPromises()
    // the store passes no label filter when the tab asks for a bare fetch
    expect(mocked.getPortfolioPositions).toHaveBeenCalledWith("p1", undefined)
  })
})
