<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioAnalytics, getPortfolioRiskMetrics } from "@/api/portfolios"
import type { PortfolioBenchmarkCalcType, PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import { formatPercent, formatSignedCurrency } from "@/utils/format"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const riskMetrics = ref<Record<string, number | null> | null>(null)
const showCustomTimeframe = ref(false)
const backfillPending = ref(store.analytics?.backfillStatus === "pending")

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

const benchmarkOptions = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
  { symbol: "VTI", name: "Total Stock Market" },
  { symbol: "EFA", name: "EAFE" },
  { symbol: "AGG", name: "Aggregate Bond" },
]

const returnTypeOptions: Array<{ value: PortfolioBenchmarkCalcType; label: string }> = [
  { value: "timeWeighted", label: "Time-Weighted Return (TWR)" },
  { value: "moneyWeighted", label: "Money-Weighted Return (cumulative)" },
  { value: "simple", label: "Simple Return" },
]

const customizeOpen = ref(false)
const showAddBenchmark = ref(false)

// Draft state — local to the modal, only committed on Apply
const draftBenchmarks = ref<string[]>([])
const draftReturnType = ref<PortfolioBenchmarkCalcType>("timeWeighted")

const knownSymbols = new Set(benchmarkOptions.map((o) => o.symbol))
const customDraftBenchmarks = computed(() => draftBenchmarks.value.filter((s) => !knownSymbols.has(s)))

function openCustomize() {
  draftBenchmarks.value = [...store.analyticsBenchmarks]
  draftReturnType.value = store.analyticsReturnType
  customizeOpen.value = true
}

function closeCustomize() {
  customizeOpen.value = false
}

function toggleDraftBenchmark(symbol: string) {
  const current = new Set(draftBenchmarks.value)
  if (current.has(symbol)) current.delete(symbol)
  else current.add(symbol)
  draftBenchmarks.value = [...current]
}

function removeDraftBenchmark(symbol: string) {
  draftBenchmarks.value = draftBenchmarks.value.filter((s) => s !== symbol)
}

function addBenchmark(symbol: string, _name: string) {
  showAddBenchmark.value = false
  const current = new Set(draftBenchmarks.value)
  current.add(symbol)
  draftBenchmarks.value = [...current]
}

async function applyCustomize() {
  customizeOpen.value = false
  const benchmarksChanged = JSON.stringify([...draftBenchmarks.value].sort()) !== JSON.stringify([...store.analyticsBenchmarks].sort())
  const returnTypeChanged = draftReturnType.value !== store.analyticsReturnType
  if (returnTypeChanged) {
    await store.setReturnType(draftReturnType.value, id)
  }
  if (benchmarksChanged) {
    await store.setBenchmarks(draftBenchmarks.value, id)
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollDeadline = 0

function stopPolling() {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
}

function startPolling() {
  stopPolling()
  pollDeadline = Date.now() + 5 * 60 * 1000
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) { stopPolling(); return }
    try {
      const analytics = await getPortfolioAnalytics(id, store.analyticsTimeframe, store.analyticsBenchmarks, store.analyticsReturnType)
      store.analytics = analytics
      if (analytics.backfillStatus !== "pending") {
        backfillPending.value = false
        stopPolling()
      }
    } catch { stopPolling() }
  }, 5000)
}

onMounted(async () => {
  try {
    riskMetrics.value = (await getPortfolioRiskMetrics(id)) as Record<string, number | null> | null
  } catch {
    riskMetrics.value = null
  }
  if (store.analytics?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  }
})

onUnmounted(() => stopPolling())

async function changeTimeframe(timeframe: PortfolioAnalyticsTimeframe) {
  await store.setTimeframe(timeframe, id)
  if (store.analytics?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  } else {
    backfillPending.value = false
    stopPolling()
  }
}

