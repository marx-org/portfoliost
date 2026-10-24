<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { storeToRefs } from "pinia"
import { removePortfolioPosition, getPortfolioTransactions } from "@/api/portfolios"
import { formatAmount, formatDate, formatNumber, formatPercent, formatSignedAmount } from "@/utils/format"
import { researchRoute } from "@/utils/research"
import type { PortfolioPositions } from "@/api/types"
import TickerBadge from "@/components/TickerBadge.vue"
import EditPositionDialog from "@/modules/portfolios/EditPositionDialog.vue"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import RecordDividendDialog from "@/modules/portfolios/RecordDividendDialog.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"
import DualCurrencyCell from "@/components/DualCurrencyCell.vue"
import DualCurrencyPnlCell from "@/components/DualCurrencyPnlCell.vue"
import LabelFilterBar from "@/components/LabelFilterBar.vue"
import LabelChips from "@/components/LabelChips.vue"
import LabelManagerDialog from "@/components/LabelManagerDialog.vue"
import LabelPickerPopover from "@/components/LabelPickerPopover.vue"
import { triggerRectFromEvent, type TriggerRect } from "@/utils/popoverPosition"
import PriceChart from "@/components/PriceChart.vue"

type Position = PortfolioPositions[number]

const props = withDefaults(defineProps<{
  mode?: "portfolio" | "global"
  positions?: PortfolioPositions
  portfolioName?: string | null
  refresh?: () => void | Promise<void>
  readonly?: boolean
}>(), {
  mode: "portfolio",
  positions: undefined,
  portfolioName: null,
  refresh: undefined,
  readonly: false,
})

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()
const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const id = computed(() => String(route.params.id ?? ""))
const isGlobal = computed(() => props.mode === "global")

function positionKey(position: Position): string {
  return `${position.portfolioId ?? id.value}\u0000${position.id}`
}

function optionPositionDetails(position: Position): string | null {
  if (position.assetType?.toUpperCase() !== "OPTION") return null

  const details: string[] = []
  const direction = position.direction
    ? position.direction.charAt(0).toUpperCase() + position.direction.slice(1).toLowerCase()
    : ""
  const optionType = position.optionType
    ? position.optionType.charAt(0).toUpperCase() + position.optionType.slice(1).toLowerCase()
    : ""
  if (direction && optionType) details.push(`${direction} ${optionType}`)
  else if (direction || optionType) details.push(direction || optionType)
  if (position.strikePrice != null) {
    details.push(`Strike ${formatAmount(position.strikePrice, position.instrumentCurrency)}`)
  }
  if (position.expirationDate) details.push(`Exp ${formatDate(position.expirationDate)}`)
  if (position.contractSize != null) details.push(`×${formatNumber(position.contractSize, 0)}`)

  return details.join(" · ") || "Option"
}

const openMenuId = ref<string | null>(null)
const notice = ref<string | null>(null)
const noticeError = ref<string | null>(null)

const labelFilter = ref<string[]>([])
const manageLabelsOpen = ref(false)
const pickerOpen = ref(false)
const pickerPosition = ref<PortfolioPositions[number] | null>(null)
const pickerTrigger = ref<TriggerRect | null>(null)

const removeTarget = ref<Position | null>(null)
const removeBusy = ref(false)
const removeError = ref<string | null>(null)

type ActionKind = "buy" | "sell" | "dividend"
const positionAction = ref<{ kind: ActionKind; position: Position } | null>(null)

// Buy/sell actions are narrowed before they reach AddPositionDialog (dividends
// go to RecordDividendDialog, §49.4/§50.5).
const apdAction = computed(() => {
  const a = positionAction.value
  if (!a || a.kind === "dividend") return undefined
  return { kind: a.kind, position: a.position }
})

const editPosition = ref<Position | null>(null)
const actionPortfolioId = computed(() => positionAction.value ? ownerId(positionAction.value.position) : id.value)
const editPortfolioId = computed(() => editPosition.value ? ownerId(editPosition.value) : id.value)

const showCustomize = ref(false)
const sortKey = ref<string | null>(null)
const sortDir = ref<"asc" | "desc">("asc")

type GroupMode = "none" | "assetType" | "sector" | "country"
const groupBy = ref<GroupMode>("none")

const groupModes: Array<{ value: GroupMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "assetType", label: "Type" },
  { value: "sector", label: "Sector" },
  { value: "country", label: "Country" },
]

