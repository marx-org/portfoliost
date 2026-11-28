<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import { getPortfolioCompare } from "@/api/portfolios"
import { formatCurrency, formatNumber, formatPercent } from "@/utils/format"
import { researchRoute } from "@/utils/research"
import type { components } from "@/api/types"

const { t } = useI18n()
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
    error.value = err instanceof Error ? err.message : t("portfolios.loadCompareError")
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
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">{{ t("portfolios.loadingCompare") }}</p>

    <div v-if="!loading && !error && rows.length" class="card overflow-hidden">
      <div class="border-b border-border px-5 py-3">
        <h2 class="text-base font-semibold">{{ t("portfolios.heldStocksComparison") }}</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted">
              <th class="px-5 py-2.5 font-medium">{{ t("tables.col.symbol") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.weight") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.price") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.marketCap") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.peRatio") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.fwdPe") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.divYield") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.revGrowth") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.netMargin") }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ t("portfolios.roe") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.symbol" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3">
                <router-link
                  :to="researchRoute(r.symbol ?? '', route.fullPath)"
                  class="font-medium text-text hover:text-accent-text dark:hover:text-blue-400 hover:underline"
                >
                  {{ r.symbol }}
                </router-link>
                <p class="text-xs text-muted">{{ r.name }}</p>
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
    <p v-else-if="!loading && !error" class="card p-6 text-sm text-muted">{{ t("portfolios.noCompare") }}</p>
  </div>
</template>
