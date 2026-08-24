import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import EditTransactionModal, { type EditTransaction } from "@/modules/portfolios/EditTransactionModal.vue"
import * as portfoliosApi from "@/api/portfolios"
import * as walletsApi from "@/api/wallets"
import { useCurrenciesStore } from "@/stores/currencies"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    createPortfolioPosition: vi.fn(),
    updatePortfolioTransaction: vi.fn(),
  }
})

vi.mock("@/api/wallets", async (importOriginal) => {
  const actual = await importOriginal<typeof walletsApi>()
  return {
    ...actual,
    getWallets: vi.fn(),
  }
})
const mocked = vi.mocked(portfoliosApi)
const mockedWallets = vi.mocked(walletsApi)

function makeEnv() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCurrenciesStore()
  store.currencies = registry
  store.loaded = true
  mockedWallets.getWallets.mockResolvedValue([
    { id: "w1", userId: "u", name: "Cash USD", currency: "USD", balance: 1000, availableBalance: 1000, isDefault: false, createdAt: "", updatedAt: "" },
  ] as never)
  return { pinia }
}

const registry = [
  { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
  { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
]

async function waitForOption(wrapper: Awaited<ReturnType<typeof openStockStep>>, value: string): Promise<void> {
  for (let i = 0; i < 25; i++) {
    if (wrapper.find(`option[value="${value}"]`).exists()) return
    await flushPromises()
  }
}

async function openStockStep(env = makeEnv()) {
  const wrapper = mount(AddPositionDialog, {
    props: { open: false, portfolioId: "p1" },
    global: { plugins: [env.pinia] },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
  await wrapper.find('[data-testid="add-position-instrument"]').trigger("click")
  // the stock step opens only after a search result is chosen
  ;(wrapper.findComponent({ name: "InstrumentSearchModal" }).vm as unknown as { $emit: (e: string, ...a: unknown[]) => void })
    .$emit("add", "AAPL.US", "Apple Inc")
  await flushPromises()
  return wrapper
}

describe("AddPositionDialog — fee currency & fx disclosure (§10.3)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.createPortfolioPosition.mockResolvedValue({} as never)
  })

  it("fee row shows the shared currency select preselected to transaction currency", async () => {
    const wrapper = await openStockStep()
    const sel = wrapper.find('[data-testid="add-position-fee-currency"]')
    expect(sel.exists()).toBe(true)
    expect((sel.element as HTMLSelectElement).value).toBe("USD")
    expect(sel.findAll("option").map((o) => o.element.value)).toEqual(["EUR", "USD", "PLN"])
    wrapper.unmount()
  })

  it("fx disclosure defaults to automatic and hides the rate input", async () => {
    const wrapper = await openStockStep()
    expect(wrapper.find('[data-testid="add-position-fx-rate"]').exists()).toBe(false)
    await wrapper.find('[data-testid="add-position-fx-toggle"]').trigger("click")
    expect(wrapper.find('[data-testid="add-position-fx-rate"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it("choosing Custom reveals the rate input and submits manual fields", async () => {
    mocked.createPortfolioPosition.mockImplementation(async () => {
      throw new Error("exit-early")
    })
    const wrapper = await openStockStep()
    await wrapper.find('[data-testid="add-position-fx-toggle"]').trigger("click")
    await wrapper.find('[data-testid="add-position-fx-manual"]').trigger("click")
    expect(wrapper.find('[data-testid="add-position-fx-rate"]').exists()).toBe(true)

    await waitForOption(wrapper, "w1")
    await wrapper.find('[data-testid="add-position-quantity"]').setValue("2")
    await wrapper.find('[data-testid="add-position-price"]').setValue("50")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w1")
    await wrapper.find('[data-testid="add-position-fx-rate"]').setValue("4.35")
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.createPortfolioPosition).toHaveBeenCalledTimes(1)
    const payload = mocked.createPortfolioPosition.mock.calls[0][1]
    expect(payload.rateSource).toBe("manual")
    expect(payload.exchangeRate).toBe(4.35)
    wrapper.unmount()
  })

  it("automatic mode omits exchangeRate from the payload", async () => {
    const wrapper = await openStockStep()
    await waitForOption(wrapper, "w1")
    await wrapper.find('[data-testid="add-position-quantity"]').setValue("1")
    await wrapper.find('[data-testid="add-position-price"]').setValue("10")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w1")
    await wrapper.find("form").trigger("submit")
    await flushPromises()
    const payload = mocked.createPortfolioPosition.mock.calls[0][1]
    expect(payload.rateSource).toBe("automatic")
    expect(payload.exchangeRate).toBeUndefined()
    wrapper.unmount()
  })
})

describe("EditTransactionModal — fee currency & fx disclosure (§10.3)", () => {
  const tx = (): EditTransaction => ({
    id: "t1",
    portfolioId: "p1",
    type: "BUY",
    instrumentSymbol: "AAPL",
    instrumentName: "Apple Inc",
    assetType: "STOCK",
    quantity: 5,
    price: 100,
    fees: 1,
    currency: "USD",
    walletId: "w1",
    executedAt: new Date().toISOString(),
    feeCurrency: null,
    rateSource: null,
    exchangeRate: null,
  })

  function mountModal(transaction: EditTransaction) {
    const env = makeEnv()
    return mount(EditTransactionModal, {
      props: { open: false, transaction },
      global: { plugins: [env.pinia] },
      attachTo: document.body,
    })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.updatePortfolioTransaction.mockResolvedValue({} as never)
  })

  it("prefills fee currency from transaction currency and defaults to automatic", async () => {
    const wrapper = mountModal(tx())
    await wrapper.setProps({ open: true })
    await flushPromises()
    const sel = wrapper.find('[data-testid="edit-tx-fee-currency"]')
    expect((sel.element as HTMLSelectElement).value).toBe("USD")
    expect(wrapper.text()).not.toContain("· custom")
    wrapper.unmount()
  })

  it("submits manual rate when custom is selected", async () => {
    const wrapper = mountModal(tx())
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find('[data-testid="edit-tx-fx-toggle"]').trigger("click")
    await wrapper.find('[data-testid="edit-tx-fx-manual"]').trigger("click")
    await wrapper.find('[data-testid="edit-tx-fx-rate"]').setValue("0.92")
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.updatePortfolioTransaction).toHaveBeenCalledTimes(1)
    const payload = mocked.updatePortfolioTransaction.mock.calls[0][2]!
    expect(payload.rateSource).toBe("manual")
    expect(payload.exchangeRate).toBe(0.92)
    wrapper.unmount()
  })

  it("keeps automatic (no exchangeRate) when untouched", async () => {
    const wrapper = mountModal(tx())
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find("form").trigger("submit")
    await flushPromises()
    const payload = mocked.updatePortfolioTransaction.mock.calls[0][2]!
    expect(payload.rateSource).toBe("automatic")
    expect(payload.exchangeRate).toBeUndefined()
    wrapper.unmount()
  })
})
