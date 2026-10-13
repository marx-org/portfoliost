import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioDetailView from "@/modules/portfolios/PortfolioDetailView.vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import * as portfoliosApi from "@/api/portfolios"

/**
 * §148 — the component test (PortfolioDetailView.test.ts) proves the conditional
 * RENDER against a fabricated `useRoute()`. This one drives the REAL route table
 * through a real router, so it also proves the wiring: `/en/portfolios/:id`
 * resolves to the detail view, the virtual route carries the id the view reads,
 * and every tab the view links to is a name the router actually knows. A tab
 * renamed in src/router/index.ts without the view following would fail here.
 *
 * The router is the application singleton (`@/router`). `authGuard` runs on every
 * push, so a session token is planted before navigation; the APIs the detail view
 * warms are mocked so the route resolves without a backend.
 */
vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    getPortfolioDetail: vi.fn(),
    getPortfolios: vi.fn(),
    getPortfolioTotalMetrics: vi.fn(),
    getPortfolioSummaryMetrics: vi.fn(),
    getPortfolioPositions: vi.fn(),
    getPortfolioAnalytics: vi.fn(),
    deletePortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" }),
}))

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>()
  return {
    ...actual,
    http: {
      get: vi.fn(async (url: string) =>
        url.includes("/api/currencies")
          ? {
              currencies: [
                { code: "PLN", name: "Polish zloty", symbol: "PLN", minorUnits: 2, popular: true },
                { code: "USD", name: "US dollar", symbol: "$", minorUnits: 2, popular: true },
              ],
            }
          : null,
      ),
    },
  }
})

const mockedPortfolios = vi.mocked(portfoliosApi)

const DETAIL = {
  id: "p1",
  name: "Virtual Momentum",
  description: null,
  currency: "USD",
  baseCurrency: "USD",
  walletId: null,
  isDefault: false,
  isVirtual: true,
  labelId: "lbl-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as never

/**
 * Import lazily so the singleton router is only ever built inside the test
 * environment (happy-dom supplies `window` for `createWebHistory`).
 */
async function mountAt(path: string) {
  const { default: router } = await import("@/router")

  const pinia = createPinia()
  setActivePinia(pinia)
  useDisplayCurrencyStore().currency = "USD"
  // `getToken()` reads this at auth-store construction; the guard then sees the
  // session and lets the deep link through (no admin group required).
  localStorage.setItem("portfoliost_token", "test-token")

  await router.push(path)
  await router.isReady()

  const wrapper = mount(PortfolioDetailView, {
    global: {
      plugins: [pinia, router],
      // The page under test, not the tab body behind it.
      stubs: { RouterView: true },
    },
  })
  await flushPromises()
  return { wrapper, routeName: router.currentRoute.value.name }
}

function tabNames(wrapper: { get: (s: string) => { findAll: (s: string) => Array<{ text: () => string }> } }) {
  return wrapper.get('nav[aria-label="Portfolio tabs"]').findAll("a").map((a) => a.text())
}

describe("§148 the portfolio detail route renders a virtual portfolio read-only", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockedPortfolios.getPortfolioDetail.mockResolvedValue(DETAIL)
    mockedPortfolios.getPortfolios.mockResolvedValue([])
    mockedPortfolios.getPortfolioTotalMetrics.mockResolvedValue({ totalValue: 0, capitalBasis: 0 } as never)
    mockedPortfolios.getPortfolioSummaryMetrics.mockResolvedValue(null as never)
    mockedPortfolios.getPortfolioPositions.mockResolvedValue([])
    mockedPortfolios.getPortfolioAnalytics.mockResolvedValue({ performance: { timeSeries: [] }, benchmarks: [] } as never)
  })

  it("deep-links to the virtual detail and drops only the Cash tab", async () => {
    const { wrapper, routeName } = await mountAt("/en/portfolios/p1/holdings")

    // The route resolved to the child the view is rendered under.
    expect(routeName).toBe("portfolio-holdings")
    const tabs = tabNames(wrapper)
    expect(tabs).not.toContain("Cash")
    expect(tabs).toContain("Holdings")
    expect(tabs).toContain("Transactions")
    expect(wrapper.findAll("button").some((b) => b.text() === "Add Position")).toBe(false)
  })

  it("links each surviving tab to the id's real path, and never to Cash", async () => {
    const { wrapper } = await mountAt("/en/portfolios/p1/holdings")

    // RouterLink renders a real <a> under the real router, so this is the actual
    // navigation target: a stale route name would render no href at all.
    const hrefs = wrapper
      .get('nav[aria-label="Portfolio tabs"]')
      .findAll("a")
      .map((a) => a.attributes("href") ?? "")

    expect(hrefs).toContain("/en/portfolios/p1/holdings")
    expect(hrefs).toContain("/en/portfolios/p1/transactions")
    expect(hrefs).toContain("/en/portfolios/p1/performance")
    expect(hrefs.some((href) => href.endsWith("/cash"))).toBe(false)
  })
})
