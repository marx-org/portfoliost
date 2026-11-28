<script lang="ts">
/** One sector slice, as the shared allocation dataset reports it. */
export interface SectorSlice {
  key: string
  label?: string
  value: number
  percent?: number | null
}
</script>

<script setup lang="ts">
/**
 * Sector weights and values (feature #253, sub-issue #268).
 *
 * Ranked horizontal bars + companion table over the same scoped `bySector`
 * aggregation the portfolio Allocation donut/table uses. An unknown sector is
 * exposed, never dropped. Presentation only.
 */
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { formatCurrency, formatPercent } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisTitle, chartTitle, labelCurrency, withSharedChart } from "./chartFormat"

const props = withDefaults(
  defineProps<{
    slices?: SectorSlice[]
    /** Currency of the slice values. */
    currency?: string
    /** Testid prefix (`${testid}-chart` / `${testid}-table`). */
    testid?: string
    /** Render the companion table. Charting keeps the table from
     * `AllocationBreakdown`, so it hides this one to avoid a duplicate. */
    showTable?: boolean
  }>(),
  { slices: () => [], currency: "", testid: "charting-sector-allocation", showTable: true },
)

const rows = computed(() => props.slices ?? [])
const { t } = useI18n()
const total = computed(() => rows.value.reduce((sum, s) => sum + (s.value ?? 0), 0))

function label(s: SectorSlice): string {
  return s.label ?? s.key
}

function percent(s: SectorSlice): number {
  if (typeof s.percent === "number" && Number.isFinite(s.percent)) return s.percent
  return total.value > 0 ? (s.value / total.value) * 100 : 0
}

const chartOptions = computed(() => withSharedChart({
  // Horizontal bars need vertical room per sector; 360 clipped long lists.
  chart: { type: "bar" as const, height: 420, toolbar: { show: false } },
  title: chartTitle(t("charts.sectorWeights")),
  plotOptions: { bar: { horizontal: true, borderRadius: 3 } },
  colors: ["var(--accent)"],
  fill: { type: "solid" as const },
  xaxis: {
    categories: rows.value.map(label),
    title: axisTitle(t("charts.marketValueCcy", { ccy: props.currency })),
  },
  yaxis: { title: axisTitle(t("charts.sector")) },
  // Bars printed raw floats (`544588.17017128`); round to a short currency label.
  dataLabels: { formatter: (v: number) => labelCurrency(v, props.currency) },
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
}))
const chartSeries = computed(() => [{ name: "Market value", data: rows.value.map((s) => s.value) }])
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="rows.length">
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="sr-only">{{ t("charts.sectorWeights") }}</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <CollapsibleSection v-if="showTable" :title="t('charts.sectorWeights')" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted dark:border-slate-800 dark:text-muted">
              <th class="px-5 py-2.5 font-medium">Sector</th>
              <th class="px-5 py-2.5 text-right font-medium">Value</th>
              <th class="px-5 py-2.5 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in rows" :key="s.key" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">{{ label(s) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(percent(s)) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-muted">
          Sectors follow the existing classification; an unknown sector is shown explicitly.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-muted">{{ t("charts.noSectorData") }}</p>
  </div>
</template>