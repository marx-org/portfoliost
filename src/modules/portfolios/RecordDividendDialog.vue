<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { createPortfolioTransaction } from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { useWalletsStore } from "@/stores/wallets"
import { useCurrenciesStore } from "@/stores/currencies"
import { formatCurrency } from "@/utils/format"
import FxRateFields from "@/components/FxRateFields.vue"
import type { PortfolioPositions } from "@/api/types"

const props = defineProps<{
  open: boolean
  portfolioId: string
  position: PortfolioPositions[number] | null
}>()
const emit = defineEmits<{ (e: "close"): void; (e: "saved"): void }>()

const store = usePortfolioStore()
const walletsStore = useWalletsStore()
const currenciesStore = useCurrenciesStore()

const perShare = ref(false)
const grossTotal = ref("")
const perShareGross = ref("")
const quantity = ref("")
const taxes = ref("")
const date = ref(new Date().toISOString().slice(0, 10))
const notes = ref("")
const walletId = ref("")
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
    if (!walletsStore.wallets.length) void walletsStore.fetchAll()
    const linked = store.portfolios.find((p) => p.id === props.portfolioId)?.walletId
    walletId.value = linked ?? walletsStore.wallets[0]?.id ?? ""
  },
)

const txCcy = computed(() => (props.position?.instrumentCurrency ?? props.position?.purchaseCurrency ?? "USD").toUpperCase())
const quant = computed(() => (perShare.value ? Number(quantity.value) || 0 : Number(props.position?.quantity) || 1))
const gross = computed(() => {
  if (perShare.value) return Math.round((Number(quant.value) * (Number(perShareGross.value) || 0)) * 1e8) / 1e8
  return Math.round((Number(grossTotal.value) || 0) * 1e8) / 1e8
})
const price = computed(() => (quant.value ? gross.value / quant.value : 0))
const tax = computed(() => Math.round((Number(taxes.value) || 0) * 1e8) / 1e8)
const net = computed(() => Math.round((gross.value - tax.value) * 1e8) / 1e8)
const taxExceedsGross = computed(() => gross.value > 0 && tax.value > gross.value)

const wallet = computed(() => walletsStore.wallets.find((w) => w.id === walletId.value))
const walletCcy = computed(() => wallet.value?.currency.toUpperCase() ?? "")
const needsFx = computed(() => Boolean(walletCcy.value) && walletCcy.value !== txCcy.value)

const rate = computed(() => {
  if (!needsFx.value) return 1
  if (rateSource.value === "automatic") return suggestion.value?.rate ?? 1
  return Number(exchangeRate.value) || 0
})
const convertedNet = computed(() => (needsFx.value && rate.value ? net.value * rate.value : null))

