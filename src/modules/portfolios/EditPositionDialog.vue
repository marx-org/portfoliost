<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  createPortfolioTransaction,
  deletePortfolioTransaction,
  getPortfolioTransactions,
  updatePortfolioPosition,
} from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency } from "@/utils/format"
import type { PortfolioPositions, PortfolioTransactionsPage } from "@/api/types"
import EditTransactionModal, { type EditTransaction } from "@/modules/portfolios/EditTransactionModal.vue"
import { useCurrenciesStore } from "@/stores/currencies"
import { useTargetCurrency } from "@/composables/useTargetCurrency"
import { useTransactionForm } from "@/composables/useTransactionForm"
import TransactionFormFields from "@/components/TransactionFormFields.vue"

type Tx = PortfolioTransactionsPage["items"][number]
type Position = PortfolioPositions[number]

const props = defineProps<{ open: boolean; portfolioId: string; position: Position | null }>()
const emit = defineEmits<{ (e: "close"): void; (e: "saved"): void }>()

const store = usePortfolioStore()
const currenciesStore = useCurrenciesStore()

const transactions = ref<Tx[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)

const newTx = ref({
  date: new Date().toISOString().slice(0, 10),
  type: "BUY" as "BUY" | "SELL",
  quantity: "",
  price: "",
  fees: "0",
  feesType: "fixed" as "fixed" | "pct",
  feeCurrency: "USD",
  feeRateSource: "automatic" as "automatic" | "manual",
  feeExchangeRate: "",
  rateSource: "automatic" as "automatic" | "manual",
  exchangeRate: "",
})

const portfolioStore = usePortfolioStore()
const targetCurrency = useTargetCurrency(
  computed(() =>
    portfolioStore.portfolios.find((p) => p.id === props.portfolioId)?.baseCurrency ?? null,
  ),
)

const tf = useTransactionForm(
  newTx,
  targetCurrency,
  computed(() => props.position?.instrumentCurrency ?? "USD"),
)

const editingTx = ref<EditTransaction | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.position) return
    transactions.value = []
    error.value = null
    newTx.value = {
      date: new Date().toISOString().slice(0, 10),
      type: "BUY",
      quantity: "",
      price: "",
      fees: "0",
      feesType: "fixed",
      feeCurrency: props.position.instrumentCurrency ?? "USD",
      feeRateSource: "automatic",
      feeExchangeRate: "",
      rateSource: "automatic",
      exchangeRate: "",
    }
    if (!currenciesStore.loaded) void currenciesStore.load()
    await load()
  },
)

