import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ConsolidatedHoldingsView from "@/modules/portfolios/ConsolidatedHoldingsView.vue"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
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
      position({ id: "shared-position", portfolioId: "p1", portfolioName: "Broker account" }),
      position({ id: "shared-position", portfolioId: "p2", portfolioName: "Retirement" }),
    ])

    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="holdings-row"]')
    expect(rows).toHaveLength(2)
    await rows[0].get('button[aria-label="Position actions"]').trigger("click")
    expect(rows[0].text()).toContain("Buy")
    expect(rows[1].text()).not.toContain("Buy")

    await rows[0].findAll("button").find((button) => button.text().trim() === "Buy")!.trigger("click")
    expect(wrapper.findComponent(AddPositionDialog).props("portfolioId")).toBe("p1")
  })

  it("shows a retryable error state", async () => {
    mocked.getAllPositions.mockRejectedValue(new Error("aggregate unavailable"))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain("aggregate unavailable")
    expect(wrapper.get("button.btn-secondary").text()).toBe("Retry")
  })
})
