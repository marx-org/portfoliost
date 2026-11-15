<script setup lang="ts">
/** Charting → Allocation (feature #253, sub-issue #256/#266–#271). */
import { computed, watch } from "vue"
import { getChartAllocation } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartAllocation)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const slices = computed(() => data.value?.byAssetType ?? [])
const chartOptions = {
  chart: { type: "donut", height: 320 },
  labels: slices.value.map((s) => s.label),
  colors: ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"],
}
const chartSeries = computed(() => slices.value.map((s) => s.value))
</script>

<template>
  <div class="space-y-3" data-testid="charting-allocation">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load allocation data.</p>
    <template v-else>
      <apexchart v-if="slices.length" type="donut" :options="chartOptions" :series="chartSeries" :height="320" />
      <p v-else class="text-sm text-slate-500">No allocation data for this scope.</p>
      <table v-if="slices.length" class="w-full text-sm">
        <thead><tr class="text-left text-slate-400"><th class="py-1">Asset type</th><th>Value</th><th>%</th></tr></thead>
        <tbody>
          <tr v-for="s in slices" :key="s.key" class="border-t border-slate-100 dark:border-slate-800">
            <td class="py-1">{{ s.label }}</td><td>{{ s.value }}</td><td>{{ s.percent ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>