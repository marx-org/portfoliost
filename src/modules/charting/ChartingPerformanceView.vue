<script setup lang="ts">
/**
 * Charting → Performance (feature #253, sub-issue #256/#272–#275).
 *
 * Renders the SHARED `PortfolioPerformanceChart` (the same renderer the
 * per-portfolio Performance tab uses) from the charting performance dataset, so
 * there is one performance renderer rather than a second chart. The view may be
 * mounted with a fixed scope (the portfolio tab) or read the shared URL scope.
 */
import { computed, watch } from "vue"
import { getChartPerformance } from "@/api/charting"
import type { ChartScopeQuery } from "@/api/charting"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const props = defineProps<{ scope?: ChartScopeQuery }>()

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartPerformance)

const activeScope = computed<ChartScopeQuery>(() => props.scope ?? scope.scopeQuery.value)
watch(activeScope, (q) => void load(q), { immediate: true })

const timeSeries = computed(() =>
  (data.value?.series ?? []).map((p) => ({ date: p.date, value: p.value, invested: p.invested ?? null })),
)
const currency = computed(() => data.value?.currency ?? "")
</script>

<template>
  <div class="space-y-3" data-testid="charting-performance">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load performance data.</p>
    <template v-else>
      <PortfolioPerformanceChart
        v-if="timeSeries.length"
        :time-series="timeSeries"
        :currency="currency"
        :height="320"
        :show-recompute="false"
      />
      <p v-else class="text-sm text-slate-500">No performance data for this scope.</p>
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>