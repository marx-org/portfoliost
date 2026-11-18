<script setup lang="ts">
/** Charting → Cash & funding (feature #253, sub-issues #256/#276–#277). */
import { computed, watch } from "vue"
import { getChartCash } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"
import CashHistoryChart from "./CashHistoryChart.vue"
import AnnualContributionsChart from "./AnnualContributionsChart.vue"
import CumulativeContributionsChart from "./CumulativeContributionsChart.vue"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartCash)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const currency = computed(() => data.value?.currency ?? "")
const series = computed(() => data.value?.series ?? [])
const contributions = computed(() => data.value?.annualContributions ?? [])
const cumulative = computed(() => data.value?.cumulativeContributions ?? [])
</script>

<template>
  <div class="space-y-3" data-testid="charting-cash">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load cash data.</p>
    <template v-else>
      <CashHistoryChart :series="series" :currency="currency" />
      <AnnualContributionsChart :points="contributions" :currency="currency" />
      <CumulativeContributionsChart :series="cumulative" :currency="currency" />
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>