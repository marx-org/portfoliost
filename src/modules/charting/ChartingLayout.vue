<script setup lang="ts">
/**
 * Charting layout (feature #253, sub-issue #256).
 *
 * Shared shell for the Charting subpages: a sub-navigation, a scope toolbar
 * (account + label multiselect, All by default, with reset) and the routed
 * child view. The scope lives in the URL via useChartScope, so it persists
 * across subpages and deep links.
 */
import { computed, onMounted } from "vue"
import { useRoute } from "vue-router"
import { storeToRefs } from "pinia"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useCurrenciesStore } from "@/stores/currencies"
import LabelFilterBar from "@/components/LabelFilterBar.vue"
import { useChartScope } from "./useChartScope"
import type { ChartCategory } from "./registry"

const route = useRoute()

const scope = useChartScope()
const { selectedAccountIds, selectedLabelIds, allAccounts, allLabels, kind, from, to } = scope

const portfolios = usePortfolioStore()
const { portfolios: accountList } = storeToRefs(portfolios)

// Display currency: the charting default and the source for the toolbar select.
const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const currenciesStore = useCurrenciesStore()
const currencyOptions = computed(() => currenciesStore.options)
const activeCurrency = computed(() => scope.currency.value ?? displayCurrency.value)

onMounted(() => {
  if (!accountList.value.length) void portfolios.fetchAll().catch(() => {})
  void currenciesStore.load().catch(() => {})
  // Charting is re-denominated by the `currency` scope param. When the URL does
  // not already pin one, default it to the user's display currency so the whole
  // page matches the rest of the app (and not the API's fallback).
  if (!scope.currency.value) scope.setCurrency(displayCurrency.value)
})

// Normal and virtual portfolios are separate, mutually exclusive filter lines:
// the switch picks which side the account multiselect operates on. A virtual
// portfolio is a read-only view over the positions carrying its label, so it is
// never mixed with real accounts.
const visibleAccounts = computed(() =>
  accountList.value.filter((p) => (kind.value === "virtual" ? p.isVirtual === true : p.isVirtual !== true)),
)

const sections: { category: ChartCategory; label: string; to: string }[] = [
  { category: "performance", label: "Performance", to: "/en/charting/performance" },
  { category: "income", label: "Income", to: "/en/charting/income" },
  { category: "allocation", label: "Allocation", to: "/en/charting/allocation" },
  { category: "cash", label: "Cash & funding", to: "/en/charting/cash" },
  { category: "categories", label: "Stock categories", to: "/en/charting/stock-categories" },
]

const active = computed<ChartCategory>(() => {
  const seg = route.path.split("/").filter(Boolean).pop() ?? ""
  if (seg === "stock-categories") return "categories"
  if (seg === "income" || seg === "allocation" || seg === "cash" || seg === "performance") return seg
  return "performance"
})

function toggleAccount(id: string) {
  scope.toggleAccount(id)
}

/**
 * Predefined ranges, matching the performance chart's timeframe control
 * (1W/1M/3M/6M/1Y/2Y/ALL). The Charting API takes an inclusive from/to window,
 * so a range sets `from` relative to today and leaves `to` open; ALL clears
 * both. Months/years are subtracted with the day clamped to the target month.
 */
type RangeKey = "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "ALL"
const RANGES: { key: RangeKey; label: string; days?: number; months?: number }[] = [
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", months: 1 },
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "2Y", label: "2Y", months: 24 },
  { key: "ALL", label: "ALL" },
]

function subtractMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

function rangeFrom(key: RangeKey, now: Date = new Date()): string | undefined {
  const r = RANGES.find((x) => x.key === key)
  if (!r || key === "ALL") return undefined
  const d = r.days != null ? new Date(now.getTime() - r.days * 86_400_000) : subtractMonths(now, r.months ?? 0)
  return d.toISOString().slice(0, 10)
}

/** The range whose window matches the current from/to, or null for a custom window. */
const activeRange = computed<RangeKey | null>(() => {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  // A window with an explicit `to` other than today is custom.
  if (to.value && to.value !== todayStr) return null
  if (!from.value) return to.value ? null : "ALL"
  for (const r of RANGES) {
    if (r.key === "ALL") continue
    if (rangeFrom(r.key, today) === from.value) return r.key
  }
  return null
})

