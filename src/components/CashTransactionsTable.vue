<script setup lang="ts">
/**
 * Shared cash transaction table used by:
 *   - CashTransactionsView    (mode="global")    — cross-portfolio feed
 *   - PortfolioCashTab       (mode="portfolio") — single-portfolio cash tab
 *
 * Mirrors TransactionsTable.vue: sorting on every data column, a full numeric
 * paginator, a page-size selector, a label filter bar, and label chips inline
 * with the description.
 *
 * Column differences:
 *   global    adds: Portfolio
 *   portfolio adds: Balance (the row's own-currency running ledger balance)
 */
import { computed, onMounted, ref, watch } from "vue"
import {
  getPortfolioCashTransactions,
  getRecentCashTransactions,
  deleteCashTransaction,
} from "@/api/portfolios"
import { formatCurrency, formatDate, formatDateTime } from "@/utils/format"
import LabelFilterBar from "@/components/LabelFilterBar.vue"
import LabelChips from "@/components/LabelChips.vue"
import LabelManagerDialog from "@/components/LabelManagerDialog.vue"
import LabelPickerPopover from "@/components/LabelPickerPopover.vue"
import { triggerRectFromEvent, type TriggerRect } from "@/utils/popoverPosition"
import PortfolioCashModals from "@/modules/portfolios/PortfolioCashModals.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"
import type { components } from "@/api/types"

type PortfolioCash = components["schemas"]["PortfolioCash"]

/**
 * Row shape the table renders. `RecentCashTransaction` (the global feed) and
 * `CashTransaction` (the per-portfolio tab) disagree: the feed's `amount` is a
 * signed decimal string and it carries `displayLabel` plus an already-resolved
 * `date`, while a per-portfolio row has a numeric `amount`, no displayLabel,
 * and an optional `transactionDate`. Both are structurally assignable to this,
 * so `load()` needs no cast.
 */
type Tx = {
  id: string
  portfolioId: string
  portfolioName?: string | null
  type: string
  displayLabel?: string | null
  amount: string | number
  currency: string
  date?: string
  transactionDate?: string | null
  createdAt: string
  description?: string | null
  toPortfolioId?: string | null
  balanceAfter?: number | null
  fees?: number | null
  feeCurrency?: string | null
  feeRateSource?: "automatic" | "manual" | null
  feeExchangeRate?: number | null
  labels?: components["schemas"]["Label"][]
}

const props = defineProps<{
  mode: "global" | "portfolio"
  /** required when mode === "portfolio" */
  portfolioId?: string
  /** portfolio-mode only — the row-edit modal needs the portfolio's cash for
   * the balance hint and currency default */
  cash?: PortfolioCash | null
  /** bump to force a reload (the portfolio tab reloads after a deposit) */
  refreshKey?: number
}>()

// ── State ────────────────────────────────────────────────────────────────

const transactions = ref<Tx[]>([])
const total        = ref(0)
const page         = ref(1)
const totalPages   = ref(1)
const loading      = ref(true)
const error        = ref<string | null>(null)
const notice       = ref<string | null>(null)

const pageSize  = ref(10)
const pageSizes = [5, 10, 20, 50]

const sortBy    = ref("date")
const sortOrder = ref<"asc" | "desc">("desc")

const labelFilter      = ref<string[]>([])
const searchFilter     = ref("")
const manageLabelsOpen = ref(false)
const pickerOpen       = ref(false)
const pickerTx         = ref<Tx | null>(null)
const pickerTrigger    = ref<TriggerRect | null>(null)

// Edit / delete
const editing      = ref<Tx | null>(null)
const modalOpen    = ref(false)
const modalAction  = ref<"deposit" | "withdraw" | "transfer">("deposit")
const deleteTarget = ref<Tx | null>(null)
const deleteBusy   = ref(false)
const deleteError  = ref<string | null>(null)

// ── Sortable columns (shared) ───────────────────────────────────────────

