<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioAnalytics, getPortfolioRiskMetrics } from "@/api/portfolios"
import { formatPercent, formatSignedCurrency } from "@/utils/format"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"

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
      const analytics = await getPortfolioAnalytics(id, store.analyticsTimeframe)
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
  const values = series.map((p) => [new Date(p.date ?? "").getTime(), p.value ?? 0])
  const bench = store.analytics?.benchmarks?.[0]
  const benchSeries = (bench?.timeSeries ?? []).map((p) => [new Date(p.date ?? "").getTime(), p.value ?? 0])
  return {
    chart: { type: "line" as const, height: 300, toolbar: { show: false }, zoom: { enabled: false } },
    colors: ["#2563eb", "#94a3b8"],
    series: [
      { name: "Portfolio", data: values },
      { name: bench?.name ?? "Benchmark", data: benchSeries },
    ],
    xaxis: { type: "datetime" as const, labels: { datetimeUTC: false } },
    stroke: { width: [2, 1], dashArray: [0, 4] },
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
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">Performance Chart</h2>
        <div class="flex gap-1">
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
</template>
