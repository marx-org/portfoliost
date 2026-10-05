import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia, type Pinia } from "pinia"
import { useCurrenciesStore } from "@/stores/currencies"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AccountsBalanceView, {
  accountsBalanceRows,
  accountsBalanceTotals,
  sortAccountsBalanceRows,
  type AccountsBalanceRow,
} from "@/modules/portfolios/AccountsBalanceView.vue"
import * as portfoliosApi from "@/api/portfolios"
import * as fxApi from "@/api/fx"
import * as preferencesApi from "@/api/preferences"

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolios: vi.fn(),
    getPortfolioTotalMetrics: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({ getLatestRate: vi.fn() }))

vi.mock("@/api/preferences", () => ({
  getUserPreferences: vi.fn(),
  patchUserPreferences: vi.fn(),
}))

const mocked = vi.mocked(portfoliosApi)
const mockedFx = vi.mocked(fxApi)

let pinia: Pinia

/**
 * The PROD shape of the ten-account block, in miniature: the four cases the table
 * has to render differently.
 *
 *  - `Top10` — the ordinary row (deposits > 0, positive P/L).
 *  - `IKE Marek` — a LOSING row, so P/L and Return % must carry a negative sign
 *    and not be clamped to zero.
 *  - `XTB` — PROD's real edge pair (cash −24,26 with deposits 0): a negative cash
 *    balance that must keep its sign, and a Return % that is 0/0, i.e. not a
 *    number at all.
 *  - `IBKR` — a row whose `returnPercentage` is ABSENT, which the contract allows.
 */
function breakdown() {
  return [
    {
      id: "p1", name: "Top10",
      instrumentsValue: 100000, cashValue: 9984.34, totalValue: 109984.34, capitalBasis: 98083.4,
      returnPercentage: 12.13,
    },
    {
      id: "p2", name: "IKE Marek",
      instrumentsValue: 41000, cashValue: 2270.14, totalValue: 43270.14, capitalBasis: 45000,
      returnPercentage: -3.84,
    },
    {
      id: "p3", name: "XTB",
      instrumentsValue: 0, cashValue: -24.26, totalValue: -24.26, capitalBasis: 0,
      returnPercentage: 0,
    },
    {
      id: "p4", name: "IBKR",
      instrumentsValue: 62000, cashValue: 15818.68, totalValue: 77818.68, capitalBasis: 74300,
    },
  ]
}

function metrics(over: Record<string, unknown> = {}) {
  const rows = breakdown()
  const sum = (k: string) => Math.round(rows.reduce((s, r) => s + (r as never as Record<string, number>)[k], 0) * 100) / 100
  return {
    instrumentsValue: sum("instrumentsValue"),
    cashValue: sum("cashValue"),
    totalValue: sum("totalValue"),
    capitalBasis: sum("capitalBasis"),
    baseCurrency: "USD",
    cashBreakdown: [],
    unpricedPositions: 0,
    portfolioBreakdown: rows,
    ...over,
  }
}

function mountView() {
  return mount(AccountsBalanceView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: "<a><slot /></a>" } },
    },
  })
}

/** The rendered number, without its symbol, separators or sign. */
function num(el: { text: () => string }): number {
  return Number(el.text().replace(/[^0-9.-]/g, ""))
}