const sortableColumns = computed(() => {
  const base = [
    { key: "date",   label: "Date" },
    { key: "type",   label: "Type" },
    { key: "amount", label: "Amount" },
  ]
  if (props.mode === "global") {
    base.splice(1, 0, { key: "portfolioName", label: "Portfolio" })
  } else {
    base.splice(3, 0, { key: "balance", label: "Balance" })
  }
  return base
})

// ── Data loading ─────────────────────────────────────────────────────────

/** The value each sortable column orders by. `date` is the effective date, so a
 * client-side order always matches what the user sees in the cell. */
const SORT_ACCESSORS: Record<string, (tx: Tx) => string | number | null | undefined> = {
  date:           (tx) => dateOf(tx),
  portfolioName:  (tx) => tx.portfolioName,
  type:           (tx) => tx.type,
  amount:         (tx) => amountOf(tx),
  balance:        (tx) => tx.balanceAfter,
}

function compareRows(a: Tx, b: Tx, key: string): number {
  const get = SORT_ACCESSORS[key]
  if (!get) return 0
  const av = get(a)
  const bv = get(b)
  // nulls last, whichever direction the sort runs
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  if (typeof av === "number" && typeof bv === "number") return av - bv
  return String(av).localeCompare(String(bv), undefined, { numeric: true })
}

/** Re-order the fetched page by the active sort.
 *
 * `/portfolios/cash/recent-transactions` sorts server-side, but the deployed
 * `wallets` backend ignores `sortBy` on `/portfolios/{id}/cash/transactions`
 * — so without this the per-portfolio tab would show a sort arrow that never
 * reorders anything. Ordering the page we already fetched keeps the arrow
 * honest; it is idempotent when the server does sort. */
function orderedPage(rows: Tx[]): Tx[] {
  const dir = sortOrder.value === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const cmp = compareRows(a, b, sortBy.value)
    return cmp === 0 ? 0 : cmp * dir
  })
}

async function load(targetPage = page.value) {
  loading.value = true
  error.value   = null
  try {
    const labels = labelFilter.value.length ? labelFilter.value : undefined
    const search = searchFilter.value.trim()
    if (props.mode === "global") {
      const res = search
        ? await getRecentCashTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value, labels, search)
        : await getRecentCashTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value, labels)
      transactions.value = orderedPage(res.data ?? [])
      total.value        = res.meta?.total ?? 0
      page.value         = res.meta?.page ?? 1
      totalPages.value   = res.meta?.totalPages ?? 1
    } else {
      const res = search
        ? await getPortfolioCashTransactions(props.portfolioId!, targetPage, pageSize.value, labels, sortBy.value, sortOrder.value, search)
        : await getPortfolioCashTransactions(props.portfolioId!, targetPage, pageSize.value, labels, sortBy.value, sortOrder.value)
      transactions.value = orderedPage(res.items)
      total.value        = res.total
      page.value         = res.page
      totalPages.value   = res.totalPages
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load cash transactions"
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

watch([labelFilter, searchFilter], () => load(1))

watch(() => props.refreshKey, () => load())

// ── Sort ─────────────────────────────────────────────────────────────────

function toggleSort(key: string) {
  if (sortBy.value === key) {
    sortOrder.value = sortOrder.value === "desc" ? "asc" : "desc"
  } else {
    sortBy.value    = key
    sortOrder.value = "asc"
  }
  load(1)
}

function sortIndicator(key: string): string {
  if (sortBy.value !== key) return ""
  return sortOrder.value === "asc" ? "↑" : "↓"
}

// ── Pagination ───────────────────────────────────────────────────────────

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

// ── Row helpers ──────────────────────────────────────────────────────────

/** The global feed's `amount` is a signed decimal string, the per-portfolio
 * schema's is a number — normalize once here. */
function amountOf(tx: Tx): number {
  return Number(tx.amount) || 0
}

/** The global feed carries a resolved `date`; a per-portfolio row has an
 * optional `transactionDate` and falls back to `createdAt`. */
function dateOf(tx: Tx): string {
  return (props.mode === "global" ? tx.date : tx.transactionDate ?? tx.createdAt) || tx.createdAt
}

function dateLabel(tx: Tx): string {
  return props.mode === "global" ? formatDateTime(dateOf(tx)) : formatDate(dateOf(tx))
}

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER: "Transfer",
}

