<script setup lang="ts">
/**
 * Cumulative dividends + interest (feature #253, sub-issue #259).
 *
 * A presentational renderer for the shared scoped income dataset: the caller
 * passes the cumulative points it already loaded, so this adds no request. The
 * curve is dividends + interest only (options are excluded); the lifetime
 * opening balance is shown explicitly when a narrow date window is displayed, so
 * the first point is the true cumulative, not just the in-window sum.
 */
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { components } from "@/api/types"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { formatCurrency } from "@/utils/format"
import { axisCurrency, axisTitle, chartTitle, withSharedChart } from "./chartFormat"

type Point = components["schemas"]["ChartIncomeCumulativePoint"]

const props = withDefaults(defineProps<{ points?: Point[]; currency?: string }>(), {
  points: () => [],
  currency: "",
})

const rows = computed(() => props.points ?? [])
const { t } = useI18n()
const opening = computed(() => {
  const first = rows.value[0]
  return first && typeof first.openingBalance === "number" ? first.openingBalance : 0
})

const chartOptions = computed(() => withSharedChart({
  chart: { type: "area", height: 320 },
  title: chartTitle(t("charts.cumulativeIncome")),
  xaxis: { type: "datetime", title: axisTitle(t("charts.date")) },
  yaxis: {
    title: axisTitle(t("charts.cumulativeIncomeCcy", { ccy: props.currency })),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  // A 90-point area chart cannot carry per-point labels legibly; the axis,
  // tooltip and table carry the values.
  dataLabels: { enabled: false },
  stroke: { width: 2 },
  fill: { type: "solid" as const },
  colors: ["var(--emerald)"],
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
}))
const chartSeries = computed(() => [
  {
    name: "Cumulative income",
    data: rows.value.map((p) => ({ x: new Date(p.date).getTime(), y: p.total ?? 0 })),
  },
])
</script>

<template>
  <div class="space-y-3" data-testid="cumulative-income-chart">
    <p v-if="opening > 0" class="text-xs text-muted" data-testid="cumulative-opening">
      Lifetime before window: {{ formatCurrency(opening, currency) }}
    </p>
    <apexchart v-if="rows.length" type="area" :options="chartOptions" :series="chartSeries" :height="320" />
    <p v-else class="text-sm text-muted">{{ t("charts.noIncomeData") }}</p>
    <CollapsibleSection v-if="rows.length" :title="t('charts.cumulativeIncome')" testid="cumulative-income-chart-table">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-1">Month</th><th>Dividends</th><th>Interest</th><th>Cumulative</th><th>Opening</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.date" class="border-t border-border">
            <td class="py-1">{{ p.date.slice(0, 7) }}</td>
            <td>{{ p.dividends ?? 0 }}</td>
            <td>{{ p.interest ?? 0 }}</td>
            <td>{{ p.total ?? 0 }}</td>
            <td>{{ p.openingBalance ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </CollapsibleSection>
  </div>
</template>