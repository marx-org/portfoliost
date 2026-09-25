import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioCashTab from "@/modules/portfolios/PortfolioCashTab.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioCash: vi.fn(),
    getPortfolioCashHistory: vi.fn(),
    getPortfolioCashTransactions: vi.fn(),
    depositCash: vi.fn(),
    withdrawCash: vi.fn(),
    transferCash: vi.fn(),
    updateCashTransaction: vi.fn(),
    deleteCashTransaction: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 1, asOf: "2026-08-25" }),
}))

const mocked = vi.mocked(portfoliosApi)

function cash(overrides: Record<string, unknown> = {}) {
  return { baseCurrency: "USD", total: 720, balances: [{ currency: "USD", balance: 500 }, { currency: "EUR", balance: 200 }], ...overrides }
}

function makeEnv(detail?: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePortfolioStore()
  store.detail = (detail ?? { id: "p1", isMarginEnabled: false, baseCurrency: "USD" }) as never
  store.portfolios = [
    { id: "p1", name: "Portfolio 1", baseCurrency: "USD" },
    { id: "p2", name: "Portfolio 2", baseCurrency: "USD" },
  ] as unknown as typeof store.portfolios
  const cs = useCurrenciesStore()
  cs.currencies = [
    { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
    { code: "EUR", name: "Euro", symbol: "\u20ac", minorUnits: 2, popular: true },
  ]
  cs.loaded = true
  return pinia
}

async function mountTab(env = makeEnv()) {
  const wrapper = mount(PortfolioCashTab, {
    global: { plugins: [env], stubs: { apexchart: true, CashBalanceChart: { template: "<div data-testid='chart-stub' />" } } },
  })
  await flushPromises()
  return wrapper
}

describe("PortfolioCashTab (§62.8)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getPortfolioCash.mockResolvedValue(cash() as never)
    mocked.getPortfolioCashHistory.mockResolvedValue({
      data: [{ date: "2026-01-01", balance: 700 }, { date: "2026-01-02", balance: 720 }],
      meta: { period: "1Y", resolution: "day", high: 720, low: 700, average: 710, startDate: "", endDate: "", change: 20 },
    } as never)
    mocked.getPortfolioCashTransactions.mockResolvedValue({
      items: [{ id: "t1", portfolioId: "p1", type: "DEPOSIT", amount: 500, currency: "USD", status: "completed", createdAt: "", balanceAfter: 500 }],
      total: 1, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrevious: false,
    } as never)
    mocked.depositCash.mockResolvedValue({ id: "new" } as never)
    mocked.transferCash.mockResolvedValue({ id: "new" } as never)
  })

  it("renders per-currency rows + base-currency total + chart + table", async () => {
    const w = await mountTab()
    expect(w.find('[data-testid="cash-tab-total"]').text()).toContain("720.00")
    expect(w.find('[data-testid="cash-balance-USD"]').text()).toContain("500.00")
    expect(w.find('[data-testid="cash-balance-EUR"]').text()).toContain("200.00")
    expect(w.find('[data-testid="chart-stub"]').exists()).toBe(true)
    expect(w.find('[data-testid="cash-tx-t1"]').exists()).toBe(true)
  })

  it("shows the negative-cash badge when a non-margin portfolio has a negative balance", async () => {
    mocked.getPortfolioCash.mockResolvedValue(cash({ balances: [{ currency: "USD", balance: -50 }] }) as never)
    const w = await mountTab(makeEnv({ id: "p1", isMarginEnabled: false, baseCurrency: "USD" }))
    const badge = w.find('[data-testid="cash-negative-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain("USD")
  })

  it("hides the negative-cash badge when margin is enabled", async () => {
    mocked.getPortfolioCash.mockResolvedValue(cash({ balances: [{ currency: "USD", balance: -50 }] }) as never)
    const w = await mountTab(makeEnv({ id: "p1", isMarginEnabled: true, baseCurrency: "USD" }))
    expect(w.find('[data-testid="cash-negative-badge"]').exists()).toBe(false)
  })

  it("opens the deposit modal and posts depositCash on submit", async () => {
    const w = await mountTab()
    await w.find('[data-testid="cash-tab-deposit"]').trigger("click")
    await flushPromises()
    const amount = w.find('[data-testid="pc-amount"]')
    expect(amount.exists()).toBe(true)
    await amount.setValue("100")
    await w.find('[data-testid="pc-currency"]').setValue("USD")
    await w.find('[data-testid="pc-form"]').trigger("submit")
    await flushPromises()
    expect(mocked.depositCash).toHaveBeenCalledTimes(1)
    expect(mocked.depositCash.mock.calls[0][0]).toBe("p1")
    expect(mocked.depositCash.mock.calls[0][1]).toMatchObject({ amount: 100, currency: "USD" })
  })

  it("transfer posts toPortfolioId + the elastic targetAmount leg", async () => {
    const w = await mountTab()
    await w.find('[data-testid="cash-tab-transfer"]').trigger("click")
    await flushPromises()
    await w.find('[data-testid="pc-amount"]').setValue("100")
    await w.find('[data-testid="pc-to-portfolio"]').setValue("p2")
    await w.find('[data-testid="pc-form"]').trigger("submit")
    await flushPromises()
    expect(mocked.transferCash).toHaveBeenCalledTimes(1)
    expect(mocked.transferCash.mock.calls[0][1]).toMatchObject({ amount: 100, toPortfolioId: "p2" })
  })
})
