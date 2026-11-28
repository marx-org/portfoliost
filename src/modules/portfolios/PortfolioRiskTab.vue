<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import { getPortfolioRiskMetrics } from "@/api/portfolios"
import { formatNumber, formatPercent } from "@/utils/format"

const { t } = useI18n()
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
    <h2 class="mb-4 text-base font-semibold">{{ t("portfolios.riskMetrics") }}</h2>
    <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.volatility") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("volatility", formatPercent) }}</dd>
      </div>
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.maxDrawdown") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("maxDrawdown", (v) => `-${formatPercent(Math.abs(v))}`) }}</dd>
      </div>
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.sharpeRatio") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("sharpeRatio", formatNumber) }}</dd>
      </div>
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.sortinoRatio") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("sortinoRatio", formatNumber) }}</dd>
      </div>
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.calmarRatio") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("calmarRatio", formatNumber) }}</dd>
      </div>
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.winRate") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("winRate", formatPercent) }}</dd>
      </div>
      <div class="rounded-lg bg-surface-2 p-4">
        <dt class="text-sm text-muted">{{ t("portfolios.periodReturn") }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums">{{ riskRow("periodReturnPercent", formatPercent) }}</dd>
      </div>
    </dl>
  </div>
</template>
