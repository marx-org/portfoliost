<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  createPortfolioTransaction,
  deletePortfolioTransaction,
  getPortfolioTransactions,
  updatePortfolioPosition,
  updatePortfolioTransaction,
} from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency, formatNumber } from "@/utils/format"
import type { PortfolioPositions, PortfolioTransactionsPage } from "@/api/types"

type Tx = PortfolioTransactionsPage["items"][number]
type Position = PortfolioPositions[number]

const props = defineProps<{ open: boolean; portfolioId: string; position: Position | null }>()
const emit = defineEmits<{ (e: "close"): void; (e: "saved"): void }>()

const store = usePortfolioStore()
const walletsStore = useWalletsStore()

const transactions = ref<Tx[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)

const newTx = ref({ date: new Date().toISOString().slice(0, 10), type: "BUY", quantity: "", price: "", fees: "0", cashPortfolio: "" })

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.position) return
    transactions.value = []
    error.value = null
    if (!walletsStore.wallets.length) {
      await walletsStore.fetchAll()
    }
    newTx.value = {
      date: new Date().toISOString().slice(0, 10),
      type: "BUY",
      quantity: "",
      price: "",
      fees: "0",
      cashPortfolio: walletsStore.wallets[0]?.id ?? "",
    }
    await load()
  },
)

async function load() {
  if (!props.position) return
  loading.value = true
  error.value = null
  try {
    const res = await getPortfolioTransactions(props.portfolioId, 1, 50, props.position.id)
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
          displayCurrency: "USD",
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

function totalFor(tx: Tx): number {
  const qty = tx.quantity ?? 0
  const price = tx.price ?? 0
  const fees = tx.fees ?? 0
  const rate = tx.exchangeRate ?? 1
  return qty * price * rate + fees
}

function typeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}

function isSynthetic(tx: Tx): boolean {
  return tx.id === "synthetic"
}

async function updateField(tx: Tx, patch: Partial<Tx>): Promise<void> {
  if (isSynthetic(tx)) {
    Object.assign(tx, patch)
    return
  }
  error.value = null
  try {
    await updatePortfolioTransaction(props.portfolioId, tx.id, patch)
    Object.assign(tx, patch)
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
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to update transaction"
  }
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
    const created = await createPortfolioTransaction(props.portfolioId, {
      type: newTx.value.type,
      symbol: props.position.symbol,
      quantity: Number(newTx.value.quantity),
      price: Number(newTx.value.price),
    })
    transactions.value.push({ ...created, executedAt: new Date(newTx.value.date).toISOString() })
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
    error.value = err instanceof Error ? err.message : "Failed to add transaction"
  } finally {
    saving.value = false
  }
}

async function close() {
  emit("saved")
  await store.fetchPositions(props.portfolioId)
  emit("close")
}

function formatSigned(v: number): string {
  return formatCurrency(v, "USD")
}
</script>