function typeLabel(tx: Tx): string {
  return tx.displayLabel ?? TYPE_LABELS[String(tx.type).toUpperCase()] ?? tx.type
}

// ── Edit / Delete ────────────────────────────────────────────────────────

function openEdit(tx: Tx) {
  editing.value  = tx
  modalAction.value =
    String(tx.type).toUpperCase() === "WITHDRAWAL" ? "withdraw"
    : String(tx.type).toUpperCase() === "TRANSFER" ? "transfer"
    : "deposit"
  modalOpen.value = true
}

function onEditDone() {
  modalOpen.value = false
  editing.value   = null
  notice.value    = "Transaction updated"
  void load()
}

/** Row-edit payload for the modal — `dateOf` supplies the effective date so a
 * per-portfolio row prefills from transactionDate instead of createdAt. */
function editPayload(tx: Tx) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    date: dateOf(tx),
    createdAt: tx.createdAt,
    description: tx.description ?? null,
    toPortfolioId: tx.toPortfolioId ?? null,
    fees: tx.fees ?? null,
    feeCurrency: tx.feeCurrency ?? null,
    feeRateSource: tx.feeRateSource ?? null,
    feeExchangeRate: tx.feeExchangeRate ?? null,
  }
}

function openDelete(tx: Tx) {
  deleteTarget.value = tx
  deleteError.value  = null
}

async function submitDelete() {
  if (!deleteTarget.value) return
  deleteBusy.value  = true
  deleteError.value = null
  const target = deleteTarget.value
  try {
    await deleteCashTransaction(target.id)
    deleteTarget.value = null
    notice.value       = "Transaction deleted"
    await load()
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete transaction"
  } finally {
    deleteBusy.value = false
  }
}

// ── Labels ───────────────────────────────────────────────────────────────

function openLabelPicker(tx: Tx, e: MouseEvent) {
  pickerTx.value   = tx
  pickerTrigger.value = triggerRectFromEvent(e.currentTarget)
  pickerOpen.value = true
}

function onPickerClosed() {
  pickerOpen.value = false
  pickerTx.value   = null
  pickerTrigger.value = null
}

