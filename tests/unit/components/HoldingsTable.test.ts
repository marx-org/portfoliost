import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import HoldingsTable from "@/components/HoldingsTable.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" }, fullPath: "/en/portfolios/p1/holdings" }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioPositions: vi.fn(),
  }
})

const mockedPortfolios = vi.mocked(portfoliosApi)

/** A USD-denominated open position (same instrument/display currency, so no FX
 *  rate is involved and the totals are plain sums). */
function position(overrides: Record<string, unknown> = {}) {
  return {
    id: `pos-${overrides.id ?? Math.random().toString(36).slice(2, 8)}`,
    portfolioId: "p1",
    symbol: String(overrides.symbol ?? "AAPL"),
    companyName: String(overrides.companyName ?? "Apple Inc"),
    assetType: "STOCK",
    quantity: 10,
    averageCostBasis: 90,
    totalCostBasis: 900,
    instrumentCurrency: "USD",
    purchaseCurrency: "USD",
    isOpen: true,
    currentPrice: 100,
    marketValue: 1000,
    unrealizedGainLoss: 100,
    percentageChange: 11.11,
    percentOfPortfolio: 4,
    displayCurrency: "USD",
    labels: [],
    ...overrides,
  } as never
}

function mountTable(positions: never[], mode: "portfolio" | "global" = "global") {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (mode === "portfolio") {
    const store = usePortfolioStore()
    store.detail = { currency: "USD" } as never
    store.positions = positions
    mockedPortfolios.getPortfolioPositions.mockResolvedValue(positions as never)
    return mount(HoldingsTable, {
      global: { plugins: [pinia], stubs: { RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } },
    })
  }
  return mount(HoldingsTable, {
    props: { mode, positions, portfolioName: "consolidated" },
    global: { plugins: [pinia], stubs: { RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } },
  })
}

function rows(wrapper: ReturnType<typeof mountTable>) {
  return wrapper.findAll('[data-testid="holdings-row"]')
}

/** The `N–M of K` range shown in the paginator footer `<p>`. */
function range(wrapper: ReturnType<typeof mountTable>) {
  const p = wrapper.findAll("p").find((el) => /^\d+–\d+ of \d+$/.test(el.text().trim()))
  return p ? p.text().trim() : ""
}

