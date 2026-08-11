<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentPeers } from "@/api/instruments"
import type { ResearchCompare } from "@/api/types"
import { formatCompact, formatCurrency, formatNumber, formatPercent } from "@/utils/format"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const items = ref<ResearchCompare[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await getInstrumentPeers(symbol)
    items.value = res.items
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load comparison"
  } finally {
    loading.value = false
  }
})

const metrics: Array<{ key: keyof ResearchCompare; label: string; fmt: (r: ResearchCompare) => string }> = [
  { key: "price", label: "Price", fmt: (r) => formatCurrency(r.price, r.currency ?? "USD") },
  { key: "marketCap", label: "Market Cap", fmt: (r) => formatCompact(r.marketCap) },
  { key: "peRatio", label: "P/E (TTM)", fmt: (r) => formatNumber(r.peRatio) },
  { key: "forwardPe", label: "Forward P/E", fmt: (r) => formatNumber(r.forwardPe) },
  { key: "pbRatio", label: "P/B", fmt: (r) => formatNumber(r.pbRatio) },
  { key: "psRatio", label: "P/S", fmt: (r) => formatNumber(r.psRatio) },
  { key: "dividendYield", label: "Dividend Yield", fmt: (r) => formatPercent(r.dividendYield) },
  { key: "revenueGrowth", label: "Revenue Growth", fmt: (r) => formatPercent(r.revenueGrowth) },
  { key: "netMargin", label: "Net Margin", fmt: (r) => formatPercent(r.netMargin) },
  { key: "roe", label: "ROE", fmt: (r) => formatPercent(r.roe) },
  { key: "grossMargin", label: "Gross Margin", fmt: (r) => formatPercent(r.grossMargin) },
  { key: "operatingMargin", label: "Operating Margin", fmt: (r) => formatPercent(r.operatingMargin) },
  { key: "evToEbitda", label: "EV/EBITDA", fmt: (r) => formatNumber(r.evToEbitda) },
  { key: "evToSales", label: "EV/Sales", fmt: (r) => formatNumber(r.evToSales) },
  { key: "fcfMargin", label: "FCF Margin", fmt: (r) => formatPercent(r.fcfMargin) },
  { key: "netIncome", label: "Net Income", fmt: (r) => formatCompact(r.netIncome) },
  { key: "revenue", label: "Revenue", fmt: (r) => formatCompact(r.revenue) },
]

const rows = computed(() =>
  metrics.map((m) => ({ label: m.label, key: m.key, values: items.value.map((r) => m.fmt(r)) })),
)
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading comparison...</p>

    <div v-if="!loading && !error && items.length" class="card p-6">
      <h2 class="mb-3 text-base font-semibold">Compare {{ symbol }} with peers</h2>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th class="py-2 pr-3">Metric</th>
              <th v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right">
                <div :class="r.symbol === symbol ? 'font-bold text-blue-700' : 'font-medium'">{{ r.symbol }}</div>
                <div class="text-[10px] font-normal normal-case text-slate-400">{{ r.name }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="row.key" class="border-b border-slate-100" :class="i % 2 ? 'bg-slate-50/50' : ''">
              <td class="py-2 pr-3 text-slate-600">{{ row.label }}</td>
              <td
                v-for="(v, j) in row.values"
                :key="j"
                class="px-3 py-2 text-right"
                :class="items[j].symbol === symbol ? 'font-semibold text-blue-700' : ''"
              >
                {{ v }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
