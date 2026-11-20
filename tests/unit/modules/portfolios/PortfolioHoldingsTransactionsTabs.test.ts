import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioHoldingsTab from "@/modules/portfolios/PortfolioHoldingsTab.vue"
import PortfolioTransactionsTab from "@/modules/portfolios/PortfolioTransactionsTab.vue"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import RecordDividendDialog from "@/modules/portfolios/RecordDividendDialog.vue"
import EditPositionDialog from "@/modules/portfolios/EditPositionDialog.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioTransactions: vi.fn(),
    getPortfolioAllocation: vi.fn(),
    getPortfolioPositions: vi.fn(),
    removePortfolioPosition: vi.fn(),
  }
})

const mocked = vi.mocked(portfoliosApi)

function position() {
  return {
    id: "pos1",
    portfolioId: "p1",
    symbol: "META",
    companyName: "Meta Platforms Inc",
    assetType: "STOCK",
    quantity: 22,
    averageCostBasis: 553.91,
    avgCostBasis: 553.91,
    instrumentAvgCostBasis: 553.91,
    totalCostBasis: 12186.02,
    costBasis: 12186.02,
    isOpen: true,
    currentPrice: 594.92,
    marketValue: 13088.24,
    unrealizedGainLoss: 902.22,
    percentageChange: 7.4,
    percentOfPortfolio: 11.9,
  }
}

describe("PortfolioHoldingsTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.getPortfolioPositions.mockResolvedValue([position() as never])
  })

  it("renders the positions table with actions", async () => {
    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()

    expect(wrapper.text()).toContain("META")
    expect(wrapper.text()).toContain("Meta Platforms Inc")
    expect(wrapper.text()).toContain("13,088.24")
    expect(wrapper.find("button[aria-label='Position actions']").exists()).toBe(true)
    // §61.5 — the identity block; the fixture has no `country`, and the
    // details line says so rather than defaulting it to "US" (§66.2: never
    // guess). `ticker-badge`/`-details` are the stable testids.
    const badge = wrapper.find('[data-testid="ticker-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.find("img").attributes("src")).toBe("/api/logos/META")
    expect(badge.text()).toContain("Meta Platforms Inc")
    expect(badge.get('[data-testid="ticker-badge-details"]').text()).toBe("Stock")
  })

  it("renders the full details line when the position carries a country", async () => {
    mocked.getPortfolioPositions.mockResolvedValue([
      { ...position(), country: "PL", assetType: "STOCK" } as never,
    ])
    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()
    expect(wrapper.get('[data-testid="ticker-badge-details"]').text()).toBe("(PL) Stock")
  })

  it("sorts positions by symbol when the Symbol column header is clicked", async () => {
    const base = position()
    mocked.getPortfolioPositions.mockResolvedValue([
      { ...base, id: "pos1", symbol: "META" } as never,
      { ...base, id: "pos2", symbol: "AAPL", companyName: "Apple Inc" } as never,
      { ...base, id: "pos3", symbol: "NVDA", companyName: "NVIDIA Corp" } as never,
    ])

    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()

    const symbolHeader = wrapper.findAll("th").find((th) => th.text().includes("Symbol"))!
    await symbolHeader.trigger("click")
    const text = wrapper.text()
    expect(text.indexOf("AAPL")).toBeLessThan(text.indexOf("META"))
    expect(text.indexOf("META")).toBeLessThan(text.indexOf("NVDA"))

    await symbolHeader.trigger("click")
    const textDesc = wrapper.text()
    expect(textDesc.indexOf("NVDA")).toBeLessThan(textDesc.indexOf("AAPL"))
  })

  it("shows an empty state without positions", async () => {
    mocked.getPortfolioPositions.mockResolvedValue([])
    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()
    expect(wrapper.text()).toContain("No open positions")
  })

  it("opens the actions menu and blocks removing a position with transactions", async () => {
    mocked.getPortfolioTransactions.mockResolvedValue({
      items: [],
      total: 2,
      page: 1,
      limit: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    } as never)

    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()

    await wrapper.get("button[aria-label='Position actions']").trigger("click")
    expect(wrapper.text()).toContain("Remove position")

    const buttons = wrapper.findAll("button")
    const remove = buttons.find((b) => b.text() === "Remove position")
    await remove!.trigger("click")
    await flushPromises()

    expect(mocked.getPortfolioTransactions).toHaveBeenCalledWith("p1", 1, 1, "date", "desc", "pos1")
    expect(mocked.removePortfolioPosition).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("Cannot remove META")
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain("Meta Platforms Inc")
  })

  it("confirms before removing a transaction-free position", async () => {
    mocked.getPortfolioTransactions.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    } as never)
    mocked.removePortfolioPosition.mockResolvedValue({ isOpen: false } as never)
    mocked.getPortfolioPositions
      .mockResolvedValueOnce([position() as never])
      .mockResolvedValueOnce([])

    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()

    await wrapper.get("button[aria-label='Position actions']").trigger("click")
    const buttons = wrapper.findAll("button")
    const remove = buttons.find((b) => b.text() === "Remove position")
    await remove!.trigger("click")
    await flushPromises()

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain("Remove position")
    expect(dialog.text()).toContain("This permanently deletes META")

    const del = dialog.findAll("button").find((b) => b.text() === "Delete")
    await del!.trigger("click")
    await flushPromises()

    expect(mocked.removePortfolioPosition).toHaveBeenCalledWith("p1", "pos1")
    expect(wrapper.text()).toContain("Removed META")
    expect(wrapper.text()).toContain("No open positions")
  })
})

