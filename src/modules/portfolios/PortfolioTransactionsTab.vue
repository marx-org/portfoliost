<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioTransactions, deletePortfolioTransaction } from "@/api/portfolios"
import { formatCurrency, formatDate, formatNumber } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import type { PortfolioTransactionsPage } from "@/api/types"
import EditTransactionModal from "@/modules/portfolios/EditTransactionModal.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"

type Tx = PortfolioTransactionsPage["items"][number]

const route = useRoute()
const id = String(route.params.id)
const transactions = ref<Tx[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const editing = ref<Tx | null>(null)

const deleteTarget = ref<Tx | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

async function load(targetPage = page.value) {
  loading.value = true
  error.value = null
  try {
    const res = await getPortfolioTransactions(id, targetPage, 20)
    transactions.value = res.items
    total.value = res.total
    page.value = res.page
    totalPages.value = res.totalPages
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load transactions"
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

function typeClass(type: string): string {
  const t = type.toUpperCase()
  if (t === "BUY") return "bg-green-50 text-green-700"
  if (t === "SELL") return "bg-red-50 text-red-700"
  return "bg-slate-100 text-slate-600"
}

function openEdit(tx: Tx) {
  editing.value = tx
}

function onEditSaved() {
  editing.value = null
  notice.value = "Transaction updated"
  load()
}

function openDelete(tx: Tx) {
  deleteTarget.value = tx
  deleteError.value = null
}

async function submitDelete() {
  if (!deleteTarget.value) return
  deleteBusy.value = true
  deleteError.value = null
  const target = deleteTarget.value
  try {
    await deletePortfolioTransaction(target.portfolioId, target.id)
    deleteTarget.value = null
    notice.value = "Transaction deleted"
    await load()
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete transaction"
  } finally {
    deleteBusy.value = false
  }
}

function costOf(tx: Tx): number {
  return (tx.totalAmount ?? 0) + (tx.fees ?? 0)
}

type GroupMode = "none" | "assetType" | "sector" | "country"
const groupBy = ref<GroupMode>("none")

const groupModes: Array<{ value: GroupMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "assetType", label: "Kind of investment" },
  { value: "sector", label: "Sector" },
  { value: "country", label: "Country" },
]

function groupValue(tx: Tx, mode: GroupMode): string {
  switch (mode) {
    case "assetType":
      return (tx.assetType || "STOCK").charAt(0) + (tx.assetType || "STOCK").slice(1).toLowerCase()
    case "sector":
      return tx.sector || "Other"
    case "country":
      return tx.country || "Other"
    default:
      return ""
  }
}

const groups = computed(() => {
  if (groupBy.value === "none") return [{ label: "", items: transactions.value }]
  const map = new Map<string, Tx[]>()
  for (const tx of transactions.value) {
    const key = groupValue(tx, groupBy.value)
    const list = map.get(key) ?? []
    list.push(tx)
    map.set(key, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, items]) => ({ label, items }))
})

function groupAmount(items: Tx[]): number {
  return items.reduce((s, tx) => s + costOf(tx), 0)
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
      <div class="flex items-center gap-3">
        <h2 class="text-base font-semibold">Transactions</h2>
        <span v-if="!loading" class="text-sm text-slate-500 dark:text-slate-400">{{ total.toLocaleString() }} total transactions</span>
      </div>
      <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Group by
        <select v-model="groupBy" class="input !w-auto !py-1 !text-xs" aria-label="Group by">
          <option v-for="mode in groupModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
        </select>
      </label>
    </div>

    <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error" class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">Loading transactions...</p>

    <template v-if="!loading && !error">
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Date</th>
              <th class="px-5 py-2.5 font-medium">Type</th>
              <th class="px-5 py-2.5 font-medium">Symbol</th>
              <th class="px-5 py-2.5 text-right font-medium">Quantity</th>
              <th class="px-5 py-2.5 text-right font-medium">Price</th>
              <th class="px-5 py-2.5 text-right font-medium">Cost</th>
              <th class="px-5 py-2.5 text-right font-medium">Fees</th>
              <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody v-for="g in groups" :key="g.label || 'all'" class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="g.label" class="bg-slate-100/70" data-testid="transactions-group-row">
              <td :colspan="8" class="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {{ g.label }}
                <span class="font-normal text-slate-400 dark:text-slate-500">{{ g.items.length }}</span>
              </td>
            </tr>
            <tr v-for="tx in g.items" :key="tx.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 whitespace-nowrap">{{ formatDate(tx.executedAt) }}</td>
              <td class="px-5 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="typeClass(tx.type)">{{ tx.type }}</span>
              </td>
              <td class="px-5 py-3">
                <router-link
                  :to="{ name: 'research-overview', params: { symbol: researchSymbol(tx.instrumentSymbol) } }"
                  class="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                >
                  {{ tx.instrumentSymbol }}
                </router-link>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ tx.instrumentName }}</p>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(tx.quantity) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(tx.price) }}</td>
              <td class="px-5 py-3 text-right font-medium tabular-nums">{{ formatCurrency(costOf(tx)) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(tx.fees) }}</td>
              <td class="px-5 py-3">
                <div class="flex justify-end gap-1">
                  <button
                    type="button"
                    class="btn-ghost px-2 py-1 text-xs"
                    aria-label="Edit transaction"
                    @click="openEdit(tx)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    aria-label="Delete transaction"
                    @click="openDelete(tx)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="g.label" class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td class="px-5 py-3 text-slate-500 dark:text-slate-400">{{ g.label }} subtotal</td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3 text-right font-medium tabular-nums">{{ formatCurrency(groupAmount(g.items)) }}</td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No transactions found.</p>

      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <button type="button" class="btn-ghost text-sm" :disabled="page <= 1" @click="load(page - 1)">Previous</button>
        <span class="text-sm text-slate-500 dark:text-slate-400">Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="btn-ghost text-sm" :disabled="page >= totalPages" @click="load(page + 1)">Next</button>
      </div>
    </template>

    <EditTransactionModal :open="!!editing" :transaction="editing" @close="editing = null" @saved="onEditSaved" />

    <ConfirmDeleteModal
      :open="!!deleteTarget"
      message="Are you sure you want to delete this transaction? This action cannot be undone."
      :busy="deleteBusy"
      :error="deleteError"
      @close="deleteTarget = null"
      @confirm="submitDelete"
    />
  </div>
</template>
