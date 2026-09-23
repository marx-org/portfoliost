import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EditTransactionModal, { type EditTransaction } from "@/modules/portfolios/EditTransactionModal.vue"
import { usePortfolioStore } from "@/stores/portfolios"
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
    updatePortfolioTransaction: vi.fn(),
  }
})

vi.mock("@/api/wallets", async (importOriginal) => {
  const actual = await importOriginal<typeof walletsApi>()
  return {
    ...actual,
    getWallets: vi.fn(),
    getWalletTotalBalance: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 4.35, asOf: "2026-08-25" }),
}))

const mocked = vi.mocked(portfoliosApi)
const mockedWallets = vi.mocked(walletsApi)

const registry = [
  { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
  { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
]

const divTx = (): EditTransaction => ({
  id: "t1",
  portfolioId: "p1",
  type: "DIVIDEND",
  instrumentSymbol: "AAPL",
  instrumentName: "Apple Inc",
  assetType: "STOCK",
  quantity: 10,
  price: 3,
  fees: null,
  currency: "USD",
  walletId: "w1",
  executedAt: "2026-09-20T00:00:00Z",
  taxes: 3,
  notes: "Q3",
})

function makeEnv() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCurrenciesStore()
  store.currencies = registry
  store.loaded = true
  const portfolios = usePortfolioStore()
  portfolios.portfolios = [{ id: "p1", currency: "PLN" }] as never
  mockedWallets.getWallets.mockResolvedValue([
    { id: "w1", userId: "u", name: "Cash USD", currency: "USD", balance: 1000, availableBalance: 1000, isDefault: true, createdAt: "", updatedAt: "" },
    { id: "w2", userId: "u", name: "Cash PLN", currency: "PLN", balance: 4300, availableBalance: 4300, isDefault: false, createdAt: "", updatedAt: "" },
  ] as never)
  mockedWallets.getWalletTotalBalance.mockResolvedValue({
    totalBalance: 5300,
    totalAvailableBalance: 5300,
    baseCurrency: "PLN",
    walletBreakdown: [],
  } as never)
  return { pinia }
}

async function openModal(tx: EditTransaction, env = makeEnv()) {
  const wrapper = mount(EditTransactionModal, {
    props: { open: false, transaction: tx },
    global: { plugins: [env.pinia] },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}

describe("EditTransactionModal — dividend parity via DividendFields (§50.8)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.updatePortfolioTransaction.mockResolvedValue({} as never)
  })

  it("total mode prefills gross = qty × price; header shows shares; notes is a prefilled textarea", async () => {
    const wrapper = await openModal(divTx())
    expect((wrapper.find('[data-testid="edit-tx-gross"]').element as HTMLInputElement).value).toBe("30")
    expect(wrapper.find('[data-testid="edit-tx-shares-held"]').text()).toContain("10")
    const notes = wrapper.find("textarea")
    expect(notes.attributes("data-testid")).toBe("edit-tx-notes")
    expect((notes.element as HTMLTextAreaElement).value).toBe("Q3")
  })

  it("total mode — submit posts qty + derived per-share price, taxes and notes", async () => {
    const wrapper = await openModal(divTx())
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.updatePortfolioTransaction).toHaveBeenCalledTimes(1)
    const payload = mocked.updatePortfolioTransaction.mock.calls[0][2]
    expect(payload).toMatchObject({ quantity: 10, price: 3, taxes: 3, notes: "Q3" })
  })

  it("total mode — editing gross derives the per-share price", async () => {
    const wrapper = await openModal(divTx())
    await wrapper.find('[data-testid="edit-tx-gross"]').setValue("40")
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    const payload = mocked.updatePortfolioTransaction.mock.calls[0][2]
    expect(payload).toMatchObject({ quantity: 10, price: 4 })
  })

  it("per-share mode — edits per-share amount + shares; price and quantity follow", async () => {
    const wrapper = await openModal(divTx())
    await wrapper.find('[data-testid="edit-tx-mode-pershare"]').trigger("click")
    expect(wrapper.find('[data-testid="edit-tx-gross"]').exists()).toBe(true)
    expect((wrapper.find('[data-testid="edit-tx-gross"]').element as HTMLInputElement).value).toBe("3")
    expect((wrapper.find('[data-testid="edit-tx-shares"]').element as HTMLInputElement).value).toBe("10")

    await wrapper.find('[data-testid="edit-tx-gross"]').setValue("4")
    await wrapper.find('[data-testid="edit-tx-shares"]').setValue("5")
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    const payload = mocked.updatePortfolioTransaction.mock.calls[0][2]
    expect(payload).toMatchObject({ quantity: 5, price: 4 })
  })

  it("tax > gross — blocks submit; summary shows minus-signed tax and net", async () => {
    const wrapper = await openModal(divTx())
    await wrapper.find('[data-testid="edit-tx-gross"]').setValue("2")
    expect(wrapper.find('[data-testid="edit-tx-tax-error"]').exists()).toBe(true)
    const btn = wrapper.find("form button[type='submit']")
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-testid="edit-tx-tax-total"]').text()).toBe("-3.00 USD")
    expect(wrapper.find('[data-testid="edit-tx-net"]').text()).toBe("-1.00 USD")
    expect(wrapper.find('[data-testid="edit-tx-net"]').classes().join(" ")).toContain("text-green-600")
  })

  it("BUY layout keeps Quantity/Price/Fees and shows no dividend fields", async () => {
    const wrapper = await openModal({ ...divTx(), type: "BUY", taxes: null, notes: null })
    expect(wrapper.find('[data-testid="edit-tx-mode-pershare"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-tx-shares-held"]').exists()).toBe(false)
    expect(wrapper.find("#etx-quantity").exists()).toBe(true)
    expect(wrapper.find("#etx-price").exists()).toBe(true)
    expect(wrapper.find('[data-testid="edit-tx-fee-currency"]').exists()).toBe(true)
  })
})
