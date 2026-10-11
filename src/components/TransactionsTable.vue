<script setup lang="ts">
/**
 * Shared transaction table used by:
 *   - TransactionsView  (mode="global")    — cross-portfolio feed
 *   - PortfolioTransactionsTab (mode="portfolio") — single-portfolio tab
 *
 * Both modes share: sorting on all columns, full numeric paginator,
 * page-size selector, grouping by sector/country/assetType.
 *
 * Column differences:
 *   global    adds: Portfolio name, Instrument Currency badge
 *   portfolio adds: (none — same columns minus Portfolio/Ccy)
 */
import { computed, onMounted, ref, watch } from "vue"
import { getAllTransactions, getPortfolioTransactions, deletePortfolioTransaction } from "@/api/portfolios"
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/utils/format"
import { useRoute } from "vue-router"
import { researchRoute } from "@/utils/research"
import TickerBadge from "@/components/TickerBadge.vue"
import FeeCell from "@/components/FeeCell.vue"
import DualCurrencyCell from "@/components/DualCurrencyCell.vue"
import LabelFilterBar from "@/components/LabelFilterBar.vue"
import LabelChips from "@/components/LabelChips.vue"
import LabelManagerDialog from "@/components/LabelManagerDialog.vue"
import LabelPickerPopover from "@/components/LabelPickerPopover.vue"
import type { EntityKind } from "@/components/LabelPickerPopover.vue"
import { triggerRectFromEvent, type TriggerRect } from "@/utils/popoverPosition"
import EditTransactionModal from "@/modules/portfolios/EditTransactionModal.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"
import type { PortfoliosTransactions, PortfolioTransactionsPage } from "@/api/types"

type GlobalTx   = PortfoliosTransactions["items"][number]
type PortfolioTx = PortfolioTransactionsPage["items"][number]
type Tx = GlobalTx & Partial<PortfolioTx>

const props = defineProps<{
  mode: "global" | "portfolio"
  portfolioId?: string   // required when mode === "portfolio"
}>()

const route = useRoute()

// ── State ────────────────────────────────────────────────────────────────

const transactions = ref<Tx[]>([])
const total        = ref(0)
const page         = ref(1)
const totalPages   = ref(1)
const loading      = ref(true)
const error        = ref<string | null>(null)
const notice       = ref<string | null>(null)

const pageSize  = ref(20)
const pageSizes = [10, 20, 50, 100]

const sortBy    = ref("date")
const sortOrder = ref<"asc" | "desc">("desc")

const labelFilter  = ref<string[]>([])
const searchFilter = ref("")
const manageLabelsOpen = ref(false)
const pickerOpen   = ref(false)
const pickerTx     = ref<Tx | null>(null)
const pickerKind   = ref<EntityKind>("transaction")
const pickerTrigger = ref<TriggerRect | null>(null)

// ── Sortable columns (shared) ─────────────────────────────────────────

const sortableColumns = computed(() => {
  const base = [
    { key: "date",     label: "Date" },
    { key: "type",     label: "Type" },
    { key: "symbol",   label: "Symbol" },
    { key: "quantity", label: "Qty" },
    { key: "price",    label: "Price" },
    { key: "fees",     label: "Fees" },
    { key: "amount",   label: "Amount" },
  ]
  if (props.mode === "global") {
    base.splice(2, 0, { key: "portfolio", label: "Portfolio" })
  }
  return base
})

// ── Grouping ──────────────────────────────────────────────────────────

type GroupMode = "none" | "assetType" | "sector" | "country"
const groupBy    = ref<GroupMode>("none")
const groupModes = [
  { value: "none"      as GroupMode, label: "None" },
  { value: "assetType" as GroupMode, label: "Kind of investment" },
  { value: "sector"    as GroupMode, label: "Sector" },
  { value: "country"   as GroupMode, label: "Country" },
]

