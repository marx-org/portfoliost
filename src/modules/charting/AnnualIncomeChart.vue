<script setup lang="ts">
/**
 * Annual dividends/interest with year-over-year growth (feature #253, sub-issue
 * #260).
 *
 * A presentational renderer for the shared scoped income dataset (no extra
 * request). Bars are the annual total; the YoY % rides a secondary axis. The
 * current year is YTD and its ratio is a partial-year-versus-prior-full-year
 * comparison — never annualised. A missing/zero prior denominator shows "—", not
 * a fabricated 0%.
 */
import { computed } from "vue"
import type { components } from "@/api/types"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { formatCurrency, formatPercent } from "@/utils/format"
import { axisCurrency, axisTitle, chartTitle, labelCurrency, labelPercent, withSharedChart } from "./chartFormat"

type Point = components["schemas"]["ChartIncomeAnnualPoint"]

const props = withDefaults(defineProps<{ points?: Point[]; currency?: string }>(), {
  points: () => [],
  currency: "",
})

const rows = computed(() => props.points ?? [])
const currentYear = new Date().getUTCFullYear()
const hasCurrentYear = computed(() => rows.value.some((p) => p.year === currentYear))

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar", height: 340 },
  title: chartTitle("Annual totals"),
  xaxis: { categories: rows.value.map((p) => String(p.year)), title: axisTitle("Year") },
  yaxis: [
    {
      seriesName: "Income",
      title: axisTitle(`Income (${props.currency})`),
      labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
    },
    {
      opposite: true,
      seriesName: "YoY %",
      title: axisTitle("YoY (%)"),
      labels: { formatter: (v: number) => `${Number(v.toFixed(1))}%` },
    },
  ],
  stroke: { width: [0, 2] },
  colors: ["var(--emerald)", "var(--accent)"],
  fill: { type: "solid" as const },
  // Series 0 is the income bar (currency), series 1 the YoY line (percent).
  // Both printed raw floats (`5917.36`, `8.38752417`); round them.
  dataLabels: {
    formatter: (v: number, opts: { seriesIndex: number }) =>
      opts.seriesIndex === 1 ? labelPercent(v) : labelCurrency(v, props.currency),
  },
  tooltip: {
    y: [
      { formatter: (v: number) => formatCurrency(v, props.currency) },
      { formatter: (v: number | null) => (v == null ? "—" : formatPercent(v, 1, true)) },
    ],
  },
}))
const chartSeries = computed(() => [
  { name: "Income", type: "bar", data: rows.value.map((p) => p.total ?? 0) },
  { name: "YoY %", type: "line", data: rows.value.map((p) => p.yoyChangePercent ?? null) },
])
</script>

<template>
  <div class="space-y-3" data-testid="annual-income-chart">
    <p v-if="hasCurrentYear" class="text-xs text-slate-500" data-testid="annual-ytd-note">
      {{ currentYear }} is year-to-date; its YoY compares a partial year to the prior full year (not annualised).
    </p>
    <apexchart v-if="rows.length" type="bar" :options="chartOptions" :series="chartSeries" :height="340" />
    <p v-else class="text-sm text-slate-500">No income data for this scope.</p>
    <CollapsibleSection v-if="rows.length" title="Annual totals" testid="annual-income-chart-table">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-400">
            <th class="py-1">Year</th><th>Dividends</th><th>Interest</th><th>Options</th><th>Total</th><th>Prior</th><th>YoY</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.year" class="border-t border-slate-100 dark:border-slate-800">
            <td class="py-1">{{ p.year }}<span v-if="p.year === currentYear" class="ml-1 text-xs text-slate-400">YTD</span></td>
            <td>{{ p.dividends ?? 0 }}</td>
            <td>{{ p.interest ?? 0 }}</td>
            <td>{{ p.options ?? 0 }}</td>
            <td>{{ p.total ?? 0 }}</td>
            <td>{{ p.priorYearTotal ?? "—" }}</td>
            <td>{{ p.yoyChangePercent == null ? "—" : formatPercent(p.yoyChangePercent, 1, true) }}</td>
          </tr>
        </tbody>
      </table>
    </CollapsibleSection>
  </div>
</template>