const canSubmit = computed(() => gross.value > 0 && !taxExceedsGross.value && !!walletId.value)

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
      quantity: quant.value,
      price: Math.round(price.value * 1e8) / 1e8,
      positionId: props.position.id,
      currency: txCcy.value,
      walletId: walletId.value || undefined,
      executedAt: date.value ? new Date(`${date.value}T00:00:00Z`).toISOString() : new Date().toISOString(),
      taxes: tax.value > 0 ? tax.value : undefined,
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
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-xs font-bold text-blue-600 dark:text-blue-400">
            {{ position.symbol.slice(0, 4) }}
          </div>
          <div>
            <div class="flex items-center gap-2 text-sm font-semibold">
              {{ position.symbol }}
              <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                HOLDING: {{ position.quantity }}
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ position.companyName ?? txCcy }}</p>
          </div>
        </div>
        <button type="button" class="btn-ghost px-2 text-slate-400" aria-label="Close modal" @click="emit('close')">
          &times;
        </button>
      </div>

      <div class="p-5">
        <div class="mb-4 flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/60">
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="!perShare ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'"
            :data-testid="`dividend-mode-total`"
            @click="perShare = false"
          >
            Total Amount
          </button>
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="perShare ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'"
            :data-testid="`dividend-mode-pershare`"
            @click="perShare = true"
          >
            Per Share
          </button>
        </div>

        <label class="mb-1.5 block text-sm font-medium" for="dividend-wallet">Cash portfolio</label>
        <select
          id="dividend-wallet"
          v-model="walletId"
          class="input mb-4"
          :data-testid="`dividend-wallet`"
        >
          <option value="" disabled>Select cash portfolio</option>
          <option v-for="w in walletsStore.wallets" :key="w.id" :value="w.id">
            {{ w.name }} ({{ formatCurrency(w.balance, w.currency) }})
          </option>
        </select>

        <label class="mb-1.5 block text-sm font-medium" for="dividend-shares" v-if="perShare">Shares</label>
        <input
          v-if="perShare"
          id="dividend-shares"
          v-model="quantity"
          type="number"
          min="0"
          step="any"
          class="input mb-4"
          :data-testid="`dividend-shares`"
        />

        <label class="mb-1.5 block text-sm font-medium" for="dividend-gross">
          {{ perShare ? "Dividend per share" : "Gross Dividend Amount" }}
        </label>
        <div class="mb-4">
          <div class="flex items-center gap-2">
            <input
              :id="perShare ? 'dividend-gross-pershare' : 'dividend-gross'"
              :value="perShare ? perShareGross : grossTotal"
              type="number"
              min="0"
              step="any"
              :placeholder="perShare ? 'e.g. 0.85' : '0.00'"
              class="input"
              :data-testid="`dividend-gross`"
              @input="perShare ? (perShareGross = ($event.target as HTMLInputElement).value) : (grossTotal = ($event.target as HTMLInputElement).value)"
            />
            <span class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{{ txCcy }}</span>
          </div>
        </div>

        <label class="mb-1.5 block text-sm font-medium" for="dividend-tax">Withholding Tax</label>
        <div class="mb-1.5">
          <div class="flex items-center gap-2">
            <input
              id="dividend-tax"
              v-model="taxes"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              class="input"
              :data-testid="`dividend-tax`"
            />
            <span class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{{ txCcy }}</span>
          </div>
        </div>
        <p v-if="taxExceedsGross" class="mb-4 text-xs text-red-600 dark:text-red-400" :data-testid="`dividend-tax-error`">
          Withholding tax cannot exceed the gross dividend amount
        </p>

        <label class="mb-1.5 block text-sm font-medium" for="dividend-date">Date received</label>
        <input id="dividend-date" v-model="date" type="date" class="input mb-4" :data-testid="`dividend-date`" />

        <label class="mb-1.5 block text-sm font-medium" for="dividend-notes">Notes (optional)</label>
        <input
          id="dividend-notes"
          v-model="notes"
          type="text"
          placeholder="e.g., Q4 2024 dividend"
          class="input mb-4"
          :data-testid="`dividend-notes`"
        />

        <FxRateFields
          leg="Transaction"
          :from="txCcy"
          :to="walletCcy"
          :hidden="!needsFx"
          :date="date"
          v-model:rate-source="rateSource"
          v-model:rate="exchangeRate"
          @suggestion="onSuggestion"
          testid="dividend-fx"
        />

        <div class="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50" :data-testid="`dividend-summary`">
          <div class="flex justify-between py-0.5">
            <span class="text-slate-500 dark:text-slate-400">Gross Dividend</span>
            <span class="tabular-nums">{{ gross.toFixed(2) }} {{ txCcy }}</span>
          </div>
          <div class="flex justify-between py-0.5">
            <span class="text-slate-500 dark:text-slate-400">Withholding Tax</span>
            <span class="tabular-nums">{{ tax.toFixed(2) }} {{ txCcy }}</span>
          </div>
          <div class="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-semibold dark:border-slate-700/60">
            <span>Net Amount</span>
            <span class="tabular-nums" :data-testid="`dividend-net`">{{ net.toFixed(2) }} {{ txCcy }}</span>
          </div>
          <div v-if="needsFx" class="flex justify-between py-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span>Net ({{ walletCcy }})</span>
            <span class="tabular-nums" :data-testid="`dividend-converted`">
              {{ convertedNet != null ? `${convertedNet.toFixed(2)} ${walletCcy}` : "—" }}
            </span>
          </div>
        </div>

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
          {{ busy ? "Recording..." : gross > 0 ? `Record dividend · ${net.toFixed(2)} ${txCcy}` : "Enter a dividend amount" }}
        </button>
      </div>
    </div>
  </div>
</template>