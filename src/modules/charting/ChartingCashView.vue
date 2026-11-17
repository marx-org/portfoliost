<script setup lang="ts">
/** Charting → Cash & funding (feature #253, sub-issues #256/#276–#277). */
import { computed, watch } from "vue"
import { getChartCash } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"
import CashHistoryChart from "./CashHistoryChart.vue"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartCash)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const currency = computed(() => data.value?.currency ?? "")
const series = computed(() => data.value?.series ?? [])
const contributions = computed(() => data.value?.annualContributions ?? [])
</script>

<template>
  <div class="space-y-3" data-testid="charting-cash">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load cash data.</p>
    <template v-else>
      <CashHistoryChart :series="series" :currency="currency" />
      <div v-if="contributions.length" class="card overflow-hidden">
        <div class="border-b border-slate-200 px-5 py-3 dark:border-slate-700/60">
          <h2 class="text-base font-semibold">Annual External Contributions</h2>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Year</th>
              <th class="px-5 py-2.5 text-right font-medium">Contributions</th>
              <th class="px-5 py-2.5 text-right font-medium">Withdrawals</th>
              <th class="px-5 py-2.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="c in contributions" :key="c.year" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3">{{ c.year }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ c.contributions }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ c.withdrawals }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ c.net }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>