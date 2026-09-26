import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CashTransactionsTable from "@/components/CashTransactionsTable.vue"
import * as portfoliosApi from "@/api/portfolios"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioCashTransactions: vi.fn(),
    getRecentCashTransactions: vi.fn(),
    deleteCashTransaction: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 1, asOf: "2026-08-25" }),
}))

const mocked = vi.mocked(portfoliosApi)

/** A per-portfolio row: numeric amount, no displayLabel, optional transactionDate. */
function portfolioTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "pt1",
    portfolioId: "p1",
    portfolioName: "Portfolio 1",
    type: "DEPOSIT",
    amount: 100,
    currency: "USD",
    status: "completed",
    createdAt: "2026-03-01T10:00:00Z",
    transactionDate: "2026-03-02",
    balanceAfter: 600,
    description: "salary",
    labels: [],
    ...overrides,
  }
}

/** A global-feed row: signed decimal-string amount, displayLabel, resolved date. */
function recentTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "rt1",
    portfolioId: "p1",
    portfolioName: "Portfolio 1",
    type: "DEPOSIT",
    displayLabel: "Deposit",
    amount: "100.00000000",
    currency: "USD",
    date: "2026-03-02T09:30:00Z",
    createdAt: "2026-03-02T09:30:00Z",
    isInternalTransfer: false,
    description: "salary",
    labels: [],
    ...overrides,
  }
}

function page<T>(items: T[], total = items.length) {
  return { items, total, page: 1, limit: 10, totalPages: 1, hasNext: false, hasPrevious: false }
}

