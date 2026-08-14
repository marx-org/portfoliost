<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioRiskMetrics } from "@/api/portfolios"
import { formatNumber, formatPercent } from "@/utils/format"

const route = useRoute()
const id = String(route.params.id)
const riskMetrics = ref<Record<string, number | null> | null>(null)

onMounted(async () => {
  try {
    riskMetrics.value = (await getPortfolioRiskMetrics(id)) as Record<string, number | null> | null
  } catch {
    riskMetrics.value = null
  }
})

function riskRow(key: string, format: (v: number) => string): string {
  const v = riskMetrics.value?.[key]
  return typeof v === "number" ? format(v) : "—"
}
</script>

<template>
  <div class="card p-6">
    <h2 class="mb-4 text-base font-semibold">Risk Metrics</h2>
    <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Volatility</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("volatility", formatPercent) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Max Drawdown</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("maxDrawdown", (v) => `-${formatPercent(v)}`) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Sharpe Ratio</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("sharpeRatio", formatNumber) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Sortino Ratio</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("sortinoRatio", formatNumber) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Calmar Ratio</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("calmarRatio", formatNumber) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Win Rate</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("winRate", formatPercent) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Period Return</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("periodReturnPercent", formatPercent) }}</dd>
      </div>
    </dl>
  </div>
</template>
