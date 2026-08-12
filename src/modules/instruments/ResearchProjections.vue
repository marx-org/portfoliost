<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getProjections } from "@/api/instruments"
import { formatCompact, formatCurrency, formatDate } from "@/utils/format"
import { baseSymbol } from "@/utils/research"

interface PriceTarget {
  lastUpdated: string
  low: number
  mean: number
  current: number
  high: number
}

interface Recommendation {
  period: string
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

interface EstimateSet {
  avg: number
  high: number
  low: number
  mean: number
  periods: string[]
}

interface Projections {
  priceTarget: PriceTarget
  recommendation: Recommendation
  earnings: EstimateSet
  revenue: EstimateSet
}

const route = useRoute()
const symbol = baseSymbol(String(route.params.symbol))

const data = ref<Projections | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    data.value = (await getProjections(symbol)) as unknown as Projections
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load projections"
  } finally {
    loading.value = false
  }
})

const recommendationSeries = computed(() => {
  const r = data.value?.recommendation
  if (!r) return []
  return [
    { name: "Strong Buy", value: r.strongBuy },
    { name: "Buy", value: r.buy },
    { name: "Hold", value: r.hold },
    { name: "Sell", value: r.sell },
    { name: "Strong Sell", value: r.strongSell },
  ]
})

const totalRatings = computed(() =>
  recommendationSeries.value.reduce((sum, s) => sum + s.value, 0),
)

const recommendationChart = computed(() => ({
  chart: { type: "donut" as const, height: 260, toolbar: { show: false } },
  labels: recommendationSeries.value.map((s) => s.name),
  series: recommendationSeries.value.map((s) => s.value),
  colors: ["#16a34a", "#22c55e", "#94a3b8", "#f97316", "#ef4444"],
  legend: { position: "bottom" as const },
  dataLabels: { enabled: false },
  plotOptions: { pie: { donut: { size: "65%" } } },
}))

function targetPosition(pt: PriceTarget): { left: string; right: string } {
  const spread = pt.high - pt.low || 1
  const clamp = (v: number) => Math.max(0, Math.min(100, ((v - pt.low) / spread) * 100))
  return { left: `${clamp(pt.current)}%`, right: `${100 - clamp(pt.current)}%` }
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading projections...</p>

    <template v-if="data && !loading && !error">
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="card p-6">
          <h2 class="mb-4 text-base font-semibold">Price Target</h2>
          <div class="flex items-end gap-6">
            <div>
              <p class="text-2xl font-semibold">{{ formatCurrency(data.priceTarget.current) }}</p>
              <p class="text-xs text-slate-500">Current price</p>
            </div>
            <div>
              <p class="text-lg font-medium">{{ formatCurrency(data.priceTarget.mean) }}</p>
              <p class="text-xs text-slate-500">Mean target</p>
            </div>
          </div>
          <div class="relative mt-6 h-2 rounded-full bg-slate-200">
            <div
              class="absolute inset-y-0 rounded-full bg-blue-600"
              :style="{ left: targetPosition(data.priceTarget).left, right: targetPosition(data.priceTarget).right }"
            ></div>
          </div>
          <div class="mt-2 flex justify-between text-xs text-slate-500">
            <span>{{ formatCurrency(data.priceTarget.low) }}</span>
            <span>{{ formatCurrency(data.priceTarget.high) }}</span>
          </div>
          <p class="mt-4 text-xs text-slate-500">Updated {{ formatDate(data.priceTarget.lastUpdated) }}</p>
        </div>

        <div class="card p-6">
          <h2 class="mb-2 text-base font-semibold">Recommendation</h2>
          <p v-if="totalRatings" class="text-xs text-slate-500">{{ totalRatings }} analysts &middot; period {{ data.recommendation.period }}</p>
          <component :is="'apexchart'" :options="recommendationChart" :series="recommendationChart.series" />
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="card p-6">
          <h2 class="mb-4 text-base font-semibold">Earnings Estimates</h2>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase text-slate-500">
                <th class="pb-2 font-medium">Metric</th>
                <th class="pb-2 text-right font-medium">Avg</th>
                <th class="pb-2 text-right font-medium">High</th>
                <th class="pb-2 text-right font-medium">Mean</th>
                <th class="pb-2 text-right font-medium">Low</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr>
                <td class="py-2">EPS</td>
                <td class="py-2 text-right tabular-nums">{{ data.earnings.avg }}</td>
                <td class="py-2 text-right tabular-nums">{{ data.earnings.high }}</td>
                <td class="py-2 text-right tabular-nums">{{ data.earnings.mean }}</td>
                <td class="py-2 text-right tabular-nums">{{ data.earnings.low }}</td>
              </tr>
              <tr v-for="period in data.earnings.periods" :key="period">
                <td class="py-2 text-slate-500">{{ period }}</td>
                <td class="py-2 text-right tabular-nums">—</td>
                <td class="py-2 text-right tabular-nums">—</td>
                <td class="py-2 text-right tabular-nums">—</td>
                <td class="py-2 text-right tabular-nums">—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card p-6">
          <h2 class="mb-4 text-base font-semibold">Revenue Estimates</h2>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase text-slate-500">
                <th class="pb-2 font-medium">Metric</th>
                <th class="pb-2 text-right font-medium">Avg</th>
                <th class="pb-2 text-right font-medium">High</th>
                <th class="pb-2 text-right font-medium">Mean</th>
                <th class="pb-2 text-right font-medium">Low</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr>
                <td class="py-2">Revenue</td>
                <td class="py-2 text-right tabular-nums">{{ formatCompact(data.revenue.avg) }}</td>
                <td class="py-2 text-right tabular-nums">{{ formatCompact(data.revenue.high) }}</td>
                <td class="py-2 text-right tabular-nums">{{ formatCompact(data.revenue.mean) }}</td>
                <td class="py-2 text-right tabular-nums">{{ formatCompact(data.revenue.low) }}</td>
              </tr>
              <tr v-for="period in data.revenue.periods" :key="period">
                <td class="py-2 text-slate-500">{{ period }}</td>
                <td class="py-2 text-right tabular-nums">—</td>
                <td class="py-2 text-right tabular-nums">—</td>
                <td class="py-2 text-right tabular-nums">—</td>
                <td class="py-2 text-right tabular-nums">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
