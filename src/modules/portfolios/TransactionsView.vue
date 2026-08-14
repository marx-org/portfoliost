<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { getAllTransactions, deletePortfolioTransaction } from "@/api/portfolios"
import { formatCurrency, formatDateTime, formatNumber } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import type { PortfoliosTransactions } from "@/api/types"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import EditTransactionModal from "@/modules/portfolios/EditTransactionModal.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"

type Tx = PortfoliosTransactions["items"][number]

const transactions = ref<Tx[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const pageSize = ref(10)
const pageSizes = [5, 10, 20, 50]
const sortBy = ref("date")
const sortOrder = ref<"asc" | "desc">("desc")

const sortableColumns: { key: string; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "date", label: "Date" },
  { key: "portfolio", label: "Portfolio" },
  { key: "type", label: "Type" },
  { key: "quantity", label: "Quantity" },
  { key: "price", label: "Price" },
  { key: "fees", label: "Fees" },
  { key: "amount", label: "Amount" },
]

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
  return items.reduce((s, tx) => s + amountOf(tx), 0)
}

const editing = ref<Tx | null>(null)

const deleteTarget = ref<Tx | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

async function load(targetPage = page.value) {
  loading.value = true
  error.value = null
  try {
    const res = await getAllTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value)
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

function toggleSort(key: string) {
  if (sortBy.value === key) {
    sortOrder.value = sortOrder.value === "desc" ? "asc" : "desc"
  } else {
    sortBy.value = key
    sortOrder.value = "asc"
  }
  load(1)
}

function changePageSize(size: number) {
  pageSize.value = size
  load(1)
}

function onPageSizeChange(e: Event) {
  changePageSize(Number((e.target as HTMLSelectElement).value))
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  load(p)
}

function pageNumbers(): (number | "…")[] {
  const t = totalPages.value
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1)
  const cur = page.value
  const set = new Set<number>([1, t, cur - 1, cur, cur + 1])
  const nums = [...set].filter((n) => n >= 1 && n <= t).sort((a, b) => a - b)
  const out: (number | "…")[] = []
  let prev = 0
  for (const n of nums) {
    if (n - prev > 1) out.push("…")
    out.push(n)
    prev = n
  }
  return out
}

function typeLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase()
}

function amountOf(tx: Tx): number {
  const gross = (tx.totalAmount ?? 0) + (tx.fees ?? 0)
  return tx.type.toUpperCase() === "BUY" ? -gross : gross
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
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">Transactions</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">All investing and cash transactions from across your account.</p>
    </div>

    <InvestmentsTabs />
    <TransactionsSubTabs />

    <p v-if="notice" class="mb-4 rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading transactions...</p>

    <div v-if="!loading && !error" class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <h2 class="text-base font-semibold">All transactions</h2>
        <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          Group by
          <select v-model="groupBy" class="input !w-auto !py-1 !text-xs" aria-label="Group by">
            <option v-for="mode in groupModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
          </select>
        </label>
      </div>
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th
                v-for="col in sortableColumns"
                :key="col.key"
                :data-testid="`table-th-${col.key}`"
                class="px-5 py-2.5 font-medium"
              >
                <button type="button" class="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100" @click="toggleSort(col.key)">
                  {{ col.label }}
                  <span v-if="sortBy === col.key">{{ sortOrder === "asc" ? "↑" : "↓" }}</span>
                </button>
              </th>
              <th class="px-5 py-2.5 font-medium">Instrument Currency</th>
              <th class="px-5 py-2.5 font-medium">P&L</th>
              <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody v-for="g in groups" :key="g.label || 'all'" class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="g.label" class="bg-slate-100/70" data-testid="transactions-group-row">
              <td :colspan="11" class="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {{ g.label }}
                <span class="font-normal text-slate-400 dark:text-slate-500">{{ g.items.length }}</span>
              </td>
            </tr>
            <tr v-for="tx in g.items" :key="tx.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3">
                <router-link
                  :to="{ name: 'research-overview', params: { symbol: researchSymbol(tx.instrumentSymbol) } }"
                  class="flex items-center gap-3"
                >
                  <img :src="`/api/logos/${tx.instrumentSymbol}`" :alt="tx.instrumentSymbol" class="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                  <span>
                    <span class="flex items-center gap-1 font-medium text-slate-900 dark:text-slate-100">
                      {{ tx.instrumentSymbol }}
                      <span class="text-xs font-normal text-slate-400 dark:text-slate-500">(US)</span>
                      <span class="text-xs font-normal text-slate-400 dark:text-slate-500">{{ typeLabel(tx.assetType ?? "STOCK") }}</span>
                    </span>
                    <span class="block text-xs text-slate-500 dark:text-slate-400">{{ tx.instrumentName }}</span>
                  </span>
                </router-link>
              </td>
              <td class="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{{ formatDateTime(tx.executedAt) }}</td>
              <td class="px-5 py-3 text-slate-600 dark:text-slate-300">{{ tx.portfolioName || "—" }}</td>
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ typeLabel(tx.type) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(tx.quantity) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(tx.price) }}</td>
              <td class="px-5 py-3">{{ tx.instrumentCurrency }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(tx.fees) }}</td>
              <td class="px-5 py-3 text-right font-medium tabular-nums" :class="amountOf(tx) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'">
                {{ formatCurrency(amountOf(tx)) }}
              </td>
              <td class="px-5 py-3 text-slate-400 dark:text-slate-500">-</td>
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
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3 text-right font-medium tabular-nums" :class="groupAmount(g.items) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'">
                {{ formatCurrency(groupAmount(g.items)) }}
              </td>
              <td class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No transactions found.</p>

      <div v-if="transactions.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, total) }} of {{ total }}
        </p>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            Rows per page
            <select class="input py-1" :value="pageSize" @change="onPageSizeChange">
              <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} per page</option>
            </select>
          </label>
          <nav aria-label="Pagination" class="flex items-center gap-1">
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="First page"
              :disabled="page <= 1"
              @click="goToPage(1)"
            >
              «
            </button>
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="Previous page"
              :disabled="page <= 1"
              @click="goToPage(page - 1)"
            >
              ‹
            </button>
            <button
              v-for="n in pageNumbers()"
              :key="n"
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              :class="n === page ? 'bg-slate-900 text-white dark:bg-slate-700' : ''"
              :aria-current="n === page ? 'page' : undefined"
              :disabled="n === '…'"
              @click="goToPage(Number(n))"
            >
              {{ n }}
            </button>
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="Next page"
              :disabled="page >= totalPages"
              @click="goToPage(page + 1)"
            >
              ›
            </button>
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="Last page"
              :disabled="page >= totalPages"
              @click="goToPage(totalPages)"
            >
              »
            </button>
          </nav>
        </div>
      </div>
    </div>

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
