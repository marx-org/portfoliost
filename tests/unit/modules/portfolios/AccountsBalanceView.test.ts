import { flushPromises, mount } from "@vue/test-utils"
import { createMemoryHistory, createRouter, type Router } from "vue-router"
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
/** The router `useRouter()` hands the view, so a test can assert on its pushes. */
let router: Router

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
  // A real (memory) router, so `useRouter()` is not undefined — without it the
  // row-click path in openRow would throw rather than be observable. RouterLink
  // stays stubbed so the Account cell still renders a bare <a>, which is what
  // openRow's closest("a") bail-out depends on.
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", name: "portfolio-holdings", component: { template: "<div />" } }],
  })
  return mount(AccountsBalanceView, {
    global: {
      plugins: [pinia, router],
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

  it("emphasizes the Total column header and values", async () => {
    const w = mountView()
    await flushPromises()

    const totalHeader = w.findAll("thead th").find((th) => th.text().includes("Total"))!
    expect(totalHeader.classes()).toEqual(
      expect.arrayContaining(["font-semibold", "text-slate-700", "dark:text-slate-200"]),
    )
    expect(w.findAll("thead th")[0].classes()).not.toContain("font-semibold")

    for (const row of w.findAll('[data-testid="accounts-balance-row"]')) {
      expect(row.get('[data-testid="accounts-balance-total"]').classes()).toContain("font-semibold")
    }
    expect(w.get('[data-testid="accounts-balance-totals-total"]').classes()).toContain("font-semibold")
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
 * §84.5 — the readability styling. Class-level assertions, because the properties
 * that matter here are not observable in jsdom: there is no layout engine, so
 * "is the Account column actually pinned" and "is its background opaque" cannot
 * be measured here. They are asserted as classes, and the real proof is the
 * Playwright measurement in tests/e2e/accounts-balance.spec.ts.
 */
describe("§84.5 readability styling", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.removeItem("portfoliost_display_currency")
    const store = useCurrenciesStore()
    store.currencies = [{ code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true }]
    store.loaded = true
    vi.clearAllMocks()
    mocked.getPortfolios.mockResolvedValue([] as never)
    mocked.getPortfolioTotalMetrics.mockResolvedValue(metrics() as never)
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-10-02" })
    vi.mocked(preferencesApi.getUserPreferences).mockResolvedValue({} as never)
    vi.mocked(preferencesApi.patchUserPreferences).mockResolvedValue({} as never)
  })

  it("stipes every second row, in both themes", async () => {
    const w = mountView()
    await flushPromises()

    const cls = w.find('[data-testid="accounts-balance-row"]').classes()
    // Both steps are needed: even:/dark:even: is the light/dark pair for one stripe.
    expect(cls).toContain("even:bg-slate-50/60")
    expect(cls).toContain("dark:even:bg-slate-800/60")
    // The stripe must not be the hover tint, or hover is invisible on striped rows.
    expect(cls).toContain("hover:bg-blue-50/70")
    expect(cls).not.toContain("hover:bg-slate-50")
  })

  it("pins the Account column with an OPAQUE background and a right separator", async () => {
    const w = mountView()
    await flushPromises()

    for (const cell of w.findAll('[data-testid="accounts-balance-account"]')) {
      const cls = cell.classes()
      expect(cls).toContain("sticky")
      expect(cls).toContain("left-0")
      // Opaque on both sides — a translucent pinned cell lets scrolled text bleed
      // through, which is the classic silent failure of this technique.
      expect(cls).toContain("bg-slate-100")
      expect(cls).toContain("dark:bg-slate-800")
      // Not a /NN alpha tint, which is what "opaque" has to mean here.
      expect(cls.filter((c) => /^bg-slate-\d+\/\d+$/.test(c))).toHaveLength(0)
      expect(cls).toContain("shadow-[-1px_0_0_0_#e2e8f0]")
      expect(cls).toContain("dark:shadow-[-1px_0_0_0_#334155]")
      // The row's hover tint sits behind this cell's own background, so the cell
      // must carry its own.
      expect(cls).toContain("group-hover:bg-blue-100")
    }
  })

  it("pins the Account header cell above the body cells", async () => {
    const w = mountView()
    await flushPromises()

    const heads = w.findAll("thead th")
    expect(heads).toHaveLength(7)
    // Every header cell declares its column, and the Account one is pinned at z-30
    // so it stays above the z-10 body cells it overlaps while scrolling.
    for (const th of heads) expect(th.attributes("scope")).toBe("col")

    const account = heads[0]
    expect(account.classes()).toContain("sticky")
    expect(account.classes()).toContain("left-0")
    expect(account.classes()).toContain("z-30")
    expect(account.classes()).toContain("bg-slate-50")
    expect(account.classes()).toContain("dark:bg-slate-800")
    // The money headers are sticky VERTICALLY (§84.9) but must not be pinned
    // horizontally — that is what makes the Account column the only fixed one.
    for (const th of heads.slice(1)) {
      expect(th.classes()).toContain("sticky")
      expect(th.classes()).toContain("top-0")
      expect(th.classes()).not.toContain("left-0")
    }
  })

  it("pins the header band vertically so column labels survive a long list", async () => {
    const w = mountView()
    await flushPromises()

    const wrap = w.get('[data-testid="accounts-balance"]').element.parentElement!
    const wrapCls = wrap.className
    // `overflow-x-auto` alone gives the wrapper a computed overflow-y of auto,
    // but its height is its content height, so a sticky header has no scroll port
    // to stick to. `max-h` supplies one. MAX-h, not `h`: with `h` a short list
    // would leave an empty band under the footer.
    expect(wrapCls).toContain("max-h-[70vh]")
    expect(wrapCls).toContain("overflow-auto")
    expect(wrapCls).not.toMatch(/(^|\s)h-\[/)

    // A sticky element with no z-index paints in DOM order and <tbody> comes
    // after <thead>, so body rows would paint OVER the pinned header.
    for (const th of w.findAll("thead th")) {
      expect(th.classes()).toContain("top-0")
      expect(th.classes()).toContain("z-20")
    }
  })

  it("pins the footer's Total label too, so it is never the one row that scrolls away", async () => {
    const w = mountView()
    await flushPromises()

    const label = w.get('[data-testid="accounts-balance-totals"]').findAll("td")[0]
    expect(label.classes()).toContain("sticky")
    expect(label.classes()).toContain("left-0")
    expect(label.classes()).toContain("bg-slate-100")
    expect(label.classes()).toContain("dark:bg-slate-800")
  })

  it("renders the Σ row as an opaque band, one step up from the body rows", async () => {
    const w = mountView()
    await flushPromises()

    const row = w.get('[data-testid="accounts-balance-totals"]')
    const cls = row.classes()
    // Opaque, not a tint: the band abuts the pinned Account cell's separator and a
    // translucent band would let the last body row show through it.
    expect(cls).toContain("bg-slate-100")
    expect(cls).toContain("dark:bg-slate-800")
    expect(cls.filter((c) => /^bg-slate-\d+\/\d+$/.test(c))).toHaveLength(0)
    expect(cls).toContain("font-semibold")
    // A type step above the table's own text-sm, so the band is heavier than a row.
    expect(row.element.closest("tfoot")!.className).toContain("text-base")

    // The label reads as a caption for the band, not as a peer of the figures.
    const label = row.findAll("td")[0]
    expect(label.text()).toBe("Total")
    expect(label.get("span").classes()).toEqual(
      expect.arrayContaining(["text-xs", "uppercase", "tracking-wide"]),
    )
    // No "band overlaps the last row" assertion here: jsdom reports every
    // getBoundingClientRect() as 0, so such a check passes unconditionally and
    // only looks like a guard. It is verified in a real browser instead.
  })
})

/**
 * §84.7 — small-screen density. Only the base (unprefixed) values are assertable
 * here: jsdom has no viewport, so it never applies an `sm:` variant and cannot tell
 * you whether the desktop is unchanged. The before/after widths are measured in a
 * real browser instead.
 */
describe("§84.7 small-screen density", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.removeItem("portfoliost_display_currency")
    const store = useCurrenciesStore()
    store.currencies = [{ code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true }]
    store.loaded = true
    vi.clearAllMocks()
    mocked.getPortfolios.mockResolvedValue([] as never)
    mocked.getPortfolioTotalMetrics.mockResolvedValue(metrics() as never)
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-10-02" })
    vi.mocked(preferencesApi.getUserPreferences).mockResolvedValue({} as never)
    vi.mocked(preferencesApi.patchUserPreferences).mockResolvedValue({} as never)
  })

  it("keeps the desktop metrics as the sm: values, so only narrow screens shrink", async () => {
    const w = mountView()
    await flushPromises()

    // Every cell carries the phone value UNPREFIXED and the desktop value at sm:,
    // so the change can only ever make the table narrower, never wider.
    for (const td of w.findAll("tbody td")) {
      expect(td.classes()).toContain("px-3")
      expect(td.classes()).toContain("sm:px-5")
    }
    const table = w.get('[data-testid="accounts-balance"]')
    expect(table.classes()).toContain("text-xs")
    expect(table.classes()).toContain("sm:text-sm")
    // A min-w FLOOR would be pointless here — the table's natural width (~905px)
    // already exceeds any phone — so the intent is the opposite: cut the width.
    expect(table.classes()).not.toContain("min-w-[680px]")
  })

  it("floors the Account column on a phone and lets the floor go at sm", async () => {
    const w = mountView()
    await flushPromises()

    const cls = w.find('[data-testid="accounts-balance-account"]').classes()
    // 9rem on a phone so the pinned column cannot be squeezed to a stub.
    expect(cls).toContain("min-w-[9rem]")
    // …and released at sm:. A floor that also applied at desktop/tablet made the
    // natural width WORSE (904.6 → 992.5px), so it is explicitly reset there.
    expect(cls).toContain("sm:min-w-0")
    // Wrapping, never truncation: a truncated account name hides exactly the
    // information needed to tell two accounts apart.
    expect(cls).toContain("break-words")
    expect(cls).not.toContain("truncate")
  })
})