function groupValue(pos: Position, mode: GroupMode): string {
  switch (mode) {
    case "assetType":
      return (pos.assetType || "Stock").charAt(0) + (pos.assetType || "Stock").slice(1).toLowerCase()
    case "sector":
      return pos.sector || "Other"
    case "country":
      return pos.country || "Other"
    default:
      return ""
  }
}

// §157 — client-side paging. The full filtered+sorted set drives the totals,
// the group subtotals, the CSV export and the group header counts; only the
// current page's slice renders as data rows. Paging and grouping both act on
// the same list, so a group's subtotal and count stay correct even when only
// some of its rows are on the current page.
const pageSize = ref(20)
const pageSizes = [10, 20, 50, 100]
const page = ref(1)

const groups = computed(() => {
  if (groupBy.value === "none") {
    return [{ label: "", items: sorted.value, rows: pagedPositions.value }]
  }
  const map = new Map<string, Position[]>()
  for (const pos of sorted.value) {
    const key = groupValue(pos, groupBy.value)
    const list = map.get(key) ?? []
    list.push(pos)
    map.set(key, list)
  }
  const on = new Set(pagedPositions.value.map(positionKey))
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, items]) => ({ label, items, rows: items.filter((p) => on.has(positionKey(p))) }))
})

const colspan = computed(() => visibleColumns.value.length + 1 + (isGlobal.value ? 1 : 0))

function groupTotal(items: Position[]): number {
  return items.reduce((s, p) => s + (p.isOpen ? p.marketValue || 0 : 0), 0)
}

function groupUnrealizedTotal(items: Position[]): number {
  return items.reduce((s, p) => s + (p.isOpen ? p.unrealizedGainLoss || 0 : 0), 0)
}

interface ColumnDef {
  key: string
  label: string
  sortable: boolean
  /** Fixed pixel width for the colgroup (`table-fixed`). Omitted = the column
   *  is the flexible one (Symbol) that absorbs the remainder and truncates. */
  width?: number
}

// Widths are the widest realistic single line of that column (dual-currency
// value + P/L percent, measured in the browser) plus headroom. The realized
// column is native-currency only. The consolidated table's minimum width keeps
// its owner column without squeezing Symbol; portfolio mode fits its viewport.
const allColumns: ColumnDef[] = [
  { key: "symbol", label: "Symbol", sortable: true },
  { key: "quantity", label: "Quantity", sortable: true, width: 100 },
  { key: "avgCost", label: "Avg Cost", sortable: true, width: 110 },
  { key: "price", label: "Price", sortable: true, width: 78 },
  { key: "marketValue", label: "Market Value", sortable: true, width: 148 },
  { key: "unrealized", label: "Unrealized P/L", sortable: true, width: 146 },
  { key: "realized", label: "Realized P/L", sortable: true, width: 120 },
  { key: "weight", label: "% of Portfolio", sortable: true, width: 105 },
]

const visibleColumns = ref<string[]>(allColumns.map((c) => c.key))

onMounted(() => {
  if (!isGlobal.value) void store.fetchPositions(id.value, labelFilter.value)
})

watch(labelFilter, () => {
  if (!isGlobal.value) void store.fetchPositions(id.value, labelFilter.value)
})

const showClosedPositions = ref(false)
const searchFilter = ref("")

// Apply labels before the lifecycle toggle so retained history participates in
// the same filter pipeline as open positions in both per-portfolio and global
// views. The portfolio route also sends the label filter to the API.
const labelFilteredPositions = computed(() => {
  const source = isGlobal.value ? (props.positions ?? []) : store.positions
  return source.filter((p) => !labelFilter.value.length || p.labels?.some((label) => labelFilter.value.includes(label.id)))
})

const openPositions = computed(() => labelFilteredPositions.value.filter((p) => p.isOpen))
const positions = computed(() => labelFilteredPositions.value.filter((p) => showClosedPositions.value || p.isOpen))

function matchesSearch(position: Position, query: string): boolean {
  return String(position.symbol ?? "").toLowerCase().includes(query) ||
    String(position.companyName ?? "").toLowerCase().includes(query)
}

function matchingPositions(source: Position[]): Position[] {
  const query = searchFilter.value.trim().toLowerCase()
  return query ? source.filter((position) => matchesSearch(position, query)) : source
}

