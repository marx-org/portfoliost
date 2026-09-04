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

function toggleBenchmark(symbol: string) {
  const current = new Set(store.analyticsBenchmarks)
  if (current.has(symbol)) current.delete(symbol)
  else current.add(symbol)
  void store.setBenchmarks([...current], id)
}

function addBenchmark(symbol: string, _name: string) {
  showAddBenchmark.value = false
  const current = new Set(store.analyticsBenchmarks)
  current.add(symbol)
  void store.setBenchmarks([...current], id)
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
  const firstVal = series[0]?.value ?? 0
  const normalized = firstVal > 0
    ? series.map((p) => [new Date(p.date ?? "").getTime(), Math.round(((p.value ?? 0) / firstVal) * 10000) / 100])
    : series.map((p) => [new Date(p.date ?? "").getTime(), p.value ?? 0])
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
            @click="changeTimeframe(tf.value)"
          >
            {{ tf.label }}
          </button>
          <button type="button" class="btn-secondary text-xs" data-testid="perf-controls-customize" @click="customizeOpen = true">
            Customize
          </button>
        </div>
      </div>
      <component :is="'apexchart'" v-if="equityOptions.series[0].data.length" :options="equityOptions" :series="equityOptions.series" />
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">No analytics available.</p>
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

  <div v-if="customizeOpen" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" @click.self="customizeOpen = false">
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Chart controls">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Chart controls</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="customizeOpen = false">✕</button>
      </div>

      <div class="space-y-5">
        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Return Type</p>
          <select
            class="input w-full"
            :value="store.analyticsReturnType"
            data-testid="perf-controls-return-type"
            @change="store.setReturnType(($event.target as HTMLSelectElement).value as PortfolioBenchmarkCalcType, id)"
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
              Add Custom Benchmark
            </button>
          </div>
          <div class="space-y-2">
            <label v-for="opt in benchmarkOptions" :key="opt.symbol" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                :checked="store.analyticsBenchmarks.includes(opt.symbol)"
                @change="toggleBenchmark(opt.symbol)"
              />
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ opt.name }}</span>
              <span class="ml-auto text-xs text-slate-400">{{ opt.symbol }}</span>
            </label>
          </div>
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="perf-controls-benchmarks">
            Selected: {{ store.analyticsBenchmarks.length ? store.analyticsBenchmarks.join(", ") : "None" }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Positions</p>
          <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
            {{ store.positions.length ? `${store.positions.length} selected` : "All selected" }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <InstrumentSearchModal :open="showAddBenchmark" mode="add" title="Add Custom Benchmark" @close="showAddBenchmark = false" @add="addBenchmark" />
</template>
