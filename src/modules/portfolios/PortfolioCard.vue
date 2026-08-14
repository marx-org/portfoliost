<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { deletePortfolio, getPortfolioAnalytics, getPortfolioPositions, updatePortfolio } from "@/api/portfolios"
import { formatCurrency, formatNumber, formatPercent } from "@/utils/format"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import type { PortfoliosSummaries } from "@/api/types"

const props = defineProps<{ portfolio: PortfoliosSummaries[number] }>()
const emit = defineEmits<{ (e: "add-position"): void }>()

const store = usePortfolioStore()
const router = useRouter()

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

const timeframe = ref<PortfolioAnalyticsTimeframe>("6M")
const series = ref<number[]>([])
const chartError = ref(false)
const openMenu = ref(false)
const notice = ref<string | null>(null)

const showRename = ref(false)
const renameName = ref(props.portfolio.name)
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

onMounted(() => loadChart())

async function loadChart() {
  chartError.value = false
  try {
    const analytics = await getPortfolioAnalytics(props.portfolio.id, timeframe.value)
    series.value = (analytics.performance?.timeSeries ?? []).map((p) => p.value)
  } catch {
    chartError.value = true
  }
}

async function changeTimeframe(tf: PortfolioAnalyticsTimeframe) {
  timeframe.value = tf
  await loadChart()
}

function tabPath(name: string) {
  const map: Record<string, string> = {
    holdings: "holdings",
    performance: "performance",
    news: "news",
    calendar: "calendar",
  }
  return { name: `portfolio-${map[name]}` as string, params: { id: props.portfolio.id } }
}

const sparkOptions = computed(() => ({
  chart: {
    type: "area" as const,
    height: 90,
    toolbar: { show: false },
    sparkline: { enabled: true },
  },
  colors: ["#2563eb"],
  series: [{ name: "Value", data: series.value }],
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.25, opacityTo: 0 } },
  xaxis: { categories: series.value.map((_, i) => i), labels: { show: false } },
  tooltip: { enabled: false },
}))

