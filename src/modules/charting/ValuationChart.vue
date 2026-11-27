<script setup lang="ts">
/**
 * Valuation, capital and cumulative income overlays (feature #253, sub-issue
 * #272).
 *
 * A thin adapter over the SHARED `PortfolioPerformanceChart`: it maps the
 * charting performance dataset onto the renderer and turns on the informative
 * capital/income/option overlays. The renderer and its financial adapter are the
 * same ones the portfolio Performance tab uses — there is no second equity
 * engine. Overlays are components of value, never added to it.
 */
import { computed } from "vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"

type Point = {
  date?: string
  value?: number
  invested?: number | null
  capitalBasis?: number | null
  cumulativeIncome?: number | null
  cumulativeOptions?: number | null
}

const props = withDefaults(
  defineProps<{
    points?: Point[]
    currency?: string
    height?: number
    gapSymbols?: string[] | null
    heldGapSymbols?: string[] | null
    benchmarks?: Array<{
      symbol: string
      name: string
      absoluteTimeSeries: Array<{ date: string; value: number }>
      timeSeries?: Array<{ date: string; value: number }>
      returnPercent?: number | null
      volatility?: number | null
    }>
  }>(),
  { points: () => [], currency: "", height: 340, gapSymbols: null, heldGapSymbols: null, benchmarks: () => [] },
)

const timeSeries = computed(() =>
  (props.points ?? []).map((p) => ({
    date: p.date,
    value: p.value ?? 0,
    invested: p.invested ?? null,
    capitalBasis: p.capitalBasis ?? null,
    cumulativeIncome: p.cumulativeIncome ?? null,
    cumulativeOptions: p.cumulativeOptions ?? null,
  })),
)

// The renderer's benchmark type uses optional (not nullable) numbers; map the
// contract's nulls to undefined so the shared component stays type-safe.
const benchmarkSeries = computed(() =>
  (props.benchmarks ?? []).map((b) => ({
    symbol: b.symbol,
    name: b.name,
    timeSeries: b.timeSeries ?? [],
    absoluteTimeSeries: b.absoluteTimeSeries,
    returnPercent: b.returnPercent ?? undefined,
    volatility: b.volatility ?? undefined,
  })),
)
</script>

<template>
  <div class="space-y-3" data-testid="charting-valuation">
    <h2 class="sr-only">Valuation, capital and cumulative income</h2>
    <PortfolioPerformanceChart
      v-if="timeSeries.length"
      :time-series="timeSeries"
      :currency="currency"
      :height="height"
      title="Valuation, capital and cumulative income"
      xaxis-title="Date"
      :yaxis-title="`Value (${currency})`"
      :show-overlays="true"
      :show-recompute="false"
      :gap-symbols="gapSymbols"
      :held-gap-symbols="heldGapSymbols"
      :benchmarks="benchmarkSeries"
    />
    <p v-else class="text-sm text-muted">No performance data for this scope.</p>
  </div>
</template>