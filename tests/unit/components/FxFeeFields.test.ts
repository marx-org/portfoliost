import { flushPromises, mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getLatestRate = vi.fn()

vi.mock("@/api/fx", () => ({
  getLatestRate: (...args: unknown[]) => getLatestRate(...args),
}))

vi.mock("@/stores/currencies", () => ({
  useCurrenciesStore: () => ({ loaded: true, load: vi.fn(), currencies: [] }),
}))

import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"

const mountWithPinia = (comp: Parameters<typeof mount>[0], props: Record<string, unknown>) =>
  mount(comp, { props: props as never, global: { plugins: [createPinia()] } })

describe("FeeFields (§10a D38)", () => {
  it("emits typed fee values and toggles fixed/pct", async () => {
    const w = mountWithPinia(FeeFields, { fees: "0", feesType: "fixed", feeCurrency: "USD", testid: "tx" })
    expect(w.find('[data-testid="tx-fee-currency"]').exists()).toBe(true)

    await w.find('[data-testid="tx-fees"]').setValue("9.5")
    expect(w.emitted("update:fees")![0]).toEqual([9.5])

    await w.find('[data-testid="tx-fees-toggle"]').trigger("click")
    expect(w.emitted("update:feesType")![0]).toEqual(["pct"])
    // pct mode hides the currency select (prop applied by the parent)
    await w.setProps({ feesType: "pct" } as never)
    expect(w.find('[data-testid="tx-fee-currency"]').exists()).toBe(false)
  })
})

describe("FxRateFields (§10a D39)", () => {
  beforeEach(() => {
    getLatestRate.mockReset()
  })

  it("hides itself when no conversion is needed (from === to)", () => {
    const w = mount(FxRateFields, {
      props: { leg: "Transaction", from: "PLN", to: "PLN", rateSource: "automatic", rate: "" },
    })
    expect(w.find('[data-testid="fx-section"]').exists()).toBe(false)
  })

  it("shows the dated market rate for automatic mode", async () => {
    getLatestRate.mockResolvedValue({ rate: 4.1234, asOf: "2026-08-25" })
    const w = mount(FxRateFields, {
      props: { leg: "Fee", from: "USD", to: "PLN", date: "2026-08-20", rateSource: "automatic", rate: "" },
    })
    await flushPromises()
    expect(getLatestRate).toHaveBeenCalledWith("USD", "PLN", "2026-08-20")
    expect(w.text()).toContain("market rate on 2026-08-20")
    expect(w.text()).toContain("4.1234")
  })

  it("prefills the custom input with the rate suggested for the selected date", async () => {
    getLatestRate.mockResolvedValue({ rate: 4.05, asOf: "2026-08-20" })
    const w = mount(FxRateFields, {
      props: { leg: "Transaction", from: "USD", to: "PLN", date: "2026-08-20", rateSource: "automatic", rate: "" },
    })
    await vi.waitFor(() => expect(w.find('[data-testid="fx-section"]').exists()).toBe(true))
    await flushPromises()
    await w.find('[data-testid="fx-manual"]').trigger("click")
    // parent applies the v-model, prop flips → suggestion prefills the input
    await w.setProps({ rateSource: "manual" })
    expect(w.emitted("update:rate")![0]).toEqual(["4.0500"])
  })

  it("does not overwrite a rate the user already typed", async () => {
    getLatestRate.mockResolvedValue({ rate: 4.05, asOf: "2026-08-20" })
    const w = mount(FxRateFields, {
      props: { leg: "Transaction", from: "USD", to: "PLN", date: "2026-08-20", rateSource: "automatic", rate: "3.9" },
    })
    await vi.waitFor(() => expect(w.find('[data-testid="fx-section"]').exists()).toBe(true))
    await flushPromises()
    await w.find('[data-testid="fx-manual"]').trigger("click")
    expect(w.emitted("update:rate")).toBeUndefined()
  })
})