describe("PortfolioTransactionsTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("renders the transaction list", async () => {
    mocked.getPortfolioTransactions.mockResolvedValue({
      items: [
        {
          id: "tx1",
          portfolioId: "p1",
          type: "BUY",
          instrumentSymbol: "META",
          instrumentName: "Meta Platforms Inc",
          executedAt: "2026-08-02T00:00:00.000Z",
          quantity: 10,
          price: 550,
          totalAmount: 5500,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    } as never)

    const wrapper = mount(PortfolioTransactionsTab)
    await flushPromises()

    expect(wrapper.text()).toContain("Buy")
    expect(wrapper.text()).toContain("META")
    expect(wrapper.text()).toContain("5,500.00")
    expect(mocked.getPortfolioTransactions).toHaveBeenCalledWith("p1", 1, 20, "date", "desc", undefined, undefined)
  })
})

// §148 — the read-only rule lives in exactly one place per tab: `readonly` is
// derived from `store.detail.isVirtual` (PortfolioHoldingsTab.vue:9,
// PortfolioTransactionsTab.vue:12). Each pair below mounts the SAME component
// with only that flag flipped, so a regression on either side fails here.
const MUTATION_ACTIONS = ["Buy", "Sell", "Dividend", "Edit position", "Set labels...", "Remove position"]

describe("PortfolioHoldingsTab — §148 virtual read-only", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.getPortfolioPositions.mockResolvedValue([position() as never])
  })

  async function mountWith(isVirtual: boolean) {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePortfolioStore().detail = { currency: "USD", isVirtual } as never
    const wrapper = mount(PortfolioHoldingsTab)
    await flushPromises()
    return wrapper
  }

  it("virtual: shows the holdings and only the read-only actions", async () => {
    const wrapper = await mountWith(true)
    expect(wrapper.text()).toContain("META")

    await wrapper.get("button[aria-label='Position actions']").trigger("click")
    // Research and View chart survive — the holding is not hidden, only frozen.
    expect(wrapper.text()).toContain("Research")
    expect(wrapper.text()).toContain("View chart")
    for (const action of MUTATION_ACTIONS) {
      expect(wrapper.findAll("button").some((b) => b.text() === action), action).toBe(false)
    }
    // The mutation dialogs are not even mounted.
    expect(wrapper.findComponent(AddPositionDialog).exists()).toBe(false)
    expect(wrapper.findComponent(RecordDividendDialog).exists()).toBe(false)
    expect(wrapper.findComponent(EditPositionDialog).exists()).toBe(false)
  })

  it("casual: the same menu carries the mutation actions", async () => {
    const wrapper = await mountWith(false)
    await wrapper.get("button[aria-label='Position actions']").trigger("click")
    for (const action of MUTATION_ACTIONS) {
      expect(wrapper.findAll("button").some((b) => b.text() === action), action).toBe(true)
    }
    expect(wrapper.findComponent(AddPositionDialog).exists()).toBe(true)
  })
})

describe("PortfolioTransactionsTab — §148 virtual read-only", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.getPortfolioTransactions.mockResolvedValue({
      items: [
        {
          id: "tx1",
          portfolioId: "p1",
          type: "BUY",
          instrumentSymbol: "META",
          instrumentName: "Meta Platforms Inc",
          executedAt: "2026-08-02T00:00:00.000Z",
          quantity: 10,
          price: 550,
          totalAmount: 5500,
          currency: "USD",
          displayCurrency: "USD",
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    } as never)
  })

  async function mountWith(isVirtual: boolean) {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePortfolioStore().detail = { currency: "USD", isVirtual } as never
    const wrapper = mount(PortfolioTransactionsTab)
    await flushPromises()
    return wrapper
  }

  it("virtual: keeps the transaction history visible with no mutation controls", async () => {
    const wrapper = await mountWith(true)
    // History is the source of holdings, so it has to stay readable…
    expect(wrapper.text()).toContain("META")
    expect(wrapper.text()).toContain("Buy")
    // …but no row exposes a write.
    expect(wrapper.find("button[aria-label='Edit transaction']").exists()).toBe(false)
    expect(wrapper.find("button[aria-label='Set labels']").exists()).toBe(false)
    expect(wrapper.find("button[aria-label='Delete transaction']").exists()).toBe(false)
  })

  it("casual: the same rows expose Edit / Labels / Delete", async () => {
    const wrapper = await mountWith(false)
    expect(wrapper.find("button[aria-label='Edit transaction']").exists()).toBe(true)
    expect(wrapper.find("button[aria-label='Set labels']").exists()).toBe(true)
    expect(wrapper.find("button[aria-label='Delete transaction']").exists()).toBe(true)
  })
})
