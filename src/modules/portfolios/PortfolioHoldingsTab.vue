<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { storeToRefs } from "pinia"
import {
  createPortfolioTransaction,
  removePortfolioPosition,
  updatePortfolioPosition,
} from "@/api/portfolios"
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import type { PortfolioPositions } from "@/api/types"
import EditPositionDialog from "@/modules/portfolios/EditPositionDialog.vue"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import { useCurrenciesStore } from "@/stores/currencies"
import { useTargetCurrency } from "@/composables/useTargetCurrency"
import { type LatestRate } from "@/api/fx"
import { useWalletsStore } from "@/stores/wallets"

type Position = PortfolioPositions[number]

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()
const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const id = String(route.params.id)

const openMenuId = ref<string | null>(null)
const notice = ref<string | null>(null)

type ActionKind = "buy" | "sell" | "dividend"
const action = ref<{ kind: ActionKind; position: Position } | null>(null)
const form = ref({ quantity: "", price: "", avgCost: "" })
const saving = ref(false)
const actionError = ref<string | null>(null)

const editPosition = ref<Position | null>(null)

const currenciesStore = useCurrenciesStore()
const walletsStore = useWalletsStore()
const targetCurrency = useTargetCurrency(
  computed(() => store.portfolios.find((p) => p.id === id)?.currency ?? null),
)

const fees = ref("0")
const feesType = ref<"fixed" | "pct">("fixed")
const feeCurrency = ref("USD")
const feeRateSource = ref<"automatic" | "manual">("automatic")
const feeExchangeRate = ref("")
const rateSource = ref<"automatic" | "manual">("automatic")
const exchangeRate = ref("")
const executedAt = ref(new Date().toISOString().slice(0, 10))
const walletId = ref("")
const txSuggestion = ref<LatestRate | null>(null)
const feeSuggestion = ref<LatestRate | null>(null)

function onTxSuggestion(r: LatestRate | null) { txSuggestion.value = r }
function onFeeSuggestion(r: LatestRate | null) { feeSuggestion.value = r }

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
  { key: "symbol", label: "Symbol", sortable: false },
  { key: "quantity", label: "Quantity", sortable: true },
  { key: "avgCost", label: "Avg Cost", sortable: true },
  { key: "price", label: "Price", sortable: true },
  { key: "marketValue", label: "Market Value", sortable: true },
  { key: "unrealized", label: "Unrealized P/L", sortable: true },
  { key: "weight", label: "% of Portfolio", sortable: true },
]

const visibleColumns = ref<string[]>(allColumns.map((c) => c.key))

onMounted(() => store.fetchPositions(id))

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

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

