import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import EditPositionDialog from "@/modules/portfolios/EditPositionDialog.vue"
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
    createPortfolioPosition: vi.fn(),
    updatePortfolioTransaction: vi.fn(),
  }
})

vi.mock("@/api/instruments", () => ({
  searchInstruments: vi.fn().mockResolvedValue({ instruments: [], total: 0 }),
  getInstrumentDetail: vi.fn().mockResolvedValue({}),
  getInstrumentProfile: vi.fn().mockResolvedValue({}),
  getInstrumentMetrics: vi.fn().mockResolvedValue({}),
  getInstrumentOverviewMetrics: vi.fn().mockResolvedValue({}),
  getQuote: vi.fn().mockResolvedValue({ symbol: "AAPL", currentPrice: 123.45 }),
  getHistoricalClose: vi.fn().mockResolvedValue(110),
  getHistory: vi.fn().mockResolvedValue({
    symbol: "AAPL",
    closePrices: [100, 110],
    highPrices: [100, 110],
    lowPrices: [100, 110],
    openPrices: [100, 100],
    volumes: [1, 1],
    timestamps: [Date.parse("2026-08-20T00:00:00Z"), Date.parse("2026-08-21T00:00:00Z")],
    status: "ok",
    currency: "USD",
  }),
  getEpsSurprises: vi.fn().mockResolvedValue({}),
}))

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