// Search both the visible rows and the open-only set independently: revealing
// retained history must not change the current open-position count or totals.
const searched = computed(() => matchingPositions(positions.value))
const openSearched = computed(() => matchingPositions(openPositions.value))
const emptyMessage = computed(() => {
  if (labelFilter.value.length || searchFilter.value.trim() || showClosedPositions.value) {
    return "No positions match the current filters."
  }
  if (!labelFilteredPositions.value.length) return "No open positions."
  if (!openPositions.value.length) return "No open positions. Show closed positions to view history."
  return "No positions match the current filters."
})

// The filtered+searched set in the current sort order. Paging, the totals and
// the group subtotals are all measured over this, so a search narrows the whole
// table (not just the visible page) and the numbers stay honest.
const sorted = computed(() => {
  if (!sortKey.value) return searched.value
  const valueOf = (p: Position, key: string): string | number => {
    switch (key) {
      case "quantity":
        return p.quantity
      case "avgCost":
        return p.averageCostBasis ?? 0
      case "price":
        return p.currentPrice ?? 0
      case "marketValue":
        return p.marketValue ?? 0
      case "unrealized":
        return p.unrealizedGainLoss ?? 0
      case "realized":
        return p.realizedGainLoss ?? 0
      case "weight":
        return p.percentOfPortfolio ?? 0
      default:
        return p.symbol
    }
  }
  const dir = sortDir.value === "asc" ? 1 : -1
  return [...searched.value].sort((a, b) => {
    const av = valueOf(a, sortKey.value!)
    const bv = valueOf(b, sortKey.value!)
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)))

// Keep the slice honest if the page is ever stale relative to the (shrunken)
// sorted set — the watch below normally resets to page 1 on any filter change.
const clampedPage = computed(() => Math.min(page.value, totalPages.value))

const pagedPositions = computed(() => {
  const start = (clampedPage.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})

// A filter, search or page-size change means the current page is meaningless —
// fall back to the first page so a stale page never points at an empty slice.
watch([labelFilter, searchFilter, pageSize, showClosedPositions], () => {
  page.value = 1
})

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
}

function onPageSizeChange(e: Event) {
  pageSize.value = Number((e.target as HTMLSelectElement).value)
}

function pageNumbers(): (number | "…")[] {
  const t = totalPages.value
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1)
  const cur = clampedPage.value
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

function visibleColumnsDef(): ColumnDef[] {
  return allColumns.filter((c) => visibleColumns.value.includes(c.key))
}

function toggleColumn(key: string) {
  if (visibleColumns.value.includes(key)) {
    visibleColumns.value = visibleColumns.value.filter((c) => c !== key)
  } else {
    visibleColumns.value = [...visibleColumns.value, key]
  }
}

function toggleSort(key: string) {
  if (!allColumns.find((c) => c.key === key)?.sortable) return
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortKey.value = key
    sortDir.value = "asc"
  }
}

function sortIndicator(key: string): string {
  if (sortKey.value !== key) return "↕"
  return sortDir.value === "asc" ? "↑" : "↓"
}

// Measured over the search-filtered open set, so history can never inflate
// current holdings totals even while the closed rows are visible.
const totalValue = computed(() => openSearched.value.reduce((s, p) => s + (p.marketValue || 0), 0))
const totalUnrealized = computed(() => openSearched.value.reduce((s, p) => s + (p.unrealizedGainLoss || 0), 0))

/** Totals stay in each instrument's currency instead of adding unlike currencies. */
function realizedTotalsByCurrency(items: Position[]): Array<{ currency: string; amount: number }> {
  const totals = new Map<string, number>()
  for (const position of items) {
    const currency = (position.instrumentCurrency ?? "").toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + (position.realizedGainLoss ?? 0))
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }))
}

function formatRealizedTotal(total: { currency: string; amount: number }): string {
  const signedAmount = formatSignedAmount(total.amount, total.currency)
  if (!total.currency) return signedAmount
  // Intl uses the ISO code itself for currencies such as PLN, but symbols for
  // currencies like USD/EUR. Add the code only in the latter case, so mixed-
  // currency subtotals stay unambiguous without repeating codes such as "PLN".
  return formatAmount(1, total.currency).trim().toUpperCase().startsWith(total.currency)
    ? signedAmount
    : `${total.currency} ${signedAmount}`
}

