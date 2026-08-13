<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { updatePortfolioTransaction } from "@/api/portfolios"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency, formatDate } from "@/utils/format"
import { researchSymbol } from "@/utils/research"

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
  walletId?: string
  executedAt: string
}

const props = defineProps<{
  open: boolean
  transaction: EditTransaction | null
}>()

const emit = defineEmits<{ (e: "close"): void; (e: "saved"): void }>()

const router = useRouter()
const walletsStore = useWalletsStore()

const executedAt = ref("")
const walletId = ref("")
const quantity = ref(0)
const price = ref(0)
const fees = ref(0)
const feesType = ref<"fixed" | "pct">("fixed")
const busy = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open && props.transaction) {
      executedAt.value = (props.transaction.executedAt || new Date().toISOString()).slice(0, 10)
      walletId.value = props.transaction.walletId || walletsStore.wallets[0]?.id || ""
      quantity.value = props.transaction.quantity
      price.value = props.transaction.price
      fees.value = props.transaction.fees ?? 0
      feesType.value = "fixed"
      busy.value = false
      error.value = null
      if (!walletsStore.wallets.length) {
        walletsStore.fetchAll().then(() => {
          if (!walletId.value) walletId.value = walletsStore.wallets[0]?.id || ""
        })
      }
    }
  },
)

const currencySymbol = computed(() => {
  const c = props.transaction?.currency ?? "USD"
  if (c === "USD") return "$"
  if (c === "EUR") return "€"
  if (c === "GBP") return "£"
  return c
})

const feeValue = computed(() => {
  if (feesType.value === "pct") return (quantity.value * price.value * (fees.value || 0)) / 100
  return fees.value || 0
})

const totalCost = computed(() => quantity.value * price.value + feeValue.value)

function typeLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase()
}

async function submit() {
  if (!props.transaction) return
  busy.value = true
  error.value = null
  try {
    await updatePortfolioTransaction(props.transaction.portfolioId, props.transaction.id, {
      type: props.transaction.type,
      quantity: quantity.value,
      price: price.value,
      fees: feeValue.value,
      executedAt: new Date(executedAt.value).toISOString(),
      walletId: walletId.value || undefined,
      feesType: feesType.value,
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
  router.push({ name: "research-overview", params: { symbol: researchSymbol(props.transaction.instrumentSymbol) } })
}
</script>

<template>
  <div
    v-if="open && transaction"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.self="emit('close')"
  >
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Edit transaction">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Edit {{ typeLabel(transaction.type) }} Transaction</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>

      <div class="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
        <img
          :src="`/api/logos/${transaction.instrumentSymbol}`"
          :alt="transaction.instrumentSymbol"
          class="h-9 w-9 shrink-0 rounded-full bg-slate-100"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-slate-900">
            {{ transaction.instrumentSymbol }}
            <span class="text-xs font-normal text-slate-400">(US)</span>
            <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
              {{ typeLabel(transaction.assetType || "STOCK") }}
            </span>
          </p>
          <p class="truncate text-xs text-slate-500">{{ transaction.instrumentName || "—" }}</p>
        </div>
        <div class="shrink-0 text-right">
          <button type="button" class="text-xs text-blue-600 hover:underline" @click="goResearch">View chart</button>
          <p class="text-sm font-medium tabular-nums text-slate-900">{{ formatCurrency(transaction.price, transaction.currency) }}</p>
          <p class="text-[11px] text-slate-400">Historical Price ({{ formatDate(transaction.executedAt) }})</p>
        </div>
      </div>

      <form @submit.prevent="submit">
        <label for="etx-date" class="mb-1 block text-sm text-slate-600">Purchase Date</label>
        <input id="etx-date" v-model="executedAt" type="date" required class="input mb-4" />

        <label for="etx-wallet" class="mb-1 block text-sm text-slate-600">Cash portfolio</label>
        <select id="etx-wallet" v-model="walletId" class="input mb-4">
          <option v-for="w in walletsStore.wallets" :key="w.id" :value="w.id">
            {{ w.name }} ({{ formatCurrency(w.balance, w.currency) }})
          </option>
        </select>

        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label for="etx-quantity" class="mb-1 block text-sm text-slate-600">Quantity</label>
            <input id="etx-quantity" v-model.number="quantity" type="number" min="0" step="any" required class="input" />
          </div>
          <div>
            <label for="etx-price" class="mb-1 block text-sm text-slate-600">Price per share ($)</label>
            <input id="etx-price" v-model.number="price" type="number" min="0" step="0.01" required class="input" />
          </div>
        </div>

        <label for="etx-fees" class="mb-1 block text-sm text-slate-600">Transaction Fees</label>
        <div class="mb-4 flex gap-2">
          <div class="flex flex-1 items-center rounded-lg border border-slate-300 focus-within:border-blue-500">
            <span class="pl-3 text-sm text-slate-500">{{ feesType === "fixed" ? currencySymbol : "%" }}</span>
            <input
              id="etx-fees"
              v-model.number="fees"
              type="number"
              min="0"
              step="0.01"
              class="input !rounded-l-none !border-0 !ring-0 focus:ring-0"
            />
          </div>
          <button
            type="button"
            class="btn-secondary shrink-0 text-sm"
            :class="feesType === 'pct' ? 'bg-slate-200 text-slate-900' : ''"
            @click="feesType = feesType === 'fixed' ? 'pct' : 'fixed'"
          >
            {{ feesType === "fixed" ? "$" : "%" }}
          </button>
        </div>

        <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
          <span class="text-sm text-slate-600">Total Cost</span>
          <span class="text-sm font-semibold tabular-nums text-slate-900">{{ formatCurrency(totalCost, transaction.currency) }}</span>
        </div>

        <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="busy || !Number(quantity)">
            {{ busy ? "Saving..." : "Save" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
