<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentDividends } from "@/api/instruments"
import type { ResearchDividends } from "@/api/types"
import { formatCurrency } from "@/utils/format"
import { baseSymbol } from "@/utils/research"

const route = useRoute()
const symbol = baseSymbol(String(route.params.symbol))

const data = ref<ResearchDividends | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentDividends(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load dividends"
  } finally {
    loading.value = false
  }
})

const history = computed(() => data.value?.history ?? [])

const stats = computed(() => {
  const rows = history.value
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return {
    count: rows.length,
    total: total,
    latest: rows[rows.length - 1]?.amount ?? 0,
    latestYear: rows[rows.length - 1]?.year ?? 0,
  }
})

const chartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 300, toolbar: { show: false } },
  colors: ["#16a34a"],
  series: [{ name: "Dividend / share", data: history.value.map((r) => r.amount) }],
  xaxis: { categories: history.value.map((r) => String(r.year)) },
  plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
  dataLabels: {
    enabled: false,
  },
  yaxis: { labels: { formatter: (v: number) => `$${v.toFixed(2)}` } },
  grid: { borderColor: "#e2e8f0" },
}))

function dateLabel(d: string): string {
  const dt = new Date(`${d}T00:00:00`)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading dividends...</p>

    <template v-if="!loading && !error && data">
      <div v-if="stats" class="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div class="card p-6">
          <p class="text-sm text-slate-500">Payments</p>
          <p class="text-2xl font-semibold">{{ stats.count }}</p>
        </div>
        <div class="card p-6">
          <p class="text-sm text-slate-500">Cumulative ({{ history[0]?.year }}–{{ stats.latestYear }})</p>
          <p class="text-2xl font-semibold">{{ formatCurrency(stats.total) }}</p>
        </div>
        <div class="card p-6">
          <p class="text-sm text-slate-500">Latest ({{ stats.latestYear }})</p>
          <p class="text-2xl font-semibold">{{ formatCurrency(stats.latest) }}</p>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Dividends per share - {{ symbol }}</h2>
        <component :is="'apexchart'" v-if="history.length" :options="chartOptions" :series="chartOptions.series" />
        <p v-else class="text-sm text-slate-500">No dividend data available.</p>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Payment History</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th class="py-2 pr-3">Date</th>
                <th class="py-2 pr-3 text-right">Year</th>
                <th class="py-2 pr-3 text-right">Amount</th>
                <th class="py-2 pr-3">Currency</th>
                <th class="py-2 pr-3">Type</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in history" :key="r.date" class="border-b border-slate-100">
                <td class="py-2 pr-3 font-medium">{{ dateLabel(r.date) }}</td>
                <td class="py-2 pr-3 text-right">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right font-semibold text-green-700">{{ formatCurrency(r.amount, r.currency) }}</td>
                <td class="py-2 pr-3">{{ r.currency }}</td>
                <td class="py-2 pr-3 capitalize">{{ r.type }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