// §48.6e B2 — the backend's `converted*` position fields are denominated in
// the portfolio BASE currency (wallets D21b), not the user's display
// currency. Each position declares that denomination in `displayCurrency`
// (it can differ from the portfolio's `currency`, e.g. API-created
// portfolios default to a USD base). Convert once per
// (base → displayCurrency) via getLatestRate (the §36/§41 client-side
// pattern). Until the rate resolves the converted sub-lines render without
// a value — a mislabelled amount is never shown.
const portfolioCcy = computed(() => {
  const source = isGlobal.value ? (props.positions ?? []) : store.positions
  const pos = source.find((p) => p.isOpen)
  return (pos?.displayCurrency ?? "").toUpperCase() || null
})
// §67.2 — third copy of the same conversion removed; the source is still this
// portfolio's own `displayCurrency`, so the totals rows keep their existing
// fallback (native currency when the rate is unknown, never a foreign symbol).
const { rate: toDisplayRate, convert: toDisplay, displayCurrencyOr } = useDisplayConversion(
  () => portfolioCcy.value,
)
// the display currency once a rate is known, else the portfolio's own
const totalsCcy = computed(() => displayCurrencyOr())

// The totals rows are intentionally NOT null-returning: when the rate is
// unknown they fall back to the portfolio-currency sum and `totalsCcy` labels it
// as the portfolio currency. That is why they use `rate` directly rather than
// `convert()` — a behaviour the dedup must preserve.
const totalValueDisplay = computed(() => (toDisplayRate.value == null ? totalValue.value : totalValue.value * toDisplayRate.value))
const totalUnrealizedDisplay = computed(() => (toDisplayRate.value == null ? totalUnrealized.value : totalUnrealized.value * toDisplayRate.value))

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400"
}

