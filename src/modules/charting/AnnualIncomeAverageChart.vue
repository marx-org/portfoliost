<script setup lang="ts">
/**
 * Annual-equivalent received income per day or month (feature #253, sub-issues
 * #261/#262).
 *
 * A presentational renderer for the shared scoped income dataset (no extra
 * request). The year's total is divided by 365 (day) or 12 (month) — an
 * annualised average, not a projection of future receipts and not a division by
 * elapsed time. The current year is marked partial (YTD).
 */
import { computed } from "vue"
import type { components } from "@/api/types"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisCurrency, axisTitle, chartTitle, labelCurrency, withSharedChart } from "./chartFormat"

type Point = components["schemas"]["ChartIncomeAveragePoint"]

const props = withDefaults(
  defineProps<{ points?: Point[]; unit?: "day" | "month"; currency?: string }>(),
  { points: () => [], unit: "day", currency: "" },
)

const rows = computed(() => props.points ?? [])
const per = computed(() => (props.unit === "day" ? "day" : "month"))
const titleText = computed(() => `Annual-equivalent Income per ${per.value}`)
const divisor = computed(() => props.unit === "day" ? 365 : 12)
const hasPartial = computed(() => rows.value.some((p) => p.partial))

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar", height: 300 },
  title: chartTitle(titleText.value),
  xaxis: { categories: rows.value.map((p) => String(p.year)), title: axisTitle("Year") },
  yaxis: {
    title: axisTitle(`Income (${props.currency}/${per.value})`),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  colors: ["#f59e0b"],
  dataLabels: { enabled: true, formatter: (v: number) => labelCurrency(v, props.currency) },
  fill: { type: "solid" as const },
  tooltip: {
    y: { formatter: (v: number) => `${v} ${props.currency}/${per.value}`.trim() },
  },
}))
const chartSeries = computed(() => [
  { name: `Income/${per.value}`, data: rows.value.map((p) => p.amount ?? 0) },
])
</script>

<template>
  <div class="space-y-3" :data-testid="`annual-income-average-${unit}`">
    <h2 class="sr-only">{{ titleText }}</h2>
    <p class="text-xs text-slate-500">
      Annual-equivalent received income per {{ per }} (the year's total ÷ {{ divisor }}). Not a forecast.
    </p>
    <p v-if="hasPartial" class="text-xs text-slate-500" data-testid="annual-average-partial">
      The current year is year-to-date, not a projected full year.
    </p>
    <apexchart v-if="rows.length" type="bar" :options="chartOptions" :series="chartSeries" :height="300" />
    <p v-else class="text-sm text-slate-500">No income data for this scope.</p>
    <CollapsibleSection v-if="rows.length" :title="`Annual-equivalent per ${per}`" :testid="`annual-income-average-${unit}-table`">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-400">
            <th class="py-1">Year</th><th>Basis</th><th>Divisor</th><th>Per {{ per }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.year" class="border-t border-slate-100 dark:border-slate-800">
            <td class="py-1">{{ p.year }}<span v-if="p.partial" class="ml-1 text-xs text-slate-400">YTD</span></td>
            <td>{{ p.basis }}</td>
            <td>{{ p.divisor }}</td>
            <td>{{ p.amount ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </CollapsibleSection>
  </div>
</template>