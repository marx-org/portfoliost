<script setup lang="ts">
/**
 * Cumulative external owner funding per account (feature #253, sub-issue #278).
 *
 * One line per selected real broker account showing the running total of
 * deposits minus withdrawals, plus a combined total line. This is the
 * per-account analogue of the "Invested" overlay on the performance chart.
 * Internal transfers are excluded (they are not owner funding). Presentation
 * only: the shared scoped dataset owns the calculation.
 */
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { components } from "@/api/types"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisCurrency, axisTitle, chartTitle, withSharedChart } from "./chartFormat"

type ContributionSeries = components["schemas"]["ChartContributionSeries"]
type Point = components["schemas"]["ChartContributionSeriesPoint"]

const props = withDefaults(
  defineProps<{
    series?: ContributionSeries[]
    currency?: string
    testid?: string
  }>(),
  { series: () => [], currency: "", testid: "charting-cumulative-contributions" },
)

const rows = computed(() => props.series ?? [])
const { t } = useI18n()
const accounts = computed(() => rows.value.filter((s) => s.key !== "__total__"))
const total = computed(() => rows.value.find((s) => s.key === "__total__"))
const hasUnknown = computed(() => rows.value.some((s) => s.points.some((p) => p.unknown)))

const chartOptions = computed(() => withSharedChart({
  chart: { type: "line" as const, height: 340, toolbar: { show: false }, zoom: { enabled: false } },
  title: chartTitle(t("charts.cumulativeExternalContributions")),
  xaxis: { type: "datetime" as const, title: axisTitle(t("charts.date")) },
  yaxis: {
    title: axisTitle(t("charts.netFundingCcy", { ccy: props.currency })),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  dataLabels: { enabled: false },
  stroke: { width: [2, 2, 2, 2.5] },
  fill: { type: "solid" as const },
  colors: ["var(--accent)", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b"],
  tooltip: {
    shared: true,
    y: { formatter: (v: number) => formatCurrency(v, props.currency) },
  },
  legend: { position: "bottom" as const },
}))

const chartSeries = computed(() => {
  const lines = accounts.value.map((s) => ({
    name: s.label,
    data: s.points.map((p) => ({ x: new Date(p.date).getTime(), y: p.net })),
  }))
  if (total.value) {
    lines.push({
      name: "Total",
      data: total.value.points.map((p) => ({ x: new Date(p.date).getTime(), y: p.net })),
    })
  }
  return lines
})

function latest(s: ContributionSeries): Point | undefined {
  return s.points.at(-1)
}
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="accounts.length">
      <p v-if="hasUnknown" class="text-xs text-amber-700" :data-testid="`${testid}-unknown`">
        Some source amounts could not be converted into {{ currency }}; the affected cumulative totals are incomplete.
      </p>
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="sr-only">{{ t("charts.cumulativeExternalContributions") }}</h2>
        <apexchart :options="chartOptions" :series="chartSeries" />
      </div>
      <CollapsibleSection :title="t('charts.cumulativeContributions')" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted dark:border-slate-800 dark:text-muted">
              <th class="px-5 py-2.5 font-medium">Account</th>
              <th class="px-5 py-2.5 text-right font-medium">Net funding</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in rows" :key="s.key" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">{{ s.label }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(latest(s)?.net ?? 0, currency) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-muted">
          Running cumulative deposits minus withdrawals per account, in {{ currency }}. Internal transfers are excluded; they are not owner funding.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-muted">No cumulative contributions for this scope.</p>
  </div>
</template>