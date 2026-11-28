<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import { getInstrumentOwnership } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatCompact, formatNumber } from "@/utils/format"
import { withSharedChart } from "@/utils/chartOptions"

const route = useRoute()
const { t } = useI18n()
const symbol = String(route.params.symbol).toUpperCase()

const data = ref<components["schemas"]["OwnershipData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentOwnership(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("research.loadOwnershipError")
  } finally {
    loading.value = false
  }
})

const institutional = computed(() => data.value?.institutional ?? [])
const mutualFund = computed(() => data.value?.mutualFund ?? [])
const insider = computed(() => data.value?.insider ?? [])
const transactions = computed(() => data.value?.insiderTransactions ?? [])

function holdersChart(rows: components["schemas"]["HoldingGroup"][]) {
  return withSharedChart({
    chart: { type: "bar" as const, height: 200, toolbar: { show: false } },
    colors: ["var(--accent)"],
    series: [{ name: t("research.holdingPct"), data: rows.map((r) => r.holdingPercentage) }],
    xaxis: { categories: rows.map((r) => r.date) },
    plotOptions: { bar: { columnWidth: "40%", borderRadius: 3 } },
    dataLabels: { enabled: false },
    yaxis: { labels: { formatter: (v: number) => `${v.toFixed(1)}%` } },
    fill: { type: "solid" as const },
  })
}

function amount(v: number): string {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return formatCompact(v)
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">{{ t("research.loadingOwnership") }}</p>

    <template v-if="!loading && !error && data">
      <div class="card p-6">
        <h2 class="card-title mb-3">{{ t("research.institutionalHolders") }}</h2>
        <component :is="'apexchart'" v-if="institutional.length" :options="holdersChart(institutional)" :series="holdersChart(institutional).series" />
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.period") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.holdingPct") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.holders") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.positionsShares") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.positionValue") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in institutional" :key="r.date" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ r.date }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.holdingPercentage) }}%</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.holdersCount, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.sumOfCurrentPositions, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ amount(r.sumOfCurrentPositionsValue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="card-title mb-3">{{ t("research.mutualFundHolders") }}</h2>
        <component :is="'apexchart'" v-if="mutualFund.length" :options="holdersChart(mutualFund)" :series="holdersChart(mutualFund).series" />
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.period") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.holdingPct") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.holders") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.positionsShares") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.positionValue") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in mutualFund" :key="r.date" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ r.date }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.holdingPercentage) }}%</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.holdersCount, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.sumOfCurrentPositions, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ amount(r.sumOfCurrentPositionsValue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="insider.length" class="card p-6">
        <h2 class="card-title mb-3">{{ t("research.insiderHolders") }}</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.period") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.holdingPct") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.holders") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.positionsShares") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.positionValue") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in insider" :key="r.date" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ r.date }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.holdingPercentage) }}%</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.holdersCount, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(r.sumOfCurrentPositions, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ amount(r.sumOfCurrentPositionsValue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="transactions.length" class="card p-6">
        <h2 class="card-title mb-3">{{ t("research.insiderTransactions") }}</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.insider") }}</th>
                <th class="py-2 pr-3">{{ t("research.date") }}</th>
                <th class="py-2 pr-3">{{ t("research.code") }}</th>
                <th class="py-2 pr-3">{{ t("research.type") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.amount") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.value") }}</th>
                <th class="py-2 pr-3">{{ t("research.filed") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(tx, i) in transactions" :key="i" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ tx.title }}</td>
                <td class="py-2 pr-3">{{ tx.transactionDate }}</td>
                <td class="py-2 pr-3">{{ tx.transactionCode }}</td>
                <td class="py-2 pr-3">{{ tx.transactionText }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(tx.transactionAmount ?? 0, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ amount(tx.transactionValue ?? 0) }}</td>
                <td class="py-2 pr-3">{{ tx.filingDate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