function groupValue(tx: Tx, mode: GroupMode): string {
  switch (mode) {
    case "assetType": return (tx.assetType || "STOCK").charAt(0) + (tx.assetType || "STOCK").slice(1).toLowerCase()
    case "sector":    return tx.sector  ?? "Other"
    case "country":   return tx.country ?? "Other"
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

// §49.5: show the Tax column only when the current page holds DIVIDEND tax rows
const hasTaxRows = computed(() => transactions.value.some((tx) => !!(tx.taxes ?? 0) && tx.type.toUpperCase() === "DIVIDEND"))

function txTaxes(tx: Tx): number | null { return tx.taxes ?? null }
function txNotes(tx: Tx): string | undefined { return tx.notes ?? undefined }

// ── Data loading ──────────────────────────────────────────────────────

async function load(targetPage = page.value) {
  loading.value = true
  error.value   = null
  try {
    let res: { items: Tx[]; total: number; page: number; totalPages: number }
    const search = searchFilter.value.trim()
    if (props.mode === "global") {
      res = search
        ? await getAllTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value, labelFilter.value.length ? labelFilter.value : undefined, undefined, search) as typeof res
        : await getAllTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value, labelFilter.value.length ? labelFilter.value : undefined) as typeof res
    } else {
      res = search
        ? await getPortfolioTransactions(props.portfolioId!, targetPage, pageSize.value, sortBy.value, sortOrder.value, undefined, labelFilter.value.length ? labelFilter.value : undefined, undefined, search) as typeof res
        : await getPortfolioTransactions(props.portfolioId!, targetPage, pageSize.value, sortBy.value, sortOrder.value, undefined, labelFilter.value.length ? labelFilter.value : undefined) as typeof res
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

watch([labelFilter, searchFilter], () => load(1))

// ── Sort ──────────────────────────────────────────────────────────────

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

// ── Amount helpers ────────────────────────────────────────────────────

// A transfer moves an instrument, not money. Its `totalAmount` is quantity x the
// source lot's cost — a NOTIONAL, not a cash movement — so feeding it into the
// amount column would fabricate a payment that never happened, and would also
// corrupt `groupSubtotal`, which sums this. Every cash figure here is therefore
// forced to 0 for the transfer pair and the cell renders "—" instead.
const TRANSFER_TYPES = new Set(["TRANSFER_OUT", "TRANSFER_IN"])

function isTransfer(type: string): boolean {
  return TRANSFER_TYPES.has(type.toUpperCase())
}

function amountOf(tx: Tx): number {
  if (isTransfer(tx.type)) return 0
  const gross = (tx.totalAmount ?? 0) + (tx.fees ?? 0)
  return tx.type.toUpperCase() === "BUY" ? -gross : gross
}

function convertedAmountOf(tx: Tx): number | null {
  if (isTransfer(tx.type)) return null
  if (tx.convertedTotalAmount == null) return null
  const gross = (tx.convertedTotalAmount ?? 0) + (tx.convertedFees ?? 0)
  return tx.type.toUpperCase() === "BUY" ? -gross : gross
}

function groupSubtotal(items: Tx[]): number {
  return items.reduce((s, tx) => s + amountOf(tx), 0)
}

// ── Type display ──────────────────────────────────────────────────────

function typeClass(type: string): string {
  const t = type.toUpperCase()
  if (t === "BUY")      return "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400"
  if (t === "SELL")     return "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400"
  if (t === "DIVIDEND") return "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400"
  // Custody changed hands. Violet rather than green/red so it is never read as a
  // trade: nothing was bought, nothing was sold, and no cash moved.
  if (t === "TRANSFER_OUT") return "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400"
  if (t === "TRANSFER_IN")  return "bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400"
  return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
}

const TYPE_LABELS: Record<string, string> = {
  BUY: "Buy",
  SELL: "Sell",
  DIVIDEND: "Dividend",
  EXPIRATION: "Expiration",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type.toUpperCase()] ?? type.charAt(0) + type.slice(1).toLowerCase()
}

// ── Edit / Delete ─────────────────────────────────────────────────────

const editing      = ref<Tx | null>(null)
const deleteTarget = ref<Tx | null>(null)
const deleteBusy   = ref(false)
const deleteError  = ref<string | null>(null)

function openEdit(tx: Tx)   { editing.value = tx }
function openDelete(tx: Tx) { deleteTarget.value = tx; deleteError.value = null }

function onEditSaved() {
  editing.value = null
  notice.value  = "Transaction updated"
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

// ── Labels ─────────────────────────────────────────────────────────────

function openLabelPicker(tx: Tx, e: MouseEvent) {
  pickerTx.value = tx
  pickerKind.value = "transaction"
  pickerTrigger.value = triggerRectFromEvent(e.currentTarget)
  pickerOpen.value = true
}

function onPickerClosed() {
  pickerOpen.value = false
  pickerTx.value = null
  pickerTrigger.value = null
}

function onPickerSaved() {
  onPickerClosed()
  load()
}

// ── Column count for group colspan ────────────────────────────────────

const colCount = computed(() =>
  // date, type, symbol, qty, price, fees, [tax], amount, actions = 8/9
  // global adds portfolio + ccy = +2
  (props.mode === "global" ? 10 : 8) + (hasTaxRows.value ? 1 : 0)
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
            data-testid="transaction-search"
          />
        </label>
      </div>
    </div>

    <!-- Notices -->
    <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error"  class="border-b border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">Loading transactions…</p>

    <template v-if="!loading && !error">
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <template v-for="col in sortableColumns" :key="col.key">
                <th
                  v-if="col.key === 'amount' && hasTaxRows"
                  data-testid="table-th-tax"
                  class="px-5 py-2.5 font-medium text-right"
                >Tax</th>
                <th
                  :data-testid="`table-th-${col.key}`"
                  class="px-5 py-2.5 font-medium"
                  :class="['price','fees','amount','quantity'].includes(col.key) ? 'text-right' : ''"
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
              <!-- global-only: instrument currency badge -->
              <th v-if="mode === 'global'" class="px-5 py-2.5 font-medium text-xs">Ccy</th>
              <!--
                Actions stay pinned to the right edge (example-service parity, §57.2):
                the global table is 10–11 columns and used to push Edit/Labels/
                Delete off-screen behind overflow-x-auto. Opaque background +
                a 1px left separator, so the columns scrolling underneath never
                bleed through. z-30 (measured on app.example-service.ai) keeps the header
                above the body cells.
              -->
              <th
                class="sticky right-0 z-30 bg-white px-5 py-2.5 shadow-[-1px_0_0_0_#e2e8f0] dark:bg-slate-900 dark:shadow-[-1px_0_0_0_#334155]"
              ><span class="sr-only">Actions</span></th>
            </tr>
          </thead>

          <tbody v-for="g in groups" :key="g.label || 'all'" class="divide-y divide-slate-100 dark:divide-slate-800">
            <!-- Group header row -->
            <tr v-if="g.label" class="bg-slate-100/70 dark:bg-slate-800/40" data-testid="transactions-group-row">
              <td :colspan="colCount" class="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {{ g.label }}
                <span class="ml-1 font-normal text-slate-400 dark:text-slate-500">{{ g.items.length }}</span>
              </td>
            </tr>

            <!-- Data rows -->
            <tr v-for="tx in g.items" :key="tx.id" class="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <!-- Date -->
              <td class="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                {{ mode === "global" ? formatDateTime(tx.executedAt) : formatDate(tx.executedAt) }}
              </td>

              <!-- Type pill -->
              <td class="px-5 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="typeClass(tx.type)">
                  {{ typeLabel(tx.type) }}
                </span>
              </td>

              <!-- Symbol — §61.6: the shared identity block; the note and the
                   label chips are transaction-level, so they stay below it. -->
              <td class="px-5 py-3">
                <router-link :to="researchRoute(tx.instrumentSymbol, route.fullPath)" class="block">
                  <TickerBadge
                    :symbol="tx.instrumentSymbol"
                    :name="tx.instrumentName"
                    :country-code="tx.country"
                    :asset-type="tx.assetType"
                  />
                </router-link>
                <span v-if="txNotes(tx)" class="block text-[11px] font-normal text-amber-600 dark:text-amber-400" :title="txNotes(tx)">note</span>
                <LabelChips v-if="tx.labels?.length" :labels="tx.labels" :max="3" class="mt-0.5" />
              </td>

              <!-- Portfolio (global only) -->
              <td v-if="mode === 'global'" class="px-5 py-3 text-slate-600 dark:text-slate-300">
                {{ tx.portfolioName || "—" }}
              </td>

              <!-- Quantity -->
              <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(tx.quantity) }}</td>

              <!-- Price -->
              <td class="px-5 py-3 text-right tabular-nums">
                <DualCurrencyCell
                  :primary="tx.price"
                  :primary-currency="tx.instrumentCurrency ?? tx.currency"
                  :converted="tx.convertedPrice"
                  :display-currency="tx.displayCurrency"
                />
              </td>

              <!-- Fees -->
              <td class="px-5 py-3 text-right text-slate-600 tabular-nums dark:text-slate-300">
                <FeeCell
                  :fees="tx.fees"
                  :fee-currency="tx.feeCurrency"
                  :fallback-currency="tx.currency"
                  :rate-source="tx.rateSource"
                  :converted-fees="tx.convertedFees"
                  :display-currency="tx.displayCurrency"
                />
              </td>

              <!-- Tax (shown for the current page when any DIVIDEND row has withholding tax) -->
              <td v-if="hasTaxRows" class="px-5 py-3 text-right tabular-nums">
                <template v-if="txTaxes(tx)">
                  <DualCurrencyCell
                    :primary="txTaxes(tx)"
                    :primary-currency="tx.instrumentCurrency ?? tx.currency"
                    :converted="undefined"
                    :display-currency="tx.displayCurrency"
                  />
                </template>
                <span v-else class="text-slate-400">—</span>
              </td>

              <!-- Amount. A transfer shows the quantity that changed custody, never a cash
                   figure — its `totalAmount` is a notional cost, and rendering it
                   as a payment would invent money that never moved. -->
              <td
                class="px-5 py-3 text-right font-medium tabular-nums"
                :class="isTransfer(tx.type)
                  ? 'text-violet-600 dark:text-violet-400'
                  : amountOf(tx) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'"
              >
                <span
                  v-if="isTransfer(tx.type)"
                  class="text-xs font-normal"
                  data-testid="transfer-moved-quantity"
                >{{ tx.quantity }} {{ tx.instrumentCurrency ?? tx.currency }}</span>
                <DualCurrencyCell
                  v-else
                  :primary="amountOf(tx)"
                  :primary-currency="tx.currency"
                  :converted="convertedAmountOf(tx)"
                  :display-currency="tx.displayCurrency"
                />
              </td>

              <!-- Instrument currency badge (global only) -->
              <td v-if="mode === 'global'" class="px-5 py-3 text-xs text-slate-400 dark:text-slate-500">
                {{ tx.instrumentCurrency }}
              </td>

              <!-- Actions — sticky right, opaque so nothing shows through -->
              <td
                class="sticky right-0 z-10 bg-white px-5 py-3 shadow-[-1px_0_0_0_#e2e8f0] group-hover:bg-slate-50 dark:bg-slate-900 dark:shadow-[-1px_0_0_0_#334155] dark:group-hover:bg-slate-800"
              >
                <div class="flex justify-end gap-1">
                  <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Edit transaction" @click="openEdit(tx)">Edit</button>
                  <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Set labels" @click="openLabelPicker(tx, $event)">Labels</button>
                  <button
                    type="button"
                    class="btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    aria-label="Delete transaction"
                    @click="openDelete(tx)"
                  >Delete</button>
                </div>
              </td>
            </tr>

            <!-- Group subtotal -->
            <tr v-if="g.label" class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td class="px-5 py-3 text-slate-500 dark:text-slate-400" :colspan="(mode === 'global' ? 7 : 6) + (hasTaxRows ? 1 : 0)">{{ g.label }} subtotal</td>
              <td
                class="px-5 py-3 text-right font-medium tabular-nums"
                :class="groupSubtotal(g.items) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'"
              >
                {{ formatCurrency(groupSubtotal(g.items), g.items[0]?.displayCurrency) }}
              </td>
              <td v-if="mode === 'global'" class="px-5 py-3"></td>
              <td
                class="sticky right-0 z-10 bg-slate-50 px-5 py-3 shadow-[-1px_0_0_0_#e2e8f0] dark:bg-slate-800 dark:shadow-[-1px_0_0_0_#334155]"
              ></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No transactions found.</p>

      <!-- Shared full paginator (both modes) -->
      <div v-if="transactions.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
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

    <LabelManagerDialog :open="manageLabelsOpen" @close="manageLabelsOpen = false" />

    <LabelPickerPopover
      v-if="pickerTx"
      :open="pickerOpen"
      :entity-id="pickerTx.id"
      :entity-kind="pickerKind"
      :portfolio-id="pickerTx.portfolioId"
      :current-labels="(pickerTx as PortfolioTx).labels ?? []"
      :trigger="pickerTrigger"
      @close="onPickerClosed"
      @saved="onPickerSaved"
    />
  </div>
</template>
