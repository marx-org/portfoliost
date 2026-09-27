<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioCompare } from "@/api/portfolios"
import { formatCurrency, formatNumber, formatPercent } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import type { components } from "@/api/types"

const route = useRoute()
const id = String(route.params.id)
const rows = ref<components["schemas"]["CompareRow"][]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await getPortfolioCompare(id)
    rows.value = res.items ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load comparison"
  } finally {
    loading.value = false
  }
})

function num(value: unknown, format: (v: number) => string): string {
  return typeof value === "number" && Number.isFinite(value) ? format(value) : "—"
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading comparison...</p>

    <div v-if="!loading && !error && rows.length" class="card overflow-hidden">
      <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <h2 class="text-base font-semibold">Held Stocks Comparison</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Symbol</th>
              <th class="px-5 py-2.5 text-right font-medium">Weight</th>
              <th class="px-5 py-2.5 text-right font-medium">Price</th>
              <th class="px-5 py-2.5 text-right font-medium">Market Cap</th>
              <th class="px-5 py-2.5 text-right font-medium">P/E</th>
              <th class="px-5 py-2.5 text-right font-medium">Fwd P/E</th>
              <th class="px-5 py-2.5 text-right font-medium">Div Yield</th>
              <th class="px-5 py-2.5 text-right font-medium">Rev Growth</th>
              <th class="px-5 py-2.5 text-right font-medium">Net Margin</th>
              <th class="px-5 py-2.5 text-right font-medium">ROE</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.symbol" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3">
                <router-link
                  :to="{ name: 'research-overview', params: { symbol: researchSymbol(r.symbol ?? '') } }"
                  class="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                >
                  {{ r.symbol }}
                </router-link>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ r.name }}</p>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(r.weight) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.price, (v) => formatCurrency(v, r.currency)) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.marketCap, (v) => `$${(v / 1e9).toFixed(1)}B`) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.peRatio, formatNumber) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.forwardPe, formatNumber) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.dividendYield, (v) => `${v.toFixed(2)}%`) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.revenueGrowth, (v) => `${v.toFixed(2)}%`) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.netMargin, (v) => `${v.toFixed(2)}%`) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ num(r.roe, (v) => `${v.toFixed(2)}%`) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <p v-else-if="!loading && !error" class="card p-6 text-sm text-slate-500 dark:text-slate-400">No positions to compare.</p>
  </div>
</template>
