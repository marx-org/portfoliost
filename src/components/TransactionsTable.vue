<script setup lang="ts">
/**
 * Shared transaction table used by:
 *   - TransactionsView (mode="global")   — cross-portfolio, full sort + paginator
 *   - PortfolioTransactionsTab (mode="portfolio") — single portfolio, prev/next paginator
 */
import { computed, onMounted, ref } from "vue"
import { getAllTransactions, getPortfolioTransactions, deletePortfolioTransaction } from "@/api/portfolios"
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import FeeCell from "@/components/FeeCell.vue"
import DualCurrencyCell from "@/components/DualCurrencyCell.vue"
import EditTransactionModal from "@/modules/portfolios/EditTransactionModal.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"
import type { PortfoliosTransactions, PortfolioTransactionsPage } from "@/api/types"

type GlobalTx  = PortfoliosTransactions["items"][number]
type PortfolioTx = PortfolioTransactionsPage["items"][number]
type Tx = GlobalTx & Partial<PortfolioTx>

const props = defineProps<{
  mode: "global" | "portfolio"
  /** required when mode === "portfolio" */
  portfolioId?: string
}>()

// ── State ────────────────────────────────────────────────────────────────

const transactions = ref<Tx[]>([])
const total        = ref(0)
const page         = ref(1)
const totalPages   = ref(1)
const loading      = ref(true)
const error        = ref<string | null>(null)
const notice       = ref<string | null>(null)

// global-only
const pageSize   = ref(10)
const pageSizes  = [5, 10, 20, 50]
const sortBy     = ref("date")
const sortOrder  = ref<"asc" | "desc">("desc")

const sortableColumns = [
  { key: "symbol",    label: "Symbol" },
  { key: "date",      label: "Date" },
  { key: "portfolio", label: "Portfolio" },
  { key: "type",      label: "Type" },
  { key: "quantity",  label: "Quantity" },
  { key: "price",     label: "Price" },
  { key: "fees",      label: "Fees" },
  { key: "amount",    label: "Amount" },
]

// shared grouping
type GroupMode = "none" | "assetType" | "sector" | "country"
const groupBy    = ref<GroupMode>("none")
const groupModes = [
  { value: "none" as GroupMode,      label: "None" },
  { value: "assetType" as GroupMode, label: "Kind of investment" },
  { value: "sector" as GroupMode,    label: "Sector" },
  { value: "country" as GroupMode,   label: "Country" },
]

// edit / delete
const editing     = ref<Tx | null>(null)
const deleteTarget = ref<Tx | null>(null)
const deleteBusy  = ref(false)
const deleteError = ref<string | null>(null)

// ── Data loading ─────────────────────────────────────────────────────────

async function load(targetPage = page.value) {
  loading.value = true
  error.value   = null
  try {
    let res: { items: Tx[]; total: number; page: number; totalPages: number }
    if (props.mode === "global") {
      res = await getAllTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value) as typeof res
    } else {
      res = await getPortfolioTransactions(props.portfolioId!, targetPage, 20) as typeof res
    }
    transactions.value = res.items
    total.value        = res.total
    page.value         = res.page
    totalPages.value   = res.totalPages
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load transactions"
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

// ── Sorting (global only) ─────────────────────────────────────────────

function toggleSort(key: string) {
  if (sortBy.value === key) {
    sortOrder.value = sortOrder.value === "desc" ? "asc" : "desc"
  } else {
    sortBy.value    = key
    sortOrder.value = "asc"
  }
  load(1)
}

// ── Pagination ────────────────────────────────────────────────────────

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  load(p)
}

function onPageSizeChange(e: Event) {
  pageSize.value = Number((e.target as HTMLSelectElement).value)
  load(1)
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

// ── Grouping ──────────────────────────────────────────────────────────

function groupValue(tx: Tx, mode: GroupMode): string {
  switch (mode) {
    case "assetType": return (tx.assetType || "STOCK").charAt(0) + (tx.assetType || "STOCK").slice(1).toLowerCase()
    case "sector":    return tx.sector  || "Other"
    case "country":   return tx.country || "Other"
    default:          return ""
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
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }))
})