function setRange(key: RangeKey) {
  scope.setDates(rangeFrom(key) ?? "", "")
}

/** Apply the two date bounds together so the route is written once. */
function onDateChange(which: "from" | "to", event: Event) {
  const value = (event.target as HTMLInputElement).value
  const nextFrom = which === "from" ? value : from.value ?? ""
  const nextTo = which === "to" ? value : to.value ?? ""
  scope.setDates(nextFrom, nextTo)
}
</script>

<template>
  <div class="space-y-4" data-testid="charting-layout">
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
      <router-link
        v-for="s in sections"
        :key="s.category"
        :to="{ path: s.to, query: route.query }"
        class="rounded px-3 py-1 text-sm"
        :class="active === s.category ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
        data-testid="charting-nav"
      >
        {{ s.label }}
      </router-link>
    </div>

    <!-- Scope toolbar -->
    <div class="flex flex-wrap items-center gap-3 rounded border border-slate-200 p-3 dark:border-slate-700" data-testid="charting-toolbar">
      <div class="flex items-center gap-1 rounded border border-slate-300 p-0.5 dark:border-slate-600" data-testid="charting-kind-switch">
        <span class="px-1 text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Portfolios</span>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs"
          :class="kind === 'normal' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="scope.setKind('normal')"
        >
          Normal
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs"
          :class="kind === 'virtual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="scope.setKind('virtual')"
        >
          Virtual
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Accounts</span>
        <span v-if="allAccounts" class="text-xs text-slate-500">All</span>
        <button
          v-for="p in visibleAccounts"
          :key="p.id"
          type="button"
          class="rounded border px-2 py-0.5 text-xs"
          :class="selectedAccountIds.includes(p.id) ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-slate-300 dark:border-slate-600'"
          @click="toggleAccount(p.id)"
        >
          {{ p.name }}
        </button>
      </div>
      <!-- A virtual portfolio is itself a label-defined view, so the separate
           label filter only applies to normal accounts. -->
      <template v-if="kind === 'normal'">
        <label-filter-bar :model-value="selectedLabelIds" @update:model-value="scope.setLabels" />
        <span v-if="allLabels" class="text-xs text-slate-500">All labels</span>
      </template>
      <label class="flex items-center gap-1 text-xs font-medium uppercase text-slate-400 dark:text-slate-500" for="charting-currency">
        Currency
        <select
          id="charting-currency"
          class="input h-7 w-24 text-xs"
          :value="activeCurrency"
          data-testid="charting-currency"
          @change="scope.setCurrency(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="c in currencyOptions" :key="c.code" :value="c.code">{{ c.code }}</option>
        </select>
      </label>
      <div class="flex items-center gap-1" data-testid="charting-date-range">
        <button
          v-for="r in RANGES"
          :key="r.key"
          type="button"
          class="btn-secondary text-xs"
          :class="activeRange === r.key ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
          :aria-pressed="activeRange === r.key"
          :data-testid="`charting-range-${r.key.toLowerCase()}`"
          @click="setRange(r.key)"
        >
          {{ r.label }}
        </button>
        <label class="ml-1 text-xs font-medium uppercase text-slate-400 dark:text-slate-500" for="charting-date-from">From</label>
        <input
          id="charting-date-from"
          type="date"
          class="input h-7 w-36 text-xs"
          :value="from ?? ''"
          data-testid="charting-date-from"
          @change="onDateChange('from', $event)"
        />
        <label class="text-xs font-medium uppercase text-slate-400 dark:text-slate-500" for="charting-date-to">To</label>
        <input
          id="charting-date-to"
          type="date"
          class="input h-7 w-36 text-xs"
          :value="to ?? ''"
          data-testid="charting-date-to"
          @change="onDateChange('to', $event)"
        />
      </div>
      <button type="button" class="btn-ghost text-xs" @click="scope.reset()">Reset</button>
    </div>

    <router-view />
  </div>
</template>