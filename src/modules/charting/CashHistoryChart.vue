<script setup lang="ts">
/**
 * Broker cash balances through time (feature #253, sub-issue #276).
 *
 * One line per selected real broker account from the canonical cashLedger
 * replay, plus the combined total (internal transfers cancel). Negative cash is
 * kept. Presentation only.
 */
import { computed } from "vue"
import type { components } from "@/api/types"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisCurrency, axisTitle, chartTitle, withSharedChart } from "./chartFormat"

type CashSeries = components["schemas"]["ChartCashSeries"]
type Point = { date: string; balance: number }

const props = withDefaults(
  defineProps<{
    series?: CashSeries[]
    currency?: string
    testid?: string
  }>(),
  { series: () => [], currency: "", testid: "charting-cash-history" },
)

const rows = computed(() => props.series ?? [])
const accounts = computed(() => rows.value.filter((s) => s.key !== "__total__"))
const total = computed(() => rows.value.find((s) => s.key === "__total__"))

const chartOptions = computed(() => withSharedChart({
  chart: { type: "line" as const, height: 340, toolbar: { show: false }, zoom: { enabled: false } },
  title: chartTitle("Broker Cash Balances"),
  xaxis: { type: "datetime" as const, title: axisTitle("Date") },
  yaxis: {
    title: axisTitle(`Cash balance (${props.currency})`),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  dataLabels: { enabled: false },
  stroke: { width: [2, 2, 2, 2.5] },
  colors: ["var(--accent)", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b"],
  tooltip: { shared: true, y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
  legend: { position: "bottom" as const },
}))
const chartSeries = computed(() => {
  const lines = accounts.value.map((s) => ({
    name: s.label,
    data: s.points.map((p) => ({ x: new Date(p.date).getTime(), y: p.balance })),
  }))
  if (total.value) {
    lines.push({
      name: "Total",
      data: total.value.points.map((p) => ({ x: new Date(p.date).getTime(), y: p.balance })),
    })
  }
  return lines
})

function latest(s: CashSeries): Point | undefined {
  return s.points.at(-1)
}
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="accounts.length">
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="mb-2 text-base font-semibold">Broker Cash Balances</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <CollapsibleSection title="Cash Balances" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Account</th>
              <th class="px-5 py-2.5 text-right font-medium">Latest balance</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in rows" :key="s.key" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ s.label }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(latest(s)?.balance ?? 0, currency) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">
          Balances are in {{ currency }}. Negative cash is shown, not clamped. Internal transfers cancel in the total.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No cash history for this scope.</p>
  </div>
</template>