async function load() {
  if (!props.position) return
  loading.value = true
  error.value = null
  try {
    const res = await getPortfolioTransactions(props.portfolioId, 1, 50, "date", "desc", props.position.id)
    transactions.value = res.items
    if (!res.items.length) {
      transactions.value = [
        {
          id: "synthetic",
          portfolioId: props.portfolioId,
          positionId: props.position.id,
          type: "BUY",
          instrumentSymbol: props.position.symbol,
          instrumentName: props.position.companyName,
          quantity: props.position.quantity,
          price: props.position.averageCostBasis ?? 0,
          fees: 0,
          totalAmount: (props.position.quantity ?? 0) * (props.position.averageCostBasis ?? 0),
          currency: props.position.instrumentCurrency ?? "USD",
          instrumentCurrency: props.position.instrumentCurrency ?? "USD",
          assetType: props.position.assetType ?? "STOCK",
          exchangeRate: 1,
          isGift: false,
          synthesizedOpeningLot: false,
          executedAt: props.position.openedAt ?? new Date().toISOString(),
          createdAt: props.position.openedAt ?? new Date().toISOString(),
          displayCurrency: props.position.instrumentCurrency ?? "USD",
          convertedTotalAmount: (props.position.quantity ?? 0) * (props.position.averageCostBasis ?? 0),
          convertedPrice: props.position.averageCostBasis ?? 0,
          convertedFees: 0,
          convertedRealizedGainLoss: null,
        } as unknown as Tx,
      ]
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load transactions"
  } finally {
    loading.value = false
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function totalFor(tx: Tx): string {
  const qty = tx.quantity ?? 0
  const price = tx.price ?? 0
  const fees = tx.fees ?? 0
  const rate = tx.exchangeRate ?? 1
  const total = qty * price * rate + fees
  return formatCurrency(total, tx.currency || "USD")
}

function typeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}

function isSynthetic(tx: Tx): boolean {
  return tx.id === "synthetic"
}

function openEditModal(tx: Tx) {
  if (isSynthetic(tx)) return
  editingTx.value = {
    id: tx.id,
    portfolioId: props.portfolioId,
    type: tx.type,
    instrumentSymbol: tx.instrumentSymbol,
    instrumentName: tx.instrumentName ?? "",
    assetType: tx.assetType ?? "STOCK",
    quantity: tx.quantity,
    price: tx.price,
    fees: tx.fees ?? 0,
    currency: tx.currency || "USD",
    executedAt: tx.executedAt,
    feeCurrency: tx.feeCurrency,
    rateSource: tx.rateSource,
    exchangeRate: tx.exchangeRate,
    feeRateSource: tx.feeRateSource,
    feeExchangeRate: tx.feeExchangeRate,
  }
}

function onEditSaved() {
  editingTx.value = null
  load()
}

async function removeRow(tx: Tx): Promise<void> {
  if (isSynthetic(tx)) return
  error.value = null
  try {
    await deletePortfolioTransaction(props.portfolioId, tx.id)
    transactions.value = transactions.value.filter((t) => t.id !== tx.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to delete transaction"
  }
}

const canAdd = computed(() => Number(newTx.value.quantity) > 0 && Number(newTx.value.price) > 0)

async function addRow(): Promise<void> {
  if (!props.position || !canAdd.value) return
  saving.value = true
  error.value = null
  try {
    const input: Parameters<typeof createPortfolioTransaction>[1] = {
      type: newTx.value.type,
      symbol: props.position.symbol,
      quantity: Number(newTx.value.quantity),
      price: Number(newTx.value.price),
      currency: props.position.instrumentCurrency ?? "USD",
      fees: newTx.value.feesType === "pct" ? tf.feeValue.value : Number(newTx.value.fees) || 0,
      feesType: newTx.value.feesType,
    }
    if (newTx.value.feesType === "fixed" && newTx.value.feeCurrency !== (props.position.instrumentCurrency ?? "USD")) {
      input.feeCurrency = newTx.value.feeCurrency
      input.feeRateSource = newTx.value.feeRateSource
      if (newTx.value.feeRateSource === "manual" && newTx.value.feeExchangeRate) {
        input.feeExchangeRate = Number(newTx.value.feeExchangeRate)
      }
    }
    if (newTx.value.rateSource === "manual" && newTx.value.exchangeRate) {
      input.rateSource = "manual"
      input.exchangeRate = Number(newTx.value.exchangeRate)
    }
    const iso = new Date(newTx.value.date).toISOString()
    input.executedAt = iso

    // Optimistic push — row appears instantly while the server processes the request
    const provisionalId = `pending-${Date.now()}`
    transactions.value.push({
      id: provisionalId,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      currency: input.currency,
      fees: input.fees,
      feeCurrency: input.feeCurrency ?? input.currency,
      executedAt: iso,
    } as unknown as Tx)

    try {
      const created = await createPortfolioTransaction(props.portfolioId, input)
      // Swap provisional row with the confirmed server row
      const idx = transactions.value.findIndex((t) => t.id === provisionalId)
      if (idx !== -1) transactions.value.splice(idx, 1)
      transactions.value.push({ ...created, executedAt: iso })
      const position = props.position
      if (position) {
        const open = transactions.value.filter((t) => !isSynthetic(t) && t.type !== "SELL")
        const totalQty = open.reduce((s, t) => s + (t.quantity ?? 0), 0)
        const totalCost = open.reduce((s, t) => s + (t.quantity ?? 0) * (t.price ?? 0) + (t.fees ?? 0), 0)
        const avg = totalQty ? totalCost / totalQty : position.averageCostBasis
        await updatePortfolioPosition(props.portfolioId, position.id, {
          quantity: totalQty || position.quantity,
          averageCostBasis: avg,
          avgCostBasis: avg,
          instrumentAvgCostBasis: avg,
        })
      }
      newTx.value.quantity = ""
      newTx.value.price = ""
      newTx.value.fees = "0"
    } catch (err) {
      // Roll back the optimistic row on failure
      const idx = transactions.value.findIndex((t) => t.id === provisionalId)
      if (idx !== -1) transactions.value.splice(idx, 1)
      error.value = err instanceof Error ? err.message : "Failed to add transaction"
    } finally {
      saving.value = false
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to add transaction"
    saving.value = false
  }
}

async function close() {
  emit("saved")
  await store.fetchPositions(props.portfolioId)
  emit("close")
}
</script>

<template>

  <div v-if="open && position" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" @click.self="close">
    <div class="card max-h-[85vh] w-full max-w-4xl overflow-y-auto p-6" role="dialog" aria-modal="true" :aria-label="`Edit ${position.symbol} position`">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Edit {{ position.symbol }} position</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
      </div>

      <p v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{{ error }}</p>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-3 py-2 font-medium">Date</th>
              <th class="px-3 py-2 font-medium">Type</th>
              <th class="px-3 py-2 font-medium">Qty</th>
              <th class="px-3 py-2 font-medium">Price</th>
              <th class="px-3 py-2 font-medium">Fees</th>
              <th class="px-3 py-2 font-medium">Total Cost</th>
              <th class="px-3 py-2 text-right" colspan="2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="loading"><td colspan="8" class="px-3 py-4 text-center text-slate-500 dark:text-slate-400">Loading...</td></tr>
            <tr v-for="tx in transactions" :key="tx.id">
              <td class="px-3 py-2">
                <span class="text-sm text-slate-700 dark:text-slate-200">{{ fmtDate(tx.executedAt) }}</span>
              </td>
              <td class="px-3 py-2 text-slate-700 dark:text-slate-200">{{ typeLabel(tx.type) }}</td>
              <td class="px-3 py-2 tabular-nums text-slate-900 dark:text-slate-100">{{ tx.quantity }}</td>
              <td class="px-3 py-2 tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(tx.price, tx.currency || "USD") }}</td>
              <td class="px-3 py-2 tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(tx.fees ?? 0, tx.feeCurrency || tx.currency || "USD") }}</td>
              <td class="px-3 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{{ totalFor(tx) }}</td>
              <td class="px-3 py-2 text-right">
                <button v-if="!isSynthetic(tx)" type="button" class="text-xs text-blue-600 hover:underline" @click="openEditModal(tx)">Edit</button>
              </td>
              <td class="px-3 py-2 text-right">
                <button v-if="!isSynthetic(tx)" type="button" class="text-xs text-red-600 hover:underline" aria-label="Delete Transaction" @click="removeRow(tx)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h4 class="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Add Transaction</h4>
        <TransactionFormFields
          :symbol="position.symbol"
          :name="position.companyName ?? ''"
          :asset-type="position.assetType"
          :country="'US'"
          :market-price="position.currentPrice"
          :price-as-of-label="'current price'"
          :target-currency="targetCurrency"
          :tx-currency="position.instrumentCurrency || 'USD'"
          :testid="'edit-position'"
          :show-type="true"
          :show-view-chart="false"
          v-model:form="newTx"
          @submit="addRow"
        >
          <template #footer>
            <div class="mt-3 flex items-center justify-end">
              <button type="submit" class="btn-primary !px-4 !py-1.5 text-sm" :disabled="saving || !canAdd">
                {{ saving ? "Adding..." : "Add Transaction" }}
              </button>
            </div>
          </template>
        </TransactionFormFields>
      </div>

      <div class="mt-4 flex justify-end">
        <button type="button" class="btn-ghost" @click="close">Close</button>
      </div>
    </div>
  </div>

  <EditTransactionModal
    v-if="editingTx"
    :open="editingTx != null"
    :transaction="editingTx"
    @close="editingTx = null"
    @saved="onEditSaved"
  />
</template>