const equityOptions = computed(() => {
  const series = store.analytics?.performance?.timeSeries ?? []
  const rt = store.analyticsReturnType

  // Pick the pre-computed indexed series matching the selected return type.
  // Falls back to normalising raw value if columns are null (e.g. before first recompute).
  const toPoint = (p: typeof series[number]): [number, number] => {
    const ts = new Date(p.date ?? "").getTime()
    if (rt === "timeWeighted" && p.cumulativeTwr != null) return [ts, p.cumulativeTwr]
    if (rt === "moneyWeighted" && p.cumulativeMwr != null) return [ts, p.cumulativeMwr]
    if (rt === "simple" && p.cumulativeSimple != null) return [ts, p.cumulativeSimple]
    // fallback: normalise raw value to index of 100
    const firstVal = series[0]?.value ?? 0
    return [ts, firstVal > 0 ? Math.round(((p.value ?? 0) / firstVal) * 10000) / 100 : (p.value ?? 0)]
  }

  const normalized = series.map(toPoint)
  const benchmarks = store.analytics?.benchmarks ?? []
  const palette = ["#94a3b8", "#f59e0b", "#ec4899", "#8b5cf6", "#10b981"]
  const benchSeriesCols = benchmarks.map((_, i) => palette[i % palette.length])
  return {
    chart: { type: "line" as const, height: 300, toolbar: { show: false }, zoom: { enabled: false } },
    colors: ["#2563eb", ...benchSeriesCols],
    series: [
      { name: "Portfolio", data: normalized },
      ...benchmarks.map((b) => ({
        name: b.name || b.symbol || "Benchmark",
        data: (b.timeSeries ?? []).map((p) => [new Date(p.date ?? "").getTime(), p.value ?? 0]),
      })),
    ],
    xaxis: { type: "datetime" as const, labels: { datetimeUTC: false } },
    yaxis: {
      labels: { formatter: (v: number) => String(Math.round(v * 100) / 100) },
      title: { text: "Index (start = 100)" },
    },
    tooltip: {
      shared: true,
      y: { formatter: (v: number) => `${v.toFixed(2)} (indexed, start = 100)` },
    },
    stroke: { width: [2, ...benchmarks.map(() => 1)], dashArray: [0, ...benchmarks.map(() => 4)] },
    dataLabels: { enabled: false },
  }
})

const monthlyOptions = computed(() => {
  const returns = store.analytics?.performance?.monthlyReturns ?? []
  return {
    chart: { type: "bar" as const, height: 220, toolbar: { show: false } },
    colors: ["#2563eb"],
    series: [{ name: "Return %", data: returns.map((m) => m.returnPercent) }],
    xaxis: { categories: returns.map((m) => m.month) },
    plotOptions: { bar: { columnWidth: "50%", borderRadius: 3 } },
    dataLabels: { enabled: false },
  }
})

const seriesValues = computed(() => (store.analytics?.performance?.timeSeries ?? []).map((p) => p.value ?? 0))

const currentDrawdownPercent = computed(() => {
  const values = seriesValues.value
  if (values.length < 2) return null
  const max = Math.max(...values)
  if (!max) return null
  return (values[values.length - 1] / max - 1) * 100
})

const maxDrawdownPercent = computed(() => {
  const v = riskMetrics.value?.["maxDrawdown"]
  return typeof v === "number" ? -v * 100 : null
})

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

