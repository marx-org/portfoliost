import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import FeeCell from "@/components/FeeCell.vue"

describe("FeeCell (§10.5)", () => {
  it("renders the fee in its own currency", () => {
    const w = mount(FeeCell, { props: { fees: 12.5, feeCurrency: "EUR", fallbackCurrency: "USD" } })
    expect(w.text()).toContain("€12.50")
    expect(w.find('[data-testid="custom-fx-badge"]').exists()).toBe(false)
  })

  it("falls back to transaction currency when no fee currency set", () => {
    const w = mount(FeeCell, { props: { fees: 5, feeCurrency: null, fallbackCurrency: "PLN" } })
    expect(w.text().replace(/\u00A0/g, " ")).toContain("PLN 5.00")
  })

  it("shows the custom fx badge only for manual rates", () => {
    const w = mount(FeeCell, { props: { fees: 1, feeCurrency: "USD", fallbackCurrency: "USD", rateSource: "manual" } })
    expect(w.find('[data-testid="custom-fx-badge"]').exists()).toBe(true)
    const auto = mount(FeeCell, { props: { fees: 1, feeCurrency: "USD", fallbackCurrency: "USD", rateSource: "automatic" } })
    expect(auto.find('[data-testid="custom-fx-badge"]').exists()).toBe(false)
  })

  it("renders an em dash for missing fees", () => {
    const w = mount(FeeCell, { props: { fees: null, fallbackCurrency: "USD" } })
    expect(w.text()).toContain("—")
  })
})
