import { computed, ref } from "vue"
import { describe, expect, it } from "vitest"
import { useTransactionForm, type TransactionFormFields } from "@/composables/useTransactionForm"

function form(fields: Partial<TransactionFormFields>): TransactionFormFields {
  return {
    quantity: "1",
    price: "0",
    fees: 0,
    feesType: "fixed",
    feeCurrency: "USD",
    feeRateSource: "manual",
    feeExchangeRate: "",
    rateSource: "manual",
    exchangeRate: "",
    ...fields,
  }
}

function mount(fields: Partial<TransactionFormFields>, target: string, instrument: string) {
  return useTransactionForm(ref(form(fields)), computed(() => target), instrument)
}

describe("useTransactionForm — fee FX axis", () => {
  it("needs no fee rate when the fee is already in the instrument currency", () => {
    const tf = mount(
      { quantity: "10", price: "100", fees: 4, feeCurrency: "EUR" },
      "USD",
      "EUR",
    )
    expect(tf.feeRateValue.value).toBeNull()
    expect(tf.feeInUsd.value).toBe(4)
    expect(tf.totalCost.value).toBe(1004)
  })

  it("divides a base-currency fee by the trade rate to reach the instrument currency", () => {
    // 19 PLN commission on a USD trade; the sheet writes the PLN fee with an
    // identity rate, so multiplying by the USD/PLN rate would book 91 PLN.
    const tf = mount(
      { quantity: "10", price: "100", fees: 19, feeCurrency: "PLN", feeRateSource: "manual", feeExchangeRate: "1", exchangeRate: "4.7975" },
      "PLN",
      "USD",
    )
    expect(tf.feeRateValue.value).toBeNull() // already in the base
    expect(tf.feeInUsd.value).toBeCloseTo(3.96039604, 8)
    expect(tf.totalCost.value).toBeCloseTo(1003.96039604, 8)
  })

  it("converts a third-currency fee by its own rate to the base, not by the trade rate", () => {
    // Production row 233: 1.25 USD commission on a EUR SAP.DE sale, PLN base.
    const tf = mount(
      { quantity: "5", price: "413.99", fees: 1.25, feeCurrency: "USD", feeExchangeRate: "4.44", exchangeRate: "4.67" },
      "PLN",
      "EUR",
    )
    expect(tf.feeRateValue.value).toBe(4.44)
    expect(tf.feeInUsd.value).toBeCloseTo(1.18843683, 8)
  })

  it("materialises a percentage fee in the transaction currency", () => {
    const tf = mount(
      { quantity: "10", price: "100", fees: 1, feesType: "pct", feeCurrency: "PLN" },
      "PLN",
      "USD",
    )
    expect(tf.feeValue.value).toBe(10)
    expect(tf.feeInUsd.value).toBe(10)
  })
})