const performers = computed(() => {
  const open = store.positions.filter((p) => p.isOpen)
  const sorted = [...open].sort((a, b) => (b.unrealizedGainLoss ?? 0) - (a.unrealizedGainLoss ?? 0))
  return {
    top: sorted.slice(0, 5),
    bottom: [...sorted].reverse().slice(0, 5),
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="card p-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">Performance Chart</h2>
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="tf in timeframes"
            :key="tf.value"
            type="button"
            class="btn-secondary text-xs"
            :class="store.analyticsTimeframe === tf.value ? 'bg-blue-600 text-white' : ''"
            :disabled="store.analyticsLoading"
            @click="changeTimeframe(tf.value)"
          >
            {{ tf.label }}
          </button>
          <button type="button" class="btn-secondary text-xs" data-testid="perf-controls-customize" :disabled="store.analyticsLoading" @click="openCustomize">
            Customize
          </button>
        </div>
      </div>
      <div class="relative">
        <component :is="'apexchart'" v-if="equityOptions.series[0].data.length" :options="equityOptions" :series="equityOptions.series" />
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">No analytics available.</p>
        <div v-if="store.analyticsLoading" class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-900/70">
          <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Refreshing...</span>
        </div>
      </div>
      <p v-if="backfillPending" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Historical data is loading, chart will update in a moment.
      </p>
    </div>

    <div class="card p-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">Drawdown</h2>
        <button type="button" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline" @click="showCustomTimeframe = !showCustomTimeframe">
          {{ showCustomTimeframe ? "Hide custom timeframe" : "Add custom timeframe" }}
        </button>
      </div>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Max Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">{{ formatPercent(maxDrawdownPercent, 2, true) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Current Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">{{ formatPercent(currentDrawdownPercent, 2, true) }}</dd>
        </div>
      </dl>
      <p v-if="showCustomTimeframe" class="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Custom timeframe support is coming soon. Pick one of the built-in ranges above instead.
      </p>
    </div>

    <div class="card p-6">
      <h2 class="mb-3 text-base font-semibold">Returns Chart</h2>
      <component :is="'apexchart'" v-if="monthlyOptions.series[0].data.length" :options="monthlyOptions" :series="monthlyOptions.series" />
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">No monthly data available.</p>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Top Performers</h2>
        <p v-if="!performers.top.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.top" :key="p.id" class="flex items-center justify-between py-2 text-sm">
            <div>
              <span class="font-medium text-slate-900 dark:text-slate-100">{{ p.symbol }}</span>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ p.companyName }}</p>
            </div>
            <div class="text-right">
              <p class="font-medium tabular-nums" :class="gainClass(p.unrealizedGainLoss)">{{ formatSignedCurrency(p.unrealizedGainLoss) }}</p>
              <p class="text-xs tabular-nums" :class="gainClass(p.percentageChange)">{{ formatPercent(p.percentageChange) }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Bottom Performers</h2>
        <p v-if="!performers.bottom.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.bottom" :key="p.id" class="flex items-center justify-between py-2 text-sm">
            <div>
              <span class="font-medium text-slate-900 dark:text-slate-100">{{ p.symbol }}</span>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ p.companyName }}</p>
            </div>
            <div class="text-right">
              <p class="font-medium tabular-nums" :class="gainClass(p.unrealizedGainLoss)">{{ formatSignedCurrency(p.unrealizedGainLoss) }}</p>
              <p class="text-xs tabular-nums" :class="gainClass(p.percentageChange)">{{ formatPercent(p.percentageChange) }}</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <div v-if="customizeOpen" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" @click.self="closeCustomize">
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Chart controls">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Chart controls</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="closeCustomize">✕</button>
      </div>

      <div class="space-y-5">
        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Return Type</p>
          <select
            v-model="draftReturnType"
            class="input w-full"
            data-testid="perf-controls-return-type"
          >
            <option v-for="opt in returnTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Benchmarks</p>
            <button
              type="button"
              class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              data-testid="perf-controls-add-benchmark"
              @click="showAddBenchmark = true"
            >
              Add Custom
            </button>
          </div>
          <div class="space-y-2">
            <label v-for="opt in benchmarkOptions" :key="opt.symbol" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                :checked="draftBenchmarks.includes(opt.symbol)"
                @change="toggleDraftBenchmark(opt.symbol)"
              />
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ opt.name }}</span>
              <span class="ml-auto text-xs text-slate-400">{{ opt.symbol }}</span>
            </label>
          </div>
          <div v-if="customDraftBenchmarks.length" class="mt-2 space-y-1">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Custom</p>
            <div v-for="sym in customDraftBenchmarks" :key="sym" class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ sym }}</span>
              <button type="button" class="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" aria-label="Remove benchmark" @click="removeDraftBenchmark(sym)">Remove</button>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="perf-controls-benchmarks">
            Selected: {{ draftBenchmarks.length ? draftBenchmarks.join(", ") : "None" }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Positions</p>
          <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
            {{ store.positions.length ? `${store.positions.length} selected` : "All selected" }}
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="closeCustomize">Cancel</button>
        <button type="button" class="btn-primary" @click="applyCustomize">Apply</button>
      </div>
    </div>
  </div>

  <InstrumentSearchModal :open="showAddBenchmark" mode="add" title="Add Custom Benchmark" @close="showAddBenchmark = false" @add="addBenchmark" />
</template>
