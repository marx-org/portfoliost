import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EditPositionDialog from "@/modules/portfolios/EditPositionDialog.vue"
import { useCurrenciesStore } from "@/stores/currencies"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"

// §85.2 — this dialog passes `showViewChart=false` to the shared
// TransactionFormFields, so it renders no "View chart" text button. Before this
// step it therefore had no route into research at all. The fix is the badge: the
// shared form emits `view-chart` when it is clicked, and this dialog now handles
// that by closing itself and pushing the research route.
//
// The tests below pin all three halves, because any one of them alone would pass
// while the feature was still broken:
//   1. no "View chart" button exists (so the badge really is the only way out),
//   2. clicking the badge emits `view-chart` from the shared form,
//   3. `@view-chart` is handled — `close` is emitted and research is pushed.

const push = vi.fn()

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" }, fullPath: "/en/portfolios/p1/holdings" }),
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioTransactions: vi.fn().mockResolvedValue({ items: [] }),
    createPortfolioTransaction: vi.fn(),
    updatePortfolioPosition: vi.fn(),
    deletePortfolioTransaction: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 1, asOf: "2026-10-02" }),
}))

vi.mock("@/api/instruments", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, searchInstruments: vi.fn().mockResolvedValue([]) }
})

const POSITION = {
  id: "pos-1",
  portfolioId: "p1",
  symbol: "AAPL",
  companyName: "Apple Inc",
  assetType: "STOCK",
  country: "US",
  instrumentCurrency: "USD",
  quantity: 10,
  averageCostBasis: 150,
  isOpen: true,
} as never

function makeEnv() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const currencies = useCurrenciesStore()
  currencies.currencies = [{ code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true }]
  currencies.loaded = true
  const portfolios = usePortfolioStore()
  portfolios.portfolios = [{ id: "p1", baseCurrency: "USD" }] as never
  return pinia
}

async function mountDialog() {
  const pinia = makeEnv()
  const wrapper = mount(EditPositionDialog, {
    props: { open: true, portfolioId: "p1", position: POSITION },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

describe("EditPositionDialog — §85.2 research access via the badge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders no 'View chart' button, so the badge is the only route into research", async () => {
    const wrapper = await mountDialog()
    const labels = wrapper.findAll("button").map((b) => b.text())
    expect(labels).not.toContain("View chart")
    // Sanity: the form itself did render, so the button's absence is the prop
    // doing its job rather than the whole block failing to mount.
    expect(wrapper.find('[data-testid="edit-position-fields"]').exists()).toBe(true)
  })

  it("pushes the research route and closes itself when the badge is clicked", async () => {
    const wrapper = await mountDialog()
    const badge = wrapper.get('[data-testid="edit-position-fields"]').find(".cursor-pointer")
    expect(badge.exists()).toBe(true)

    await badge.trigger("click")

    expect(push).toHaveBeenCalledWith({
      name: "research-overview",
      params: { symbol: "AAPL" },
      query: { from: "/en/portfolios/p1/holdings" },
    })
    expect(wrapper.emitted("close")).toHaveLength(1)
    // `close()` (the save-and-refresh path) must NOT have run: it also emits
    // `saved` and refetches positions, which does not belong on a navigation.
    expect(wrapper.emitted("saved")).toBeUndefined()
  })
})
