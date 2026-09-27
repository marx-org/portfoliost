<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioAllocation } from "@/api/portfolios"
import { formatCurrency, formatPercent } from "@/utils/format"
import type { components } from "@/api/types"

const route = useRoute()
const id = String(route.params.id)
const allocation = ref<components["schemas"]["PortfolioSnapshot"]["allocation"] | null>(null)
/** §66.3 — the allocation reports the currency it is denominated in. byCurrency
 * rows are the exception: each is in its own currency, carried as `name`. */
const allocationCcy = computed(() => allocation.value?.currency ?? null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    allocation.value = await getPortfolioAllocation(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load allocation"
  } finally {
    loading.value = false
  }
})

const sectorOptions = computed(() => {
  const slices = allocation.value?.bySector ?? []
  return {
    chart: { type: "donut" as const, height: 320, toolbar: { show: false } },
    labels: slices.map((s) => s.name),
    colors: ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b", "#ec4899"],
    legend: { position: "bottom" as const },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (value: number) => formatCurrency(value, allocationCcy.value) } },
    series: slices.map((s) => s.value),
  }
})

function weight(name: string, slices: { name?: string; value?: number }[] | undefined): number {
  const list = slices ?? []
  const total = list.reduce((s, x) => s + (x.value ?? 0), 0)
  const slice = list.find((x) => x.name === name)
  return total > 0 && slice ? ((slice.value ?? 0) / total) * 100 : 0
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading allocation...</p>

    <template v-if="!loading && !error">
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div class="card p-6">
          <h2 class="mb-2 text-base font-semibold">By Sector</h2>
          <component :is="'apexchart'" v-if="sectorOptions.series.length" :options="sectorOptions" :series="sectorOptions.series" />
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No allocation data.</p>
        </div>
        <div class="card overflow-hidden">
          <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
            <h2 class="text-base font-semibold">Sector Weights</h2>
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <th class="px-5 py-2.5 font-medium">Sector</th>
                <th class="px-5 py-2.5 text-right font-medium">Value</th>
                <th class="px-5 py-2.5 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="s in allocation?.bySector" :key="s.name" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ s.name }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value ?? 0, allocationCcy) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(weight(s.name ?? "", allocation?.bySector)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div class="card overflow-hidden">
          <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
            <h2 class="text-base font-semibold">By Asset Type</h2>
          </div>
          <table class="w-full text-sm">
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="s in allocation?.byAssetType" :key="s.name" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ s.name }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value ?? 0, allocationCcy) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(weight(s.name ?? "", allocation?.byAssetType)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card overflow-hidden">
          <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
            <h2 class="text-base font-semibold">By Currency</h2>
          </div>
          <table class="w-full text-sm">
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="s in allocation?.byCurrency" :key="s.name" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ s.name }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value ?? 0, s.name) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(weight(s.name ?? "", allocation?.byCurrency)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