function rowByName(w: ReturnType<typeof mountView>, name: string) {
  const row = w.findAll('[data-testid="accounts-balance-row"]').find((r) =>
    r.get('[data-testid="accounts-balance-account"]').text().includes(name),
  )
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe("AccountsBalanceView", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.removeItem("portfoliost_display_currency")
    const store = useCurrenciesStore()
    store.currencies = [
      { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
      { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
    ]
    store.loaded = true
    vi.clearAllMocks()
    mocked.getPortfolios.mockResolvedValue([] as never)
    mocked.getPortfolioTotalMetrics.mockResolvedValue(metrics() as never)
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-10-02" })
    vi.mocked(preferencesApi.getUserPreferences).mockResolvedValue({} as never)
    vi.mocked(preferencesApi.patchUserPreferences).mockResolvedValue({} as never)
  })

  it("renders one row per breakdown entry, sorted by Total descending by default", async () => {
    const w = mountView()
    await flushPromises()

    const names = w
      .findAll('[data-testid="accounts-balance-account"]')
      .map((el) => el.text().trim())
    // 109984.34 · 77818.68 · 43270.14 · −24.26
    expect(names).toEqual(["Top10", "IBKR", "IKE Marek", "XTB"])
  })

  it("renders the seven columns with the payload's own figures", async () => {
    const w = mountView()
    await flushPromises()

    const headers = w.findAll("thead th").map((th) => th.text().replace(/[↑↓]/g, "").trim())
    expect(headers).toEqual(["Account", "Investments", "Free cash", "Total", "Deposits", "P/L", "Return %"])

    const top10 = rowByName(w, "Top10")
    expect(num(top10.get('[data-testid="accounts-balance-investments"]'))).toBe(100000)
    expect(num(top10.get('[data-testid="accounts-balance-cash"]'))).toBe(9984.34)
    expect(num(top10.get('[data-testid="accounts-balance-total"]'))).toBe(109984.34)
    expect(num(top10.get('[data-testid="accounts-balance-deposits"]'))).toBe(98083.4)
  })

  /**
   * The two rules the data forces. Both were measured in PROD, and both fail
   * silently if they are "tidied up": a margin balance clamped to 0 reads as
   * "this account holds no cash", and a 0/0 return printed as 0.00% reads as
   * "this account neither gained nor lost".
   */
  it("keeps a negative cash balance signed, and renders — for a row with no deposits", async () => {
    const w = mountView()
    await flushPromises()

    const xtb = rowByName(w, "XTB")
    const cash = xtb.get('[data-testid="accounts-balance-cash"]').text()
    expect(cash).toContain("-")
    expect(num(xtb.get('[data-testid="accounts-balance-cash"]'))).toBe(-24.26)
    expect(xtb.get('[data-testid="accounts-balance-return"]').text()).toBe("—")
    // A negative Total is a real figure, not a formatting accident.
    expect(num(xtb.get('[data-testid="accounts-balance-total"]'))).toBe(-24.26)
  })

  it("derives column 6 as Total − Deposits and column 7 as 6 / 5", async () => {
    const w = mountView()
    await flushPromises()

    for (const name of ["Top10", "IKE Marek", "XTB"]) {
      const row = rowByName(w, name)
      const total = num(row.get('[data-testid="accounts-balance-total"]'))
      const invested = num(row.get('[data-testid="accounts-balance-deposits"]'))
      expect(num(row.get('[data-testid="accounts-balance-gain"]'))).toBeCloseTo(total - invested, 2)

      const ret = row.get('[data-testid="accounts-balance-return"]').text()
      if (invested > 0) {
        expect(num({ text: () => ret })).toBeCloseTo(((total - invested) / invested) * 100, 2)
      } else {
        expect(ret).toBe("—")
      }
    }
  })

  it("renders a negative return for a losing row rather than clamping it", async () => {
    const w = mountView()
    await flushPromises()

    const row = rowByName(w, "IKE Marek")
    expect(num(row.get('[data-testid="accounts-balance-gain"]'))).toBeCloseTo(-1729.86, 2)
    expect(row.get('[data-testid="accounts-balance-return"]').text()).toContain("-3.84")
  })

  it("falls back to deriving the return when the payload omits returnPercentage", async () => {
    const w = mountView()
    await flushPromises()

    // IBKR has no returnPercentage in the fixture (the contract marks it optional).
    const row = rowByName(w, "IBKR")
    expect(num(row.get('[data-testid="accounts-balance-return"]'))).toBeCloseTo(4.74, 2)
  })

  it("sums the money columns in the Σ footer, and the Total matches the headline tile", async () => {
    const w = mountView()
    await flushPromises()

    const foot = w.get('[data-testid="accounts-balance-totals"]')
    const rows = w.findAll('[data-testid="accounts-balance-row"]')
    for (const [col, cell] of [
      ["investments", "accounts-balance-totals-investments"],
      ["cash", "accounts-balance-totals-cash"],
      ["total", "accounts-balance-totals-total"],
      ["deposits", "accounts-balance-totals-deposits"],
      ["gain", "accounts-balance-totals-gain"],
    ] as const) {
      const sum = rows.reduce((s, r) => s + num(r.get(`[data-testid="accounts-balance-${col}"]`)), 0)
      expect(num(foot.get(`[data-testid="${cell}"]`))).toBeCloseTo(sum, 2)
    }
    // The load-bearing one: the footer's Total is the aggregate's own totalValue,
    // which is what the dashboard's `tile-total-value` renders.
    expect(num(foot.get('[data-testid="accounts-balance-totals-total"]'))).toBeCloseTo(
      metrics().totalValue,
      2,
    )
  })

  it("toggles both directions on every column, and orders numerically not lexically", async () => {
    const w = mountView()
    await flushPromises()

    const totalHeader = w.findAll("thead th").find((th) => th.text().includes("Total"))!
    const names = () =>
      w.findAll('[data-testid="accounts-balance-account"]').map((el) => el.text().trim())

    // default: Total desc (asserted above), first click flips to asc
    expect(totalHeader.attributes("aria-sort")).toBe("descending")
    await totalHeader.get("button").trigger("click")
    expect(totalHeader.attributes("aria-sort")).toBe("ascending")
    // Lexically "IKE Marek" < "IBKR" < "Top10" < "XTB"; numerically the ascending
    // order starts at XTB's −24.26, so the two differ and the test can tell.
    expect(names()).toEqual(["XTB", "IKE Marek", "IBKR", "Top10"])

    await totalHeader.get("button").trigger("click")
    expect(totalHeader.attributes("aria-sort")).toBe("descending")
    expect(names()).toEqual(["Top10", "IBKR", "IKE Marek", "XTB"])
  })

  it("sorts by account name on the string column", async () => {
    const w = mountView()
    await flushPromises()

    const accountHeader = w.findAll("thead th").find((th) => th.text().includes("Account"))!
    await accountHeader.get("button").trigger("click")
    await flushPromises()

    expect(
      w.findAll('[data-testid="accounts-balance-account"]').map((el) => el.text().trim()),
    ).toEqual(["IBKR", "IKE Marek", "Top10", "XTB"])
  })

  /**
   * §66.3 — the money columns are converted, not relabelled, and a change of the
   * display currency re-renders them in place. Asserted without a remount: a
   * remount would also pass, and would hide a store that stopped being reactive.
   */
  it("re-renders the money columns when the display currency changes, without a remount", async () => {
    const w = mountView()
    await flushPromises()

    expect(num(w.get('[data-testid="accounts-balance-totals-total"]'))).toBe(231048.9)

    useDisplayCurrencyStore().setCurrency("EUR")
    await flushPromises()
    await flushPromises()

    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("USD", "EUR")
    // 0.9 rate, and the footer label follows the currency.
    expect(w.get('[data-testid="accounts-balance-totals-total"]').text()).toContain("€")
    expect(num(w.get('[data-testid="accounts-balance-totals-total"]'))).toBeCloseTo(207944.01, 2)
    expect(num(rowByName(w, "Top10").get('[data-testid="accounts-balance-total"]'))).toBeCloseTo(98985.91, 2)
    // The same mount, still one component instance.
    expect(w.findAll('[data-testid="accounts-balance-row"]').length).toBe(4)
  })
})

