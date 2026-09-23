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

function tx(overrides: Record<string, unknown>) {
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