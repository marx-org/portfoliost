<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { createPortfolioTransaction } from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"
import FxRateFields from "@/components/FxRateFields.vue"
import DividendFields, { dividendTotals } from "@/components/DividendFields.vue"
import type { PortfolioPositions } from "@/api/types"

const props = defineProps<{
  open: boolean
  portfolioId: string
  position: PortfolioPositions[number] | null
}>()
const emit = defineEmits<{ (e: "close"): void; (e: "saved"): void }>()

const store = usePortfolioStore()
const currenciesStore = useCurrenciesStore()

const perShare = ref(false)
const grossTotal = ref("")
const perShareGross = ref("")
const quantity = ref("")
const taxes = ref("")
const date = ref(new Date().toISOString().slice(0, 10))
const notes = ref("")
const rateSource = ref<"automatic" | "manual">("automatic")
const exchangeRate = ref("")
const suggestion = ref<{ rate: number } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open || !props.position) return
    error.value = null
    busy.value = false
    perShare.value = false
    grossTotal.value = ""
    perShareGross.value = ""
    taxes.value = ""
    date.value = new Date().toISOString().slice(0, 10)
    notes.value = ""
    rateSource.value = "automatic"
    exchangeRate.value = ""
    suggestion.value = null
    quantity.value = String(props.position.quantity ?? 1)
    if (!currenciesStore.loaded) void currenciesStore.load()
  },
)

const txCcy = computed(() => (props.position?.instrumentCurrency ?? props.position?.purchaseCurrency ?? "USD").toUpperCase())
const ccySymbol = computed(() => currenciesStore.info(txCcy.value)?.symbol ?? txCcy.value)
const assetLabel = computed(() => {
  const t = props.position?.assetType
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : "Stock"
})
const totals = computed(() => dividendTotals(perShare.value, grossTotal.value, perShareGross.value, quantity.value, taxes.value))

// The dividend is paid into the portfolio; the FX leg converts the tx currency
// into the portfolio's base currency (§62 — dividends need no wallet).
const portfolioCcy = computed(() => (store.portfolios.find((p) => p.id === props.portfolioId)?.baseCurrency ?? "USD").toUpperCase())
const needsFx = computed(() => portfolioCcy.value !== txCcy.value)

const rate = computed(() => {
  if (!needsFx.value) return 1
  if (rateSource.value === "automatic") return suggestion.value?.rate ?? 1
  return Number(exchangeRate.value) || 0
})
const convertedNet = computed(() => (needsFx.value && rate.value ? totals.value.net * rate.value : null))

const canSubmit = computed(() => totals.value.gross > 0 && !totals.value.taxExceedsGross)

function onSuggestion(r: { rate: number } | null): void {
  suggestion.value = r
}

async function submit(): Promise<void> {
  if (!props.position || !canSubmit.value) return
  busy.value = true
  error.value = null
  try {
    const payload: Parameters<typeof createPortfolioTransaction>[1] = {
      type: "DIVIDEND",
      symbol: props.position.symbol.toUpperCase(),
      quantity: totals.value.quant,
      price: totals.value.price,
      positionId: props.position.id,
      currency: txCcy.value,
      executedAt: date.value ? new Date(`${date.value}T00:00:00Z`).toISOString() : new Date().toISOString(),
      taxes: totals.value.tax > 0 ? totals.value.tax : undefined,
      notes: notes.value.trim() || undefined,
    }
    if (needsFx.value && rateSource.value === "manual" && exchangeRate.value) {
      payload.rateSource = "manual"
      payload.exchangeRate = Number(exchangeRate.value)
    }
    await createPortfolioTransaction(props.portfolioId, payload)
    emit("saved")
    emit("close")
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to record dividend"
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    v-if="open && position"
    class="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/40 p-4 pt-24"
    @click.self="emit('close')"
  >
    <div class="card w-full max-w-md" role="dialog" aria-modal="true" aria-label="Record Dividend">
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700/60">
        <h2 class="text-base font-semibold" data-testid="dividend-title">Record dividend</h2>
        <button type="button" class="btn-ghost px-2 text-slate-400" aria-label="Close modal" @click="emit('close')">
          &times;
        </button>
      </div>

      <div class="p-5">
        <div class="mb-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
          <div class="flex items-center gap-3">
            <img :src="`/api/logos/${position.symbol}`" :alt="position.symbol" class="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 text-sm font-semibold">
                {{ position.symbol }}
                <span class="text-xs font-normal text-slate-500 dark:text-slate-400">({{ position.country || "US" }})</span>
                <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {{ assetLabel }}
                </span>
              </div>
              <p class="truncate text-xs text-slate-500 dark:text-slate-400">{{ position.companyName }}</p>
            </div>
          </div>
          <p class="mt-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500" data-testid="dividend-shares-held">
            Shares held:
            <span class="font-semibold text-slate-900 dark:text-slate-100">{{ position.quantity }}</span>
          </p>
        </div>
        <DividendFields
          testid="dividend"
          :tx-ccy="txCcy"
          :ccy-symbol="ccySymbol"
          :converted-net="needsFx ? convertedNet : null"
          :converted-ccy="needsFx ? portfolioCcy : ''"
          v-model:per-share="perShare"
          v-model:gross-total="grossTotal"
          v-model:per-share-gross="perShareGross"
          v-model:quantity="quantity"
          v-model:taxes="taxes"
          v-model:date="date"
          v-model:notes="notes"
        >
          <template #before-summary>
            <FxRateFields
              leg="Transaction"
              :from="txCcy"
              :to="portfolioCcy"
              :hidden="!needsFx"
              :date="date"
              v-model:rate-source="rateSource"
              v-model:rate="exchangeRate"
              @suggestion="onSuggestion"
              testid="dividend-fx"
            />
          </template>
        </DividendFields>

        <p v-if="error" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      </div>

      <div class="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700/60">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="btn-primary"
          :class="{ 'opacity-50': !canSubmit }"
          :disabled="!canSubmit || busy"
          :data-testid="`dividend-submit`"
          @click="submit"
        >
          {{ busy ? "Recording..." : totals.gross > 0 ? `Record dividend · ${totals.net.toFixed(2)} ${txCcy}` : "Enter a dividend amount" }}
        </button>
      </div>
    </div>
  </div>
</template>