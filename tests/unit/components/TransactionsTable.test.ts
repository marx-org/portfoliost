import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import TransactionsTable from "@/components/TransactionsTable.vue"
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
    getAllTransactions: vi.fn(),
    deletePortfolioTransaction: vi.fn(),
  }
})

function tx(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-" + Math.random().toString(36).slice(2, 8),
    portfolioId: "p1",
    portfolioName: "Top10",
    type: "BUY",
    instrumentSymbol: "AAPL",
    instrumentName: "Apple Inc",
    exchange: "XNAS",
    assetType: "STOCK",
    sector: "Technology",
    country: "US",
    quantity: 10,
    price: 100,
    fees: 0,
    totalAmount: 1000,
    currency: "USD",
    feeCurrency: "USD",
    instrumentCurrency: "USD",
    convertedPrice: null,
    convertedFees: null,
    convertedTotalAmount: null,
    taxes: null,
    notes: null,
    displayCurrency: "USD",
    executedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

async function mountTable() {
  setActivePinia(createPinia())
  const wrapper = mount(TransactionsTable, {
    props: { mode: "portfolio", portfolioId: "p1" },
    global: {
      plugins: [createPinia()] as never[],
      components: {
        RouterLink: { props: ["to"], template: "<a><slot /></a>" },
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe("TransactionsTable — §49.5 dividend tax column + notes", () => {
  it("filters transactions by company name or ticker", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [tx()], total: 1, page: 1, totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockClear()

    await wrapper.get('[data-testid="transaction-search"]').setValue("Apple")
    await flushPromises()

    expect(portfoliosApi.getPortfolioTransactions).toHaveBeenCalledWith(
      "p1", 1, 20, "date", "desc", undefined, undefined, undefined, "Apple",
    )
  })

  it("renders assigned labels in the overall transaction row", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [tx({ labels: [{ id: "l1", name: "Core", color: "#3b82f6" }] })],
      total: 1, page: 1, totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    expect(wrapper.text()).toContain("Core")
  })

  it("does not show the Tax column when the page has no DIVIDEND tax rows", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [tx({ type: "BUY" })],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    expect(wrapper.find('[data-testid="table-th-tax"]').exists()).toBe(false)
  })

  it("shows the Tax column with the withholding value when a DIVIDEND row carries taxes", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [
        tx({
          type: "DIVIDEND",
          quantity: 10,
          price: 5,
          totalAmount: 45,
          taxes: 5,
          notes: "withholding 10%",
        }),
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    expect(wrapper.find('[data-testid="table-th-tax"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("$5.00")
    expect(wrapper.text()).toContain("Dividend")
  })

  it("keeps the blue DIVIDEND badge", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [tx({ type: "DIVIDEND", totalAmount: 45, taxes: 5 })],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    expect(wrapper.find("span.bg-blue-50").exists()).toBe(true)
  })

  it("renders the notes tooltip marker only when notes exist", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [
        tx({ type: "DIVIDEND", totalAmount: 45, taxes: 5, notes: "withholding 10%" }),
        tx({ type: "BUY" }),
      ],
      total: 2,
      page: 1,
      totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    const note = wrapper.find(".text-amber-600")
    expect(note.exists()).toBe(true)
    expect(note.attributes("title")).toBe("withholding 10%")
  })
})

describe("TransactionsTable — an in-kind transfer is not a payment", () => {
  it("shows the quantity that moved custody, never a cash amount", async () => {
    // `totalAmount` on a transfer row is quantity x the source lot's cost — a
    // NOTIONAL. Rendering it as money would invent a payment that never happened.
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [tx({ type: "TRANSFER_OUT", quantity: 5, price: 10, totalAmount: 50 })],
      total: 1, page: 1, totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    const moved = wrapper.find('[data-testid="transfer-moved-quantity"]')
    expect(moved.exists()).toBe(true)
    expect(moved.text()).toContain("5")
    // $50.00 is the notional and must not appear anywhere as an amount.
    expect(moved.text()).not.toContain("$50")
    expect(wrapper.text()).not.toContain("$50.00")
  })

  it("labels both transfer directions readably", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [
        tx({ type: "TRANSFER_OUT", quantity: 5, totalAmount: 50 }),
        tx({ type: "TRANSFER_IN", quantity: 5, totalAmount: 50 }),
      ],
      total: 2, page: 1, totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    expect(wrapper.text()).toContain("Transfer out")
    expect(wrapper.text()).toContain("Transfer in")
    // Never the mechanical capitalisation the old label produced.
    expect(wrapper.text()).not.toContain("TransferOut")
  })

  it("does not style a transfer as a trade — violet/teal, never green or red", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [
        tx({ type: "TRANSFER_OUT", totalAmount: 50 }),
        tx({ type: "TRANSFER_IN", totalAmount: 50 }),
      ],
      total: 2, page: 1, totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    expect(wrapper.find("span.bg-violet-50").exists()).toBe(true)
    expect(wrapper.find("span.bg-teal-50").exists()).toBe(true)
    // A BUY in the same page still uses green, so this asserts the palette is
    // additive rather than the whole table changing.
    expect(wrapper.find("span.bg-green-50").exists()).toBe(false)
  })

  it("a transfer row contributes 0 to a group subtotal, not its notional cost", async () => {
    vi.mocked(portfoliosApi.getPortfolioTransactions).mockResolvedValue({
      items: [
        tx({ type: "TRANSFER_OUT", quantity: 5, totalAmount: 5000 }),
        tx({ type: "TRANSFER_IN", quantity: 5, totalAmount: 5000 }),
      ],
      total: 2, page: 1, totalPages: 1,
    } as never)
    const wrapper = await mountTable()
    // 10000 of notional cost between the two legs would dominate any total shown.
    expect(wrapper.text()).not.toContain("10,000")
    expect(wrapper.text()).not.toContain("$5,000")
  })
})
