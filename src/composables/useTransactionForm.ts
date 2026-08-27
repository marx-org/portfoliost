import { computed, ref, type ComputedRef, type Ref } from "vue"
import { type LatestRate } from "@/api/fx"

const TX_CCY = "USD"

export interface TransactionFormFields {
  quantity: string
  price: string
  fees: string
  feesType: "fixed" | "pct"
  feeCurrency: string
  feeRateSource: "automatic" | "manual"
  feeExchangeRate: string
  rateSource: "automatic" | "manual"
  exchangeRate: string
}

export function useTransactionForm(
  form: Ref<TransactionFormFields>,
  targetCurrency: ComputedRef<string | null>,
) {
  const txSuggestion = ref<LatestRate | null>(null)
  const feeSuggestion = ref<LatestRate | null>(null)

  function onTxSuggestion(r: LatestRate | null) { txSuggestion.value = r }
  function onFeeSuggestion(r: LatestRate | null) { feeSuggestion.value = r }

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

  const feeRateValue = computed<number | null>(() => {
    if (feeValue.value <= 0) return null
    if (form.value.feeCurrency === TX_CCY) return 1
    if (form.value.feeRateSource === "manual" && form.value.feeExchangeRate) {
      return Number(form.value.feeExchangeRate)
    }
    return feeSuggestion.value?.rate ?? null
  })

  const feeInUsd = computed(() => {
    if (form.value.feeCurrency === TX_CCY) return feeValue.value
    if (feeRateValue.value == null) return null
    return feeValue.value * feeRateValue.value
  })

  const totalCost = computed(() => {
    return positionCostUSD.value + (feeInUsd.value ?? feeValue.value)
  })

  const txRateValue = computed<number | null>(() => {
    if (targetCurrency.value === TX_CCY) return null
    if (form.value.rateSource === "manual" && form.value.exchangeRate) {
      return Number(form.value.exchangeRate)
    }
    return txSuggestion.value?.rate ?? null
  })

  const positionCostConverted = computed(() => {
    if (txRateValue.value == null) return null
    return positionCostUSD.value * txRateValue.value
  })

  const totalCostConverted = computed(() => {
    if (txRateValue.value == null) return null
    return totalCost.value * txRateValue.value
  })

  return {
    TX_CCY,
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
