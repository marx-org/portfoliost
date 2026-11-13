import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ConsolidatedHoldingsView from "@/modules/portfolios/ConsolidatedHoldingsView.vue"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import HoldingsTable from "@/components/HoldingsTable.vue"
import type { PortfolioPositions } from "@/api/types"
import * as portfoliosApi from "@/api/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return { ...actual, getAllPositions: vi.fn() }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 1, asOf: "2026-08-25" }),
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, fullPath: "/en/investments/holdings" }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mocked = vi.mocked(portfoliosApi)

function position(overrides: Record<string, unknown> = {}) {
  return {
    id: "pos-1",
    portfolioId: "p1",
    portfolioName: "Broker account",
    symbol: "AAPL",
    companyName: "Apple Inc",
    assetType: "STOCK",
    quantity: 10,
    averageCostBasis: 100,
    totalCostBasis: 1000,
    instrumentCurrency: "USD",
    isOpen: true,
    currentPrice: 110,
    marketValue: 1100,
    unrealizedGainLoss: 100,
    realizedGainLoss: 0,
    percentageChange: 10,
    percentOfPortfolio: 100,
    displayCurrency: "USD",
    labels: [],
    ...overrides,
  } as never
}

function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const currencies = useCurrenciesStore(pinia)
  currencies.currencies = [{ code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true }]
  currencies.loaded = true
  return mount(ConsolidatedHoldingsView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } },
    },
  })
}

describe("ConsolidatedHoldingsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("loads all open positions and keeps portfolio context in the shared table", async () => {
    mocked.getAllPositions.mockResolvedValue([position(), position({ id: "pos-2", portfolioId: "p2", portfolioName: "Retirement" })])

    const wrapper = mountView()
    await flushPromises()

    expect(mocked.getAllPositions).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain("Consolidated holdings")
    expect(wrapper.text()).toContain("Broker account")
    expect(wrapper.text()).toContain("Retirement")
    expect(wrapper.findAll("button[aria-label='Position actions']")).toHaveLength(2)
  })

  it("keeps duplicate position memberships separate and targets actions to the owning portfolio", async () => {
    mocked.getAllPositions.mockResolvedValue([
      position({ id: "shared-position", portfolioId: "p1", portfolioName: "Broker account", realizedGainLoss: 18 }),
      position({ id: "shared-position", portfolioId: "p2", portfolioName: "Retirement", realizedGainLoss: 42 }),
    ])

    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="holdings-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].get('[data-testid="holdings-cell-realized"]').text()).toBe("+$18.00")
    expect(rows[1].get('[data-testid="holdings-cell-realized"]').text()).toBe("+$42.00")
    await rows[0].get('button[aria-label="Position actions"]').trigger("click")
    expect(rows[0].text()).toContain("Buy")
    expect(rows[1].text()).not.toContain("Buy")

    await rows[0].findAll("button").find((button) => button.text().trim() === "Buy")!.trigger("click")
    expect(wrapper.findComponent(AddPositionDialog).props("portfolioId")).toBe("p1")
  })

  it("keeps the table mounted while the aggregate refreshes, so paging and filters survive", async () => {
    // §90 — a label save, a buy or a dividend calls the table's `refresh` prop. If
    // the loading branch replaces the table, the component remounts and every
    // local ref (pageSize, search, groupBy, sort, visibleColumns) resets.
    const rows = [
      position(),
      position({ id: "pos-2", portfolioId: "p2", portfolioName: "Retirement", symbol: "KO", companyName: "Coca-Cola Co" }),
    ]
    // Deferred so the DOM can be inspected while the refresh is genuinely in flight.
    const resolvers: Array<(value: PortfolioPositions) => void> = []
    mocked.getAllPositions.mockImplementation(() => new Promise((res) => resolvers.push(res)))

    const wrapper = mountView()
    resolvers[0](rows)
    await flushPromises()

    const table = wrapper.findComponent(HoldingsTable)
    // The table's paging and search are local refs; set them through the DOM so
    // Vue's v-model sees a real input event.
    const pageSize = wrapper.element.querySelector('[data-testid="holdings-page-size"]') as HTMLSelectElement
    const search = wrapper.element.querySelector('[data-testid="holdings-search"]') as HTMLInputElement
    pageSize.value = "50"
    pageSize.dispatchEvent(new Event("change"))
    search.value = "KO"
    search.dispatchEvent(new Event("input"))
    await flushPromises()
    expect(wrapper.findAll('[data-testid="holdings-row"]')).toHaveLength(1)

    const pending = (table.props("refresh") as () => Promise<void>)()
    await flushPromises()
    // Mid-refresh the table is still mounted, with a "Refreshing…" line instead of
    // a loading card.
    expect(wrapper.find('[data-testid="holdings-table-wrap"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="holdings-refreshing"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain("Loading holdings...")

    resolvers[1](rows)
    await pending
    await flushPromises()

    expect(wrapper.find('[data-testid="holdings-refreshing"]').exists()).toBe(false)
    expect((wrapper.element.querySelector('[data-testid="holdings-page-size"]') as HTMLSelectElement).value).toBe("50")
    expect((wrapper.element.querySelector('[data-testid="holdings-search"]') as HTMLInputElement).value).toBe("KO")
    expect(wrapper.findAll('[data-testid="holdings-row"]')).toHaveLength(1)
  })

  it("shows a retryable error state", async () => {
    mocked.getAllPositions.mockRejectedValue(new Error("aggregate unavailable"))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain("aggregate unavailable")
    expect(wrapper.get("button.btn-secondary").text()).toBe("Retry")
  })
})
