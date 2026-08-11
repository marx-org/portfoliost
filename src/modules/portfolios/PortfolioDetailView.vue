<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/utils/format"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const loading = ref(true)
const error = ref<string | null>(null)

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

onMounted(load)

watch(
  () => route.params.id,
  () => load(),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await store.fetchDetail(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load portfolio"
  } finally {
    loading.value = false
  }
}

async function changeTimeframe(timeframe: PortfolioAnalyticsTimeframe) {
  await store.setTimeframe(timeframe, id)
}

const equityOptions = computed(() => {
  const series = store.analytics?.performance.timeSeries ?? []
  const values = series.map((p) => [new Date(p.date).getTime(), p.value])
  const bench = store.analytics?.benchmarks?.[0]
  const benchSeries = (bench?.timeSeries ?? []).map((p) => [new Date(p.date).getTime(), p.value])
  return {
    chart: { type: "line" as const, height: 300, toolbar: { show: false }, zoom: { enabled: false } },
    colors: ["#2563eb", "#94a3b8"],
    series: [
      { name: "Portfolio", data: values },
      { name: bench?.name ?? "Benchmark", data: benchSeries },
    ],
    xaxis: { type: "datetime" as const, labels: { datetimeUTC: false } },
    stroke: { width: [2, 1], dashArray: [0, 4] },
    dataLabels: { enabled: false },
  }
})

const monthlyOptions = computed(() => {
  const returns = store.analytics?.performance.monthlyReturns ?? []
  return {
    chart: { type: "bar" as const, height: 220, toolbar: { show: false } },
    colors: ["#2563eb"],
    series: [{ name: "Return %", data: returns.map((m) => m.returnPercent) }],
    xaxis: { categories: returns.map((m) => m.month) },
    plotOptions: { bar: { columnWidth: "50%", borderRadius: 3 } },
    dataLabels: { enabled: false },
  }
})

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}
</script>

<template>
  <div>
    <router-link to="/en/investments" class="btn-ghost mb-4">&larr; All portfolios</router-link>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading portfolio...</p>

    <template v-if="!loading && !error">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-semibold">{{ store.portfolios.find((p) => p.id === id)?.name ?? "Portfolio" }}</h1>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-600">
              {{ store.portfolios.find((p) => p.id === id)?.strategy ?? "—" }}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-500">
            {{ store.portfolios.find((p) => p.id === id)?.description || "No description" }}
          </p>
        </div>
      </div>

      <div v-if="store.summaryMetrics" class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Value</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.summaryMetrics.totalValue) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Invested</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.summaryMetrics.totalInvested) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Unrealized Gain / Loss</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" :class="gainClass(store.summaryMetrics.unrealizedGainLoss)">
            {{ formatSignedCurrency(store.summaryMetrics.unrealizedGainLoss) }}
          </p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Day Change</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" :class="gainClass(store.summaryMetrics.dayChangeAmount)">
            {{ formatSignedCurrency(store.summaryMetrics.dayChangeAmount) }}
            <span class="text-sm font-normal" :class="gainClass(store.summaryMetrics.dayChangePercent)">
              ({{ formatPercent(store.summaryMetrics.dayChangePercent) }})
            </span>
          </p>
        </div>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div class="card p-6 xl:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-base font-semibold">Equity Curve</h2>
            <div class="flex gap-1">
              <button
                v-for="tf in timeframes"
                :key="tf.value"
                type="button"
                class="btn-secondary text-xs"
                :class="store.analyticsTimeframe === tf.value ? 'bg-blue-600 text-white' : ''"
                @click="changeTimeframe(tf.value)"
              >
                {{ tf.label }}
              </button>
            </div>
          </div>
          <component :is="'apexchart'" v-if="equityOptions.series[0].data.length" :options="equityOptions" />
          <p v-else class="text-sm text-slate-500">No analytics available.</p>
        </div>

        <div class="card p-6">
          <h2 class="mb-3 text-base font-semibold">Monthly Returns</h2>
          <component :is="'apexchart'" v-if="monthlyOptions.series[0].data.length" :options="monthlyOptions" />
          <p v-else class="text-sm text-slate-500">No monthly data available.</p>
          <dl v-if="store.analytics?.performance" class="mt-4 space-y-1.5 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">Volatility</dt>
              <dd class="tabular-nums">{{ formatPercent(store.analytics.performance.volatility) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Max Drawdown</dt>
              <dd class="tabular-nums">-{{ formatPercent(store.analytics.performance.maxDrawdown) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Sharpe Ratio</dt>
              <dd class="tabular-nums">{{ formatNumber(store.analytics.performance.sharpeRatio) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Win Rate</dt>
              <dd class="tabular-nums">{{ formatPercent(store.analytics.performance.winRate) }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 class="text-base font-semibold">Positions</h2>
          <span class="text-sm text-slate-500">{{ store.positions.length }} open</span>
        </div>
        <div v-if="store.positions.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <th class="px-5 py-2.5 font-medium">Symbol</th>
                <th class="px-5 py-2.5 text-right font-medium">Quantity</th>
                <th class="px-5 py-2.5 text-right font-medium">Avg Cost</th>
                <th class="px-5 py-2.5 text-right font-medium">Price</th>
                <th class="px-5 py-2.5 text-right font-medium">Market Value</th>
                <th class="px-5 py-2.5 text-right font-medium">Unrealized P/L</th>
                <th class="px-5 py-2.5 text-right font-medium">% of Portfolio</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="pos in store.positions" :key="pos.id" class="hover:bg-slate-50">
                <td class="px-5 py-3">
                  <router-link
                    :to="{ name: 'research-overview', params: { symbol: pos.symbol } }"
                    class="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                  >
                    {{ pos.symbol }}
                  </router-link>
                  <p class="text-xs text-slate-500">{{ pos.companyName }}</p>
                </td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(pos.quantity, 0) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.averageCostBasis) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.currentPrice) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.marketValue) }}</td>
                <td class="px-5 py-3 text-right tabular-nums" :class="gainClass(pos.unrealizedGainLoss)">
                  {{ formatSignedCurrency(pos.unrealizedGainLoss) }}
                  <span class="text-xs font-normal">({{ formatPercent(pos.percentageChange) }})</span>
                </td>
                <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(pos.percentOfPortfolio) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="px-5 py-6 text-sm text-slate-500">No open positions.</p>
      </div>
    </template>
  </div>
</template>
