<script setup lang="ts">
/**
 * Reusable portfolio performance chart (plan §27.4, §41): plots the raw
 * absolute `value` series (0 → ~111k USD) with an absolute, flow-mirrored
 * benchmark overlay. The cumulative TWR/MWR/simple columns in the payload are
 * return statistics — they do NOT drive the equity lines.
 */
import { computed } from "vue"
import { formatCompactCurrency, formatCurrency } from "@/utils/format"
import type { PortfolioAnalytics } from "@/api/types"

interface PerformancePoint {
  date?: string
  value?: number
  /** Cumulative net money-in (same currency as `value`). When present, drawn
   * as a second "Invested" line so value − invested = profit at a glance. */
  invested?: number | null
  /** §78.5 — base-currency cost of positions held on this day that have no
   * price, so `value` does not include them. Absent = not measured (a row
   * written before the column existed), which is NOT the same as 0. */
  unpricedValue?: number | null
  cumulativeTwr?: number | null
  cumulativeMwr?: number | null
  cumulativeSimple?: number | null
}

type BenchmarkSeries = NonNullable<PortfolioAnalytics["benchmarks"]>[number]

const props = withDefaults(
  defineProps<{
    timeSeries: PerformancePoint[]
    benchmarks?: BenchmarkSeries[]
    currency?: string
    color?: string
    backfillPending?: boolean
    loading?: boolean
    height?: number
    /** §63.8 — a recompute/backfill pass is in flight. The chart is grayed
     * out and non-interactable (no tooltip / no re-trigger) until it finishes. */
    recomputing?: boolean
    /** §63.8 — held symbols the last backfill had no price bar for. Non-empty →
     * the value series is a partial sum; a warning chip is shown. */
    gapSymbols?: string[] | null
    /** §72.30 — the subset of `gapSymbols` STILL HELD on the window's last day.
     * Non-empty means the LATEST point on this chart is itself short, which is
     * the claim the warning makes about the number in front of the user.
     *
     * `gapSymbols` on its own is window-wide and cannot carry that claim: PROD
     * on 2026-10-01 rendered "Value excludes 7 positions without price history"
     * for IKE Beata, whose 7 flagged symbols had all been sold — the current
     * point was complete. A warning that is wrong about the number next to it is
     * worse than silence, because it is believed. */
     heldGapSymbols?: string[] | null
     showInvested?: boolean
  }>(),
   { benchmarks: () => [], currency: "USD", color: "#3b82f6", backfillPending: false, loading: false, height: 300, recomputing: false, gapSymbols: null, heldGapSymbols: null, showInvested: true },
)

const emit = defineEmits<{ recompute: [] }>()

const toPoint = (p: { date?: string; value?: number }): [number, number] => [new Date(p.date ?? "").getTime(), p.value ?? 0]

// §cash-invested overlay — the "Invested" line (cumulative net money-in) is
// only drawn when the caller passes it through, so it shows on the per-
//portfolio performance chart AND the combined chart. Same currency as value.
const hasInvested = computed(() => props.showInvested !== false && props.timeSeries.some((p) => p.invested != null))
const INVESTED_COLOR = "#0ea5e9"

// §63.8 / §72.30 — TWO different claims, and the component says the one that is
// true of the point it is drawing.
//
//   - `heldGapSymbols` non-empty → the LATEST point excludes them. "Value is a
//     partial sum" is accurate and urgent.
//   - `gapSymbols` non-empty but `heldGapSymbols` empty → the gaps are all in
//     earlier history (positions since sold). Today's number is complete; the
//     CHART's past is not. Saying "value excludes N positions" here was the PROD
//     defect — it warned about a value that was not short.
//
// The history case is still reported, never dropped: a curve with holes is worth
// knowing about, and §72.30 widened the window-wide scan precisely to catch it.
// It just is not allowed to impersonate a defect in today's number.
const heldGapCount = computed(() => props.heldGapSymbols?.length ?? 0)
const historyGapCount = computed(() => {
  const all = props.gapSymbols?.length ?? 0
  return Math.max(0, all - heldGapCount.value)
})
/**
 * §78.5 — how much money the value line is NOT drawing, and over what span.
 *
 * `gapSymbols` names the symbols and `heldGapSymbols` says whether TODAY is
 * short. Neither says **how much**, which is the part a user can act on: "7
 * positions" is a bookkeeping detail, "up to 10,465 PLN is missing from this
 * curve" is the size of the problem.
 *
 * The peak is reported rather than the sum on purpose. These positions are held
 * for months, so a sum would multiply the same money by its holding period and
 * report a number no one can reconcile against the chart. The peak is what any
 * single day of the line was short by, which is comparable to the drop it
 * explains.
 *
 * Absent `unpricedValue` is NOT zero. A row written before the column existed
 * omits the field, and reading that as "nothing withheld" would understate the
 * problem on exactly the series that need the warning — so it is treated as
 * unknown and simply not mentioned.
 */