function onPickerSaved() {
  onPickerClosed()
  void load()
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
      <div class="flex items-center gap-3">
        <h2 class="text-base font-semibold">Cash transactions</h2>
        <span v-if="!loading" class="text-sm text-slate-500 dark:text-slate-400">{{ total.toLocaleString() }} total</span>
      </div>
    </div>

    <div class="border-b border-slate-100 dark:border-slate-800 px-5 py-2">
      <div class="flex flex-wrap items-center gap-3">
        <LabelFilterBar v-model="labelFilter" @manage="manageLabelsOpen = true" />
        <label class="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span class="sr-only">Filter by company name or ticker</span>
          <input
            v-model="searchFilter"
            class="input !w-56 !py-1.5 !text-xs"
            type="search"
            placeholder="Company name or ticker"
            aria-label="Filter by company name or ticker"
            data-testid="cash-transaction-search"
          />
        </label>
      </div>
    </div>

    <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error"  class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">Loading cash transactions…</p>

    <template v-if="!loading && !error">
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <template v-for="col in sortableColumns" :key="col.key">
                <th
                  :data-testid="`table-th-${col.key}`"
                  class="px-5 py-2.5 font-medium"
                  :class="['amount', 'balance'].includes(col.key) ? 'text-right' : ''"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    @click="toggleSort(col.key)"
                  >
                    {{ col.label }}
                    <span v-if="sortIndicator(col.key)" class="text-[10px]">{{ sortIndicator(col.key) }}</span>
                  </button>
                </th>
              </template>
              <th class="px-5 py-2.5 font-medium">Description</th>
              <!-- Sticky actions — example-service parity (§57.2); 6 columns do not
                   overflow at 1280 today, but this keeps them reachable on a
                   narrow viewport. -->
              <th
                class="sticky right-0 z-30 bg-white px-5 py-2.5 shadow-[-1px_0_0_0_#e2e8f0] dark:bg-slate-900 dark:shadow-[-1px_0_0_0_#334155]"
              ><span class="sr-only">Actions</span></th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="tx in transactions"
              :key="tx.id"
              class="group hover:bg-slate-50 dark:hover:bg-slate-800/50"
              :data-testid="`cash-tx-${tx.id}`"
            >
              <!-- Date -->
              <td class="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{{ dateLabel(tx) }}</td>

              <!-- Portfolio (global only) -->
              <td v-if="mode === 'global'" class="px-5 py-3 text-slate-900 dark:text-slate-100">{{ tx.portfolioName || "—" }}</td>

              <!-- Type -->
              <td class="px-5 py-3 text-slate-600 dark:text-slate-300">{{ typeLabel(tx) }}</td>

              <!-- Amount -->
              <td
                class="px-5 py-3 text-right font-medium tabular-nums"
                :class="amountOf(tx) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'"
              >
                {{ formatCurrency(amountOf(tx), tx.currency) }}
              </td>

              <!-- Balance (portfolio only) -->
              <td v-if="mode === 'portfolio'" class="px-5 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                {{ tx.balanceAfter != null ? formatCurrency(tx.balanceAfter, tx.currency) : "—" }}
              </td>

              <!-- Description + label chips -->
              <td class="px-5 py-3 text-slate-600 dark:text-slate-300">
                <div>{{ tx.description || "—" }}</div>
                <LabelChips v-if="tx.labels?.length" :labels="tx.labels" :max="3" class="mt-1" />
              </td>

              <!-- Actions — sticky right, opaque so nothing shows through -->
              <td
                class="sticky right-0 z-10 bg-white px-5 py-3 shadow-[-1px_0_0_0_#e2e8f0] group-hover:bg-slate-50 dark:bg-slate-900 dark:shadow-[-1px_0_0_0_#334155] dark:group-hover:bg-slate-800"
              >
                <div class="flex justify-end gap-1">
                  <button
                    type="button"
                    class="btn-ghost px-2 py-1 text-xs"
                    aria-label="Set labels"
                    @click="openLabelPicker(tx, $event)"
                  >
                    Labels
                  </button>
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
                    class="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    aria-label="Delete transaction"
                    @click="openDelete(tx)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
        {{ mode === "global" ? "No cash transactions found." : "No cash transactions yet." }}
      </p>

      <!-- Shared full paginator (both modes) -->
      <div v-if="transactions.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700/60">
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
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Next page"  :disabled="page >= totalPages"  @click="goToPage(page + 1)">›</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Last page"  :disabled="page >= totalPages"  @click="goToPage(totalPages)">»</button>
          </nav>
        </div>
      </div>
    </template>

    <!-- Modals -->
    <PortfolioCashModals
      :open="modalOpen"
      :action="modalAction"
      :portfolio-id="editing?.portfolioId ?? ''"
      :cash="cash ?? { baseCurrency: editing?.currency ?? '', balances: [], total: 0 }"
      :edit-tx="editing ? editPayload(editing) : null"
      @close="modalOpen = false; editing = null"
      @done="onEditDone"
    />

    <ConfirmDeleteModal
      :open="!!deleteTarget"
      message="Are you sure you want to delete this transaction?"
      :busy="deleteBusy"
      :error="deleteError"
      @close="deleteTarget = null"
      @confirm="submitDelete"
    />

    <LabelManagerDialog :open="manageLabelsOpen" @close="manageLabelsOpen = false" />

    <LabelPickerPopover
      v-if="pickerTx"
      :open="pickerOpen"
      :entity-id="pickerTx.id"
      entity-kind="cash-transaction"
      :portfolio-id="pickerTx.portfolioId"
      :current-labels="pickerTx.labels ?? []"
      :trigger="pickerTrigger"
      @close="onPickerClosed"
      @saved="onPickerSaved"
    />
  </div>
</template>
