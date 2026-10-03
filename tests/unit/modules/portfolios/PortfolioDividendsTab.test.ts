import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioDividendsTab from "@/modules/portfolios/PortfolioDividendsTab.vue"
import * as portfoliosApi from "@/api/portfolios"

// §85.2 — the Dividend History symbol cell now links into research, but only
// where there is a symbol to link to. The component renders two different
// endpoint shapes from one table (§49.5): the real `items[]`, and the
// research-backed `history[]` whose `mapLegacy` hardcodes an em-dash
// placeholder because those rows genuinely carry no ticker. Linking the
// placeholder would produce a live link to `/en/research/%E2%80%94/overview`,
// so the legacy path must keep a plain badge.

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" }, fullPath: "/en/portfolios/p1/dividends" }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = importOriginal<typeof portfoliosApi>()
  return { ...(await actual), getPortfolioDividends: vi.fn() }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 1, asOf: "2026-10-02" }),
}))

const mocked = vi.mocked(portfoliosApi)

const ITEM = {
  symbol: "AAPL",
  instrumentName: "Apple Inc",
  date: "2026-02-10",
  quantity: 10,
  gross: 25,
  taxes: 5,
  amount: 20,
  currency: "USD",
  exchangeRate: null,
  convertedAmount: null,
  notes: null,
}

async function mountTab(data: Record<string, unknown>) {
  mocked.getPortfolioDividends.mockResolvedValue(data as never)
  const wrapper = mount(PortfolioDividendsTab, {
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

function firstRowLink(wrapper: Awaited<ReturnType<typeof mountTab>>) {
  const links = wrapper.get('[data-testid="dividends-table"]').findAll('[data-testid="research-link"]')
  if (!links.length) throw new Error("expected a research link on the first dividend row")
  return links[0]!
}

describe("PortfolioDividendsTab — §85.2 research link on the symbol cell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("links the symbol to its research page, with this page as `from`", async () => {
    const wrapper = await mountTab({ count: 1, items: [ITEM], history: [] })
    const link = firstRowLink(wrapper)
    expect(JSON.parse(link.attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "AAPL" },
      query: { from: "/en/portfolios/p1/dividends" },
    })
    // The badge stays inside the link rather than being re-parented.
    expect(link.find("ticker-badge-stub").exists()).toBe(true)
  })

  it("renders a plain badge, no link, on the legacy history[] path", async () => {
    // `history[]` rows have no ticker — `mapLegacy` fills in "—".
    const wrapper = await mountTab({
      count: 1,
      items: [],
      history: [{ date: "2026-02-10", amount: 25, currency: "USD" }],
    })
    expect(wrapper.findAll('[data-testid="research-link"]')).toHaveLength(0)
    // The badge still renders, so the legacy table loses nothing but the link.
    expect(wrapper.get('[data-testid="dividends-table"]').findAll("ticker-badge-stub").length).toBeGreaterThan(0)
  })

  it("prefers items[] when both shapes are present", async () => {
    const wrapper = await mountTab({ count: 1, items: [ITEM], history: [{ date: "2026-01-01", amount: 1, currency: "USD" }] })
    const link = firstRowLink(wrapper)
    expect(JSON.parse(link.attributes("data-to")!).params.symbol).toBe("AAPL")
  })
})