describe("HoldingsTable — §157 client-side search, paging and symbol scaling", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it("constrains the symbol column and fixes the numeric columns (the truncation mechanism)", () => {
    const wrapper = mountTable([position(), position({ symbol: "BBA" })])
    // table-fixed is what makes the colgroup widths binding.
    expect(wrapper.find("table").classes()).toContain("table-fixed")
    const cols = wrapper.findAll("col")
    // Symbol is the only data column WITHOUT a fixed width — it is the flexible
    // one that absorbs the remainder and truncates; every numeric column carries
    // an explicit pixel width.
    const symbolCol = cols.find((c) => !c.attributes("style"))
    expect(symbolCol, "symbol column has no fixed width").toBeTruthy()
    const fixed = cols.filter((c) => c.attributes("style")?.includes("width"))
    // global mode: Portfolio + 6 fixed numeric columns + actions = 8 fixed,
    // Symbol the one flexible column without a width.
    expect(fixed).toHaveLength(8)
  })

  it("truncates a long company name inside the symbol column", () => {
    const wrapper = mountTable([position({ companyName: "ING Emerytura 2065 (ING Emerytura SFIO)" })])
    const nameEl = wrapper.find('[data-testid="ticker-badge-name"]')
    expect(nameEl.exists()).toBe(true)
    expect(nameEl.text()).toContain("ING Emerytura")
    // The td that holds the badge clamps overflow so the TickerBadge's inner
    // truncate clips the long name to an ellipsis instead of inflating the column.
    const parentTd = nameEl.element.closest("td")
    expect(parentTd, "badge lives in the symbol td").toBeTruthy()
    expect(parentTd!.className).toMatch(/min-w-0/)
    expect(parentTd!.className).toMatch(/overflow-hidden/)
  })

  it("renders every default column without paging under the default page size", () => {
    const wrapper = mountTable(Array.from({ length: 11 }, (_, i) => position({ id: `p${i}`, symbol: `SYM${i}` })))
    // 11 rows < default page size 20 → single page. The paginator is still shown
    // (matching the transactions table) with the full-range footer.
    expect(rows(wrapper)).toHaveLength(11)
    expect(range(wrapper)).toBe("1–11 of 11")
  })

  it("pages client-side at the default size (20) and shows a range footer", async () => {
    const positions = Array.from({ length: 25 }, (_, i) => position({ id: `p${i}`, symbol: `SYM${i}` }))
    const wrapper = mountTable(positions)
    expect(rows(wrapper)).toHaveLength(20)
    expect(range(wrapper)).toBe("1–20 of 25")
    // Total row is measured over ALL 25, not just the visible page.
    expect(wrapper.find("tfoot").text()).toContain("$25,000.00")

    // Advance to page 2: the remaining 5 rows, total row unchanged.
    await wrapper.find('button[aria-label="Next page"]').trigger("click")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(5)
    expect(range(wrapper)).toBe("21–25 of 25")
    expect(wrapper.find("tfoot").text()).toContain("$25,000.00")
  })

  it("keeps group subtotals correct when only part of a group is on the page", async () => {
    // 12 Alpha + 13 Beta. Page size 20 → Alpha (12) fits on page 1, Beta (13)
    // splits 8/5 across pages. Each subtotal must still cover its whole group.
    const positions = [
      ...Array.from({ length: 12 }, (_, i) => position({ id: `a${i}`, symbol: `A${i}`, sector: "Alpha" })),
      ...Array.from({ length: 13 }, (_, i) => position({ id: `b${i}`, symbol: `B${i}`, sector: "Beta" })),
    ]
    const wrapper = mountTable(positions)
    await wrapper.get('select[aria-label="Group by"]').setValue("sector")
    await flushPromises()

    const alphas = wrapper.findAll('[data-testid="holdings-group-row"]')
    expect(alphas.map((r) => r.text())).toEqual(expect.arrayContaining(["Alpha 12", "Beta 13"]))
    // Page 1 holds all 12 Alpha and the first 8 Beta rows → 20 data rows.
    expect(rows(wrapper)).toHaveLength(20)
    // Both subtotals are the full group sum (MV 12k and 13k), not the page slice.
    const subtotalTexts = wrapper
      .findAll("tr")
      .map((t) => t.text())
      .filter((t) => t.includes("subtotal"))
    expect(subtotalTexts.some((t) => t.includes("Alpha subtotal") && t.includes("$12,000.00"))).toBe(true)
    expect(subtotalTexts.some((t) => t.includes("Beta subtotal") && t.includes("$13,000.00"))).toBe(true)

    // Page 2 holds the remaining 5 Beta rows; the Beta subtotal is still 13k.
    await wrapper.find('button[aria-label="Next page"]').trigger("click")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(5)
    const page2Subtotals = wrapper
      .findAll("tr")
      .map((t) => t.text())
      .filter((t) => t.includes("subtotal"))
    expect(page2Subtotals.some((t) => t.includes("Beta subtotal") && t.includes("$13,000.00"))).toBe(true)
  })

  it("filters by ticker in the header search", async () => {
    const positions = Array.from({ length: 6 }, (_, i) => position({ id: `p${i}`, symbol: i === 0 ? "GOOG" : `SYM${i}`, companyName: i === 0 ? "Alphabet" : `Corp ${i}` }))
    const wrapper = mountTable(positions)
    await wrapper.get('[data-testid="holdings-search"]').setValue("goog")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(1)
    expect(range(wrapper)).toBe("1–1 of 1")
  })

  it("filters by company name (case-insensitive) and clears back to the full list", async () => {
    const positions = [
      position({ id: "a", symbol: "GOOG", companyName: "Alphabet Inc" }),
      position({ id: "b", symbol: "META", companyName: "Meta Platforms" }),
      position({ id: "c", symbol: "MSFT", companyName: "Microsoft Corp" }),
    ]
    const wrapper = mountTable(positions)
    expect(rows(wrapper)).toHaveLength(3)
    await wrapper.get('[data-testid="holdings-search"]').setValue("meta")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(1)
    expect(wrapper.find('[data-testid="holdings-row"]').text()).toContain("META")
    // Clearing restores the whole list.
    await wrapper.get('[data-testid="holdings-search"]').setValue("")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(3)
  })

  it("works in portfolio mode, not just the consolidated (global) surface", async () => {
    const positions = [position({ id: "a", symbol: "AAPL", companyName: "Apple" }), position({ id: "b", symbol: "GOOG", companyName: "Alphabet" })]
    const wrapper = mountTable(positions, "portfolio")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(2)
    await wrapper.get('[data-testid="holdings-search"]').setValue("apple")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(1)
    expect(wrapper.find('[data-testid="holdings-row"]').text()).toContain("AAPL")
  })

  it("resets to the first page when the search narrows the result set", async () => {
    const positions = Array.from({ length: 25 }, (_, i) => position({ id: `p${i}`, symbol: `SYM${i}`, companyName: i === 24 ? "Uniquex Corp" : `Corp ${i}` }))
    const wrapper = mountTable(positions)
    // Go to page 2 (5 rows there).
    await wrapper.find('button[aria-label="Next page"]').trigger("click")
    await flushPromises()
    expect(wrapper.find("tfoot").exists()).toBe(true)
    // A search that matches only one row on page 1 must jump back to page 1.
    await wrapper.get('[data-testid="holdings-search"]').setValue("uniquex")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(1)
    expect(range(wrapper)).toBe("1–1 of 1")
  })

  it("reflects the page size in the range footer and keeps the totals honest", async () => {
    const positions = Array.from({ length: 25 }, (_, i) => position({ id: `p${i}`, symbol: `SYM${i}` }))
    const wrapper = mountTable(positions)
    await wrapper.get('[data-testid="holdings-page-size"]').setValue("10")
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(10)
    expect(range(wrapper)).toBe("1–10 of 25")
    // Three pages now; the Total row is still the full 25-row sum.
    expect(wrapper.find("tfoot").text()).toContain("$25,000.00")
  })

  it("exports the filtered set to CSV, not just the visible page", async () => {
    // Capture the Blob the export builds (the CSV body is its single part).
    const blobParts: string[] = []
    const origBlob = globalThis.Blob
    class CaptureBlob extends origBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts)
        for (const p of parts) if (typeof p === "string") blobParts.push(p)
      }
    }
    vi.spyOn(globalThis, "Blob").mockImplementation((CaptureBlob as never) as never)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})

    const positions = Array.from({ length: 25 }, (_, i) => position({ id: `p${i}`, symbol: `SYM${i}`, companyName: i === 24 ? "Uniquex Corp" : `Corp ${i}` }))
    const wrapper = mountTable(positions)
    // Search matches only position 24 (by company name "Uniquex Corp").
    await wrapper.get('[data-testid="holdings-search"]').setValue("uniquex")
    await flushPromises()

    const exportBtn = wrapper.findAll("button").find((b) => b.text().trim() === "Export")
    expect(exportBtn, "Export button").toBeTruthy()
    await exportBtn!.trigger("click")
    await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    const csv = blobParts.join("")
    expect(csv).toBeDefined()
    const lines = csv.split("\n")
    expect(lines[0]).toBe("Symbol,Quantity,Avg Cost,Price,Market Value,Unrealized P/L,Weight")
    // Only the single matching row is exported (filtered), not all 25.
    expect(lines.filter(Boolean)).toHaveLength(2)
    // The CSV carries the symbol (SYM24), not the company name.
    expect(lines[1]).toContain("SYM24")
  })
})