async function mountTable(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  const wrapper = mount(CashTransactionsTable, {
    props: { mode: "portfolio", portfolioId: "p1", ...props },
    global: {
      plugins: [createPinia()] as never[],
      stubs: { apexchart: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe("CashTransactionsTable — shared cash table (date column + sorting)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getPortfolioCashTransactions.mockResolvedValue(page([portfolioTx()]) as never)
    mocked.getRecentCashTransactions.mockResolvedValue({
      data: [recentTx()],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    } as never)
  })

  // ── The bug: the per-portfolio cash tab had no Date column at all ────────

  it("portfolio mode renders a Date column from transactionDate", async () => {
    const w = await mountTable()
    const th = w.find('[data-testid="table-th-date"]')
    expect(th.exists()).toBe(true)
    expect(th.text()).toContain("Date")
    // the row shows the resolved date, not a blank cell
    const row = w.find('[data-testid="cash-tx-pt1"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain("Mar 2, 2026")
  })

  it("portfolio mode falls back to createdAt when the row has no transactionDate", async () => {
    mocked.getPortfolioCashTransactions.mockResolvedValue(
      page([portfolioTx({ transactionDate: null })]) as never,
    )
    const w = await mountTable()
    expect(w.find('[data-testid="cash-tx-pt1"]').text()).toContain("Mar 1, 2026")
  })

  it("global mode renders the Date column with a time component", async () => {
    const w = await mountTable({ mode: "global" })
    expect(w.find('[data-testid="table-th-date"]').exists()).toBe(true)
    expect(w.find('[data-testid="cash-tx-rt1"]').text()).toContain("Mar 2, 2026")
  })

  // ── Column sets per mode ───────────────────────────────────────────────

  it("portfolio mode shows Balance and hides Portfolio", async () => {
    const w = await mountTable()
    expect(w.find('[data-testid="table-th-balance"]').exists()).toBe(true)
    expect(w.find('[data-testid="table-th-portfolioName"]').exists()).toBe(false)
    expect(w.text()).toContain("$600.00") // balanceAfter
  })

  it("global mode shows Portfolio and hides Balance", async () => {
    const w = await mountTable({ mode: "global" })
    expect(w.find('[data-testid="table-th-portfolioName"]').exists()).toBe(true)
    expect(w.find('[data-testid="table-th-balance"]').exists()).toBe(false)
    expect(w.text()).toContain("Portfolio 1")
  })

  it("both modes keep the unsortable Description column and the row actions", async () => {
    for (const mode of ["portfolio", "global"] as const) {
      const w = await mountTable({ mode })
      const headers = w.findAll("th").map((th) => th.text())
      expect(headers.some((h) => h.trim() === "Description")).toBe(true)
      expect(w.find('[aria-label="Edit transaction"]').exists()).toBe(true)
      expect(w.find('[aria-label="Delete transaction"]').exists()).toBe(true)
      expect(w.find('[aria-label="Set labels"]').exists()).toBe(true)
    }
  })

  // ── Sorting (server-side, like TransactionsTable) ───────────────────────

  it("defaults to date desc", async () => {
    await mountTable()
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledWith("p1", 1, 10, undefined, "date", "desc")
  })

  it("clicking a new column sorts it asc and returns to page 1", async () => {
    const w = await mountTable()
    mocked.getPortfolioCashTransactions.mockClear()
    await w.find('[data-testid="table-th-amount"] button').trigger("click")
    await flushPromises()
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledWith("p1", 1, 10, undefined, "amount", "asc")
  })

  it("clicking the active column flips the order and shows the indicator", async () => {
    const w = await mountTable()
    const th = () => w.find('[data-testid="table-th-date"]')
    expect(th().text()).toContain("↓")

    mocked.getPortfolioCashTransactions.mockClear()
    await th().find("button").trigger("click")
    await flushPromises()
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledWith("p1", 1, 10, undefined, "date", "asc")
    expect(th().text()).toContain("↑")

    mocked.getPortfolioCashTransactions.mockClear()
    await th().find("button").trigger("click")
    await flushPromises()
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledWith("p1", 1, 10, undefined, "date", "desc")
    expect(th().text()).toContain("↓")
  })

  it("sorts the global feed through getRecentCashTransactions", async () => {
    const w = await mountTable({ mode: "global" })
    await w.find('[data-testid="table-th-type"] button').trigger("click")
    await flushPromises()
    expect(mocked.getRecentCashTransactions).toHaveBeenLastCalledWith(1, 10, "type", "asc", undefined)
  })

  // The deployed wallets backend ignores sortBy on this endpoint, so the table
  // re-orders the page it fetched — the arrow must always mean something.
  it("orders the fetched page by the active sort even when the API ignores it", async () => {
    mocked.getPortfolioCashTransactions.mockResolvedValue(
      page([
        portfolioTx({ id: "a", type: "DEPOSIT", amount: 300, transactionDate: "2026-05-01", description: "big" }),
        portfolioTx({ id: "b", type: "WITHDRAWAL", amount: 100, transactionDate: "2026-06-01", description: "small" }),
        portfolioTx({ id: "c", type: "DEPOSIT", amount: 200, transactionDate: "2026-07-01", description: "mid" }),
      ]) as never,
    )
    const w = await mountTable()
    const desc = () => w.findAll("tbody tr").map((tr) => tr.text())
    // default: date desc
    expect(desc()[0]).toContain("mid")
    expect(desc()[2]).toContain("big")

    await w.find('[data-testid="table-th-amount"] button').trigger("click")
    await flushPromises()
    expect(desc()[0]).toContain("small")
    expect(desc()[1]).toContain("mid")
    expect(desc()[2]).toContain("big")

    await w.find('[data-testid="table-th-date"] button').trigger("click")
    await flushPromises()
    expect(desc()[0]).toContain("big")
    expect(desc()[2]).toContain("mid")
  })

  it("sorts the global feed page by portfolio name", async () => {
    mocked.getRecentCashTransactions.mockResolvedValue({
      data: [
        recentTx({ id: "z", portfolioName: "Zeta" }),
        recentTx({ id: "a", portfolioName: "Alpha" }),
      ],
      meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
    } as never)
    const w = await mountTable({ mode: "global" })
    await w.find('[data-testid="table-th-portfolioName"] button').trigger("click")
    await flushPromises()
    const rows = w.findAll("tbody tr").map((tr) => tr.text())
    expect(rows[0]).toContain("Alpha")
    expect(rows[1]).toContain("Zeta")
  })

  // ── Paginator ──────────────────────────────────────────────────────────

  it("renders the full paginator with a page-size selector", async () => {
    mocked.getPortfolioCashTransactions.mockResolvedValue(page([portfolioTx()], 42) as never)
    const w = await mountTable()
    expect(w.find('[aria-label="Pagination"]').exists()).toBe(true)
    expect(w.text()).toContain("1–10 of 42")
    expect(w.text()).toContain("10 per page")
  })

  it("changing the page size reloads page 1", async () => {
    const w = await mountTable()
    mocked.getPortfolioCashTransactions.mockClear()
    const select = w.find('select.input')
    await select.setValue("20")
    await flushPromises()
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledWith("p1", 1, 20, undefined, "date", "desc")
  })

  // ── Amount + type rendering ────────────────────────────────────────────

  it("renders the signed amount and colours outflows red", async () => {
    mocked.getPortfolioCashTransactions.mockResolvedValue(
      page([portfolioTx({ amount: -50, type: "WITHDRAWAL", balanceAfter: 550 })]) as never,
    )
    const w = await mountTable()
    const row = w.find('[data-testid="cash-tx-pt1"]')
    expect(row.text()).toContain("-$50.00")
    expect(row.text()).toContain("Withdrawal")
    expect(row.find(".text-red-600").exists()).toBe(true)
  })

  it("parses the global feed's decimal-string amount", async () => {
    mocked.getRecentCashTransactions.mockResolvedValue({
      data: [recentTx({ amount: "-125.50000000", type: "WITHDRAWAL", displayLabel: "Withdrawal" })],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    } as never)
    const w = await mountTable({ mode: "global" })
    expect(w.find('[data-testid="cash-tx-rt1"]').text()).toContain("-$125.50")
  })

  // ── refreshKey (the portfolio tab reloads after a deposit) ──────────────

  it("reloads when refreshKey changes", async () => {
    const w = await mountTable({ refreshKey: 0 })
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledTimes(1)
    await w.setProps({ refreshKey: 1 })
    await flushPromises()
    expect(mocked.getPortfolioCashTransactions).toHaveBeenCalledTimes(2)
  })

  // ── Empty + error states ───────────────────────────────────────────────

  it("uses the per-mode empty-state copy", async () => {
    mocked.getPortfolioCashTransactions.mockResolvedValue(page([]) as never)
    expect((await mountTable()).text()).toContain("No cash transactions yet.")

    mocked.getRecentCashTransactions.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    } as never)
    expect((await mountTable({ mode: "global" })).text()).toContain("No cash transactions found.")
  })

  it("surfaces a load error", async () => {
    mocked.getPortfolioCashTransactions.mockRejectedValue(new Error("boom"))
    const w = await mountTable()
    expect(w.text()).toContain("boom")
  })
})
