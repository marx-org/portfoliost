<script setup lang="ts">
/** Charting → Cash & funding (feature #253, sub-issue #256/#276–#277). */
import { computed, watch } from "vue"
import { getChartCash } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartCash)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const history = computed(() => data.value?.balanceHistory ?? [])
const contributions = computed(() => data.value?.annualContributions ?? [])
const chartOptions = {
  chart: { type: "line", height: 300 },
  xaxis: { type: "datetime" },
  colors: ["#f59e0b"],
}
const chartSeries = computed(() => [{ name: "Cash", data: history.value.map((p) => ({ x: new Date(p.date).getTime(), y: p.balance })) }])
</script>

<template>
  <div class="space-y-3" data-testid="charting-cash">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load cash data.</p>
    <template v-else>
      <apexchart v-if="history.length" type="line" :options="chartOptions" :series="chartSeries" :height="300" />
      <p v-else class="text-sm text-slate-500">No cash history for this scope.</p>
      <table v-if="contributions.length" class="w-full text-sm">
        <thead><tr class="text-left text-slate-400"><th class="py-1">Year</th><th>Contributions</th><th>Withdrawals</th><th>Net</th></tr></thead>
        <tbody>
          <tr v-for="c in contributions" :key="c.year" class="border-t border-slate-100 dark:border-slate-800">
            <td class="py-1">{{ c.year }}</td><td>{{ c.contributions }}</td><td>{{ c.withdrawals }}</td><td>{{ c.net }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>