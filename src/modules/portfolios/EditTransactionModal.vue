<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { updatePortfolioTransaction } from "@/api/portfolios"
import { formatCurrency, formatDate } from "@/utils/format"
import { researchRoute } from "@/utils/research"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import DividendFields, { dividendTotals } from "@/components/DividendFields.vue"
import { useCurrenciesStore } from "@/stores/currencies"
import { usePortfolioStore } from "@/stores/portfolios"
import { useTargetCurrency } from "@/composables/useTargetCurrency"

export interface EditTransaction {
  id: string
  portfolioId: string
  type: string
  instrumentSymbol: string
  instrumentName: string
  assetType: string
  quantity: number
  price: number
  fees: number | null
  currency: string
  executedAt: string
  feeCurrency?: string | null
  rateSource?: "automatic" | "manual" | null
  exchangeRate?: number | null
  feeRateSource?: "automatic" | "manual" | null
  feeExchangeRate?: number | null
  taxes?: number | null
  notes?: string | null
}

const props = defineProps<{
  open: boolean
  transaction: EditTransaction | null
}>()

const emit = defineEmits<{ (e: "close"): void; (e: "saved"): void }>()

const route = useRoute()
const router = useRouter()
const currenciesStore = useCurrenciesStore()

const executedAt = ref("")
const quantity = ref(0)
const price = ref(0)
const fees = ref(0)
const feesType = ref<"fixed" | "pct">("fixed")
const feeCurrency = ref("USD")
const rateSource = ref<"automatic" | "manual">("automatic")
const exchangeRate = ref("")
const feeRateSource = ref<"automatic" | "manual">("automatic")
const feeExchangeRate = ref("")
const taxes = ref("")
const notes = ref("")
const perShare = ref(false)
const grossInput = ref("")
const perShareInput = ref("")
const quantityStr = ref("")

const portfolioStore = usePortfolioStore()
const targetCurrency = useTargetCurrency(
  computed(() =>
    portfolioStore.portfolios.find((p) => p.id === props.transaction?.portfolioId)?.baseCurrency ?? null,
  ),
)
const busy = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open && props.transaction) {
      executedAt.value = (props.transaction.executedAt || new Date().toISOString()).slice(0, 10)
      quantity.value = props.transaction.quantity
      price.value = props.transaction.price
      fees.value = props.transaction.fees ?? 0
      feesType.value = "fixed"
      feeCurrency.value = props.transaction.feeCurrency || props.transaction.currency || ""
      rateSource.value = props.transaction.rateSource === "manual" ? "manual" : "automatic"
      exchangeRate.value = props.transaction.exchangeRate != null ? String(props.transaction.exchangeRate) : ""
      feeRateSource.value = props.transaction.feeRateSource === "manual" ? "manual" : "automatic"
      feeExchangeRate.value = props.transaction.feeExchangeRate != null ? String(props.transaction.feeExchangeRate) : ""
      taxes.value = String(props.transaction.taxes ?? 0)
      notes.value = props.transaction.notes ?? ""
      perShare.value = false
      grossInput.value = String(Math.round(props.transaction.quantity * props.transaction.price * 1e8) / 1e8)
      perShareInput.value = String(props.transaction.price)
      quantityStr.value = String(props.transaction.quantity)
      if (!currenciesStore.loaded) void currenciesStore.load()
      busy.value = false
      error.value = null
    }
  },
  { immediate: true },
)

const feeValue = computed(() => {
  if (feesType.value === "pct") return (quantity.value * price.value * (fees.value || 0)) / 100
  return fees.value || 0
})

const totalCost = computed(() => quantity.value * price.value + feeValue.value)

const isDividend = computed(() => props.transaction?.type === "DIVIDEND")
const dTotals = computed(() => dividendTotals(perShare.value, grossInput.value, perShareInput.value, quantityStr.value, taxes.value))
const taxExceedsGross = computed(() => (isDividend.value ? dTotals.value.taxExceedsGross : false))
const ccySymbol = computed(() => {
  const ccy = (props.transaction?.currency ?? "").toUpperCase()
  return currenciesStore.info(ccy)?.symbol ?? ccy
})

function typeLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase()
}

