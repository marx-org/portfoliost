<script setup lang="ts">
/**
 * Reusable portfolio performance chart (plan §27.4, §41): plots the raw
 * absolute `value` series (0 → ~111k USD) with a benchmark overlay drawn on
 * the same axis. The cumulative TWR/MWR/simple columns are % stats in the
 * payload — they do NOT drive the line (plan §41, example-service-verified).
 */
import { computed } from "vue"
import { formatCompactCurrency, formatCurrency } from "@/utils/format"

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
    currency?: string
    color?: string
    backfillPending?: boolean
    loading?: boolean
    height?: number
  }>(),
  { benchmarks: () => [], currency: "USD", color: "#16a34a", backfillPending: false, loading: false, height: 300 },
)

const emit = defineEmits<{ recompute: [] }>()

const options = computed(() => {
  const toPoint = (p: PerformancePoint): [number, number] => [new Date(p.date ?? "").getTime(), p.value ?? 0]

  const series = props.timeSeries.map(toPoint)
  const benchmarks = props.benchmarks ?? []
  const benchCols = benchmarks.map(() => "#94a3b8")
  return {
    chart: { type: "line" as const, toolbar: { show: false }, zoom: { enabled: false } },
    colors: [props.color, ...benchCols],
    series: [
      { name: "Portfolio", data: series },
      ...benchmarks.map((b) => ({
        name: b.name || b.symbol || "Benchmark",
        data: (b.timeSeries ?? []).map((p) => [new Date(p.date ?? "").getTime(), p.value ?? 0]),
      })),
    ],
    xaxis: { type: "datetime" as const, labels: { datetimeUTC: false } },
    yaxis: {
      labels: { formatter: (v: number) => formatCompactCurrency(v, props.currency) },
    },
    tooltip: {
      shared: true,
      y: { formatter: (v: number) => formatCurrency(v, props.currency) },
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