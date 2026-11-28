<script setup lang="ts">
/**
 * Quarterly received income grouped by year (feature #253, sub-issue #263).
 *
 * One grouped bar series per year across Q1–Q4, from the shared scoped income
 * dataset. Quarters the server zero-filled (a covered zero-income quarter)
 * render as a zero bar; quarters outside the observed range are `null` and draw
 * no bar, so a future quarter is never an invented zero. The current calendar
 * quarter is marked year-to-date. Presentation only.
 */
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisCurrency, axisTitle, chartTitle, labelCurrency, withSharedChart } from "./chartFormat"

type Point = {
  quarter: string
  dividends?: number
  interest?: number
  options?: number
  total?: number
}

const props = withDefaults(
  defineProps<{ points?: Point[]; currency?: string; testid?: string }>(),
  { points: () => [], currency: "", testid: "charting-quarterly-income" },
)

const rows = computed(() => props.points ?? [])
const { t } = useI18n()
const years = computed(() => [...new Set(rows.value.map((p) => Number(p.quarter.slice(0, 4))))].sort((a, b) => a - b))
const now = computed(() => new Date())
const currentQuarter = computed(
  () => `${now.value.getUTCFullYear()}-Q${Math.floor(now.value.getUTCMonth() / 3) + 1}`,
)

function pointFor(year: number, q: number): Point | undefined {
  const key = `${year}-Q${q}`
  return rows.value.find((p) => p.quarter === key)
}

const categories = ["Q1", "Q2", "Q3", "Q4"]
const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 340, toolbar: { show: false } },
  title: chartTitle(t("charts.quarterlyReceiptsByYear")),
  xaxis: { categories, title: axisTitle(t("charts.quarter")) },
  yaxis: {
    title: axisTitle(t("charts.receiptsCcy", { ccy: props.currency })),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  colors: ["var(--accent)", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981"],
  fill: { type: "solid" as const },
  legend: { position: "bottom" as const },
  // Bars printed raw floats (`20.77`); round to a short currency label.
  dataLabels: { formatter: (v: number) => labelCurrency(v, props.currency) },
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
}))
const chartSeries = computed(() =>
  years.value.map((year) => ({
    name: String(year),
    data: [1, 2, 3, 4].map((q) => pointFor(year, q)?.total ?? null),
  })),
)

const partialLabel = computed(() => {
  const p = rows.value.find((r) => r.quarter === currentQuarter.value)
  return p ? p.quarter : null
})
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="rows.length">
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="sr-only">{{ t("charts.quarterlyReceiptsByYear") }}</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <p v-if="partialLabel" class="text-xs text-muted" :data-testid="`${testid}-partial`">
        {{ partialLabel }} is year-to-date, not a full-quarter forecast.
      </p>
      <CollapsibleSection :title="t('charts.quarterlyReceipts')" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted dark:border-slate-800 dark:text-muted">
              <th class="px-5 py-2.5 font-medium">Quarter</th>
              <th class="px-5 py-2.5 text-right font-medium">Dividends</th>
              <th class="px-5 py-2.5 text-right font-medium">Interest</th>
              <th class="px-5 py-2.5 text-right font-medium">Options</th>
              <th class="px-5 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.quarter" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">
                {{ r.quarter }}<span v-if="r.quarter === currentQuarter" class="ml-1 text-xs text-muted">YTD</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.dividends ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.interest ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.options ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.total ?? 0, currency) }}</td>
            </tr>
          </tbody>
        </table>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-muted">No quarterly income for this scope.</p>
  </div>
</template>