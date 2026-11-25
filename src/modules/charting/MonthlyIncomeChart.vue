<script setup lang="ts">
/**
 * Monthly received income chart (feature #253, sub-issue #257).
 *
 * Dividends + credited interest as one bar series, option premium receipts as a
 * separate series, and a least-squares trend line over the COMPLETE months only
 * (current/future months are partial and excluded from the fit). A companion
 * table carries the exact amounts, kind and month for tooltips/inspection.
 */
import { computed, watch } from "vue"
import { getChartIncome } from "@/api/charting"
import { useChartData } from "./useChartData"
import { useChartScope } from "./useChartScope"
import type { ChartScopeQuery } from "@/api/charting"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { formatCurrency } from "@/utils/format"
import { axisCurrency, axisTitle, chartTitle } from "./chartFormat"

const props = defineProps<{ scope?: ChartScopeQuery }>()

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartIncome)

// The view may be mounted with a fixed scope (account tab) or read the shared
// URL scope. Watch whichever applies.
const activeScope = computed<ChartScopeQuery>(() => props.scope ?? scope.scopeQuery.value)
watch(activeScope, (q) => void load(q), { immediate: true })

const points = computed(() => data.value?.monthly ?? [])
const currency = computed(() => data.value?.currency ?? "")

function linearTrend(points: { period: string; value: number; partial?: boolean }[]): { slope: number; intercept: number } | null {
  const pts = points.filter((p) => !p.partial)
  if (pts.length < 2) return null
  const n = pts.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    const x = i, y = pts[i].value
    sx += x; sy += y; sxx += x * x; sxy += x * y
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  return { slope, intercept: (sy - slope * sx) / n }
}

const categories = computed(() => points.value.map((p) => p.period))
// ~91 monthly categories at ~13px each collide even when rotated. Show roughly
// a dozen evenly spaced labels (the tooltip still reports the exact month).
const labelEvery = computed(() => Math.max(1, Math.ceil(categories.value.length / 12)))
const divInt = computed(() => points.value.map((p) => Math.round(((p.dividends ?? 0) + (p.interest ?? 0)) * 1e8) / 1e8))
const options = computed(() => points.value.map((p) => p.options ?? 0))

const trend = computed(() =>
  linearTrend(points.value.map((p) => ({ period: p.period, value: (p.dividends ?? 0) + (p.interest ?? 0), partial: p.partial ?? false }))),
)
const trendLine = computed(() =>
  trend.value ? points.value.map((_, i) => Math.round((trend.value!.slope * i + trend.value!.intercept) * 1e8) / 1e8) : [],
)

const chartOptions = computed(() => ({
  chart: { type: "line", height: 340, stacked: false },
  title: chartTitle("Monthly income"),
  xaxis: {
    categories: categories.value,
    title: axisTitle("Month"),
    // ~91 monthly categories collide even rotated. Blank all but every Nth label
    // so ~12 evenly spaced dates remain; the tooltip still uses the exact month.
    labels: {
      rotate: -45,
      rotateAlways: false,
      formatter: (val: string) => (categories.value.indexOf(val) % labelEvery.value === 0 ? val : ""),
    },
  },
  yaxis: {
    title: axisTitle(`Income (${currency.value})`),
    labels: { formatter: (v: number) => axisCurrency(v, currency.value) },
  },
  stroke: { width: [0, 0, 2] },
  colors: ["#22c55e", "#f59e0b", "#3b82f6"],
  legend: { position: "top" },
  // Round the tooltip (the trend line and bars otherwise print raw floats).
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, currency.value) } },
}))
const chartSeries = computed(() => {
  const out: { name: string; type: string; data: number[] }[] = [
    { name: "Dividends + interest", type: "bar", data: divInt.value },
    { name: "Options", type: "bar", data: options.value },
  ]
  if (trendLine.value.length) out.push({ name: "Trend (div+int)", type: "line", data: trendLine.value })
  return out
})
</script>

<template>
  <div class="space-y-3" data-testid="monthly-income-chart">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load income data.</p>
    <template v-else>
      <apexchart v-if="points.length" type="line" :options="chartOptions" :series="chartSeries" :height="340" />
      <p v-else class="text-sm text-slate-500">No income data for this scope.</p>
      <CollapsibleSection v-if="points.length" title="Monthly income" testid="monthly-income-chart-table">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400"><th class="py-1">Month</th><th>Dividends</th><th>Interest</th><th>Options</th><th>Total</th><th>Partial</th></tr></thead>
          <tbody>
            <tr v-for="p in points" :key="p.period" class="border-t border-slate-100 dark:border-slate-800">
              <td class="py-1">{{ p.period }}</td><td>{{ p.dividends }}</td><td>{{ p.interest }}</td><td>{{ p.options }}</td><td>{{ p.total }}</td><td>{{ p.partial ? "yes" : "" }}</td>
            </tr>
          </tbody>
        </table>
      </CollapsibleSection>
    </template>
  </div>
</template>