// ── Amount helpers ────────────────────────────────────────────────────

/** Signed gross (native currency): BUY is negative outflow */
function amountOf(tx: Tx): number {
  const gross = (tx.totalAmount ?? 0) + (tx.fees ?? 0)
  return tx.type.toUpperCase() === "BUY" ? -gross : gross
}

function convertedAmountOf(tx: Tx): number | null {
  if (tx.convertedTotalAmount == null) return null
  const gross = (tx.convertedTotalAmount ?? 0) + (tx.convertedFees ?? 0)
  return tx.type.toUpperCase() === "BUY" ? -gross : gross
}

function groupSubtotal(items: Tx[]): number {
  return items.reduce((s, tx) => s + amountOf(tx), 0)
}

// ── Type display ──────────────────────────────────────────────────────

function typeLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase()
}

function typeClass(type: string): string {
  const t = type.toUpperCase()
  if (t === "BUY")      return "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400"
  if (t === "SELL")     return "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400"
  if (t === "DIVIDEND") return "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400"
  return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
}

// ── Edit / Delete ─────────────────────────────────────────────────────

function openEdit(tx: Tx)   { editing.value = tx }
function openDelete(tx: Tx) { deleteTarget.value = tx; deleteError.value = null }

function onEditSaved() {
  editing.value  = null
  notice.value   = "Transaction updated"
  load()
}

async function submitDelete() {
  if (!deleteTarget.value) return
  deleteBusy.value  = true
  deleteError.value = null
  const target = deleteTarget.value
  try {
    await deletePortfolioTransaction(target.portfolioId, target.id)
    deleteTarget.value = null
    notice.value       = "Transaction deleted"
    await load()
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete transaction"
  } finally {
    deleteBusy.value = false
  }
}

// ── Column count (for group colspan) ─────────────────────────────────

const colCount = computed(() =>
  // global: symbol, date, portfolio, type, qty, price, instrCcy, fees, amount, P&L, actions = 11
  // portfolio: date, type, symbol, qty, price, cost, fees, actions = 8
  props.mode === "global" ? 11 : 8
)
</script>

