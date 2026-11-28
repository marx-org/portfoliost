<script setup lang="ts">
/**
 * Quarterly year-over-year income growth (feature #253, sub-issue #264).
 *
 * Four percentage bars for the latest year that has a prior-year comparison:
 * each quarter against the SAME quarter of the preceding year. A zero or
 * missing prior quarter is undefined and draws no bar (never 0% or infinity).
 * The current quarter is flagged partial against the prior full quarter.
 * Presentation only — the growth math lives in wallets.
 */
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { formatCurrency, formatPercent } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisPercent, axisTitle, chartTitle, withSharedChart } from "./chartFormat"

type Point = {
  quarter: string
  total?: number
  priorYearQuarterTotal?: number | null
  yoyChangePercent?: number | null
}

const props = withDefaults(
  defineProps<{ points?: Point[]; currency?: string; testid?: string }>(),
  { points: () => [], currency: "", testid: "charting-quarterly-yoy" },
)

const all = computed(() => props.points ?? [])

/** Latest year with at least one defined YoY comparison. */
const selectedYear = computed<number | null>(() => {
  const years = all.value
    .filter((p) => typeof p.yoyChangePercent === "number")
    .map((p) => Number(p.quarter.slice(0, 4)))
  return years.length ? Math.max(...years) : null
})

const { t } = useI18n()

const rows = computed(() =>
  selectedYear.value == null
    ? []
    : [1, 2, 3, 4].map((q) => {
        const key = `${selectedYear.value}-Q${q}`
        return all.value.find((p) => p.quarter === key) ?? { quarter: key }
      }),
)

const categories = ["Q1", "Q2", "Q3", "Q4"]
const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 300, toolbar: { show: false } },
  title: chartTitle(t("charts.quarterlyIncomeGrowth")),
  xaxis: { categories, title: axisTitle(t("charts.quarter")) },
  yaxis: {
    title: axisTitle(t("charts.yoyChangePercent")),
    labels: { formatter: axisPercent },
  },
  plotOptions: { bar: { distributed: true } },
  colors: rows.value.map((r) =>
    typeof r.yoyChangePercent !== "number" ? "var(--border)" : r.yoyChangePercent >= 0 ? "var(--emerald)" : "var(--danger)",
  ),
  fill: { type: "solid" as const },
  dataLabels: {
    enabled: true,
    formatter: (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}%`,
  },
  tooltip: {
    custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
      const r = rows.value[dataPointIndex]
      if (!r || typeof r.yoyChangePercent !== "number") return `${r?.quarter ?? ""}: undefined`
      const prior = r.priorYearQuarterTotal
      const current = r.total ?? 0
      return `${r.quarter}: ${formatCurrency(current, props.currency)} vs ${formatCurrency(prior ?? 0, props.currency)} (${formatPercent(r.yoyChangePercent)})`
    },
  },
}))
const chartSeries = computed(() => [
  { name: "YoY %", data: rows.value.map((r) => r.yoyChangePercent ?? null) },
])
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="selectedYear != null">
      <p class="text-xs text-muted">
        {{ selectedYear }} vs {{ selectedYear - 1 }} — quarterly receipts, year over year.
      </p>
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="sr-only">{{ t("charts.quarterlyIncomeGrowth") }}</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <p class="text-xs text-muted" :data-testid="`${testid}-partial`">
        The current quarter is year-to-date and is compared with the prior full quarter, not a final YoY.
      </p>
      <CollapsibleSection :title="t('charts.quarterlyIncomeGrowth')" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted dark:border-slate-800 dark:text-muted">
              <th class="px-5 py-2.5 font-medium">Quarter</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ selectedYear }}</th>
              <th class="px-5 py-2.5 text-right font-medium">{{ selectedYear - 1 }}</th>
              <th class="px-5 py-2.5 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.quarter" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">Q{{ r.quarter.slice(6) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.total ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ r.priorYearQuarterTotal == null ? "—" : formatCurrency(r.priorYearQuarterTotal, currency) }}
              </td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ r.yoyChangePercent == null ? "—" : formatPercent(r.yoyChangePercent) }}
              </td>
            </tr>
          </tbody>
        </table>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-muted">No year-over-year quarterly income for this scope.</p>
  </div>
</template>