<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentDividends } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatAmount } from "@/utils/format"
import { withSharedChart } from "@/utils/chartOptions"
import CurrencyWarningBadge from "@/components/CurrencyWarningBadge.vue"
import type { CurrencySource } from "@/utils/instrumentCurrency"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const data = ref<components["schemas"]["DividendsData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentDividends(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load dividends"
  } finally {
    loading.value = false
  }
})

const history = computed(() => data.value?.history ?? [])

/**
 * §47.5/§49.6 — native currency from the response's top-level resolved
 * currency (never "USD"-guessed), falling back to the first dividend row;
 * the §47.4 currencySource rides along for the warning badge.
 */
const instrCcy = computed<string | null>(
  () => data.value?.currency ?? history.value[0]?.currency ?? null,
)
const currencySource = computed<CurrencySource | null>(() => data.value?.currencySource ?? null)

const stats = computed(() => {
  const rows = history.value
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return {
    count: rows.length,
    total: total,
    latest: rows[rows.length - 1]?.amount ?? 0,
    latestYear: rows[rows.length - 1]?.year ?? 0,
  }
})

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 300, toolbar: { show: false } },
  colors: ["var(--emerald)"],
  series: [{ name: "Dividend / share", data: history.value.map((r) => r.amount) }],
  xaxis: { categories: history.value.map((r) => String(r.year)) },
  plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
  dataLabels: {
    enabled: false,
  },
  yaxis: { labels: { formatter: (v: number) => formatAmount(v, instrCcy.value) } },
  fill: { type: "solid" as const },
}))

function dateLabel(d: string): string {
  const dt = new Date(`${d}T00:00:00`)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">Loading dividends...</p>

    <template v-if="!loading && !error && data">
      <div v-if="stats" class="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div class="card p-6">
          <p class="text-sm text-muted">Payments</p>
          <p class="text-2xl font-semibold">{{ stats.count }}</p>
        </div>
        <div class="card p-6">
          <p class="text-sm text-muted">Cumulative ({{ history[0]?.year }}–{{ stats.latestYear }})</p>
          <p class="text-2xl font-semibold">{{ formatAmount(stats.total, instrCcy) }}</p>
        </div>
        <div class="card p-6">
          <p class="text-sm text-muted">Latest ({{ stats.latestYear }})</p>
          <p class="text-2xl font-semibold">{{ formatAmount(stats.latest, instrCcy) }}</p>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="card-title mb-3">
          Dividends per share - {{ symbol }}
          <CurrencyWarningBadge :source="currencySource" :currency="instrCcy" class="ml-2" />
        </h2>
        <component :is="'apexchart'" v-if="history.length" :options="chartOptions" :series="chartOptions.series" />
        <p v-else class="text-sm text-muted">No dividend data available.</p>
      </div>

      <div class="card p-6">
        <h2 class="card-title mb-3">Payment History</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">Date</th>
                <th class="py-2 pr-3">Payment Date</th>
                <th class="py-2 pr-3 text-right">Year</th>
                <th class="py-2 pr-3 text-right">Amount</th>
                <th class="py-2 pr-3">Currency</th>
                <th class="py-2 pr-3">Type</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in history" :key="r.date" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ dateLabel(r.date) }}</td>
                <td class="py-2 pr-3">{{ r.paymentDate ? dateLabel(r.paymentDate) : "—" }}</td>
                <td class="py-2 pr-3 text-right">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right font-semibold text-emerald">{{ formatAmount(r.amount, r.currency) }}</td>
                <td class="py-2 pr-3">{{ r.currency }}</td>
                <td class="py-2 pr-3 capitalize">{{ r.type }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
