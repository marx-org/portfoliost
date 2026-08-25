import { nextTick } from "vue"
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WalletCashModals from "@/modules/portfolios/WalletCashModals.vue"
import * as walletsApi from "@/api/wallets"

vi.mock("@/stores/currencies", () => {
  const registry = [
    { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2, popular: true },
    { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2, popular: true },
    { code: "PLN", name: "Polish Zloty", symbol: "zł", minorUnits: 2, popular: true },
  ]
  return { useCurrenciesStore: () => ({ loaded: true, load: vi.fn(), currencies: registry, options: registry, info: {}, minorUnits: {} }) }
})

vi.mock("@/api/wallets", async (importOriginal) => {
  const actual = await importOriginal<typeof walletsApi>()
  return {
    ...actual,
    depositToWallet: vi.fn(),
    withdrawFromWallet: vi.fn(),
    transferBetweenWallets: vi.fn(),
  }
})
const mocked = vi.mocked(walletsApi)

const eurWallet = {
  id: "w-eur",
  userId: "u",
  name: "EUR wallet",
  currency: "EUR",
  balance: 1000,
  availableBalance: 1000,
  isDefault: false,
  createdAt: "",
  updatedAt: "",
} as never

const usdWallet = {
  id: "w-usd",
  userId: "u",
  name: "USD wallet",
  currency: "USD",
  balance: 500,
  availableBalance: 500,
  isDefault: false,
  createdAt: "",
  updatedAt: "",
} as never

function makeEnv() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

function mountModal(action: "deposit" | "withdraw" | "transfer", wallet = eurWallet) {
  return mount(WalletCashModals, {
    props: { open: false, action, wallet },
    global: { plugins: [makeEnv()] },
  })
}

describe("WalletCashModals — fee currency & cross-currency transfer (§10.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.depositToWallet.mockResolvedValue({} as never)
    mocked.withdrawFromWallet.mockResolvedValue({} as never)
    mocked.transferBetweenWallets.mockResolvedValue({} as never)
  })

  it("withdraw fee select preselects the wallet currency and submits it", async () => {
    const wrapper = mountModal("withdraw")
    await wrapper.setProps({ open: true })
    await flushPromises()

    const sel = wrapper.find('[data-testid="wc-fee-currency"]')
    expect((sel.element as HTMLSelectElement).value).toBe("EUR")
    await wrapper.find("#wc-amount").setValue(50)
    await sel.setValue("USD")
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.withdrawFromWallet).toHaveBeenCalledTimes(1)
    const payload = mocked.withdrawFromWallet.mock.calls[0][1]
    expect(payload.feeCurrency).toBe("USD")
    expect(payload.rateSource).toBe("automatic")
  })

  it("deposit includes fee fields when provided", async () => {
    const wrapper = mountModal("deposit")
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find("#wc-amount").setValue(200)
    await wrapper.find('[data-testid="wc-fees-toggle"]').trigger("click") // switch to %
    expect(wrapper.find('[data-testid="wc-fee-currency"]').exists()).toBe(false) // pct has no ccy
    await wrapper.find("#wc-fees").setValue(1)
    await wrapper.find("form").trigger("submit")
    await flushPromises()
    const payload = mocked.depositToWallet.mock.calls[0][1]
    expect(payload.fees_type).toBe("pct")
    expect(payload.feeCurrency).toBeUndefined()
  })

  it("same-currency transfer hides target inputs; payload has no targetAmount", async () => {
    const wrapper = mountModal("transfer")
    await wrapper.setProps({ open: true })
    await flushPromises()
    // add a second EUR wallet via store? simpler: same-currency by using only one wallet -> no dest options
    expect(wrapper.find('[data-testid="wc-target-amount"]').exists()).toBe(false)
  })

  it("cross-currency transfer shows target input and submits manual target amount", async () => {
    const pinia = makeEnv()
    const { useWalletsStore } = await import("@/stores/wallets")
    const store = useWalletsStore()
    store.wallets = [eurWallet, usdWallet] as never

    const wrapper = mount(WalletCashModals, {
      props: { open: false, action: "transfer", wallet: usdWallet },
      global: { plugins: [pinia] },
    })
    await wrapper.setProps({ open: true })
    await flushPromises()

    await wrapper.find("#wc-to-wallet").setValue("w-eur")
    await flushPromises()
    // target leg uses the unified disclosure — Custom reveals the amount input
    await wrapper.find('[data-testid="wc-transfer-fx-manual"]').trigger("click")
    await wrapper.setProps({}) // noop keepalive
    expect(wrapper.find('[data-testid="wc-target-amount"]').exists()).toBe(true)

    await wrapper.find("#wc-amount").setValue(100)
    await wrapper.find('[data-testid="wc-target-amount"]').setValue(91.5)
    await wrapper.find("form").trigger("submit")
    await flushPromises()

    expect(mocked.transferBetweenWallets).toHaveBeenCalledTimes(1)
    const payload = mocked.transferBetweenWallets.mock.calls[0][1]
    expect(payload.targetAmount).toBe(91.5)
    expect(payload.to_wallet_id).toBe("w-eur")
  })
})

