<script setup lang="ts">
/** Charting → Income (feature #253, sub-issue #256/#257–#265). */
import { computed, watch } from "vue"
import { getChartIncome } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartIncome)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const annual = computed(() => data.value?.annual ?? [])
const chartOptions = {
  chart: { type: "bar", height: 320 },
  xaxis: { categories: annual.value.map((a) => String(a.year)), title: { text: "Year" } },
  colors: ["#22c55e"],
}
const chartSeries = computed(() => [
  { name: "Income", data: annual.value.map((a) => a.total) },
])
</script>

<template>
  <div class="space-y-3" data-testid="charting-income">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load income data.</p>
    <template v-else>
      <apexchart v-if="annual.length" type="bar" :options="chartOptions" :series="chartSeries" :height="320" />
      <p v-else class="text-sm text-slate-500">No income data for this scope.</p>
      <table v-if="annual.length" class="w-full text-sm">
        <thead><tr class="text-left text-slate-400"><th class="py-1">Year</th><th>Dividends</th><th>Interest</th><th>Options</th><th>Total</th></tr></thead>
        <tbody>
          <tr v-for="a in annual" :key="a.year" class="border-t border-slate-100 dark:border-slate-800">
            <td class="py-1">{{ a.year }}</td><td>{{ a.dividends }}</td><td>{{ a.interest }}</td><td>{{ a.options }}</td><td>{{ a.total }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>