function returnClass(p: PortfoliosSummaries[number]): string {
  return (p.metrics?.totalReturn ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

function goToDetail() {
  router.push({ name: "portfolio-detail", params: { id: props.portfolio.id } })
}

function openRename() {
  openMenu.value = false
  renameName.value = props.portfolio.name
  renameError.value = null
  showRename.value = true
}

async function submitRename() {
  if (!renameName.value.trim()) return
  renameBusy.value = true
  renameError.value = null
  try {
    await updatePortfolio(props.portfolio.id, { name: renameName.value.trim() })
    showRename.value = false
    await store.fetchAll()
    notice.value = "Portfolio renamed"
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : "Failed to rename portfolio"
  } finally {
    renameBusy.value = false
  }
}

function openDelete() {
  openMenu.value = false
  deleteError.value = null
  showDeleteConfirm.value = true
}

async function submitDelete() {
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deletePortfolio(props.portfolio.id)
    showDeleteConfirm.value = false
    await store.fetchAll()
    notice.value = `Deleted ${props.portfolio.name}`
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete portfolio"
  } finally {
    deleteBusy.value = false
  }
}

function exportFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPositions(format: "csv" | "xml" | "json") {
  openMenu.value = false
  const positions = await getPortfolioPositions(props.portfolio.id)
  const name = `${props.portfolio.name.replace(/\s+/g, "_")}-positions`
  if (format === "json") {
    exportFile(`${name}.json`, JSON.stringify(positions, null, 2), "application/json")
  } else if (format === "xml") {
    const rows = positions
      .map((p) => {
        const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        return `  <position symbol="${esc(p.symbol)}" quantity="${esc(p.quantity)}" averageCostBasis="${esc(p.averageCostBasis)}" currentPrice="${esc(p.currentPrice)}" marketValue="${esc(p.marketValue)}" />`
      })
      .join("\n")
    exportFile(`${name}.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<positions>\n${rows}\n</positions>`, "application/xml")
  } else {
    const header = "Symbol,Quantity,Avg Cost,Price,Market Value,Unrealized P/L,Weight"
    const rows = positions.map((p) =>
      [p.symbol, p.quantity, p.averageCostBasis, p.currentPrice, p.marketValue, p.unrealizedGainLoss, p.percentOfPortfolio].join(","),
    )
    exportFile(`${name}.csv`, [header, ...rows].join("\n"), "text/csv")
  }
}
</script>

<template>
  <div class="card flex cursor-pointer flex-col p-5 transition-shadow hover:shadow-md" @click="goToDetail">
    <div class="flex items-center justify-between gap-2">
      <div>
        <router-link
          :to="{ name: 'portfolio-detail', params: { id: portfolio.id } }"
          class="truncate font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
        >
          {{ portfolio.name }}
        </router-link>
        <p class="text-xs text-slate-500 dark:text-slate-400">{{ portfolio.description || "No description" }}</p>
      </div>
      <div class="flex items-center gap-2" @click.stop>
        <span class="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:text-slate-300">
          {{ portfolio.strategy }}
        </span>
        <div class="relative">
          <button
            type="button"
            aria-label="Portfolio actions"
            class="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
            @click="openMenu = !openMenu"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="8" cy="13" r="1.4" />
            </svg>
          </button>
          <template v-if="openMenu">
            <div class="fixed inset-0 z-20" @click="openMenu = false"></div>
            <div class="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 py-1 shadow-lg">
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openRename">Edit</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="exportPositions('csv')">Export as CSV</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="exportPositions('xml')">Export as XML</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="exportPositions('json')">Export as JSON</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" @click="openDelete">Delete</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <p v-if="notice" class="mt-3 rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>

    <div class="mt-4">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs text-slate-500 dark:text-slate-400">Performance</span>
        <div class="flex gap-1" @click.stop>
          <button
            v-for="tf in timeframes"
            :key="tf.value"
            type="button"
            class="rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            :class="timeframe === tf.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : ''"
            @click="changeTimeframe(tf.value)"
          >
            {{ tf.label }}
          </button>
        </div>
      </div>
      <component
        :is="'apexchart'"
        v-if="series.length"
        :options="sparkOptions"
        :series="sparkOptions.series"
      />
      <p v-else-if="chartError" class="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Chart unavailable</p>
      <div v-else class="flex h-[90px] items-center justify-center">
        <p class="text-xs text-slate-400 dark:text-slate-500">Loading chart...</p>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-2 text-sm">
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Value</p>
        <p class="font-medium tabular-nums">{{ formatCurrency(portfolio.currentValue) }}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Invested</p>
        <p class="font-medium tabular-nums">{{ formatCurrency(portfolio.totalInvested) }}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Return</p>
        <p class="font-medium tabular-nums" :class="returnClass(portfolio)">{{ formatPercent(portfolio.metrics?.totalReturn) }}</p>
      </div>
    </div>
    <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
      {{ portfolio.metrics?.openPositions ?? 0 }} open positions &middot; {{ formatNumber(portfolio.metrics?.unrealizedGainLoss) }} unrealized
    </p>

    <div class="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3" @click.stop>
      <button type="button" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline" data-testid="card-add-position" @click="emit('add-position')">Add Position</button>
      <div class="flex gap-3 text-sm">
        <router-link :to="tabPath('performance')" class="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">Analytics</router-link>
        <router-link :to="tabPath('news')" class="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">News</router-link>
        <router-link :to="tabPath('calendar')" class="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">Calendar</router-link>
      </div>
    </div>

    <div
      v-if="showRename"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showRename = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Rename portfolio" @click.stop>
        <h3 class="mb-4 text-base font-semibold">Rename portfolio</h3>
        <form @submit.prevent="submitRename">
          <label for="portfolio-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
          <input id="portfolio-name" v-model="renameName" type="text" required class="input mb-4" />
          <p v-if="renameError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ renameError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showRename = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="renameBusy || !renameName.trim()">
              {{ renameBusy ? "Saving..." : "Save" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showDeleteConfirm = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete portfolio" @click.stop>
        <h3 class="mb-4 text-base font-semibold">Delete portfolio</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Delete "{{ portfolio.name }}" and its positions? This cannot be undone.</p>
        <p v-if="deleteError" class="mb-3 mt-2 text-sm text-red-600 dark:text-red-400">{{ deleteError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button type="button" class="btn-primary bg-red-600" :disabled="deleteBusy" @click="submitDelete">
            {{ deleteBusy ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