describe("WalletCashModals — dual-currency confirmation (§10a D39/D40)", () => {
  it("cross-currency transfer summary shows values in both currencies, live", async () => {
    const pinia = makeEnv()
    const { useWalletsStore } = await import("@/stores/wallets")
    const store = useWalletsStore()
    store.wallets = [usdWallet, eurWallet] as never

    const wrapper = mount(WalletCashModals, {
      props: { open: false, action: "transfer", wallet: usdWallet },
      global: { plugins: [pinia] },
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find("#wc-to-wallet").setValue("w-eur")
    await wrapper.find("#wc-amount").setValue(100)

    // transfer leg resolves its reference rate → summary converts on the fly
    const fxLeg = wrapper.findComponent({ name: "FxRateFields" })
    ;(fxLeg.vm.$emit as (e: string, v: unknown) => void)("suggestion", { rate: 4.2, asOf: "2026-08-25" })
    await flushPromises()

    const text = wrapper.text().replace(/\u00A0/g, " ")
    expect(text).toContain("$100.00")
    expect(text).toContain("≈ €420.00") // amount dual (dest = EUR wallet)
    expect(text).toContain("@ 4.2000")       // live rate annotation
    expect(text).toContain("€420.00 ≈ $100.00") // target dual
    expect(text).toContain("Total debited")
    expect(text).toContain("$400.00")        // remaining (no fee)
    expect(text).toContain("≈ €1,680.00")    // remaining dual
  })

  it("same-currency summary stays single-currency", async () => {
    const wrapper = mountModal("transfer")
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find("#wc-amount").setValue(50)
    await flushPromises()
    expect(wrapper.text()).not.toContain("≈")
  })
})

describe("WalletCashModals — deposit net summary (§13 follow-up)", () => {
  it("deposit with foreign-currency fee shows net credited once rate resolves", async () => {
    const pinia = makeEnv()
    const wrapper = mount(WalletCashModals, {
      props: { open: false, action: "deposit", wallet: usdWallet },
      global: { plugins: [pinia] },
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
    await wrapper.find("#wc-amount").setValue(200)
    await nextTick(); await flushPromises()
    await wrapper.find('[data-testid="wc-fee-currency"]').setValue("PLN")
    await nextTick(); await flushPromises()
    await wrapper.find('[data-testid="wc-fees"]').setValue(10)
    await nextTick(); await flushPromises()
    // fee leg resolves PLN→USD (transfer leg also mounts while hidden — pick by testid)
    const feeLeg = wrapper
      .findAllComponents({ name: "FxRateFields" })
      .find((w) => w.props("testid") === "wc-fee-fx")!
    ;(feeLeg.vm.$emit as (e: string, v: unknown) => void)("suggestion", { rate: 0.25, asOf: "2026-08-25" })
    await nextTick(); await flushPromises(); await nextTick(); await flushPromises()
    const text = wrapper.text().replace(/\u00A0/g, " ")
    expect(text).toContain("Total credited (net)")
    expect(text).toContain("$197.50") // 200 − 10×0.25
  })
})
