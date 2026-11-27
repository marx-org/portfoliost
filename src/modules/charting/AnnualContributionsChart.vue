<script setup lang="ts">
/**
 * Annual net external owner contributions (feature #253, sub-issue #277).
 *
 * Bars show deposits above zero and withdrawals below zero; the line is signed
 * net owner funding. Buys/sells are absent because they are internal cash moves.
 * Internal transfer pairs cancel in `transfers`; a transfer crossing the
 * selected account boundary remains in that separate column rather than being
 * counted as a deposit or withdrawal. Presentation only: the shared scoped
 * dataset owns the calculation.
 */
import { computed } from "vue"
import type { components } from "@/api/types"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisCurrency, axisTitle, chartTitle, labelCurrency, withSharedChart } from "./chartFormat"

type Point = components["schemas"]["ChartContributionPoint"]

const props = withDefaults(
  defineProps<{
    points?: Point[]
    currency?: string
    testid?: string
  }>(),
  { points: () => [], currency: "", testid: "charting-annual-contributions" },
)

const rows = computed(() => props.points ?? [])
const currentYear = new Date().getUTCFullYear()
const hasPartial = computed(() => rows.value.some((p) => p.partial))
const hasUnknown = computed(() => rows.value.some((p) => p.unknown))

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 340, toolbar: { show: false }, zoom: { enabled: false } },
  title: chartTitle("Annual External Contributions"),
  xaxis: { categories: rows.value.map((p) => String(p.year)), title: axisTitle("Year") },
  yaxis: {
    title: axisTitle(`External funding (${props.currency})`),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  dataLabels: { formatter: (v: number) => labelCurrency(v, props.currency) },
  plotOptions: { bar: { columnWidth: "55%" } },
  colors: ["var(--emerald)", "var(--danger)", "var(--accent)"],
  stroke: { width: [0, 0, 2] },
  fill: { type: "solid" as const },
  tooltip: {
    shared: true,
    y: { formatter: (v: number | null) => (v == null ? "—" : formatCurrency(v, props.currency)) },
  },
  legend: { position: "bottom" as const },
}))

const chartSeries = computed(() => [
  { name: "Contributions", type: "bar", data: rows.value.map((p) => p.contributions ?? 0) },
  { name: "Withdrawals", type: "bar", data: rows.value.map((p) => -(p.withdrawals ?? 0)) },
  { name: "Net", type: "line", data: rows.value.map((p) => p.net) },
])
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="rows.length">
      <p v-if="hasPartial" class="text-xs text-slate-500" :data-testid="`${testid}-partial`">
        {{ currentYear }} is year-to-date; its total is not a full-year figure.
      </p>
      <p v-if="hasUnknown" class="text-xs text-amber-700" :data-testid="`${testid}-unknown`">
        Some source amounts could not be converted into {{ currency }}; the affected totals are incomplete.
      </p>
      <div class="card p-6">
        <h2 class="sr-only">Annual External Contributions</h2>
        <apexchart type="bar" :options="chartOptions" :series="chartSeries" :height="340" />
      </div>
      <CollapsibleSection title="Annual External Contributions" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Year</th>
              <th class="px-5 py-2.5 text-right font-medium">Contributions</th>
              <th class="px-5 py-2.5 text-right font-medium">Withdrawals</th>
              <th class="px-5 py-2.5 text-right font-medium">Net</th>
              <th class="px-5 py-2.5 text-right font-medium">Transfers</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="p in rows" :key="p.year" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3">
                {{ p.year }}
                <span v-if="p.year === currentYear" class="ml-1 text-xs text-slate-400">YTD</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.contributions ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.withdrawals ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.net, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.transfers ?? 0, currency) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">
          Deposits and withdrawals are owner funding. Withdrawals are shown below zero in the chart. Transfers are internal cash/in-kind moves; a one-sided boundary transfer is not owner funding.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No annual external contributions for this scope.</p>
  </div>
</template>