/**
 * The pure math, exercised without mounting (docs/COMPONENTS.md "shared math").
 */
describe("§84 shared math", () => {
  it("accountsBalanceRows derives P/L and the return, and nulls a 0/0 return", () => {
    const rows = accountsBalanceRows(breakdown())
    const xtb = rows.find((r) => r.name === "XTB")!
    expect(xtb.gainLoss).toBeCloseTo(-24.26, 2)
    expect(xtb.returnPercentage).toBeNull()
    // The payload's own percentage wins when present (IKE Marek carries -3.84) —
    // the ratio is a fallback for a response that omits the optional field.
    expect(rows.find((r) => r.name === "IKE Marek")!.returnPercentage).toBeCloseTo(-3.84, 5)
    expect(rows.find((r) => r.name === "IBKR")!.returnPercentage).toBeCloseTo(4.735774, 5)
  })

  it("sortAccountsBalanceRows puts a null return last in both directions", () => {
    const rows = accountsBalanceRows(breakdown())
    expect(sortAccountsBalanceRows(rows, "returnPercentage", "asc").at(-1)!.name).toBe("XTB")
    expect(sortAccountsBalanceRows(rows, "returnPercentage", "desc").at(-1)!.name).toBe("XTB")
    expect(sortAccountsBalanceRows(rows, "returnPercentage", "asc").at(0)!.name).toBe("IKE Marek")
    expect(sortAccountsBalanceRows(rows, "returnPercentage", "desc").at(0)!.name).toBe("Top10")
  })

  it("accountsBalanceTotals returns the ratio of the summed money, not a sum of ratios", () => {
    const rows = accountsBalanceRows(breakdown())
    const totals = accountsBalanceTotals(rows)
    const invested = rows.reduce((s, r) => s + r.capitalBasis, 0)
    const gain = rows.reduce((s, r) => s + r.gainLoss, 0)
    expect(totals.capitalBasis).toBeCloseTo(invested, 2)
    expect(totals.gainLoss).toBeCloseTo(gain, 2)
    expect(totals.returnPercentage).toBeCloseTo((gain / invested) * 100, 10)
    // …which is NOT the mean of the rows' own returns.
    const mean = rows.reduce((s, r) => s + (r.returnPercentage ?? 0), 0) / rows.length
    expect(totals.returnPercentage).not.toBeCloseTo(mean, 2)
  })

  it("accountsBalanceTotals is empty-safe", () => {
    const totals = accountsBalanceTotals([] as AccountsBalanceRow[])
    expect(totals.totalValue).toBe(0)
    expect(totals.returnPercentage).toBeNull()
  })
})