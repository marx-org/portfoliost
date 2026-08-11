<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioRiskMetrics } from "@/api/portfolios"
import { formatNumber, formatPercent } from "@/utils/format"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const riskMetrics = ref<Record<string, number | null> | null>(null)

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

onMounted(async () => {
  try {
    riskMetrics.value = (await getPortfolioRiskMetrics(id)) as Record<string, number | null> | null
  } catch {
    riskMetrics.value = null
  }
})

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

function riskRow(key: string, format: (v: number) => string): string {
  const v = riskMetrics.value?.[key]
  return typeof v === "number" ? format(v) : "—"
}
</script>

<template>
  <div class="space-y-6">
    <div class="card p-6">
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
      <component :is="'apexchart'" v-if="equityOptions.series[0].data.length" :options="equityOptions" :series="equityOptions.series" />
      <p v-else class="text-sm text-slate-500">No analytics available.</p>
    </div>

    <div class="card p-6">
      <h2 class="mb-3 text-base font-semibold">Monthly Returns</h2>
      <component :is="'apexchart'" v-if="monthlyOptions.series[0].data.length" :options="monthlyOptions" :series="monthlyOptions.series" />
      <p v-else class="text-sm text-slate-500">No monthly data available.</p>
    </div>

    <div class="card p-6">
      <h2 class="mb-4 text-base font-semibold">Risk Metrics</h2>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Volatility</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("volatility", formatPercent) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Max Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("maxDrawdown", (v) => `-${formatPercent(v)}`) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Sharpe Ratio</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("sharpeRatio", formatNumber) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Sortino Ratio</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("sortinoRatio", formatNumber) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Calmar Ratio</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("calmarRatio", formatNumber) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Win Rate</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("winRate", formatPercent) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <dt class="text-sm text-slate-500">Period Return</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("periodReturnPercent", formatPercent) }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