function exportCsv() {
  // Export the full filtered+searched set in the current sort order — not just
  // the visible page — so a CSV reflects the active search/sort across pages.
  const rows = sorted.value.map((p) =>
    [
      p.symbol,
      p.quantity,
      p.averageCostBasis ?? "",
      p.currentPrice ?? "",
      p.marketValue ?? "",
      p.unrealizedGainLoss ?? "",
      p.realizedGainLoss ?? 0,
      p.percentOfPortfolio ?? "",
      ...(showClosedPositions.value ? [p.isOpen ? "Open" : "Closed", p.isOpen ? "" : p.closedAt ?? ""] : []),
    ].join(","),
  )
  const baseHeader = "Symbol,Quantity,Avg Cost,Price,Market Value,Unrealized P/L,Realized P/L,Weight"
  const header = showClosedPositions.value ? `${baseHeader},Status,Closed At` : baseHeader
  const csv = [header, ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${(props.portfolioName ?? store.detail?.name ?? "consolidated_holdings").replace(/\s+/g, "_")}-positions.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function openAction(kind: ActionKind, position: Position): void {
  openMenuId.value = null
  positionAction.value = { kind, position }
}

function toggleActionMenu(position: Position): void {
  const key = positionKey(position)
  openMenuId.value = openMenuId.value === key ? null : key
}

function onActionSaved() {
  notice.value = positionAction.value
    ? `${positionAction.value.kind === "buy" ? "Bought" : positionAction.value.kind === "sell" ? "Sold" : "Recorded dividend for"} ${positionAction.value!.position.symbol}`
    : null
  const ownerId = positionAction.value ? positionAction.value.position.portfolioId : id.value
  positionAction.value = null
  if (isGlobal.value) void props.refresh?.()
  else void store.fetchPositions(ownerId)
}

function onActionClose() {
  positionAction.value = null
}

function openEditPosition(position: Position): void {
  openMenuId.value = null
  editPosition.value = position
}

function onEditClose() {
  editPosition.value = null
}

function onEditSaved() {
  if (isGlobal.value) void props.refresh?.()
  else void store.fetchPositions(id.value)
}

function ownerId(position: Position): string {
  return position.portfolioId ?? id.value
}

async function openRemoveConfirm(position: Position): Promise<void> {
  openMenuId.value = null
  notice.value = null
  noticeError.value = null
  try {
    const page = await getPortfolioTransactions(ownerId(position), 1, 1, "date", "desc", position.id)
    if (page.total > 0) {
      noticeError.value = `Cannot remove ${position.symbol} — it has ${page.total} transaction${page.total === 1 ? "" : "s"}. Delete the transactions first.`
      return
    }
    removeError.value = null
    removeTarget.value = position
  } catch (err) {
    noticeError.value = err instanceof Error ? err.message : "Failed to check position transactions"
  }
}

async function confirmRemovePosition(): Promise<void> {
  if (!removeTarget.value) return
  const target = removeTarget.value
  removeBusy.value = true
  removeError.value = null
  try {
    await removePortfolioPosition(ownerId(target), target.id)
    removeTarget.value = null
    if (isGlobal.value) await props.refresh?.()
    else await store.fetchPositions(id.value)
    notice.value = `Removed ${target.symbol}`
  } catch (err) {
    removeError.value = err instanceof Error ? err.message : "Failed to remove position"
  } finally {
    removeBusy.value = false
  }
}

function goResearch(position: Position): void {
  openMenuId.value = null
  router.push(researchRoute(position.symbol, route.fullPath))
}

const chartPosition = ref<Position | null>(null)

function openChartView(position: Position): void {
  openMenuId.value = null
  chartPosition.value = position
}

function openLabelPicker(position: Position, e: MouseEvent): void {
  // The kebab menu closes (and unmounts this button) right after the click, so
  // the rect has to be snapshotted now — the panel is placed from the numbers.
  pickerTrigger.value = triggerRectFromEvent(e.currentTarget)
  openMenuId.value = null
  pickerPosition.value = position
  pickerOpen.value = true
}

function onPickerClosed() {
  pickerPosition.value = null
  pickerOpen.value = false
  pickerTrigger.value = null
}

function onPickerSaved() {
  onPickerClosed()
  if (isGlobal.value) void props.refresh?.()
  else void store.fetchPositions(id.value, labelFilter.value)
}
</script>

<template>
  <div class="space-y-4">
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold">Positions</h2>
          <span class="text-sm text-slate-500 dark:text-slate-400">
            <template v-if="showClosedPositions">{{ openSearched.length }} open · {{ searched.length - openSearched.length }} closed</template>
            <template v-else>{{ openSearched.length }} open</template>
          </span>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            Group by
            <select v-model="groupBy" class="input !w-auto !py-1 !text-xs" aria-label="Group by">
              <option v-for="mode in groupModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
            </select>
          </label>
          <button type="button" class="btn-secondary text-xs" @click="exportCsv">Export</button>
          <div class="relative">
            <button type="button" class="btn-secondary text-xs" @click="showCustomize = !showCustomize">
              Customize {{ visibleColumns.length }}
            </button>
            <template v-if="showCustomize">
              <div class="fixed inset-0 z-20" @click="showCustomize = false"></div>
              <div class="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-2 shadow-lg">
                <p class="px-2 pb-1 text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Columns</p>
                <label v-for="col in allColumns" :key="col.key" class="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" class="h-4 w-4" :checked="visibleColumns.includes(col.key)" @change="toggleColumn(col.key)" />
                  {{ col.label }}
                </label>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="border-b border-slate-100 dark:border-slate-800 px-5 py-2">
        <div class="flex flex-wrap items-center gap-3">
          <LabelFilterBar v-model="labelFilter" @manage="manageLabelsOpen = true" />
          <label class="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              v-model="showClosedPositions"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
              aria-label="Show closed positions"
              data-testid="holdings-closed-filter"
            />
            <span>Show closed positions</span>
          </label>
          <label class="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span class="sr-only">Filter by company name or ticker</span>
            <input
              v-model="searchFilter"
              class="input !w-56 !py-1.5 !text-xs"
              type="search"
              placeholder="Company name or ticker"
              aria-label="Filter by company name or ticker"
              data-testid="holdings-search"
            />
          </label>
        </div>
      </div>

      <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 bg-green-50 dark:bg-green-500/10 px-5 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
      <p v-if="noticeError" class="border-b border-slate-100 dark:border-slate-800 bg-red-50 dark:bg-red-500/10 px-5 py-2 text-sm text-red-700 dark:text-red-400">{{ noticeError }}</p>

      <div v-if="sorted.length" class="overflow-x-auto" data-testid="holdings-table-wrap">
        <table :class="['w-full table-fixed text-sm', isGlobal ? 'min-w-[1140px]' : '']">
          <!-- §157 — table-fixed with an explicit colgroup: the numeric columns
               take a fixed share so a long company name inflates only the
               flexible Symbol column (which truncates), never pushing the
               Market Value column off-screen. -->
          <colgroup>
            <col v-if="isGlobal" style="width: 110px" />
            <template v-for="col in visibleColumnsDef()" :key="col.key">
              <col v-if="col.width" :style="{ width: `${col.width}px` }" />
              <col v-else />
            </template>
            <col style="width: 56px" />
          </colgroup>
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <th v-if="isGlobal" class="px-5 py-2.5 font-medium">Portfolio</th>
              <th
                v-for="col in visibleColumnsDef()"
                :key="col.key"
                :data-testid="col.key === 'realized' ? 'holdings-column-realized' : undefined"
                class="py-2.5 font-medium"
                :class="[col.width ? 'px-3' : 'px-5', col.sortable ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100' : '']"
                :aria-sort="sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined"
                @click="toggleSort(col.key)"
              >
                <span class="inline-flex items-center gap-1">
                  {{ col.label }}
                  <span v-if="col.sortable" class="text-[10px] text-slate-400 dark:text-slate-500">{{ sortIndicator(col.key) }}</span>
                </span>
              </th>
              <th class="px-5 py-2.5"><span class="sr-only">Position actions</span></th>
            </tr>
          </thead>
          <tbody v-for="g in groups" :key="g.label || 'all'" class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-if="g.label" class="bg-slate-100/70" data-testid="holdings-group-row">
              <td :colspan="colspan" class="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {{ g.label }}
                <span class="font-normal text-slate-400 dark:text-slate-500">{{ g.items.length }}</span>
              </td>
            </tr>
            <tr v-for="pos in g.rows" :key="positionKey(pos)" data-testid="holdings-row" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td v-if="isGlobal" class="truncate px-5 py-3 text-slate-700 dark:text-slate-200">{{ pos.portfolioName || pos.portfolioId }}</td>
              <template v-if="visibleColumns.includes('symbol')">
                <!-- min-w-0 + overflow-hidden on the td: under table-fixed the
                     column has a definite width, so the TickerBadge's inner
                     truncate clips a long company name to an ellipsis here. -->
                <td class="min-w-0 overflow-hidden px-5 py-3">
                  <router-link :to="researchRoute(pos.symbol, route.fullPath)" class="block">
                    <TickerBadge
                      :symbol="pos.symbol"
                      :name="pos.companyName"
                      :country-code="pos.country"
                      :asset-type="pos.assetType"
                    />
                    <p
                      v-if="optionPositionDetails(pos)"
                      data-testid="holdings-option-details"
                      class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400"
                    >{{ optionPositionDetails(pos) }}</p>
                  </router-link>
                  <span v-if="!pos.isOpen" class="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Closed<span v-if="pos.closedAt"> · {{ formatDate(pos.closedAt) }}</span>
                  </span>
                  <LabelChips v-if="pos.labels?.length" :labels="pos.labels" :max="4" class="mt-1" />
                </td>
              </template>
              <td v-if="visibleColumns.includes('quantity')" class="whitespace-nowrap px-3 py-3 text-right tabular-nums">{{ formatNumber(pos.quantity, 0) }}</td>
              <td v-if="visibleColumns.includes('avgCost')" class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                <DualCurrencyCell
                  :primary="pos.averageCostBasis"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedAverageCostBasis)"
                  :display-currency="displayCurrency"
                />
              </td>
              <td v-if="visibleColumns.includes('price')" class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                <DualCurrencyCell
                  :primary="pos.currentPrice"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedCurrentPrice)"
                  :display-currency="displayCurrency"
                />
              </td>
              <td v-if="visibleColumns.includes('marketValue')" class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                <DualCurrencyCell
                  :primary="pos.marketValue"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedMarketValue)"
                  :display-currency="displayCurrency"
                />
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  Cost <DualCurrencyCell
                    :primary="pos.totalCostBasis"
                    :primary-currency="pos.instrumentCurrency"
                    :converted="toDisplay((pos as any).convertedTotalCostBasis)"
                    :display-currency="displayCurrency"
                  />
                </p>
              </td>
              <td v-if="visibleColumns.includes('unrealized')" class="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                <DualCurrencyPnlCell
                  :primary="pos.unrealizedGainLoss"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedUnrealizedGainLoss)"
                  :display-currency="displayCurrency"
                  :percent="pos.percentageChange"
                />
              </td>
              <td
                v-if="visibleColumns.includes('realized')"
                class="whitespace-nowrap px-3 py-3 text-right tabular-nums"
              >
                <span
                  data-testid="holdings-cell-realized"
                  :aria-label="`Realized P/L ${formatSignedAmount(pos.realizedGainLoss ?? 0, pos.instrumentCurrency)}`"
                  :class="gainClass(pos.realizedGainLoss ?? 0)"
                >{{ formatSignedAmount(pos.realizedGainLoss ?? 0, pos.instrumentCurrency) }}</span>
              </td>
              <td v-if="visibleColumns.includes('weight')" class="whitespace-nowrap px-3 py-3 text-right tabular-nums">{{ formatPercent(pos.percentOfPortfolio) }}</td>
              <td class="px-5 py-3 text-right">
                <div class="relative inline-block">
                  <button
                    type="button"
                    aria-label="Position actions"
                    class="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                    @click="toggleActionMenu(pos)"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <circle cx="8" cy="3" r="1.4" />
                      <circle cx="8" cy="8" r="1.4" />
                      <circle cx="8" cy="13" r="1.4" />
                    </svg>
                  </button>
                  <template v-if="openMenuId === positionKey(pos)">
                    <div class="fixed inset-0 z-20" @click="openMenuId = null"></div>
                    <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 py-1 shadow-lg">
                       <button v-if="!props.readonly" type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openAction('buy', pos)">Buy</button>
                       <button v-if="!props.readonly" type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openAction('sell', pos)">Sell</button>
                       <button v-if="!props.readonly" type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openAction('dividend', pos)">Dividend</button>
                       <button v-if="!props.readonly" type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openEditPosition(pos)">Edit position</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="goResearch(pos)">Research</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openChartView(pos)">View chart</button>
                       <button v-if="!props.readonly" type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openLabelPicker(pos, $event)">Set labels...</button>
                       <button v-if="!props.readonly" type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" @click="openRemoveConfirm(pos)">Remove position</button>
                    </div>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="g.label" class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td class="px-5 py-3 text-slate-500 dark:text-slate-400">{{ g.label }} subtotal</td>
              <td v-if="visibleColumns.includes('quantity')" class="px-3 py-3"></td>
              <td v-if="visibleColumns.includes('avgCost')" class="px-3 py-3"></td>
              <td v-if="visibleColumns.includes('price')" class="px-3 py-3"></td>
              <td v-if="visibleColumns.includes('marketValue')" class="px-3 py-3 text-right tabular-nums">{{ formatAmount(groupTotal(g.items) * (toDisplayRate ?? 1), totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-3 py-3 text-right tabular-nums">{{ formatSignedAmount(groupUnrealizedTotal(g.items) * (toDisplayRate ?? 1), totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('realized')" class="px-3 py-3 text-right tabular-nums" data-testid="holdings-group-realized">
                <span
                  v-for="total in realizedTotalsByCurrency(g.items)"
                  :key="total.currency"
                  class="mr-2 inline-block whitespace-nowrap"
                  :class="gainClass(total.amount)"
                >{{ formatRealizedTotal(total) }}</span>
              </td>
              <td v-if="visibleColumns.includes('weight')" class="px-3 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tbody>
          <tfoot v-if="groupBy === 'none'">
            <tr class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td v-if="visibleColumns.includes('symbol')" class="px-5 py-3">Total</td>
              <td v-if="visibleColumns.includes('quantity')" class="px-3 py-3"></td>
              <td v-if="visibleColumns.includes('avgCost')" class="px-3 py-3"></td>
              <td v-if="visibleColumns.includes('price')" class="px-3 py-3"></td>
              <td v-if="visibleColumns.includes('marketValue')" class="px-3 py-3 text-right tabular-nums">{{ formatAmount(totalValueDisplay, totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-3 py-3 text-right tabular-nums" :class="gainClass(totalUnrealized)">{{ formatSignedAmount(totalUnrealizedDisplay, totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('realized')" class="px-3 py-3 text-right tabular-nums" data-testid="holdings-total-realized">
                <span
                  v-for="total in realizedTotalsByCurrency(sorted)"
                  :key="total.currency"
                  class="mr-2 inline-block whitespace-nowrap"
                  :class="gainClass(total.amount)"
                >{{ formatRealizedTotal(total) }}</span>
              </td>
              <td v-if="visibleColumns.includes('weight')" class="px-3 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
        {{ emptyMessage }}
      </p>

      <!-- §157 — client-side paginator, mirroring the transactions table. The
           range counts the filtered+searched set; the Total row and group
           subtotals above are measured over that same set, so they stay correct
           on every page and while a filter is applied. -->
      <div v-if="sorted.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ (clampedPage - 1) * pageSize + 1 }}–{{ Math.min(clampedPage * pageSize, sorted.length) }} of {{ sorted.length }}
        </p>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            Rows per page
            <select
              class="input py-1"
              :value="pageSize"
              aria-label="Rows per page"
              data-testid="holdings-page-size"
              @change="onPageSizeChange"
            >
              <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} per page</option>
            </select>
          </label>
          <nav aria-label="Pagination" class="flex items-center gap-1">
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="First page" :disabled="clampedPage <= 1" @click="goToPage(1)">«</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Previous page" :disabled="clampedPage <= 1" @click="goToPage(clampedPage - 1)">‹</button>
            <button
              v-for="n in pageNumbers()" :key="n" type="button"
              class="btn-ghost px-2 py-1 text-xs"
              :class="n === clampedPage ? 'bg-slate-900 text-white dark:bg-slate-700' : ''"
              :aria-current="n === clampedPage ? 'page' : undefined"
              :disabled="n === '…'"
              @click="goToPage(Number(n))"
            >{{ n }}</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Next page" :disabled="clampedPage >= totalPages" @click="goToPage(clampedPage + 1)">›</button>
            <button type="button" class="btn-ghost px-2 py-1 text-xs" aria-label="Last page" :disabled="clampedPage >= totalPages" @click="goToPage(totalPages)">»</button>
          </nav>
        </div>
      </div>
    </div>

    <AddPositionDialog v-if="!props.readonly"
      :open="positionAction !== null && positionAction.kind !== 'dividend'"
      :portfolio-id="actionPortfolioId"
      :position-action="apdAction"
      @close="onActionClose"
      @saved="onActionSaved"
    />

    <RecordDividendDialog v-if="!props.readonly"
      :open="positionAction?.kind === 'dividend'"
      :portfolio-id="actionPortfolioId"
      :position="positionAction?.kind === 'dividend' ? positionAction.position : null"
      @close="onActionClose"
      @saved="onActionSaved"
    />

    <EditPositionDialog v-if="!props.readonly"
      :open="editPosition !== null"
      :portfolio-id="editPortfolioId"
      :position="editPosition"
      @close="onEditClose"
      @saved="onEditSaved"
    />

    <ConfirmDeleteModal v-if="!props.readonly"
      :open="!!removeTarget"
      title="Remove position"
      :message="removeTarget ? `This permanently deletes ${removeTarget.symbol} from this portfolio. This cannot be undone.` : ''"
      :busy="removeBusy"
      :error="removeError"
      @close="removeTarget = null"
      @confirm="confirmRemovePosition"
    />

    <LabelManagerDialog :open="manageLabelsOpen" @close="manageLabelsOpen = false" />

    <LabelPickerPopover v-if="!props.readonly && pickerPosition"
      :open="pickerOpen"
      :entity-id="pickerPosition.id"
      entity-kind="position"
      :current-labels="pickerPosition.labels ?? []"
      :trigger="pickerTrigger"
      @close="onPickerClosed"
      @saved="onPickerSaved"
    />

    <div v-if="chartPosition" class="fixed inset-0 z-50 overflow-auto bg-white dark:bg-slate-900 p-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">
          <!-- §85.3 — the badge joins the existing wording rather than replacing
               it: this `h2` is also the `role="heading"` an e2e locates, so the
               text has to stay. It is a full-screen modal, not a dialog over the
               page, so `goResearch` (emit-then-push) is not in play here. -->
          <TickerBadge
            size="lg"
            :symbol="chartPosition.symbol"
            :name="chartPosition.companyName"
            :country-code="chartPosition.country"
            :asset-type="chartPosition.assetType"
            class="align-middle"
          />
          <span class="align-middle">{{ chartPosition.symbol }} — {{ chartPosition.companyName }}</span>
        </h2>
        <button type="button" class="btn-secondary text-sm" @click="chartPosition = null">Close</button>
      </div>
      <PriceChart
        :symbol="chartPosition.symbol"
        :portfolio-id="ownerId(chartPosition)"
        :portfolio-name="chartPosition.portfolioName ?? store.detail?.name ?? null"
        :default-show-transactions="true"
      />
    </div>
  </div>
</template>
