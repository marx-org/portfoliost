<script setup lang="ts">
/**
 * Reusable portfolio performance chart (plan §27.4): index-normalized
 * series (start = 100) with benchmark overlay, a "Historical data is
 * loading…" pending line, and a Recompute button that force-rebuilds the
 * portfolio's value snapshots.
 */
import { computed } from "vue"
import type { PortfolioBenchmarkCalcType } from "@/api/portfolios"

interface PerformancePoint {
  date?: string
  value?: number
  cumulativeTwr?: number | null
  cumulativeMwr?: number | null
  cumulativeSimple?: number | null
}

interface BenchmarkSeries {
  symbol?: string
  name?: string
  returnPercent?: number
  timeSeries?: Array<{ date?: string; value?: number }>
}

const props = withDefaults(
  defineProps<{
    timeSeries: PerformancePoint[]
    benchmarks?: BenchmarkSeries[]
    returnType: PortfolioBenchmarkCalcType
    backfillPending?: boolean
    loading?: boolean
    height?: number
  }>(),
  { benchmarks: () => [], backfillPending: false, loading: false, height: 300 },
)

const emit = defineEmits<{ recompute: [] }>()

const options = computed(() => {
  const series = props.timeSeries
  const rt = props.returnType

  // Pick the pre-computed indexed series matching the selected return type.
  // Falls back to normalising raw value if columns are null (e.g. before first recompute).
  const toPoint = (p: PerformancePoint): [number, number] => {
    const ts = new Date(p.date ?? "").getTime()
    if (rt === "timeWeighted" && p.cumulativeTwr != null) return [ts, p.cumulativeTwr]
    if (rt === "moneyWeighted" && p.cumulativeMwr != null) return [ts, p.cumulativeMwr]
    if (rt === "simple" && p.cumulativeSimple != null) return [ts, p.cumulativeSimple]
    const firstVal = series[0]?.value ?? 0
    return [ts, firstVal > 0 ? Math.round(((p.value ?? 0) / firstVal) * 10000) / 100 : (p.value ?? 0)]
  }

  const normalized = series.map(toPoint)
  const benchmarks = props.benchmarks ?? []
  const palette = ["#94a3b8", "#f59e0b", "#ec4899", "#8b5cf6", "#10b981"]
  const benchSeriesCols = benchmarks.map((_, i) => palette[i % palette.length])
  return {
    chart: { type: "line" as const, toolbar: { show: false }, zoom: { enabled: false } },
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

defineExpose({ options })
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <span />
      <button
        type="button"
        class="btn-secondary text-xs"
        data-testid="portfolio-chart-recompute"
        :disabled="loading"
        @click="emit('recompute')"
      >
        Recompute
      </button>
    </div>
    <div class="relative">
      <component :is="'apexchart'" v-if="timeSeries.length" :options="options" :series="options.series" :height="height" />
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">No analytics available.</p>
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-900/70">
        <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Refreshing...</span>
      </div>
    </div>
    <p v-if="backfillPending" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
      Historical data is loading, chart will update in a moment.
    </p>
  </div>
</template>