const unpriced = computed(() => {
  const affected = props.timeSeries.filter(
    (p): p is PerformancePoint & { unpricedValue: number } =>
      typeof p.unpricedValue === "number" && p.unpricedValue > 0,
  )
  if (affected.length === 0) return null
  const peak = affected.reduce((a, b) => (b.unpricedValue > a.unpricedValue ? b : a))
  return {
    peak: peak.unpricedValue,
    first: affected[0].date ?? null,
    last: affected[affected.length - 1].date ?? null,
    days: affected.length,
  }
})
/** "up to 10,465.32 PLN" — the amount, in the portfolio's own currency. */
const unpricedAmount = computed(() =>
  unpriced.value ? `up to ${formatCurrency(unpriced.value.peak, props.currency)}` : "",
)
const gapMessage = computed(() => {
  // §78.5 — the amount and the count describe DIFFERENT windows and never share
  // a sentence. `gapSymbols` is window-wide by design (§72.30); the series here
  // is timeframe-filtered. On IKE Beata, 1Y reports 7 gap symbols with 0 of them
  // held in the visible window, while ALL reports the same 7 with 1,016 of 1,801
  // days withheld. "7 positions, up to 10,465 PLN" would assert a count about a
  // period the amount does not describe.
  if (heldGapCount.value > 0) {
    const n = heldGapCount.value
    const amt = unpricedAmount.value
    return `Value excludes ${n} position${n === 1 ? "" : "s"} with no price history yet${amt ? ` — ${amt} withheld` : ""}. Total is a partial sum.`
  }
  if (historyGapCount.value > 0) {
    const amt = unpricedAmount.value
    if (amt) return `${amt} of this chart is missing — those points are partial sums. The latest value is complete.`
    const n = historyGapCount.value
    return `Earlier in this period, ${n} position${n === 1 ? " was" : "s were"} held with no price history — those points are partial sums. The latest value is complete.`
  }
  return ""
})
// Config-only options (no `series`). The object is memoised by
// (currency, colour, benchmark names) so a data swap that keeps the same
// configuration reuses the identical `options` reference (vue3-apexcharts
// then skips its updateOptions path, whose JSON deep-clone would drop the
// y-axis formatter function). §48.6e B3: the data itself is guaranteed to
// reach the chart by the `chartKey` remount below, which rebuilds the chart
// from scratch with the current series + formatter.
let chartOptionsCache: { key: string; value: ChartOptions } | null = null
type ChartOptions = ReturnType<typeof buildChartOptions>

/** Stable colors keep multiple benchmark overlays distinguishable. */
const BENCHMARK_COLORS: Record<string, string> = {
  SPY: "#94a3b8",
  QQQ: "#c084fc",
  DIA: "#f59e0b",
  IWM: "#34d399",
  VTI: "#22d3ee",
  EFA: "#f472b6",
  AGG: "#fb7185",
}
const BENCHMARK_FALLBACK_COLORS = ["#a78bfa", "#2dd4bf", "#f97316", "#e879f9"]

function benchmarkColor(benchmark: BenchmarkSeries, index: number): string {
  const symbol = (benchmark.symbol ?? "").toUpperCase()
  return BENCHMARK_COLORS[symbol] ?? BENCHMARK_FALLBACK_COLORS[index % BENCHMARK_FALLBACK_COLORS.length]
}

