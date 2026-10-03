<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { storeToRefs } from "pinia"
import { removePortfolioPosition, getPortfolioTransactions } from "@/api/portfolios"
import { formatAmount, formatNumber, formatPercent, formatSignedAmount } from "@/utils/format"
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

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()
const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const id = String(route.params.id)

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

const groups = computed(() => {
  if (groupBy.value === "none") return [{ label: "", items: positions.value }]
  const map = new Map<string, Position[]>()
  for (const pos of positions.value) {
    const key = groupValue(pos, groupBy.value)
    const list = map.get(key) ?? []
    list.push(pos)
    map.set(key, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, items]) => ({ label, items }))
})

const colspan = computed(() => visibleColumns.value.length + 1)

function groupTotal(items: Position[]): number {
  return items.reduce((s, p) => s + (p.marketValue || 0), 0)
}

interface ColumnDef {
  key: string
  label: string
  sortable: boolean
}

const allColumns: ColumnDef[] = [
  { key: "symbol", label: "Symbol", sortable: true },
  { key: "quantity", label: "Quantity", sortable: true },
  { key: "avgCost", label: "Avg Cost", sortable: true },
  { key: "price", label: "Price", sortable: true },
  { key: "marketValue", label: "Market Value", sortable: true },
  { key: "unrealized", label: "Unrealized P/L", sortable: true },
  { key: "weight", label: "% of Portfolio", sortable: true },
]

const visibleColumns = ref<string[]>(allColumns.map((c) => c.key))

onMounted(() => {
  void store.fetchPositions(id, labelFilter.value)
})

watch(labelFilter, () => {
  void store.fetchPositions(id, labelFilter.value)
})

const positions = computed(() => {
  const open = store.positions.filter((p) => p.isOpen)
  if (!sortKey.value) return open
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
      case "weight":
        return p.percentOfPortfolio ?? 0
      default:
        return p.symbol
    }
  }
  const dir = sortDir.value === "asc" ? 1 : -1
  return [...open].sort((a, b) => {
    const av = valueOf(a, sortKey.value!)
    const bv = valueOf(b, sortKey.value!)
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
})

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

const totalValue = computed(() => store.positions.filter((p) => p.isOpen).reduce((s, p) => s + (p.marketValue || 0), 0))
const totalUnrealized = computed(() => store.positions.filter((p) => p.isOpen).reduce((s, p) => s + (p.unrealizedGainLoss || 0), 0))