<template>

  <div v-if="open && position" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" @click.self="close">
    <div class="card max-h-[85vh] w-full max-w-3xl overflow-y-auto p-6" role="dialog" aria-modal="true" :aria-label="`Edit ${position.symbol} position`">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Edit {{ position.symbol }} position</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
      </div>

      <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Changes save when you leave a field. On cross-currency rows, type the total your broker charged to set the exchange rate.
      </p>

      <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50">
        <div>
          <p class="text-sm text-slate-600 dark:text-slate-300">Cash in {{ walletsStore.wallets[0]?.name ?? "cash portfolio" }}:</p>
          <p class="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(walletsStore.wallets[0]?.balance ?? 0, walletsStore.wallets[0]?.currency ?? "USD") }}</p>
        </div>
        <div class="flex items-center gap-2">
          <input type="number" class="input !w-32 !py-1.5 text-sm" placeholder="Amount" aria-label="Amount" />
          <button type="button" class="btn-secondary text-sm">Deposit</button>
        </div>
      </div>

      <p v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{{ error }}</p>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-3 py-2 font-medium">Date</th>
              <th class="px-3 py-2 font-medium">Type</th>
              <th class="px-3 py-2 font-medium">Quantity</th>
              <th class="px-3 py-2 font-medium">Price per share</th>
              <th class="px-3 py-2 font-medium">Transaction Fees</th>
              <th class="px-3 py-2 font-medium">Exchange Rate</th>
              <th class="px-3 py-2 font-medium">Total Cost</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="loading"><td colspan="8" class="px-3 py-4 text-center text-slate-500 dark:text-slate-400">Loading...</td></tr>
            <tr v-for="tx in transactions" :key="tx.id">
              <td class="px-3 py-2">
                <span v-if="isSynthetic(tx)" class="text-sm text-slate-700 dark:text-slate-200">{{ fmtDate(tx.executedAt) }}</span>
                <input v-else type="date" class="input !w-auto !px-2 !py-1 text-sm" :value="tx.executedAt.slice(0, 10)" @change="updateField(tx, { executedAt: new Date(($event.target as HTMLInputElement).value).toISOString() })" />
              </td>
              <td class="px-3 py-2 text-slate-700 dark:text-slate-200">{{ typeLabel(tx.type) }}</td>
              <td class="px-3 py-2">
                <input type="number" min="0" step="any" class="input !w-24 !px-2 !py-1 text-right text-sm tabular-nums" :value="tx.quantity" @change="updateField(tx, { quantity: Number(($event.target as HTMLInputElement).value) })" />
              </td>
              <td class="px-3 py-2">
                <span class="inline-flex items-center gap-1">
                  <input type="number" min="0" step="any" class="input !w-24 !px-2 !py-1 text-right text-sm tabular-nums" :value="tx.price" @change="updateField(tx, { price: Number(($event.target as HTMLInputElement).value) })" />
                  <span class="text-xs text-slate-400 dark:text-slate-500">{{ tx.currency || tx.instrumentCurrency || "USD" }}</span>
                </span>
              </td>
              <td class="px-3 py-2">
                <span class="inline-flex items-center gap-1">
                  <input type="number" min="0" step="any" class="input !w-20 !px-2 !py-1 text-right text-sm tabular-nums" :value="tx.fees ?? 0" @change="updateField(tx, { fees: Number(($event.target as HTMLInputElement).value) })" />
                  <span class="text-xs text-slate-400 dark:text-slate-500">{{ tx.currency || tx.instrumentCurrency || "USD" }}</span>
                </span>
              </td>
              <td class="px-3 py-2 text-slate-400 dark:text-slate-500">{{ (tx.exchangeRate ?? 1) === 1 ? "-" : formatNumber(tx.exchangeRate ?? 1, 4) }}</td>
              <td class="px-3 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{{ formatSigned(totalFor(tx)) }}</td>
              <td class="px-3 py-2 text-right">
                <button v-if="!isSynthetic(tx)" type="button" class="text-xs text-red-600 hover:underline" aria-label="Delete Transaction" @click="removeRow(tx)">Delete</button>
              </td>
            </tr>
          </tbody>
          <tfoot class="border-t border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/50">
            <tr>
              <td class="px-3 py-2">
                <input type="date" v-model="newTx.date" class="input !w-auto !px-2 !py-1 text-sm" aria-label="Date" />
              </td>
              <td class="px-3 py-2">
                <select v-model="newTx.type" class="input !w-auto !px-2 !py-1 text-sm" aria-label="Type">
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <input type="number" v-model="newTx.quantity" min="0" step="any" class="input !w-24 !px-2 !py-1 text-right text-sm" aria-label="Quantity" />
              </td>
              <td class="px-3 py-2">
                <span class="inline-flex items-center gap-1">
                  <input type="number" v-model="newTx.price" min="0" step="any" class="input !w-24 !px-2 !py-1 text-right text-sm" aria-label="Price per share" />
                  <span class="text-xs text-slate-400 dark:text-slate-500">{{ position.instrumentCurrency || "USD" }}</span>
                </span>
              </td>
              <td class="px-3 py-2">
                <input type="number" v-model="newTx.fees" min="0" step="any" class="input !w-20 !px-2 !py-1 text-right text-sm" aria-label="Transaction Fees" />
              </td>
              <td class="px-3 py-2">
                <select v-model="newTx.cashPortfolio" class="input !w-40 !px-2 !py-1 text-sm" aria-label="Cash portfolio">
                  <option value="">No linked cash</option>
                  <option v-for="w in walletsStore.wallets" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
              </td>
              <td class="px-3 py-2 text-right">
                <button type="button" class="btn-primary !px-3 !py-1 text-xs" :disabled="saving || !canAdd" @click="addRow">{{ saving ? "Adding..." : "Add" }}</button>
              </td>
              <td class="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="mt-4 flex justify-end">
        <button type="button" class="btn-ghost" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>