/**
 * §84.8 — touch targets and keyboard focus.
 */
describe("§84.8 touch targets and focus", () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.removeItem("portfoliost_display_currency")
    const store = useCurrenciesStore()
    store.currencies = [{ code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true }]
    store.loaded = true
    vi.clearAllMocks()
    mocked.getPortfolios.mockResolvedValue([] as never)
    mocked.getPortfolioTotalMetrics.mockResolvedValue(metrics() as never)
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.9, asOf: "2026-10-02" })
    vi.mocked(preferencesApi.getUserPreferences).mockResolvedValue({} as never)
    vi.mocked(preferencesApi.patchUserPreferences).mockResolvedValue({} as never)
  })

  it("grows the hit area on touch and restores the desktop padding at sm", async () => {
    const w = mountView()
    await flushPromises()

    // py-3.5 below sm, py-2.5 at sm, so desktop keeps its original 41px row.
    // 3.5 and not 3: measured, py-3 gives a 41px SINGLE-LINE row — under the 44px
    // touch minimum — and short account names ("Top10") are exactly the rows that
    // stay single-line. py-3.5 measures 45px. Only vertical, so the width saved
    // in §84.7 is untouched.
    for (const td of w.findAll("tbody td")) {
      expect(td.classes()).toContain("py-3.5")
      expect(td.classes()).toContain("sm:py-2.5")
    }
  })

  it("tints the row on keyboard focus, matching hover", async () => {
    const w = mountView()
    await flushPromises()

    const row = w.find('[data-testid="accounts-balance-row"]')
    const cls = row.classes()
    // The Account link is the row's only focusable element, so without this a
    // keyboard user sees focus on the link alone and not on its row.
    expect(cls).toContain("focus-within:bg-blue-50/70")
    expect(cls).toContain("dark:focus-within:bg-slate-700/60")
    // Same tint as hover, so pointer and keyboard agree on what "this row" means.
    expect(cls).toContain("hover:bg-blue-50/70")

    // The pinned cell needs its own, for the same reason it needs group-hover:.
    const acc = row.get('[data-testid="accounts-balance-account"]').classes()
    expect(acc).toContain("group-focus-within:bg-blue-100")
    expect(acc).toContain("dark:group-focus-within:bg-slate-700")
  })

  it("gives the Account link a focus-visible ring, not just a row tint", async () => {
    const w = mountView()
    await flushPromises()

    const link = rowByName(w, "Top10").get("a")
    const cls = link.classes()
    // A row tint alone fails anyone who cannot distinguish blue-50 from slate-100.
    expect(cls).toContain("focus-visible:ring-2")
    expect(cls.some((c) => c.startsWith("focus-visible:ring-"))).toBe(true)
    // Still a real anchor: middle-click and "announced as a link" depend on it.
    expect(link.element.tagName).toBe("A")
  })

  it("navigates once from a money cell, and not at all from the Account link", async () => {
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, "push")

    await rowByName(w, "Top10").get('[data-testid="accounts-balance-total"]').trigger("click")
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({
      name: "portfolio-holdings",
      params: { id: expect.any(String) },
    })
    push.mockClear()

    // The Account cell holds a real <a> that navigates itself, so openRow must
    // bail out — otherwise the row click and the anchor would both push and the
    // user would get two navigations. Asserted on the row handler's own push.
    await rowByName(w, "Top10").get("a").trigger("click")
    expect(push).not.toHaveBeenCalled()
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