// §48.6e B2 — the backend's `converted*` position fields are denominated in
// the portfolio BASE currency (wallets D21b), not the user's display
// currency. Each position declares that denomination in `displayCurrency`
// (it can differ from the portfolio's `currency`, e.g. API-created
// portfolios default to a USD base). Convert once per
// (base → displayCurrency) via getLatestRate (the §36/§41 client-side
// pattern). Until the rate resolves the converted sub-lines render without
// a value — a mislabelled amount is never shown.
const portfolioCcy = computed(() => {
  const pos = store.positions.find((p) => p.isOpen)
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
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

function exportCsv() {
  const rows = positions.value.map((p) =>
    [
      p.symbol,
      p.quantity,
      p.averageCostBasis ?? "",
      p.currentPrice ?? "",
      p.marketValue ?? "",
      p.unrealizedGainLoss ?? "",
      p.percentOfPortfolio ?? "",
    ].join(","),
  )
  const csv = ["Symbol,Quantity,Avg Cost,Price,Market Value,Unrealized P/L,Weight", ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${(store.detail?.name ?? "portfolio").replace(/\s+/g, "_")}-positions.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function openAction(kind: ActionKind, position: Position): void {
  openMenuId.value = null
  positionAction.value = { kind, position }
}

function onActionSaved() {
  notice.value = positionAction.value
    ? `${positionAction.value.kind === "buy" ? "Bought" : positionAction.value.kind === "sell" ? "Sold" : "Recorded dividend for"} ${positionAction.value!.position.symbol}`
    : null
  positionAction.value = null
  void store.fetchPositions(id)
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
  void store.fetchPositions(id)
}

async function openRemoveConfirm(position: Position): Promise<void> {
  openMenuId.value = null
  notice.value = null
  noticeError.value = null
  try {
    const page = await getPortfolioTransactions(id, 1, 1, "date", "desc", position.id)
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
    await removePortfolioPosition(id, target.id)
    removeTarget.value = null
    await store.fetchPositions(id)
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
  void store.fetchPositions(id, labelFilter.value)
}
</script>

<template>
  <div class="space-y-4">
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold">Positions</h2>
          <span class="text-sm text-slate-500 dark:text-slate-400">{{ positions.length }} open</span>
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
        <LabelFilterBar v-model="labelFilter" @manage="manageLabelsOpen = true" />
      </div>

      <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 bg-green-50 dark:bg-green-500/10 px-5 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
      <p v-if="noticeError" class="border-b border-slate-100 dark:border-slate-800 bg-red-50 dark:bg-red-500/10 px-5 py-2 text-sm text-red-700 dark:text-red-400">{{ noticeError }}</p>

      <div v-if="positions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <th
                v-for="col in visibleColumnsDef()"
                :key="col.key"
                class="px-5 py-2.5 font-medium"
                :class="col.sortable ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100' : ''"
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
            <tr v-for="pos in g.items" :key="pos.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <template v-if="visibleColumns.includes('symbol')">
                <td class="px-5 py-3">
                  <router-link :to="researchRoute(pos.symbol, route.fullPath)" class="block">
                    <TickerBadge
                      :symbol="pos.symbol"
                      :name="pos.companyName"
                      :country-code="pos.country"
                      :asset-type="pos.assetType"
                    />
                  </router-link>
                  <LabelChips v-if="pos.labels?.length" :labels="pos.labels" :max="4" class="mt-1" />
                </td>
              </template>
              <td v-if="visibleColumns.includes('quantity')" class="px-5 py-3 text-right tabular-nums">{{ formatNumber(pos.quantity, 0) }}</td>
              <td v-if="visibleColumns.includes('avgCost')" class="px-5 py-3 text-right tabular-nums">
                <DualCurrencyCell
                  :primary="pos.averageCostBasis"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedAverageCostBasis)"
                  :display-currency="displayCurrency"
                />
              </td>
              <td v-if="visibleColumns.includes('price')" class="px-5 py-3 text-right tabular-nums">
                <DualCurrencyCell
                  :primary="pos.currentPrice"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedCurrentPrice)"
                  :display-currency="displayCurrency"
                />
              </td>
              <td v-if="visibleColumns.includes('marketValue')" class="px-5 py-3 text-right tabular-nums">
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
              <td v-if="visibleColumns.includes('unrealized')" class="px-5 py-3 text-right tabular-nums">
                <DualCurrencyPnlCell
                  :primary="pos.unrealizedGainLoss"
                  :primary-currency="pos.instrumentCurrency"
                  :converted="toDisplay((pos as any).convertedUnrealizedGainLoss)"
                  :display-currency="displayCurrency"
                  :percent="pos.percentageChange"
                />
              </td>
              <td v-if="visibleColumns.includes('weight')" class="px-5 py-3 text-right tabular-nums">{{ formatPercent(pos.percentOfPortfolio) }}</td>
              <td class="px-5 py-3 text-right">
                <div class="relative inline-block">
                  <button
                    type="button"
                    aria-label="Position actions"
                    class="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                    @click="openMenuId = openMenuId === pos.id ? null : pos.id"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <circle cx="8" cy="3" r="1.4" />
                      <circle cx="8" cy="8" r="1.4" />
                      <circle cx="8" cy="13" r="1.4" />
                    </svg>
                  </button>
                  <template v-if="openMenuId === pos.id">
                    <div class="fixed inset-0 z-20" @click="openMenuId = null"></div>
                    <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 py-1 shadow-lg">
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openAction('buy', pos)">Buy</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openAction('sell', pos)">Sell</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openAction('dividend', pos)">Dividend</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openEditPosition(pos)">Edit position</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="goResearch(pos)">Research</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openChartView(pos)">View chart</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openLabelPicker(pos, $event)">Set labels...</button>
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" @click="openRemoveConfirm(pos)">Remove position</button>
                    </div>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="g.label" class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td class="px-5 py-3 text-slate-500 dark:text-slate-400">{{ g.label }} subtotal</td>
              <td v-if="visibleColumns.includes('quantity')" class="px-5 py-3"></td>
              <td v-if="visibleColumns.includes('avgCost')" class="px-5 py-3"></td>
              <td v-if="visibleColumns.includes('price')" class="px-5 py-3"></td>
              <td v-if="visibleColumns.includes('marketValue')" class="px-5 py-3 text-right tabular-nums">{{ formatAmount(groupTotal(g.items) * (toDisplayRate ?? 1), totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-5 py-3 text-right tabular-nums">{{ formatSignedAmount(g.items.reduce((s, p) => s + (p.unrealizedGainLoss || 0), 0) * (toDisplayRate ?? 1), totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('weight')" class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tbody>
          <tfoot v-if="groupBy === 'none'">
            <tr class="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 font-medium">
              <td v-if="visibleColumns.includes('symbol')" class="px-5 py-3">Total</td>
              <td v-if="visibleColumns.includes('quantity')" class="px-5 py-3"></td>
              <td v-if="visibleColumns.includes('avgCost')" class="px-5 py-3"></td>
              <td v-if="visibleColumns.includes('price')" class="px-5 py-3"></td>
              <td v-if="visibleColumns.includes('marketValue')" class="px-5 py-3 text-right tabular-nums">{{ formatAmount(totalValueDisplay, totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-5 py-3 text-right tabular-nums" :class="gainClass(totalUnrealized)">{{ formatSignedAmount(totalUnrealizedDisplay, totalsCcy) }}</td>
              <td v-if="visibleColumns.includes('weight')" class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
    </div>

    <AddPositionDialog
      :open="positionAction !== null && positionAction.kind !== 'dividend'"
      :portfolio-id="id"
      :position-action="apdAction"
      @close="onActionClose"
      @saved="onActionSaved"
    />

    <RecordDividendDialog
      :open="positionAction?.kind === 'dividend'"
      :portfolio-id="id"
      :position="positionAction?.kind === 'dividend' ? positionAction.position : null"
      @close="onActionClose"
      @saved="onActionSaved"
    />

    <EditPositionDialog
      :open="editPosition !== null"
      :portfolio-id="id"
      :position="editPosition"
      @close="onEditClose"
      @saved="onEditSaved"
    />

    <ConfirmDeleteModal
      :open="!!removeTarget"
      title="Remove position"
      :message="removeTarget ? `This permanently deletes ${removeTarget.symbol} from this portfolio. This cannot be undone.` : ''"
      :busy="removeBusy"
      :error="removeError"
      @close="removeTarget = null"
      @confirm="confirmRemovePosition"
    />

    <LabelManagerDialog :open="manageLabelsOpen" @close="manageLabelsOpen = false" />

    <LabelPickerPopover
      v-if="pickerPosition"
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
        :portfolio-id="id"
        :portfolio-name="store.detail?.name ?? null"
        :default-show-transactions="true"
      />
    </div>
  </div>
</template>
