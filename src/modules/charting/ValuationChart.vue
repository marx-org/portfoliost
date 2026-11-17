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
  }>(),
  { points: () => [], currency: "", height: 340, gapSymbols: null, heldGapSymbols: null },
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
</script>

<template>
  <div class="space-y-3" data-testid="charting-valuation">
    <PortfolioPerformanceChart
      v-if="timeSeries.length"
      :time-series="timeSeries"
      :currency="currency"
      :height="height"
      :show-overlays="true"
      :show-recompute="false"
      :gap-symbols="gapSymbols"
      :held-gap-symbols="heldGapSymbols"
    />
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No performance data for this scope.</p>
  </div>
</template>