import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import TransferSharesDialog from "@/modules/portfolios/TransferSharesDialog.vue"
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
    getPortfolioPositions: vi.fn(),
    transferPosition: vi.fn(),
    getPortfolios: vi.fn(),
    getPortfolioTotalMetrics: vi.fn().mockResolvedValue(null),
  }
})

const mocked = vi.mocked(portfoliosApi)

const POSITIONS = [
  { id: "pos-msft", portfolioId: "p1", symbol: "MSFT", companyName: "Microsoft", assetType: "STOCK", quantity: 32, averageCostBasis: 461.91, purchaseCurrency: "USD", instrumentCurrency: "USD", isOpen: true, direction: null },
  { id: "pos-closed", portfolioId: "p1", symbol: "OLD", companyName: "Closed", assetType: "STOCK", quantity: 0, averageCostBasis: 10, purchaseCurrency: "USD", instrumentCurrency: "USD", isOpen: false, direction: null },
  { id: "pos-short", portfolioId: "p1", symbol: "SPY", companyName: "SPY", assetType: "CFD", quantity: 5, averageCostBasis: 500, purchaseCurrency: "USD", instrumentCurrency: "USD", isOpen: true, direction: "LONG" },
  { id: "pos-write", portfolioId: "p1", symbol: "TSLA", companyName: "Tesla", assetType: "OPTION", quantity: 3, averageCostBasis: 120, purchaseCurrency: "USD", instrumentCurrency: "USD", isOpen: true, direction: "SHORT" },
]

function env() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePortfolioStore()
  store.portfolios = [
    { id: "p1", name: "Current", baseCurrency: "USD", isVirtual: false },
    { id: "p2", name: "IBKR", baseCurrency: "USD", isVirtual: false },
    { id: "p3", name: "Shadow", baseCurrency: "USD", isVirtual: true },
  ] as never
  return pinia
}

async function openDialog() {
  env()
  mocked.getPortfolioPositions.mockResolvedValue(POSITIONS as never)
  const w = mount(TransferSharesDialog, {
    props: { open: false, portfolioId: "p1" },
    global: { plugins: [] },
  })
  await w.setProps({ open: true })
  await flushPromises()
  return w
}

describe("TransferSharesDialog (§74)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists only open, long holdings and prefills the whole position", async () => {
    const w = await openDialog()
    const instrument = w.find('[data-testid="ts-instrument"]')
    const options = instrument.findAll("option").map((o) => o.text().trim())
    expect(options).toEqual(["Select a holding", "MSFT — 32 shares", "SPY — 5 shares"])

    instrument.setValue("MSFT")
    await flushPromises()
    // The common case is "move all of it" — the cap is stated in the label.
    expect((w.find('[data-testid="ts-quantity"]').element as HTMLInputElement).value).toBe("32")
    expect(w.find('[data-testid="ts-quantity"]').attributes("max")).toBe("32")
    expect(w.text()).toContain("max 32")
  })

  it("offers only the user's other, non-virtual portfolios", async () => {
    const w = await openDialog()
    const dest = w.find('[data-testid="ts-to-portfolio"]')
    const ids = dest.findAll("option").map((o) => o.attributes("value"))
    expect(ids).toEqual(["", "p2"])
  })

  it("loads the portfolio list when the page was opened by deep link", async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = usePortfolioStore()
    store.portfolios = []
    mocked.getPortfolios.mockResolvedValue([
      { id: "p1", name: "Current", baseCurrency: "USD", isVirtual: false },
      { id: "p2", name: "IBKR", baseCurrency: "USD", isVirtual: false },
    ] as never)
    mocked.getPortfolioPositions.mockResolvedValue(POSITIONS as never)

    const w = mount(TransferSharesDialog, { props: { open: false, portfolioId: "p1" }, global: { plugins: [pinia] } })
    await w.setProps({ open: true })
    await flushPromises()

    expect(mocked.getPortfolios).toHaveBeenCalledTimes(1)
    const ids = w.find('[data-testid="ts-to-portfolio"]')
      .findAll("option")
      .map((o) => o.attributes("value"))
    expect(ids).toEqual(["", "p2"])
  })

  it("posts the contract shape and reports the legs it created", async () => {
    const w = await openDialog()
    mocked.transferPosition.mockResolvedValue({
      transferGroupId: "g1",
      quantity: 2,
      sourcePositionId: "pos-msft",
      targetPositionId: "pos-target",
      legs: [
        { id: "l1", portfolioId: "p1", type: "TRANSFER_OUT", instrumentSymbol: "MSFT", quantity: 2, price: 461.91, totalAmount: 923.82, currency: "USD", executedAt: "2026-10-04T00:00:00.000Z", transferGroupId: "g1" },
        { id: "l2", portfolioId: "p2", type: "TRANSFER_IN", instrumentSymbol: "MSFT", quantity: 2, price: 461.91, totalAmount: 923.82, currency: "USD", executedAt: "2026-10-04T00:00:00.000Z", transferGroupId: "g1" },
      ],
    } as never)

    w.find('[data-testid="ts-instrument"]').setValue("MSFT")
    w.find('[data-testid="ts-quantity"]').setValue("2")
    w.find('[data-testid="ts-to-portfolio"]').setValue("p2")
    w.find('[data-testid="ts-date"]').setValue("2026-10-04")
    w.find('[data-testid="ts-notes"]').setValue("moved to IBKR")
    w.find('[data-testid="ts-form"]').trigger("submit")
    await flushPromises()

    expect(mocked.transferPosition).toHaveBeenCalledWith("p1", {
      symbol: "MSFT",
      quantity: 2,
      toPortfolioId: "p2",
      executedAt: "2026-10-04",
      notes: "moved to IBKR",
    })
    expect(w.find('[data-testid="ts-result"]').text()).toContain("Moved 2 of MSFT in 1 lot")
    expect(w.emitted("done")).length(1)
    // The dialog does not close on success, and it re-reads the holdings so the
    // cap for a second move in the same dialog is the post-transfer quantity.
    expect(w.find('[data-testid="ts-form"]').exists()).toBe(true)
    expect(mocked.getPortfolioPositions).toHaveBeenCalledTimes(2)
  })

  it("blocks a quantity above the open lots before the request is made", async () => {
    const w = await openDialog()
    w.find('[data-testid="ts-instrument"]').setValue("MSFT")
    w.find('[data-testid="ts-to-portfolio"]').setValue("p2")
    w.find('[data-testid="ts-quantity"]').setValue("33")
    await flushPromises()

    expect(w.find('[data-testid="ts-over-max"]').exists()).toBe(true)
    expect((w.find('[data-testid="ts-submit"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(mocked.transferPosition).not.toHaveBeenCalled()
  })

  it("shows the server's refusal instead of pretending the move happened", async () => {
    const w = await openDialog()
    mocked.transferPosition.mockRejectedValue(new Error("TRANSFER_OUT of 33 exceeds 32 open in MSFT"))
    w.find('[data-testid="ts-instrument"]').setValue("MSFT")
    w.find('[data-testid="ts-to-portfolio"]').setValue("p2")
    w.find('[data-testid="ts-quantity"]').setValue("32")
    w.find('[data-testid="ts-form"]').trigger("submit")
    await flushPromises()

    expect(w.text()).toContain("exceeds 32 open in MSFT")
    expect(w.find('[data-testid="ts-result"]').exists()).toBe(false)
    expect(w.emitted("done") ?? []).length(0)
  })
})
