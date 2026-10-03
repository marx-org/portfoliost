import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import BondCatalogueView from "@/modules/admin/BondCatalogueView.vue"
import * as adminApi from "@/api/admin"

// §85.6 — this is the surface the original request named explicitly: "bond".
// The symbols are ROD1033 / NNEP25-style government series, not equity tickers,
// and what makes the link resolve is the bond-profile fallback in
// portfoliost-instruments (/api/instruments/:symbol → profile when :symbol
// 404s), not a research page that happens to exist for every series.
//
// The logo endpoint was checked rather than assumed: /api/logos/ROD1033 answers
// 200 with a generated SVG plate (the first three characters in a circle), so
// TickerBadge degrades to a real plate instead of a broken image and needs no
// special-casing for series that have no logo of their own.

vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: "/en/admin/bond-catalogue" }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof adminApi>()
  return {
    ...actual,
    fetchBondCatalogue: vi.fn(),
    fetchCpiSeries: vi.fn().mockResolvedValue(null),
  }
})

const ROD = {
  symbol: "ROD1033",
  name: " obligacje 2033",
  issueDate: "2023-05-01",
  maturityDate: "2033-05-01",
  rateRule: "fixed",
  margin: "0.0125",
} as never

const NNEP = {
  symbol: "NNEP25",
  name: "Nowe obligacje 2025",
  issueDate: "2024-02-01",
  maturityDate: "2025-08-01",
  rateRule: null,
  margin: null,
} as never

async function mountView(rows: unknown[]) {
  vi.mocked(adminApi.fetchBondCatalogue).mockResolvedValue({ count: rows.length, rows } as never)
  const wrapper = mount(BondCatalogueView, {
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

describe("BondCatalogueView — §85.6 bond series link to research", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("links a bond series symbol to its research page", async () => {
    const wrapper = await mountView([ROD])
    expect(JSON.parse(wrapper.get('[data-testid="research-link"]').attributes("data-to")!)).toEqual({
      name: "research-overview",
      params: { symbol: "ROD1033" },
      query: { from: "/en/admin/bond-catalogue" },
    })
  })

  it("links every series, with the bare symbol in params", async () => {
    const wrapper = await mountView([ROD, NNEP])
    const symbols = wrapper
      .findAll('[data-testid="research-link"]')
      .map((l) => (JSON.parse(l.attributes("data-to")!) as { params: { symbol: string } }).params.symbol)
    expect(symbols).toEqual(["ROD1033", "NNEP25"])
  })

  it("passes no name to the badge, keeping the separate Name column authoritative", async () => {
    // The badge's `name` prop is deliberately not bound: the row already has a
    // dedicated Name column, and duplicating it in the badge would render the
    // series name twice in one row.
    const wrapper = await mountView([ROD])
    const badge = wrapper.get('[data-testid="research-link"]').findComponent({ name: "TickerBadge" })
    expect(badge.props("symbol")).toBe("ROD1033")
    expect(badge.props("name")).toBeUndefined()
  })

  it("keeps the symbol cell's mono styling and leaves the other columns alone", async () => {
    const wrapper = await mountView([ROD])
    const cell = wrapper.get('[data-testid="research-link"]').element.closest("td")
    expect(cell!.className).toContain("font-mono")
    expect(wrapper.text()).toContain("2033-05-01")
  })
})
