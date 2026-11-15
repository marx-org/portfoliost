import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import StockCategoriesView from "@/modules/charting/StockCategoriesView.vue"
import { getStockChartCategories, setStockChartCategory } from "@/api/charting"
import { getAllPositions } from "@/api/portfolios"

vi.mock("@/api/charting", () => ({
  getStockChartCategories: vi.fn(),
  setStockChartCategory: vi.fn(),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/portfolios")>()
  return { ...actual, getAllPositions: vi.fn() }
})

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

const mockedList = vi.mocked(getStockChartCategories)
const mockedSave = vi.mocked(setStockChartCategory)
const mockedPositions = vi.mocked(getAllPositions)

function position(overrides: Record<string, unknown>) {
  return {
    id: "p1",
    symbol: "AAPL",
    companyName: "Apple",
    assetType: "STOCK",
    instrumentCurrency: "USD",
    ...overrides,
  } as never
}

describe("StockCategoriesView", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists held STOCKs with a not-classified default and excludes a same-ticker option", async () => {
    mockedList.mockResolvedValue([])
    mockedPositions.mockResolvedValue([
      position({ id: "p1", symbol: "AAPL" }),
      position({ id: "p2", symbol: "AAPL", assetType: "OPTION" }),
    ])
    const wrapper = mount(StockCategoriesView, { global: { stubs: { apexchart: true } } })
    await flushPromises()

    const rows = wrapper.findAll("tbody tr")
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes("data-symbol")).toBe("AAPL")
    const select = wrapper.get('[data-testid="category-select-AAPL-USD"]').element as HTMLSelectElement
    expect(select.value).toBe("not_classified")
  })

  it("saves a category change and marks the row updated", async () => {
    mockedList.mockResolvedValue([])
    mockedPositions.mockResolvedValue([position({ id: "p1", symbol: "AAPL" })])
    mockedSave.mockResolvedValue({
      symbol: "AAPL",
      instrumentCurrency: "USD",
      name: "Apple",
      category: "high_growth",
      updatedAt: "2026-11-15T00:00:00.000Z",
    } as never)

    const wrapper = mount(StockCategoriesView, { global: { stubs: { apexchart: true } } })
    await flushPromises()

    const select = wrapper.get('[data-testid="category-select-AAPL-USD"]')
    await select.setValue("high_growth")
    await flushPromises()

    expect(mockedSave).toHaveBeenCalledWith({ symbol: "AAPL", instrumentCurrency: "USD", category: "high_growth" })
    expect(wrapper.get('[data-testid="category-select-AAPL-USD"]').element).toHaveProperty("value", "high_growth")
  })

  it("keeps a stored assignment for a stock that is no longer held", async () => {
    mockedList.mockResolvedValue([
      {
        symbol: "MSFT",
        instrumentCurrency: "USD",
        name: "Microsoft",
        category: "balanced",
        updatedAt: "2026-11-01T00:00:00.000Z",
      } as never,
    ])
    mockedPositions.mockResolvedValue([])
    const wrapper = mount(StockCategoriesView, { global: { stubs: { apexchart: true } } })
    await flushPromises()

    const rows = wrapper.findAll("tbody tr")
    expect(rows.map((r) => r.attributes("data-symbol"))).toEqual(["MSFT"])
    expect(wrapper.get('[data-testid="category-select-MSFT-USD"]').element).toHaveProperty("value", "balanced")
  })

  it("shows an empty state when there are no stocks", async () => {
    mockedList.mockResolvedValue([])
    mockedPositions.mockResolvedValue([])
    const wrapper = mount(StockCategoriesView, { global: { stubs: { apexchart: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain("No stocks to classify")
  })
})