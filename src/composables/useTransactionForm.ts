import { computed, ref, type ComputedRef, type MaybeRef, type Ref } from "vue"
import { toValue } from "vue"
import { type LatestRate } from "@/api/fx"

export interface TransactionFormFields {
  quantity: string
  price: string
  fees: string | number
  feesType: "fixed" | "pct"
  feeCurrency: string
  feeRateSource: "automatic" | "manual"
  feeExchangeRate: string
  rateSource: "automatic" | "manual"
  exchangeRate: string
}

/**
 * @param form          reactive transaction form model
 * @param targetCurrency  payment/wallet currency (e.g. "USD")
 * @param txCurrency    instrument/transaction currency (e.g. "PLN"); defaults to "USD"
 */
export function useTransactionForm(
  form: Ref<TransactionFormFields>,
  targetCurrency: ComputedRef<string | null>,
  txCurrency: MaybeRef<string | null> = null,
) {
  const txSuggestion = ref<LatestRate | null>(null)
  const feeSuggestion = ref<LatestRate | null>(null)

  function onTxSuggestion(r: LatestRate | null) { txSuggestion.value = r }
  function onFeeSuggestion(r: LatestRate | null) { feeSuggestion.value = r }

  /** Resolved instrument currency (e.g. "PLN") */
  const instrCcy = computed(() => (toValue(txCurrency) || "").toUpperCase())

  /** Cost in instrument currency: qty × price */
  const positionCostUSD = computed(() => {
    const qty = Number(form.value.quantity) || 0
    const price = Number(form.value.price) || 0
    return qty * price
  })

  const feeValue = computed(() => {
    const qty = Number(form.value.quantity) || 0
    const price = Number(form.value.price) || 0
    const fees = Number(form.value.fees) || 0
    if (form.value.feesType === "pct") return (qty * price * fees) / 100
    return fees
  })

  /**
   * Exchange rate for the fee currency → instrument currency.
   * null when no conversion needed or rate not yet available.
   */
  const feeRateValue = computed<number | null>(() => {
    if (feeValue.value <= 0) return null
    if (form.value.feeCurrency === instrCcy.value) return null
    if (form.value.feeRateSource === "manual" && form.value.feeExchangeRate) {
      return Number(form.value.feeExchangeRate)
    }
    return feeSuggestion.value?.rate ?? null
  })

  /** Fee expressed in instrument currency */
  const feeInUsd = computed(() => {
    if (form.value.feeCurrency === instrCcy.value) return feeValue.value
    if (feeRateValue.value == null) return null
    return feeValue.value * feeRateValue.value
  })

  /** Total cost in instrument currency (before FX to wallet) */
  const totalCost = computed(() => {
    return positionCostUSD.value + (feeInUsd.value ?? feeValue.value)
  })

  /**
   * Exchange rate: instrument currency → payment/wallet currency.
   * null when instrCcy === targetCurrency (no conversion needed).
   */
  const txRateValue = computed<number | null>(() => {
    const tgt = targetCurrency.value?.toUpperCase() ?? null
    if (!tgt || tgt === instrCcy.value) return null
    if (form.value.rateSource === "manual" && form.value.exchangeRate) {
      return Number(form.value.exchangeRate)
    }
    return txSuggestion.value?.rate ?? null
  })

  /** Cost in wallet/payment currency */
  const positionCostConverted = computed(() => {
    if (txRateValue.value == null) return null
    return positionCostUSD.value * txRateValue.value
  })

  /** Total cost in wallet/payment currency */
  const totalCostConverted = computed(() => {
    if (txRateValue.value == null) return null
    return totalCost.value * txRateValue.value
  })

  return {
    instrCcy,
    txSuggestion,
    feeSuggestion,
    onTxSuggestion,
    onFeeSuggestion,
    positionCostUSD,
    feeValue,
    totalCost,
    txRateValue,
    feeRateValue,
    feeInUsd,
    positionCostConverted,
    totalCostConverted,
  }
}