function buildChartOptions() {
  const benchmarks = props.benchmarks ?? []
  const hasInv = hasInvested.value
  // Series slots: 0 = Portfolio, 1 = Invested (optional), then benchmarks.
  // Every slot is an absolute value in the same display currency.
  const valueSeriesNames = [
    "Portfolio",
    ...(hasInv ? ["Invested"] : []),
    ...benchmarks.map((b) => b.name || b.symbol || "Benchmark"),
  ]
  return {
    chart: { type: "line" as const, toolbar: { show: false }, zoom: { enabled: false } },
    colors: [props.color, ...(hasInv ? [INVESTED_COLOR] : []), ...benchmarks.map(benchmarkColor)],
    xaxis: { type: "datetime" as const, labels: { datetimeUTC: false } },
    // Portfolio, Invested, and the absolute flow-mirrored benchmarks share one
    // currency axis so a deposit/withdrawal is visible in every line.
    yaxis: [
      {
        seriesName: valueSeriesNames,
        labels: { formatter: (v: number) => formatCompactCurrency(v, props.currency) },
      },
    ],
    tooltip: {
      shared: true,
      y: {
        formatter: (v: number) => formatCurrency(v, props.currency),
      },
    },
    // All lines are solid: the legend and stable per-benchmark colors distinguish
    // the series without turning the benchmark into visual noise.
    stroke: {
      width: [2.5, ...(hasInv ? [1.75] : []), ...benchmarks.map(() => 1.75)],
      dashArray: [0, ...(hasInv ? [0] : []), ...benchmarks.map(() => 0)],
    },
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
    ...(hasInvested.value
      ? [{ name: "Invested", data: props.timeSeries.map((p) => [new Date(p.date ?? "").getTime(), p.invested ?? 0]) }]
      : []),
    ...benchmarks.map((b) => ({
      name: b.name || b.symbol || "Benchmark",
      data: (b.absoluteTimeSeries ?? []).map(toPoint),
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
    hasInvested.value ? "inv" : "",
    benchmarks.map((b) => b.name || b.symbol || "Benchmark").join(","),
    `${props.timeSeries.length}|${(props.timeSeries[0]?.value ?? "").toString()}|${tail(props.timeSeries)}|${(props.timeSeries.at(-1)?.invested ?? "").toString()}`,
    ...benchmarks.map((b) => `${(b.absoluteTimeSeries ?? []).length}|${tail(b.absoluteTimeSeries)}`),
  ].join("~")
})

// Merged config + data object (unit-test compatibility).
const options = computed(() => ({ ...chartOptions.value, series: seriesData.value }))

defineExpose({ options, chartOptions, seriesData })
</script>

<template>
  <div data-testid="portfolio-performance-chart">
    <div class="mb-2 flex items-center justify-between">
      <span />
      <button
        type="button"
        class="btn-secondary text-xs"
        data-testid="portfolio-chart-recompute"
        :disabled="loading || recomputing"
        @click="emit('recompute')"
      >
        {{ recomputing ? "Recomputing..." : "Recompute" }}
      </button>
    </div>
    <div
      class="relative transition-opacity duration-300"
      :class="{ 'pointer-events-none select-none opacity-50': recomputing }"
    >
      <component :is="'apexchart'" :key="chartKey" v-if="timeSeries.length" :options="chartOptions" :series="seriesData" :height="height" />
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">No analytics available.</p>
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-900/70">
        <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Refreshing...</span>
      </div>
      <!-- §63.8 — gray-out overlay while a recompute/backfill is in flight -->
      <div v-if="recomputing" class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/40 dark:bg-slate-900/40">
        <span class="text-sm font-medium text-slate-500 dark:text-slate-400" data-testid="portfolio-chart-recomputing-overlay">
          Recomputing — please wait…
        </span>
      </div>
    </div>
    <!-- §63.8 — value is a partial sum when some held symbols lack price history -->
    <p v-if="gapMessage" class="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400" data-testid="portfolio-chart-gap-warning">
      {{ gapMessage }}
    </p>
    <p v-if="backfillPending" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
      Historical data is loading, chart will update in a moment.
    </p>
  </div>
</template>