<template>
  <div class="card overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
      <div class="flex items-center gap-3">
        <h2 class="text-base font-semibold">{{ mode === "global" ? "All transactions" : "Transactions" }}</h2>
        <span v-if="!loading" class="text-sm text-slate-500 dark:text-slate-400">{{ total.toLocaleString() }} total</span>
      </div>
      <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Group by
        <select v-model="groupBy" class="input !w-auto !py-1 !text-xs" aria-label="Group by">
          <option v-for="m in groupModes" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </label>
    </div>

    <!-- Notices -->
    <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error"  class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">Loading transactions…</p>

    <template v-if="!loading && !error">
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">

          <!-- ── Global thead (sortable) ─────────────────────────── -->
          <thead v-if="mode === 'global'">
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th v-for="col in sortableColumns" :key="col.key" :data-testid="`table-th-${col.key}`" class="px-5 py-2.5 font-medium">
                <button type="button" class="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100" @click="toggleSort(col.key)">
                  {{ col.label }}
                  <span v-if="sortBy === col.key">{{ sortOrder === "asc" ? "↑" : "↓" }}</span>
                </button>
              </th>
              <th class="px-5 py-2.5 font-medium">Ccy</th>
              <th class="px-5 py-2.5 font-medium">P&amp;L</th>
              <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>

          <!-- ── Portfolio thead (static) ───────────────────────── -->
          <thead v-else>
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

          <!-- ── Body ────────────────────────────────────────────── -->
          <tbody v-for="g in groups" :key="g.label || 'all'" class="divide-y divide-slate-100 dark:divide-slate-800">
            <!-- Group header -->
            <tr v-if="g.label" class="bg-slate-100/70 dark:bg-slate-800/40" data-testid="transactions-group-row">
              <td :colspan="colCount" class="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {{ g.label }}
                <span class="ml-1 font-normal text-slate-400 dark:text-slate-500">{{ g.items.length }}</span>
              </td>
            </tr>

            <!-- ── Global row ──────────────────────────────────── -->
            <template v-if="mode === 'global'">
              <tr v-for="tx in g.items" :key="tx.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <!-- Symbol -->
                <td class="px-5 py-3">
                  <router-link :to="{ name: 'research-overview', params: { symbol: researchSymbol(tx.instrumentSymbol) } }" class="flex items-center gap-3">
                    <img :src="`/api/logos/${tx.instrumentSymbol}`" :alt="tx.instrumentSymbol" class="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                    <span>
                      <span class="flex items-center gap-1 font-medium text-slate-900 dark:text-slate-100">
                        {{ tx.instrumentSymbol }}
                        <span class="text-xs font-normal text-slate-400 dark:text-slate-500">{{ typeLabel(tx.assetType ?? "STOCK") }}</span>
                      </span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400">{{ tx.instrumentName }}</span>
                    </span>
                  </router-link>
                </td>
                <!-- Date -->
                <td class="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{{ formatDateTime(tx.executedAt) }}</td>
                <!-- Portfolio -->
                <td class="px-5 py-3 text-slate-600 dark:text-slate-300">{{ tx.portfolioName || "—" }}</td>
                <!-- Type -->
                <td class="px-5 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="typeClass(tx.type)">{{ typeLabel(tx.type) }}</span>
                </td>
                <!-- Qty -->
                <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(tx.quantity) }}</td>
                <!-- Price -->
                <td class="px-5 py-3 text-right tabular-nums">
                  <DualCurrencyCell :primary="tx.price" :primary-currency="tx.instrumentCurrency ?? tx.currency" :converted="tx.convertedPrice" :display-currency="tx.displayCurrency" />
                </td>
                <!-- Fees -->
                <td class="px-5 py-3 text-right text-slate-600 tabular-nums dark:text-slate-300">
                  <FeeCell :fees="tx.fees" :fee-currency="tx.feeCurrency" :fallback-currency="tx.currency" :rate-source="tx.rateSource" :converted-fees="tx.convertedFees" :display-currency="tx.displayCurrency" />
                </td>
                <!-- Amount -->
                <td class="px-5 py-3 text-right font-medium tabular-nums" :class="amountOf(tx) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'">
                  <DualCurrencyCell :primary="amountOf(tx)" :primary-currency="tx.currency" :converted="convertedAmountOf(tx)" :display-currency="tx.displayCurrency" />
                </td>
                <!-- Instr.ccy -->
                <td class="px-5 py-3 text-xs text-slate-400 dark:text-slate-500">{{ tx.instrumentCurrency }}</td>
                <!-- P&L -->
                <td class="px-5 py-3 text-slate-400 dark:text-slate-500">-</td>
                <!-- Actions -->
                <td class="px-5 py-3">
                  <div class="flex justify-end gap-1">
                    <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Edit transaction" @click="openEdit(tx)">Edit</button>
                    <button type="button" class="btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" aria-label="Delete transaction" @click="openDelete(tx)">Delete</button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- ── Portfolio row ───────────────────────────────── -->
            <template v-else>
              <tr v-for="tx in g.items" :key="tx.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <!-- Date -->
                <td class="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{{ formatDate(tx.executedAt) }}</td>
                <!-- Type pill -->
                <td class="px-5 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="typeClass(tx.type)">{{ tx.type }}</span>
                </td>
                <!-- Symbol -->
                <td class="px-5 py-3">
                  <router-link :to="{ name: 'research-overview', params: { symbol: researchSymbol(tx.instrumentSymbol) } }" class="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                    {{ tx.instrumentSymbol }}
                  </router-link>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ tx.instrumentName }}</p>
                </td>
                <!-- Qty -->
                <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(tx.quantity) }}</td>
                <!-- Price -->
                <td class="px-5 py-3 text-right tabular-nums">
                  <DualCurrencyCell :primary="tx.price" :primary-currency="tx.instrumentCurrency ?? tx.currency" :converted="tx.convertedPrice" :display-currency="tx.displayCurrency" />
                </td>
                <!-- Cost -->
                <td class="px-5 py-3 text-right font-medium tabular-nums">
                  <DualCurrencyCell :primary="(tx.totalAmount ?? 0) + (tx.fees ?? 0)" :primary-currency="tx.currency" :converted="tx.convertedTotalAmount != null ? (tx.convertedTotalAmount ?? 0) + (tx.convertedFees ?? 0) : null" :display-currency="tx.displayCurrency" />
                </td>
                <!-- Fees -->
                <td class="px-5 py-3 text-right text-slate-600 tabular-nums dark:text-slate-300">
                  <FeeCell :fees="tx.fees" :fee-currency="tx.feeCurrency" :fallback-currency="tx.currency" :rate-source="tx.rateSource" :converted-fees="tx.convertedFees" :display-currency="tx.displayCurrency" />
                </td>
                <!-- Actions -->
                <td class="px-5 py-3">
                  <div class="flex justify-end gap-1">
                    <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Edit transaction" @click="openEdit(tx)">Edit</button>
                    <button type="button" class="btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" aria-label="Delete transaction" @click="openDelete(tx)">Delete</button>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Group subtotal -->
            <tr v-if="g.label" class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td class="px-5 py-3 text-slate-500 dark:text-slate-400">{{ g.label }} subtotal</td>
              <!-- fill empty cells: global has 10 more cols, portfolio has 6 more, last real col gets the value -->
              <template v-if="mode === 'global'">
                <td v-for="n in 7" :key="n" class="px-5 py-3"></td>
                <td class="px-5 py-3 text-right font-medium tabular-nums" :class="groupSubtotal(g.items) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'">
                  {{ formatCurrency(groupSubtotal(g.items), g.items[0]?.displayCurrency ?? 'USD') }}
                </td>
                <td v-for="n in 2" :key="'t'+n" class="px-5 py-3"></td>
              </template>
              <template v-else>
                <td v-for="n in 4" :key="n" class="px-5 py-3"></td>
                <td class="px-5 py-3 text-right font-medium tabular-nums">
                  {{ formatCurrency(g.items.reduce((s, tx) => s + (tx.totalAmount ?? 0) + (tx.fees ?? 0), 0), g.items[0]?.displayCurrency ?? 'USD') }}
                </td>
                <td v-for="n in 2" :key="'t'+n" class="px-5 py-3"></td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No transactions found.</p>

      <!-- ── Pagination: global (full numeric) ─────────────────── -->
      <div v-if="mode === 'global' && transactions.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }}
        </p>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            Rows per page
            <select class="input py-1" :value="pageSize" @change="onPageSizeChange">
              <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} per page</option>
            </select>
          </label>
          <nav aria-label="Pagination" class="flex items-center gap-1">
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="First page"    :disabled="page <= 1"           @click="goToPage(1)">«</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Previous page" :disabled="page <= 1"           @click="goToPage(page - 1)">‹</button>
            <button
              v-for="n in pageNumbers()" :key="n" type="button"
              class="btn-ghost px-2 py-1 text-xs"
              :class="n === page ? 'bg-slate-900 text-white dark:bg-slate-700' : ''"
              :aria-current="n === page ? 'page' : undefined"
              :disabled="n === '…'"
              @click="goToPage(Number(n))"
            >{{ n }}</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Next page"  :disabled="page >= totalPages" @click="goToPage(page + 1)">›</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Last page"  :disabled="page >= totalPages" @click="goToPage(totalPages)">»</button>
          </nav>
        </div>
      </div>

      <!-- ── Pagination: portfolio (prev/next) ─────────────────── -->
      <div v-if="mode === 'portfolio' && totalPages > 1" class="flex items-center justify-between border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <button type="button" class="btn-ghost text-sm" :disabled="page <= 1"           @click="load(page - 1)">Previous</button>
        <span class="text-sm text-slate-500 dark:text-slate-400">Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="btn-ghost text-sm" :disabled="page >= totalPages" @click="load(page + 1)">Next</button>
      </div>
    </template>

    <!-- Modals -->
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
