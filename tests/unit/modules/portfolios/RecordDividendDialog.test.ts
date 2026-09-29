import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RecordDividendDialog from "@/modules/portfolios/RecordDividendDialog.vue"
import { usePortfolioStore } from "@/stores/portfolios"
import * as portfoliosApi from "@/api/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "p1" } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof portfoliosApi>()
  return {
    ...actual,
    createPortfolioTransaction: vi.fn(),
  }
})

vi.mock("@/api/fx", () => ({
  getLatestRate: vi.fn().mockResolvedValue({ rate: 4.35, asOf: "2026-08-25" }),
}))

const mocked = vi.mocked(portfoliosApi)

const registry = [
  { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
  { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
]

const POSITION = {
  id: "pos-1",
  portfolioId: "p1",
  symbol: "AAPL",
  companyName: "Apple Inc",
  assetType: "STOCK",
  country: "US",
  instrumentCurrency: "USD",
  purchaseCurrency: "USD",
  quantity: 10,
} as never

function makeEnv(baseCurrency = "USD") {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCurrenciesStore()
  store.currencies = registry
  store.loaded = true
  const portfolios = usePortfolioStore()
  portfolios.portfolios = [{ id: "p1", baseCurrency }] as never
  return { pinia }
}

async function openDialog(env = makeEnv()) {
  const wrapper = mount(RecordDividendDialog, {
    props: { open: false, portfolioId: "p1", position: POSITION },
    global: { plugins: [env.pinia] },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}

describe("RecordDividendDialog (§49.4)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocked.createPortfolioTransaction.mockResolvedValue({} as never)
  })

  it("defaults the receive date to today and shows no wallet picker (§62)", async () => {
    const wrapper = await openDialog()
    expect(wrapper.find('[data-testid="dividend-wallet"]').exists()).toBe(false)
  })

  it("title + header card parity: title, logo, country, asset pill, shares held (§50.2)", async () => {
    const wrapper = await openDialog()
    expect(wrapper.find('[data-testid="dividend-title"]').text()).toBe("Record dividend")
    const held = wrapper.find('[data-testid="dividend-shares-held"]')
    expect(held.text()).toContain("Shares held:")
    expect(held.text()).toContain("10")
    // §61.9 — the shared identity block, on the testids
    const badge = wrapper.get('[data-testid="ticker-badge"]')
    expect(badge.find("img").attributes("src")).toBe("/api/logos/AAPL")
    expect(badge.get('[data-testid="ticker-badge-details"]').text()).toBe("(US) Stock")
    expect(badge.get('[data-testid="ticker-badge-name"]').text()).toBe("Apple Inc")
  })

  it("total mode — net = gross − tax; submit posts DIVIDEND with taxes+notes (§49.4)", async () => {
    const wrapper = await openDialog()

    await wrapper.find('[data-testid="dividend-gross"]').setValue("200")
    await wrapper.find('[data-testid="dividend-tax"]').setValue("30")
    await wrapper.find('[data-testid="dividend-notes"]').setValue("Q4 div")
    await wrapper.find('[data-testid="dividend-submit"]').trigger("click")
    await flushPromises()

    expect(mocked.createPortfolioTransaction).toHaveBeenCalledTimes(1)
    const payload = mocked.createPortfolioTransaction.mock.calls[0][1]
    expect(payload).toMatchObject({
      type: "DIVIDEND",
      symbol: "AAPL",
      quantity: 10, // held shares
      price: 20, // gross per share (200/10)
      positionId: "pos-1",
      currency: "USD",
      taxes: 30,
      notes: "Q4 div",
    })
    const wrapper0 = wrapper.emitted("saved")
    expect(wrapper0).toBeTruthy()
  })

  it("total mode — net summary reflects gross − tax", async () => {
    const wrapper = await openDialog()
    await wrapper.find('[data-testid="dividend-gross"]').setValue("200")
    await wrapper.find('[data-testid="dividend-tax"]').setValue("50")
    expect(wrapper.find('[data-testid="dividend-net"]').text()).toContain("150.00")
  })

  it("summary parity — tax row minus-signed + red, net row green (§50.4)", async () => {
    const wrapper = await openDialog()
    await wrapper.find('[data-testid="dividend-gross"]').setValue("200")
    await wrapper.find('[data-testid="dividend-tax"]').setValue("30")
    const taxRow = wrapper.find('[data-testid="dividend-tax-total"]')
    expect(taxRow.text()).toBe("-30.00 USD")
    expect(taxRow.classes().join(" ")).toContain("text-red-600")
    const netRow = wrapper.find('[data-testid="dividend-net"]')
    expect(netRow.text()).toBe("170.00 USD")
    expect(netRow.classes().join(" ")).toContain("text-green-600")
  })

  it("per-share mode — gross = quantity × per share; submit posts per-share math", async () => {
    const wrapper = await openDialog()
    await wrapper.find('[data-testid="dividend-mode-pershare"]').trigger("click")
    await wrapper.find('[data-testid="dividend-gross"]').setValue("3")
    await wrapper.find('[data-testid="dividend-shares"]').setValue("10")
    await wrapper.find('[data-testid="dividend-submit"]').trigger("click")
    await flushPromises()

    const payload = mocked.createPortfolioTransaction.mock.calls[0][1]
    expect(payload).toMatchObject({
      quantity: 10,
      price: 3,
      taxes: undefined,
      notes: undefined,
    })
    expect(wrapper.find('[data-testid="dividend-net"]').text()).toContain("30.00")
  })

  it("per-share mode — two-column row prefilled with held shares; notes is a textarea (§50.3)", async () => {
    const wrapper = await openDialog()
    await wrapper.find('[data-testid="dividend-mode-pershare"]').trigger("click")
    expect(wrapper.text()).toContain("Dividend per share")
    expect(wrapper.text()).toContain("Shares receiving dividend")
    expect((wrapper.find('[data-testid="dividend-shares"]').element as HTMLInputElement).value).toBe("10")
    const notes = wrapper.find("textarea")
    expect(notes.exists()).toBe(true)
    expect(notes.attributes("data-testid")).toBe("dividend-notes")
  })

  it("total mode — currency symbol prefix from the registry on money inputs (§50.3)", async () => {
    const wrapper = await openDialog()
    expect(wrapper.find("div.relative span").text()).toBe("$")
  })

  it("tax > gross → client-side error, submit blocked (§49.4)", async () => {
    const wrapper = await openDialog()
    await wrapper.find('[data-testid="dividend-gross"]').setValue("100")
    await wrapper.find('[data-testid="dividend-tax"]').setValue("150")
    expect(wrapper.find('[data-testid="dividend-tax-error"]').exists()).toBe(true)
    expect((wrapper.find('[data-testid="dividend-submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it("no gross amount → submit disabled with example-service label (§49.4)", async () => {
    const wrapper = await openDialog()
    const btn = wrapper.find('[data-testid="dividend-submit"]')
    expect(btn.text()).toContain("Enter a dividend amount")
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it("cross-currency — converts net into the portfolio base currency via manual rate (§49.4)", async () => {
    const wrapper = await openDialog(makeEnv("PLN"))
    await wrapper.find('[data-testid="dividend-gross"]').setValue("200")
    await wrapper.find('[data-testid="dividend-tax"]').setValue("20")
    await wrapper.find('[data-testid="dividend-fx-manual"]').trigger("click")
    const rateInput = wrapper.find('[data-testid="dividend-fx-rate"]')
    await rateInput.setValue("4.5")
    await wrapper.find('[data-testid="dividend-submit"]').trigger("click")
    await flushPromises()

    expect(wrapper.find('[data-testid="dividend-converted"]').text()).toContain("810.00") // 180 × 4.5

    const payload = mocked.createPortfolioTransaction.mock.calls[0][1]
    expect(payload).toMatchObject({
      rateSource: "manual",
      exchangeRate: 4.5,
    })
  })
})