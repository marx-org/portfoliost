<script lang="ts">
/** One cost-basis/market-value pair, as the shared allocation dataset reports it. */
export interface LabelCostValueRow {
  key: string
  label?: string
  costBasis: number
  value: number
  percentCost?: number | null
  percentValue?: number | null
  unknown?: boolean
}
</script>

<script setup lang="ts">
/**
 * Remaining cost basis versus current market value by position label (feature
 * #253, sub-issue #270).
 *
 * Horizontal paired bars, one pair per label. Labels overlap, so each row is an
 * independent group and the rows are NOT a partition — the footer says the group
 * rows are not a portfolio total. Presentation only: the scoped aggregation and
 * the "cost basis, not deposits" definition live in wallets.
 */
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisCurrency, axisTitle, chartTitle, labelCurrency, withSharedChart } from "./chartFormat"

const props = withDefaults(
  defineProps<{
    rows?: LabelCostValueRow[]
    /** Currency of the cost/value amounts. */
    currency?: string
    /** Testid prefix (`${testid}-chart` / `${testid}-table`). */
    testid?: string
  }>(),
  { rows: () => [], currency: "", testid: "charting-label-cost-value" },
)

const groups = computed(() => props.rows ?? [])
const { t } = useI18n()

function label(row: LabelCostValueRow): string {
  return row.label ?? row.key
}

const chartOptions = computed(() => withSharedChart({
  // Horizontal paired bars need vertical room per label; 360 clipped the rows
  // and made the pairs hard to compare.
  chart: { type: "bar" as const, height: 520, toolbar: { show: false } },
  title: chartTitle(t("charts.costBasisByLabel")),
  plotOptions: { bar: { horizontal: true, borderRadius: 3 } },
  colors: ["var(--muted)", "var(--accent)"],
  fill: { type: "solid" as const },
  xaxis: {
    categories: groups.value.map(label),
    title: axisTitle(t("charts.costBasisMarketCcy", { ccy: props.currency })),
    labels: { formatter: (v: number) => axisCurrency(v, props.currency) },
  },
  yaxis: { title: axisTitle(t("charts.label")) },
  // Bars printed raw floats (`4938.454218`); round to a short currency label.
  dataLabels: { formatter: (v: number) => labelCurrency(v, props.currency) },
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
  legend: { position: "bottom" as const },
}))
const chartSeries = computed(() => [
  { name: "Cost basis", data: groups.value.map((r) => r.costBasis ?? 0) },
  { name: "Market value", data: groups.value.map((r) => r.value ?? 0) },
])
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="groups.length">
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="sr-only">{{ t("charts.costBasisByLabel") }}</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <CollapsibleSection :title="t('charts.costBasisVsMarket')" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted dark:border-slate-800 dark:text-muted">
              <th class="px-5 py-2.5 font-medium">Label</th>
              <th class="px-5 py-2.5 text-right font-medium">Cost basis</th>
              <th class="px-5 py-2.5 text-right font-medium">Market value</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in groups" :key="r.key" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">{{ label(r) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.costBasis, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.value, currency) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-muted">
          Labels may overlap, so each row is an independent group and the rows are not a portfolio total.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-muted">{{ t("charts.noCostBasisData") }}</p>
  </div>
</template>