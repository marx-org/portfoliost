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

const toPoint = (p: PerformancePoint): [number, number] => [new Date(p.date ?? "").getTime(), p.value ?? 0]

// Config-only options (no `series`). The object is memoised by
// (currency, colour, benchmark names) so a data swap that keeps the same
// configuration reuses the identical `options` reference (vue3-apexcharts
// then skips its updateOptions path, whose JSON deep-clone would drop the
// y-axis formatter function). §48.6e B3: the data itself is guaranteed to
// reach the chart by the `chartKey` remount below, which rebuilds the chart
// from scratch with the current series + formatter.
let chartOptionsCache: { key: string; value: ChartOptions } | null = null
type ChartOptions = ReturnType<typeof buildChartOptions>

function buildChartOptions() {
  const benchmarks = props.benchmarks ?? []
  return {
    chart: { type: "line" as const, toolbar: { show: false }, zoom: { enabled: false } },
    colors: [props.color, ...benchmarks.map(() => "#94a3b8")],
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
}

const chartOptions = computed(() => {
  const benchmarks = props.benchmarks ?? []
  const key = [
    props.currency,
    props.color,
    ...benchmarks.map((b) => b.name || b.symbol || "Benchmark"),
  ].join("|")
  if (chartOptionsCache?.key === key) return chartOptionsCache.value
  const value = buildChartOptions()
  chartOptionsCache = { key, value }
  return value
})

const seriesData = computed(() => {
  const benchmarks = props.benchmarks ?? []
  return [
    { name: "Portfolio", data: props.timeSeries.map(toPoint) },
    ...benchmarks.map((b) => ({
      name: b.name || b.symbol || "Benchmark",
      data: (b.timeSeries ?? []).map((p) => [new Date(p.date ?? "").getTime(), p.value ?? 0]),
    })),
  ]
})

// §48.6e B3 — remount key (PriceChart §47.6/§48.5 precedent): vue3-apexcharts'
// prop-update path is unreliable in this stack — a data swap after mount is
// never pushed into the running instance (and its JSON deep-clone drops the
// y-axis formatter on updateOptions). A fresh mount is the only reliable way
// to guarantee the chart shows the current series in the current currency.
// The fingerprint (length + first/last values per series) changes on every
// real data swap: analytics load, Recompute, and the §48.6e display-currency
// re-conversion; currency/colour/height/benchmark names cover config changes.
const chartKey = computed(() => {
  const benchmarks = props.benchmarks ?? []
  const tail = (pts?: Array<{ value?: number }>) => (pts?.at(-1)?.value ?? "").toString()
  return [
    props.currency,
    props.color,
    props.height,
    benchmarks.map((b) => b.name || b.symbol || "Benchmark").join(","),
    `${props.timeSeries.length}|${(props.timeSeries[0]?.value ?? "").toString()}|${tail(props.timeSeries)}`,
    ...benchmarks.map((b) => `${(b.timeSeries ?? []).length}|${tail(b.timeSeries)}`),
  ].join("~")
})

// Merged config + data object (unit-test compatibility).
const options = computed(() => ({ ...chartOptions.value, series: seriesData.value }))

defineExpose({ options, chartOptions, seriesData })
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
      <component :is="'apexchart'" :key="chartKey" v-if="timeSeries.length" :options="chartOptions" :series="seriesData" :height="height" />
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