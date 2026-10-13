import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PortfolioDetailView from "@/modules/portfolios/PortfolioDetailView.vue"
import PortfolioSettingsDialog from "@/modules/portfolios/PortfolioSettingsDialog.vue"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import * as portfoliosApi from "@/api/portfolios"
import * as fxApi from "@/api/fx"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

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

// The detail view warms the currency registry on mount (D26) — keep it inert.
vi.mock("@/api/client", () => ({
  http: {
    get: vi.fn(async (url: string) =>
      url.includes("/api/currencies")
        ? { currencies: [
            { code: "PLN", name: "Polish zloty", symbol: "PLN", minorUnits: 2, popular: true },
            { code: "USD", name: "US dollar", symbol: "$", minorUnits: 2, popular: true },
          ] }
        : null,
    ),
  },
}))

const mockedFx = vi.mocked(fxApi)
const mockedPortfolios = vi.mocked(portfoliosApi)

/** Intl renders currency CODES with a non-breaking space — normalize for assertions. */
const txt = (w: { text: () => string }) => w.text().replace(/\u00a0/g, " ")

// §48.6e B3 umbrella (B2 residual) — the summary cards render
// summaryMetrics, which wallets denominates in the portfolio baseCurrency
// (Obligacje PKO: 119,190 PLN must never show as "$119,190.00").
const DETAIL = {
  id: "p1",
  name: "Obligacje PKO SA Beata",
  description: null,
  currency: "PLN",
  baseCurrency: "PLN",
  walletId: null,
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as never

const METRICS = {
  totalValue: 119190,
  capitalBasis: 115000,
  simpleReturnPercent: 3.64,
  investmentReturnPercent: 3.64,
  currencyImpactPercent: 0,
  cumulativeDividends: 0,
  totalDividends: 0,
  positionValue: 119190,
  realizedGain: 0,
  costBasis: 115000,
  unrealizedGainLoss: 4190,
  dayChangeAmount: 0,
  dayChangePercent: 0,
  dayChangeDate: "2026-01-01T00:00:00.000Z",
} as never

async function mountDetail(display: string, detailOverrides: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useDisplayCurrencyStore().currency = display
  mockedPortfolios.getPortfolioDetail.mockResolvedValue({ ...(DETAIL as Record<string, unknown>), ...detailOverrides } as never)
  mockedPortfolios.getPortfolios.mockResolvedValue([])
  mockedPortfolios.getPortfolioTotalMetrics.mockResolvedValue({ totalValue: 0, capitalBasis: 0 } as never)
  mockedPortfolios.getPortfolioSummaryMetrics.mockResolvedValue(METRICS)
  mockedPortfolios.getPortfolioPositions.mockResolvedValue([])
  mockedPortfolios.getPortfolioAnalytics.mockResolvedValue({
    performance: { timeSeries: [] },
    benchmarks: [],
  } as never)
  return mount(PortfolioDetailView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: '<a href="#"><slot /></a>' },
        AddPositionDialog: true,
      },
    },
  })
}