async function submit() {
  if (!props.transaction) return
  if (taxExceedsGross.value) {
    error.value = "Withholding tax cannot exceed the gross dividend amount"
    return
  }
  busy.value = true
  error.value = null
  try {
    await updatePortfolioTransaction(props.transaction.portfolioId, props.transaction.id, {
      type: props.transaction.type,
      quantity: isDividend.value ? dTotals.value.quant : quantity.value,
      price: isDividend.value ? dTotals.value.price : price.value,
      fees: feeValue.value,
      executedAt: new Date(executedAt.value).toISOString(),
      feesType: feesType.value,
      feeCurrency: feesType.value === "fixed" ? feeCurrency.value : undefined,
      rateSource: rateSource.value,
      exchangeRate:
        rateSource.value === "manual" && exchangeRate.value ? Number(exchangeRate.value) : undefined,
      feeRateSource:
        feesType.value === "fixed" && feeCurrency.value !== props.transaction.currency
          ? feeRateSource.value
          : undefined,
      feeExchangeRate:
        feesType.value === "fixed" &&
        feeCurrency.value !== props.transaction.currency &&
        feeRateSource.value === "manual" &&
        feeExchangeRate.value
          ? Number(feeExchangeRate.value)
          : undefined,
      ...(isDividend.value ? { taxes: dTotals.value.tax, notes: notes.value.trim() } : {}),
    })
    emit("saved")
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to update transaction"
  } finally {
    busy.value = false
  }
}

function goResearch() {
  if (!props.transaction) return
  emit("close")
  router.push(researchRoute(props.transaction.instrumentSymbol, route.fullPath))
}
</script>

<template>

  <div
    v-if="open && transaction"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.self="emit('close')"
  >
    <div class="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Edit transaction">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Edit {{ typeLabel(transaction.type) }} Transaction</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>

      <div class="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <img
          :src="`/api/logos/${transaction.instrumentSymbol}`"
          :alt="transaction.instrumentSymbol"
          class="h-9 w-9 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-slate-900 dark:text-slate-100">
            {{ transaction.instrumentSymbol }}
            <span v-if="!isDividend" class="text-xs font-normal text-slate-400 dark:text-slate-500">(US)</span>
            <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {{ typeLabel(transaction.assetType || "STOCK") }}
            </span>
          </p>
          <p class="truncate text-xs text-slate-500 dark:text-slate-400">{{ transaction.instrumentName || "—" }}</p>
          <p v-if="isDividend" class="mt-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500" data-testid="edit-tx-shares-held">
            Shares:
            <span class="font-semibold text-slate-900 dark:text-slate-100">{{ quantityStr }}</span>
          </p>
        </div>
        <div v-if="!isDividend" class="shrink-0 text-right">
          <button type="button" class="text-xs text-blue-600 hover:underline" @click="goResearch">View chart</button>
          <p class="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(transaction.price, transaction.currency) }}</p>
          <p class="text-[11px] text-slate-400 dark:text-slate-500">Historical Price ({{ formatDate(transaction.executedAt) }})</p>
        </div>
      </div>

      <form @submit.prevent="submit">
        <template v-if="isDividend">
          <DividendFields
            testid="edit-tx"
            :tx-ccy="transaction.currency"
            :ccy-symbol="ccySymbol"
            v-model:per-share="perShare"
            v-model:gross-total="grossInput"
            v-model:per-share-gross="perShareInput"
            v-model:quantity="quantityStr"
            v-model:taxes="taxes"
            v-model:date="executedAt"
            v-model:notes="notes"
          >
            <template #after-toggle>
          </template>
          <template #before-summary>
              <FxRateFields
                leg="Transaction"
                :from="transaction.currency"
                :to="targetCurrency"
                :date="executedAt"
                v-model:rate-source="rateSource"
                v-model:rate="exchangeRate"
                testid="edit-tx-fx"
              />
            </template>
          </DividendFields>
        </template>

        <template v-else>
          <label for="etx-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Purchase Date</label>
          <input id="etx-date" v-model="executedAt" type="date" required class="input mb-4" />

          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label for="etx-quantity" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Quantity</label>
              <input id="etx-quantity" v-model.number="quantity" type="number" min="0" step="any" required class="input" />
            </div>
            <div>
              <label for="etx-price" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Price per share ($)</label>
              <input id="etx-price" v-model.number="price" type="number" min="0" step="any" required class="input" />
            </div>
          </div>

          <label for="etx-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Fees</label>
          <FeeFields
            v-model:fees="fees"
            v-model:fees-type="feesType"
            v-model:fee-currency="feeCurrency"
            testid="edit-tx"
            input-id="etx-fees"
          />

          <FxRateFields
            leg="Transaction"
            :from="transaction.currency"
            :to="targetCurrency"
            :date="executedAt"
            v-model:rate-source="rateSource"
            v-model:rate="exchangeRate"
            testid="edit-tx-fx"
          />

          <FxRateFields
            leg="Fee"
            :from="feeCurrency"
            :to="transaction.currency"
            :date="executedAt"
            :hidden="feesType !== 'fixed' || feeCurrency === transaction.currency"
            v-model:rate-source="feeRateSource"
            v-model:rate="feeExchangeRate"
            testid="edit-tx-fee-fx"
          />

          <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <span class="text-sm text-slate-600 dark:text-slate-300">Total Cost</span>
            <span class="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(totalCost, transaction.currency) }}</span>
          </div>
        </template>

        <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="busy || taxExceedsGross || (isDividend ? !Number(quantityStr) : !Number(quantity))">
            {{ busy ? "Saving..." : "Save" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
