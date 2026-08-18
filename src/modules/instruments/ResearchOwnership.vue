<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentOwnership } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatCompact, formatNumber } from "@/utils/format"
import { baseSymbol } from "@/utils/research"

const route = useRoute()
const symbol = baseSymbol(String(route.params.symbol))

const data = ref<components["schemas"]["OwnershipData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentOwnership(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load ownership"
  } finally {
    loading.value = false
  }
})

const institutional = computed(() => data.value?.institutional ?? [])
const mutualFund = computed(() => data.value?.mutualFund ?? [])
const insider = computed(() => data.value?.insider ?? [])
const transactions = computed(() => data.value?.insiderTransactions ?? [])

function holdersChart(rows: components["schemas"]["HoldingGroup"][]) {
  return {
    chart: { type: "bar" as const, height: 200, toolbar: { show: false } },
    colors: ["#2563eb"],
    series: [{ name: "Holding %", data: rows.map((r) => r.holdingPercentage) }],
    xaxis: { categories: rows.map((r) => r.date) },
    plotOptions: { bar: { columnWidth: "40%", borderRadius: 3 } },
    dataLabels: { enabled: false },
    yaxis: { labels: { formatter: (v: number) => `${v.toFixed(1)}%` } },
  }
}

function amount(v: number): string {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return formatCompact(v)
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading ownership...</p>

    <template v-if="!loading && !error && data">
      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Institutional Holders</h2>
        <component :is="'apexchart'" v-if="institutional.length" :options="holdersChart(institutional)" :series="holdersChart(institutional).series" />
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Period</th>
                <th class="py-2 pr-3 text-right">Holding %</th>
                <th class="py-2 pr-3 text-right">Holders</th>
                <th class="py-2 pr-3 text-right">Positions (shares)</th>
                <th class="py-2 pr-3 text-right">Position Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in institutional" :key="r.date" class="border-b border-slate-100 dark:border-slate-800">
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
        <h2 class="mb-3 text-base font-semibold">Mutual Fund Holders</h2>
        <component :is="'apexchart'" v-if="mutualFund.length" :options="holdersChart(mutualFund)" :series="holdersChart(mutualFund).series" />
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Period</th>
                <th class="py-2 pr-3 text-right">Holding %</th>
                <th class="py-2 pr-3 text-right">Holders</th>
                <th class="py-2 pr-3 text-right">Positions (shares)</th>
                <th class="py-2 pr-3 text-right">Position Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in mutualFund" :key="r.date" class="border-b border-slate-100 dark:border-slate-800">
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
        <h2 class="mb-3 text-base font-semibold">Insider Holders</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Period</th>
                <th class="py-2 pr-3 text-right">Holding %</th>
                <th class="py-2 pr-3 text-right">Holders</th>
                <th class="py-2 pr-3 text-right">Positions (shares)</th>
                <th class="py-2 pr-3 text-right">Position Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in insider" :key="r.date" class="border-b border-slate-100 dark:border-slate-800">
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
        <h2 class="mb-3 text-base font-semibold">Insider Transactions</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Insider</th>
                <th class="py-2 pr-3">Date</th>
                <th class="py-2 pr-3">Code</th>
                <th class="py-2 pr-3">Type</th>
                <th class="py-2 pr-3 text-right">Amount</th>
                <th class="py-2 pr-3 text-right">Value</th>
                <th class="py-2 pr-3">Filed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in transactions" :key="i" class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-3 font-medium">{{ t.title }}</td>
                <td class="py-2 pr-3">{{ t.transactionDate }}</td>
                <td class="py-2 pr-3">{{ t.transactionCode }}</td>
                <td class="py-2 pr-3">{{ t.transactionText }}</td>
                <td class="py-2 pr-3 text-right">{{ formatNumber(t.transactionAmount ?? 0, 0) }}</td>
                <td class="py-2 pr-3 text-right">{{ amount(t.transactionValue ?? 0) }}</td>
                <td class="py-2 pr-3">{{ t.filingDate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