describe("PortfolioDetailView — §48.6e B3 umbrella: summary cards in the display currency", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" })
  })

  it("converts portfolio-base summaryMetrics to the display currency", async () => {
    const wrapper = await mountDetail("USD")
    await flushPromises()

    expect(mockedFx.getLatestRate).toHaveBeenCalledWith("PLN", "USD")
    // 119,190 × 0.25 = 29,797.50 — never "$119,190.00" (the B2 mislabel).
    expect(wrapper.text()).toContain("$29,797.50")
    expect(wrapper.text()).not.toContain("$119,190.00")
    // P/L converted too (4,190 × 0.25 = 1,047.50); return % untouched.
    expect(wrapper.text()).toContain("$1,047.50")
    expect(wrapper.text()).toContain("3.64%")
  })

  it("same-currency portfolio: no FX fetch, values rendered as-is", async () => {
    const wrapper = await mountDetail("PLN")
    await flushPromises()

    expect(mockedFx.getLatestRate).not.toHaveBeenCalled()
    expect(txt(wrapper)).toContain("PLN 119,190.00")
    expect(txt(wrapper)).toContain("PLN 115,000.00")
  })

  it("switching the display currency in place re-converts the cards", async () => {
    const wrapper = await mountDetail("PLN")
    await flushPromises()
    expect(txt(wrapper)).toContain("PLN 119,190.00")

    const pinia = wrapper.vm.$.appContext.app.config.globalProperties.$pinia
    useDisplayCurrencyStore(pinia).currency = "USD"
    await flushPromises()

    expect(wrapper.text()).toContain("$29,797.50")
    expect(txt(wrapper)).not.toContain("PLN 119,190.00")
  })

  it("submits the edited base currency with portfolio settings", async () => {
    const wrapper = await mountDetail("PLN")
    await flushPromises()

    const rename = wrapper.findAll("button").find((button) => button.text() === "Rename")
    await rename!.trigger("click")
    await wrapper.get("#portfolio-settings-name").setValue("Updated portfolio")
    await wrapper.get("#portfolio-settings-currency").setValue("USD")
    await wrapper.get("form").trigger("submit")

    expect(mockedPortfolios.updatePortfolio).toHaveBeenCalledWith("p1", {
      name: "Updated portfolio",
      baseCurrency: "USD",
      cashLegOnTrade: false,
    })
  })
})

// §148 — a virtual portfolio is the SAME detail page as a casual one, minus the
// cash ledger and every transaction/position mutation affordance. The single
// source of that difference is `store.detail.isVirtual`, so each half is asserted
// against the same mount: drop one, and the other should fail.
describe("PortfolioDetailView — §148 virtual detail is read-only", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedFx.getLatestRate.mockResolvedValue({ rate: 0.25, asOf: "2026-08-25" })
  })

  const tabLabels = (wrapper: { get: (s: string) => { findAll: (s: string) => Array<{ text: () => string }> } }) =>
    wrapper.get('nav[aria-label="Portfolio tabs"]').findAll("a").map((a) => a.text())

  const hasAddPosition = (wrapper: { findAll: (s: string) => Array<{ text: () => string }> }) =>
    wrapper.findAll("button").some((b) => b.text() === "Add Position")

  it("virtual: drops the Cash tab but keeps every supported read-only tab", async () => {
    const wrapper = await mountDetail("USD", { isVirtual: true })
    await flushPromises()

    expect(tabLabels(wrapper)).toEqual([
      "Holdings",
      "Transactions",
      "Performance",
      "Allocation",
      "Risk Analysis",
      "Dividends",
      "Calendar",
      "News",
      "Compare",
    ])
  })

  it("casual: keeps the Cash tab in the same position", async () => {
    const wrapper = await mountDetail("USD", { isVirtual: false })
    await flushPromises()

    const labels = tabLabels(wrapper)
    expect(labels).toContain("Cash")
    // Second tab, immediately after Holdings — the ordering is part of parity.
    expect(labels.slice(0, 3)).toEqual(["Holdings", "Cash", "Transactions"])
  })

  it("virtual: hides Add Position, keeps the portfolio-level Rename and Delete", async () => {
    const wrapper = await mountDetail("USD", { isVirtual: true })
    await flushPromises()

    expect(hasAddPosition(wrapper)).toBe(false)
    // The portfolio itself is still manageable — only the ledger is frozen.
    expect(wrapper.findAll("button").some((b) => b.text() === "Rename")).toBe(true)
    expect(wrapper.findAll("button").some((b) => b.text() === "Delete")).toBe(true)
  })

  it("casual: shows Add Position", async () => {
    const wrapper = await mountDetail("USD", { isVirtual: false })
    await flushPromises()

    expect(hasAddPosition(wrapper)).toBe(true)
  })

  it("virtual: the settings dialog is told the portfolio is virtual, so the label is editable", async () => {
    const wrapper = await mountDetail("USD", { isVirtual: true, labelId: "lbl-1" })
    await flushPromises()

    const settings = wrapper.findComponent(PortfolioSettingsDialog)
    expect(settings.props("isVirtual")).toBe(true)
    expect(settings.props("labelId")).toBe("lbl-1")
  })
})
