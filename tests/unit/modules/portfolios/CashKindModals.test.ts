import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioCashModals from "@/modules/portfolios/PortfolioCashModals.vue"
import { cashTypeLabel, editActionFor, type CashAction } from "@/utils/cashKinds"
import { useCurrenciesStore } from "@/stores/currencies"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => {
  const route = { params: { id: "p1" }, path: "/portfolios/p1/cash", query: {} }
  return {
    useRoute: () => route,
    useRouter: () => ({ push: vi.fn(), resolve: (p: string) => ({ href: p }) }),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 1.1, asOf: "2026-11-01" }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolios: vi.fn().mockResolvedValue([]),
    getPortfolioTotalMetrics: vi.fn().mockResolvedValue(null),
    depositCash: vi.fn(),
    withdrawCash: vi.fn(),
    transferCash: vi.fn(),
    interestCash: vi.fn(),
    feeCash: vi.fn(),
    conversionCash: vi.fn(),
    updateCashTransaction: vi.fn(),
  }
})

const mocked = vi.mocked(portfoliosApi)

const REGISTRY = [
  { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
  { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
  { code: "GBP", name: "Pound Sterling", symbol: "£", minorUnits: 2, popular: true },
]

function env() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCurrenciesStore()
  store.currencies = REGISTRY as never
  store.loaded = true
  return pinia
}

/**
 * The modal prefills in `watch(() => props.open)`, so it must be opened by a
 * prop change — mounting it already open would skip the prefill.
 */
async function openModal(action: CashAction, props: Record<string, unknown> = {}) {
  env()
  const wrapper = mount(PortfolioCashModals, {
    props: {
      open: false,
      action,
      portfolioId: "p1",
      cash: { baseCurrency: "USD", balances: [{ currency: "USD", balance: 1000 }], total: 1000 },
      ...props,
    },
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}

const field = (wrapper: ReturnType<typeof mount>, testid: string) => wrapper.find(`[data-testid="${testid}"]`)
const inputOf = (wrapper: ReturnType<typeof mount>, testid: string) => field(wrapper, testid).element as HTMLInputElement
const valueOf = (wrapper: ReturnType<typeof mount>, testid: string) => Number(inputOf(wrapper, testid).value)
const submitDisabled = (wrapper: ReturnType<typeof mount>) => (field(wrapper, "pc-submit").element as HTMLButtonElement).disabled

/** The request body the modal built. Typed loosely on purpose: the contract
 * types for these requests are regenerated from the spec, and the test only
 * cares about the values the modal put in them. */
function firstInput(fn: { mock: { calls: unknown[][] } }) {
  return fn.mock.calls[0][1] as Record<string, unknown>
}

async function submit(wrapper: ReturnType<typeof mount>) {
  wrapper.find("[data-testid='pc-form']").trigger("submit")
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("cash kind labels", () => {
  it("labels every kind the ledger can hold", () => {
    expect(cashTypeLabel("INTEREST")).toBe("Interest")
    expect(cashTypeLabel("FEE")).toBe("Fee")
    expect(cashTypeLabel("FX_CONVERSION")).toBe("Conversion")
    expect(cashTypeLabel("DEPOSIT")).toBe("Deposit")
    expect(cashTypeLabel("UNKNOWN")).toBe("UNKNOWN")
  })

  it("maps each stored type to the modal that edits it", () => {
    expect(editActionFor("INTEREST")).toBe("interest")
    expect(editActionFor("FEE")).toBe("fee")
    expect(editActionFor("FX_CONVERSION")).toBe("conversion")
    // An unknown type falls back to the generic movement form.
    expect(editActionFor("DIVIDEND")).toBe("deposit")
  })
})

describe("interest", () => {
  it("posts the amount with the sign the user typed", async () => {
    mocked.interestCash.mockResolvedValue({} as never)
    const wrapper = await openModal("interest")
    field(wrapper, "pc-amount").setValue(-12.5)
    await submit(wrapper)
    expect(mocked.interestCash).toHaveBeenCalledTimes(1)
    const input = firstInput(mocked.interestCash)
    expect(input.amount).toBe(-12.5)
    expect(input.currency).toBe("USD")
  })

  it("refuses to submit a zero interest row", async () => {
    mocked.interestCash.mockResolvedValue({} as never)
    const wrapper = await openModal("interest")
    field(wrapper, "pc-amount").setValue(0)
    expect(submitDisabled(wrapper)).toBe(true)
    await submit(wrapper)
    expect(mocked.interestCash).not.toHaveBeenCalled()
  })

  it("prefills a debit-interest row with its sign and keeps it on save", async () => {
    mocked.updateCashTransaction.mockResolvedValue({} as never)
    const wrapper = await openModal("interest", {
      editTx: { id: "i1", type: "INTEREST", amount: -3, currency: "USD", createdAt: "2026-11-01T00:00:00Z" },
    })
    expect(valueOf(wrapper, "pc-amount")).toBe(-3)
    field(wrapper, "pc-amount").setValue(20)
    await submit(wrapper)
    expect(firstInput(mocked.updateCashTransaction).amount).toBe(20)
  })
})

describe("charge", () => {
  it("books a magnitude as a debit", async () => {
    mocked.feeCash.mockResolvedValue({} as never)
    const wrapper = await openModal("fee")
    field(wrapper, "pc-amount").setValue(7.4)
    await submit(wrapper)
    expect(firstInput(mocked.feeCash).amount).toBe(7.4)
  })

  it("will not submit a negative charge — the form takes a magnitude", async () => {
    mocked.feeCash.mockResolvedValue({} as never)
    const wrapper = await openModal("fee")
    field(wrapper, "pc-amount").setValue(-7.4)
    expect(submitDisabled(wrapper)).toBe(true)
    expect(mocked.feeCash).not.toHaveBeenCalled()
  })
})

describe("conversion", () => {
  it("sends both legs, with the charge netted into the leg it is quoted in", async () => {
    mocked.conversionCash.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion")
    field(wrapper, "pc-amount").setValue(1000)
    field(wrapper, "pc-to-currency").setValue("EUR")
    field(wrapper, "pc-to-amount").setValue(900)
    field(wrapper, "pc-fees").setValue(10)
    await submit(wrapper)
    const input = firstInput(mocked.conversionCash)
    expect(input.currency).toBe("USD")
    expect(input.amount).toBe(-1010)
    expect(input.toCurrency).toBe("EUR")
    expect(input.toAmount).toBe(900)
    expect(input.fees).toBe(10)
  })

  it("nets a charge quoted in the received currency into that leg", async () => {
    mocked.conversionCash.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion")
    field(wrapper, "pc-amount").setValue(1000)
    field(wrapper, "pc-to-currency").setValue("EUR")
    field(wrapper, "pc-to-amount").setValue(400)
    field(wrapper, "pc-fees").setValue(5)
    field(wrapper, "pc-fee-currency").setValue("EUR")
    await submit(wrapper)
    const input = firstInput(mocked.conversionCash)
    expect(input.amount).toBe(-1000)
    expect(input.toAmount).toBe(395)
  })

  it("refuses a charge in a currency that is neither leg", async () => {
    mocked.conversionCash.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion")
    field(wrapper, "pc-amount").setValue(1000)
    field(wrapper, "pc-to-currency").setValue("EUR")
    field(wrapper, "pc-to-amount").setValue(400)
    field(wrapper, "pc-fees").setValue(5)
    field(wrapper, "pc-fee-currency").setValue("GBP")
    await flushPromises()
    // The submit button is the gate: a charge in a third currency has no leg to
    // net into, so the form refuses it before the request is made.
    expect(submitDisabled(wrapper)).toBe(true)
    expect(wrapper.text()).toContain("neither leg of this conversion")
    await submit(wrapper)
    expect(mocked.conversionCash).not.toHaveBeenCalled()
  })

  it("allows a foreign leg in a single-currency account when the other leg settles", async () => {
    mocked.conversionCash.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion", { cashCurrency: "USD" })
    field(wrapper, "pc-currency").setValue("EUR")
    field(wrapper, "pc-amount").setValue(1000)
    field(wrapper, "pc-to-currency").setValue("USD")
    field(wrapper, "pc-to-amount").setValue(1100)
    await submit(wrapper)
    const input = firstInput(mocked.conversionCash)
    expect(input.currency).toBe("EUR")
    expect(input.amount).toBe(-1000)
    expect(input.toCurrency).toBe("USD")
    expect(input.toAmount).toBe(1100)
  })

  it("books a broker residual as a one-currency correction", async () => {
    mocked.conversionCash.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion")
    field(wrapper, "pc-amount").setValue(60.5)
    field(wrapper, "pc-to-amount").setValue(0)
    await submit(wrapper)
    const input = firstInput(mocked.conversionCash)
    expect(input.amount).toBe(-60.5)
    expect(input.toCurrency).toBe("USD")
    expect(input.toAmount).toBe(0)
  })

  it("prefills a stored correction as one leg and re-posts it with the same sign", async () => {
    mocked.updateCashTransaction.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion", {
      cashCurrency: "USD",
      editTx: {
        id: "c1",
        type: "FX_CONVERSION",
        amount: -60.515636,
        currency: "USD",
        toCurrency: "USD",
        toAmount: null,
        createdAt: "2026-11-01T00:00:00Z",
      },
    })
    expect(valueOf(wrapper, "pc-amount")).toBeCloseTo(60.515636, 6)
    expect(valueOf(wrapper, "pc-to-amount")).toBe(0)
    await submit(wrapper)
    const input = firstInput(mocked.updateCashTransaction)
    expect(input.amount).toBeCloseTo(-60.515636, 6)
    expect(input.toCurrency).toBe("USD")
    expect(input.toAmount).toBe(0)
  })

  it("edits both legs of a stored conversion", async () => {
    mocked.updateCashTransaction.mockResolvedValue({} as never)
    const wrapper = await openModal("conversion", {
      cashCurrency: "USD",
      editTx: {
        id: "c2",
        type: "FX_CONVERSION",
        amount: -99,
        currency: "EUR",
        toCurrency: "USD",
        toAmount: 110,
        createdAt: "2026-11-01T00:00:00Z",
      },
    })
    expect(valueOf(wrapper, "pc-amount")).toBe(99)
    expect(valueOf(wrapper, "pc-to-amount")).toBe(110)
    field(wrapper, "pc-to-amount").setValue(105)
    await submit(wrapper)
    const input = firstInput(mocked.updateCashTransaction)
    expect(input.amount).toBe(-99)
    expect(input.toAmount).toBe(105)
    expect(input.currency).toBe("EUR")
  })
})