function assetLabel(pos: Position): string {
  const kind = pos.assetType ? pos.assetType.charAt(0) + pos.assetType.slice(1).toLowerCase() : "Stock"
  return `(${pos.country || "US"}) ${kind}`
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
  action.value = { kind, position }
  form.value = {
    quantity: kind === "sell" ? String(position.quantity) : "",
    price: String(position.currentPrice ?? ""),
    avgCost: String(position.averageCostBasis ?? ""),
  }
  fees.value = "0"
  feesType.value = "fixed"
  feeCurrency.value = position.instrumentCurrency ?? "USD"
  feeRateSource.value = "automatic"
  feeExchangeRate.value = ""
  rateSource.value = "automatic"
  exchangeRate.value = ""
  executedAt.value = new Date().toISOString().slice(0, 10)
  walletId.value = ""
  txSuggestion.value = null
  feeSuggestion.value = null
  if (!currenciesStore.loaded) void currenciesStore.load()
  if (!walletsStore.wallets.length) {
    walletsStore.fetchAll().then(() => {
      if (!walletId.value) walletId.value = walletsStore.wallets[0]?.id ?? ""
    })
  } else if (!walletId.value) {
    walletId.value = walletsStore.wallets[0]?.id ?? ""
  }
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

const actionPositionCost = computed(() => {
  if (!action.value) return 0
  const qty = Number(form.value.quantity) || 0
  const price = Number(form.value.price) || 0
  return qty * price
})

const actionTxRate = computed(() => {
  if (rateSource.value === "manual" && exchangeRate.value) return Number(exchangeRate.value)
  return txSuggestion.value?.rate ?? null
})

const actionFeeValue = computed(() => {
  if (feesType.value === "pct") return (actionPositionCost.value * (Number(fees.value) || 0)) / 100
  return Number(fees.value) || 0
})

const actionFeeRate = computed(() => {
  if (feeRateSource.value === "manual" && feeExchangeRate.value) return Number(feeExchangeRate.value)
  return feeSuggestion.value?.rate ?? null
})

const actionFeeInUsd = computed(() => {
  if (!action.value) return null
  const instCcy = action.value.position.instrumentCurrency ?? "USD"
  if (feeCurrency.value === instCcy) return actionFeeValue.value
  if (actionFeeRate.value && actionFeeValue.value) return actionFeeValue.value * actionFeeRate.value
  return null
})

const selectedWalletCurrency = computed(() => {
  const w = walletsStore.wallets.find((w) => w.id === walletId.value)
  return w?.currency ?? null
})

const actionCostConverted = computed(() => {
  if (actionTxRate.value == null) return null
  return actionPositionCost.value * actionTxRate.value
})

const actionTotalConverted = computed(() => {
  if (actionTxRate.value == null || !action.value) return null
  const feePart = actionFeeInUsd.value ?? 0
  return (actionPositionCost.value + feePart) * actionTxRate.value
})

function dialogTitle(): string {
  if (!action.value) return ""
  const map: Record<ActionKind, string> = {
    buy: `Buy ${action.value.position.symbol}`,
    sell: `Sell ${action.value.position.symbol}`,
    dividend: `Dividend for ${action.value.position.symbol}`,
  }
  return map[action.value.kind]
}

async function submitAction(): Promise<void> {
  if (!action.value) return
  saving.value = true
  actionError.value = null
  const { kind, position } = action.value
  const quantity = Number(form.value.quantity)
  const price = Number(form.value.price)
  const instCcy = position.instrumentCurrency ?? "USD"
  const dividendQty = kind === "dividend" ? (position.quantity || 1) : quantity
  const txPayload: Parameters<typeof createPortfolioTransaction>[1] = { type: kind === "buy" ? "BUY" : kind === "sell" ? "SELL" : "DIVIDEND", symbol: position.symbol, quantity: dividendQty, price, positionId: position.id }
  if (walletId.value) txPayload.walletId = walletId.value
  if (executedAt.value) txPayload.executedAt = new Date(executedAt.value).toISOString()
  if (position.instrumentCurrency) txPayload.currency = position.instrumentCurrency
  if (feesType.value === "fixed" && Number(fees.value) > 0) {
    txPayload.fees = Number(fees.value)
    txPayload.feesType = "fixed"
    if (feeCurrency.value !== instCcy) {
      txPayload.feeCurrency = feeCurrency.value
      txPayload.feeRateSource = feeRateSource.value
      if (feeRateSource.value === "manual" && feeExchangeRate.value) {
        txPayload.feeExchangeRate = Number(feeExchangeRate.value)
      }
    }
  } else if (feesType.value === "pct" && Number(fees.value) > 0) {
    txPayload.fees = (quantity * price * Number(fees.value)) / 100
    txPayload.feesType = "pct"
  }
  if (rateSource.value === "manual" && exchangeRate.value) {
    txPayload.rateSource = "manual"
    txPayload.exchangeRate = Number(exchangeRate.value)
  }
  try {
    if (kind === "buy") {
      await createPortfolioTransaction(id, txPayload)
      const newQty = (position.quantity || 0) + quantity
      const newAvg = ((position.quantity || 0) * (position.averageCostBasis || 0) + quantity * price) / newQty
      await updatePortfolioPosition(id, position.id, {
        quantity: newQty,
        averageCostBasis: newAvg,
        avgCostBasis: newAvg,
        instrumentAvgCostBasis: newAvg,
      })
      notice.value = `Bought ${quantity} ${position.symbol}`
    } else if (kind === "sell") {
      await createPortfolioTransaction(id, txPayload)
      const remaining = (position.quantity || 0) - quantity
      if (remaining <= 0) {
        await removePortfolioPosition(id, position.id)
      } else {
        await updatePortfolioPosition(id, position.id, { quantity: remaining })
      }
      notice.value = `Sold ${quantity} ${position.symbol}`
    } else if (kind === "dividend") {
      await createPortfolioTransaction(id, txPayload)
      notice.value = `Recorded dividend for ${position.symbol}`
    }
    await store.fetchPositions(id)
    action.value = null
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Action failed"
  } finally {
    saving.value = false
  }
}

async function removePosition(position: Position): Promise<void> {
  openMenuId.value = null
  try {
    await removePortfolioPosition(id, position.id)
    await store.fetchPositions(id)
    notice.value = `Removed ${position.symbol}`
  } catch (err) {
    notice.value = err instanceof Error ? err.message : "Failed to remove position"
  }
}

function goResearch(position: Position): void {
  openMenuId.value = null
  router.push({ name: "research-overview", params: { symbol: researchSymbol(position.symbol) } })
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

      <p v-if="notice" class="border-b border-slate-100 dark:border-slate-800 bg-green-50 dark:bg-green-500/10 px-5 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>

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
                  <div class="flex items-center gap-3">
                    <img :src="`/api/logos/${pos.symbol}`" :alt="pos.symbol" class="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                    <div>
                      <router-link
                        :to="{ name: 'research-overview', params: { symbol: researchSymbol(pos.symbol) } }"
                        class="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        {{ pos.symbol }}
                      </router-link>
                      <p class="text-xs text-slate-500 dark:text-slate-400">{{ pos.companyName }}</p>
                      <p class="text-[11px] text-slate-400 dark:text-slate-500">{{ assetLabel(pos) }}</p>
                    </div>
                  </div>
                </td>
              </template>
              <td v-if="visibleColumns.includes('quantity')" class="px-5 py-3 text-right tabular-nums">{{ formatNumber(pos.quantity, 0) }}</td>
              <td v-if="visibleColumns.includes('avgCost')" class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.averageCostBasis, displayCurrency) }}</td>
              <td v-if="visibleColumns.includes('price')" class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.currentPrice, displayCurrency) }}</td>
              <td v-if="visibleColumns.includes('marketValue')" class="px-5 py-3 text-right tabular-nums">
                <p>{{ formatCurrency(pos.marketValue, displayCurrency) }}</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">Cost {{ formatCurrency(pos.totalCostBasis, displayCurrency) }}</p>
              </td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-5 py-3 text-right tabular-nums" :class="gainClass(pos.unrealizedGainLoss)">
                <p>{{ formatSignedCurrency(pos.unrealizedGainLoss, displayCurrency) }}</p>
                <p class="text-xs font-normal" :class="gainClass(pos.percentageChange)">({{ formatPercent(pos.percentageChange) }})</p>
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
                      <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" @click="removePosition(pos)">Remove position</button>
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
              <td v-if="visibleColumns.includes('marketValue')" class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(groupTotal(g.items), displayCurrency) }}</td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-5 py-3 text-right tabular-nums">{{ formatSignedCurrency(g.items.reduce((s, p) => s + (p.unrealizedGainLoss || 0), 0), displayCurrency) }}</td>
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
              <td v-if="visibleColumns.includes('marketValue')" class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(totalValue, displayCurrency) }}</td>
              <td v-if="visibleColumns.includes('unrealized')" class="px-5 py-3 text-right tabular-nums" :class="gainClass(totalUnrealized)">{{ formatSignedCurrency(totalUnrealized, displayCurrency) }}</td>
              <td v-if="visibleColumns.includes('weight')" class="px-5 py-3"></td>
              <td class="px-5 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No open positions.</p>

    <div
      v-if="action"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="action = null"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="dialogTitle()">
        <h3 class="mb-4 text-base font-semibold">{{ dialogTitle() }}</h3>
        <form @submit.prevent="submitAction">
          <label v-if="action.kind !== 'dividend'" for="holdings-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Date</label>
          <input
            v-if="action.kind !== 'dividend'"
            id="holdings-date"
            v-model="executedAt"
            type="date"
            required
            class="input mb-4"
            data-testid="action-date"
          />

          <label v-if="action.kind !== 'dividend'" for="holdings-wallet" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Cash portfolio</label>
          <select
            v-if="action.kind !== 'dividend'"
            id="holdings-wallet"
            v-model="walletId"
            class="input mb-4"
            data-testid="action-wallet"
          >
            <option v-if="!walletsStore.wallets.length" value="" disabled>Loading wallets…</option>
            <option v-for="w in walletsStore.wallets" :key="w.id" :value="w.id">
              {{ w.name }} ({{ formatCurrency(w.balance, w.currency) }})
            </option>
          </select>

          <label v-if="action.kind !== 'dividend'" for="pos-qty" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Quantity</label>
          <input
            v-if="action.kind !== 'dividend'"
            id="pos-qty"
            v-model="form.quantity"
            type="number"
            min="0.000001"
            step="any"
            required
            class="input mb-4"
            data-testid="action-quantity"
          />
          <label
            :for="action.kind === 'dividend' ? 'pos-amount' : 'pos-price'"
            class="mb-1 block text-sm text-slate-600 dark:text-slate-300"
          >
            {{ action.kind === 'dividend' ? `Amount per share (${action.position.quantity} shares)` : 'Price' }}
          </label>
          <input
            :id="action.kind === 'dividend' ? 'pos-amount' : 'pos-price'"
            v-model="form.price"
            type="number"
            min="0"
            step="any"
            required
            class="input mb-4"
            data-testid="action-price"
          />

          <label v-if="action.kind !== 'dividend'" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Fees</label>
          <FeeFields
            v-if="action.kind !== 'dividend'"
            v-model:fees="fees"
            v-model:fees-type="feesType"
            v-model:fee-currency="feeCurrency"
            testid="holdings-action"
          />

          <FxRateFields
            v-if="action.kind !== 'dividend'"
            leg="Transaction"
            :from="selectedWalletCurrency || action.position.instrumentCurrency || 'USD'"
            :to="targetCurrency"
            :date="executedAt"
            v-model:rate-source="rateSource"
            v-model:rate="exchangeRate"
            testid="holdings-action-fx"
            @suggestion="onTxSuggestion"
          />

          <FxRateFields
            v-if="action.kind !== 'dividend'"
            leg="Fee"
            :from="feeCurrency"
            :to="action.position.instrumentCurrency || 'USD'"
            :date="executedAt"
            :hidden="feesType !== 'fixed' || feeCurrency === (action.position.instrumentCurrency || 'USD')"
            v-model:rate-source="feeRateSource"
            v-model:rate="feeExchangeRate"
            testid="holdings-action-fee-fx"
            @suggestion="onFeeSuggestion"
          />

          <dl v-if="action.kind !== 'dividend'" class="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <div class="flex items-center justify-between text-sm">
              <dt class="text-slate-600 dark:text-slate-300">Shares × Price</dt>
              <dd class="tabular-nums text-slate-900 dark:text-slate-100">
                {{ formatCurrency(actionPositionCost, action.position.instrumentCurrency || "USD") }}
                <template v-if="actionTxRate != null"> ≈ {{ formatCurrency(actionCostConverted!, targetCurrency ?? "") }}</template>
              </dd>
            </div>
            <div v-if="actionFeeValue > 0" class="mt-1 flex items-center justify-between text-sm">
              <dt class="text-slate-600 dark:text-slate-300">Fee ({{ feeCurrency }})</dt>
              <dd class="tabular-nums text-slate-900 dark:text-slate-100">
                {{ formatCurrency(actionFeeValue, feeCurrency) }}
                <template v-if="actionFeeRate != null && feeCurrency !== (action.position.instrumentCurrency || 'USD')"> ≈ {{ formatCurrency(actionFeeInUsd!, "USD") }}</template>
              </dd>
            </div>
            <div class="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 text-sm font-medium dark:border-slate-700">
              <dt class="text-slate-700 dark:text-slate-200">Total Cost</dt>
              <dd class="tabular-nums text-slate-900 dark:text-slate-100">
                {{ formatCurrency(actionPositionCost + (actionFeeInUsd ?? actionFeeValue), action.position.instrumentCurrency || "USD") }}
                <template v-if="actionTotalConverted != null"> ≈ {{ formatCurrency(actionTotalConverted, targetCurrency ?? "") }}</template>
              </dd>
            </div>
          </dl>

          <p v-if="actionError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ actionError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="action = null">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? "Saving..." : "Confirm" }}</button>
          </div>
        </form>
      </div>
    </div>
    </div>

    <EditPositionDialog
      :open="editPosition !== null"
      :portfolio-id="id"
      :position="editPosition"
      @close="onEditClose"
      @saved="onEditSaved"
    />
  </div>
</template>