function makeEnv() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCurrenciesStore()
  store.currencies = registry
  store.loaded = true
  // D40: the transaction leg settles into the *wallet's* currency (payment currency);
  // the portfolio currency is only the fallback when no wallet is selected
  const portfolios = usePortfolioStore()
  portfolios.portfolios = [{ id: "p1", currency: "PLN" }] as never
  mockedWallets.getWallets.mockResolvedValue([
    { id: "w1", userId: "u", name: "Cash USD", currency: "USD", balance: 1000, availableBalance: 1000, isDefault: false, createdAt: "", updatedAt: "" },
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

const registry = [
  { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
  { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
]

async function waitForOption(wrapper: { find: (sel: string) => { exists(): boolean } }, value: string): Promise<void> {
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
  // await the async market-price fetch triggered by onSearchAdd
  const vm = wrapper.vm as unknown as { pendingMarketPrice: Promise<void> | null }
  if (vm.pendingMarketPrice) await vm.pendingMarketPrice
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

  it("hides the fx section when the wallet currency equals the transaction currency", async () => {
    const wrapper = await openStockStep()
    await waitForOption(wrapper, "w1")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w1") // USD === TX_CCY
    await flushPromises()
    expect(wrapper.find('[data-testid="add-position-fx-section"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it("shows the fx section targeted at the wallet currency; defaults to automatic, hides the rate input", async () => {
    const wrapper = await openStockStep()
    await waitForOption(wrapper, "w2")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w2")
    await flushPromises()
    expect(wrapper.find('[data-testid="add-position-fx-section"]').exists()).toBe(true) // USD → PLN (wallet ccy)
    expect(wrapper.text()).toContain("USD → PLN")
    expect(wrapper.find('[data-testid="add-position-fx-rate"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it("choosing Custom reveals the rate input and submits manual fields", async () => {
    mocked.createPortfolioPosition.mockImplementation(async () => {
      throw new Error("exit-early")
    })
    const wrapper = await openStockStep()
    await waitForOption(wrapper, "w2")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w2")
    await flushPromises()
    await wrapper.find('[data-testid="add-position-fx-manual"]').trigger("click")
    expect(wrapper.find('[data-testid="add-position-fx-rate"]').exists()).toBe(true)

    await wrapper.find('[data-testid="add-position-quantity"]').setValue("2")
    await wrapper.find('[data-testid="add-position-price"]').setValue("50")
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
    await waitForOption(wrapper, "w2")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w2")
    await flushPromises()
    await wrapper.find('[data-testid="add-position-quantity"]').setValue("1")
    await wrapper.find('[data-testid="add-position-price"]').setValue("10")
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
    expect(wrapper.find('[data-testid="edit-tx-fx-rate"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it("submits manual rate when custom is selected", async () => {
    const wrapper = mountModal(tx())
    await wrapper.setProps({ open: true })
    await flushPromises()
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

describe("AddPositionDialog — market price suggestion (plan §13 follow-up 3/6)", () => {
  beforeEach(async () => {
    const mod = await import("@/api/instruments")
    vi.mocked(mod.getQuote).mockResolvedValue({ symbol: "AAPL", currentPrice: 123.45 } as never)
    vi.mocked(mod.getHistoricalClose).mockImplementation(async (_sym, date) => {
      if (date === "2026-08-21") return 110
      if (date === "2026-08-20") return 100
      return null
    })
  })

  it("prefills price with the current quote and shows it in the header", async () => {
    const { getQuote } = await import("@/api/instruments")
    const wrapper = await openStockStep()
    expect(vi.mocked(getQuote)).toHaveBeenCalled()
    expect((wrapper.find('[data-testid="add-position-price"]').element as HTMLInputElement).value).toBe("123.45")
    expect(wrapper.text()).toContain("123.45")
    expect(wrapper.text()).toContain("current price")
    wrapper.unmount()
  })

  it("backdated purchase shows the exchange close at that date and re-suggests", async () => {
    const { getHistoricalClose } = await import("@/api/instruments")
    const wrapper = await openStockStep()
    await wrapper.find('[data-testid="add-position-date"]').setValue("2026-08-21")
    await flushPromises()
    // await the async market-price fetch triggered by the date watcher
    const vm = wrapper.vm as unknown as { pendingMarketPrice: Promise<void> | null }
    if (vm.pendingMarketPrice) await vm.pendingMarketPrice
    await flushPromises()
    expect(vi.mocked(getHistoricalClose)).toHaveBeenCalled()
    expect(wrapper.text()).toContain("110")
    expect(wrapper.text()).toContain("close on 2026-08-21")
    expect((wrapper.find('[data-testid="add-position-price"]').element as HTMLInputElement).value).toBe("110")
    // user override wins over the suggestion
    await wrapper.find('[data-testid="add-position-price"]').setValue("111.5")
    await wrapper.find('[data-testid="add-position-date"]').setValue("2026-08-20")
    await flushPromises()
    if (vm.pendingMarketPrice) await vm.pendingMarketPrice
    await flushPromises()
    await wrapper.find('[data-testid="add-position-date"]').setValue("2026-08-21")
    await flushPromises()
    if (vm.pendingMarketPrice) await vm.pendingMarketPrice
    await flushPromises()
    expect((wrapper.find('[data-testid="add-position-price"]').element as HTMLInputElement).value).toBe("111.5")
    wrapper.unmount()
  })
})

describe("AddPositionDialog — multicurrency summary (plan §13 follow-up 4/6)", () => {
  beforeEach(async () => {
    const mod = await import("@/api/instruments")
    vi.mocked(mod.getQuote).mockResolvedValue({ symbol: "AAPL", currentPrice: 123.45 } as never)
    const fxMod = await import("@/api/fx")
    vi.mocked(fxMod.getLatestRate).mockResolvedValue({ rate: 4.35, asOf: "2026-08-25" } as never)
  })

  it("shows converted amounts when the wallet currency differs from TX_CCY", async () => {
    const wrapper = await openStockStep()
    await waitForOption(wrapper, "w2")
    await wrapper.find('[data-testid="add-position-wallet"]').setValue("w2")
    await flushPromises()
    await wrapper.find('[data-testid="add-position-price"]').setValue("100")
    await flushPromises()
    await flushPromises()
    await flushPromises()
    const summaryText = wrapper.find("dl").text()
    // 1 × $100 = $100, converted at 4.35 → PLN 435.00 (wallet ccy)
    expect(summaryText).toContain("$100.00")
    // Intl.NumberFormat uses U+00A0 between currency code and amount
    expect(summaryText).toContain("PLN\u00A0435.00")
    expect(summaryText).toContain("Total Cost")
    wrapper.unmount()
  })

  it("shows fee row with cross-currency conversion when fee currency differs from USD", async () => {
    const wrapper = await openStockStep()
    await wrapper.find('[data-testid="add-position-price"]').setValue("100")
    await wrapper.find('[data-testid="add-position-fees"]').setValue("5")
    await wrapper.find('[data-testid="add-position-fee-currency"]').setValue("EUR")
    await flushPromises()
    const summaryText = wrapper.find("dl").text()
    expect(summaryText).toContain("Fee (EUR)")
    expect(summaryText).toContain("€5.00")
    wrapper.unmount()
  })

  it("shows no ≈ conversion when the wallet currency equals TX_CCY", async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const cs = useCurrenciesStore()
    cs.currencies = registry
    cs.loaded = true
    const ps = usePortfolioStore()
    ps.portfolios = [{ id: "p1", currency: "USD" }] as never
    mockedWallets.getWallets.mockResolvedValue([{ id: "w1", name: "Cash", balance: 1000, currency: "USD" }] as never)

    const wrapper = mount(AddPositionDialog, {
      props: { open: false, portfolioId: "p1" },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find('[data-testid="add-position-instrument"]').trigger("click")
    ;(wrapper.findComponent({ name: "InstrumentSearchModal" }).vm as unknown as { $emit: (e: string, ...a: unknown[]) => void })
      .$emit("add", "AAPL.US", "Apple Inc")
    await flushPromises()
    const vm = wrapper.vm as unknown as { pendingMarketPrice: Promise<void> | null }
    if (vm.pendingMarketPrice) await vm.pendingMarketPrice
    await flushPromises()
    await wrapper.find('[data-testid="add-position-price"]').setValue("100")
    await flushPromises()
    const summaryText = wrapper.find("dl").text()
    expect(summaryText).toContain("$100.00")
    expect(summaryText).not.toContain("≈")
    wrapper.unmount()
  })
})

describe("EditPositionDialog — fee/FX fields + multicurrency summary (plan §13 follow-up 5/6)", () => {
  const position = () => ({
    id: "pos1",
    portfolioId: "p1",
    symbol: "AAPL",
    companyName: "Apple Inc",
    assetType: "STOCK",
    quantity: 10,
    averageCostBasis: 150,
    instrumentCurrency: "USD",
    openedAt: "2026-08-20T00:00:00Z",
  })

  function mountDialog() {
    const env = makeEnv()
    return mount(EditPositionDialog, {
      props: { open: false, portfolioId: "p1", position: position() as never },
      global: { plugins: [env.pinia] },
      attachTo: document.body,
    })
  }

  beforeEach(async () => {
    const fxMod = await import("@/api/fx")
    vi.mocked(fxMod.getLatestRate).mockResolvedValue({ rate: 4.35, asOf: "2026-08-25" } as never)
  })

  it("renders FeeFields and FxRateFields in the add-tx form when a cross-currency wallet is selected", async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await flushPromises()
    // FeeFields renders fee currency select
    expect(wrapper.find('[data-testid="edit-position-fee-currency"]').exists()).toBe(true)
    // FxRateFields renders transaction disclosure once the payment wallet differs from tx ccy
    await waitForOption(wrapper, "w2")
    await wrapper.find('[data-testid="edit-position-wallet"]').setValue("w2")
    await flushPromises()
    expect(wrapper.find('[data-testid="edit-position-fx-section"]').exists()).toBe(true)
    // Multicurrency summary exists
    expect(wrapper.find("dl").exists()).toBe(true)
    wrapper.unmount()
  })

  it("shows multicurrency summary when the wallet currency differs from instrument currency", async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await flushPromises()
    await waitForOption(wrapper, "w2")
    await wrapper.find('[data-testid="edit-position-wallet"]').setValue("w2")
    await flushPromises()
    await wrapper.find('[data-testid="edit-position-quantity"]').setValue("2")
    await wrapper.find('[data-testid="edit-position-price"]').setValue("100")
    await flushPromises()
    await flushPromises()
    await flushPromises()
    const dl = wrapper.find("dl")
    const text = dl.text()
    // 2 × $100 = $200 → converted at 4.35 → PLN 870.00 (wallet ccy)
    expect(text).toContain("$200.00")
    expect(text).toContain("PLN\u00A0870.00")
    wrapper.unmount()
  })

  it("edit button opens EditTransactionModal for non-synthetic rows", async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await flushPromises()
    // The mock returns empty transactions → synthetic row has no Edit button
    expect(wrapper.findAll("button").filter((b) => b.text() === "Edit").length).toBe(0)
    wrapper.unmount()
  })
})
