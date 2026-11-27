<script lang="ts">
/** One dividend-stock category slice, as the shared allocation dataset reports it. */
export interface StockCategorySlice {
  key: string
  label?: string
  value: number
  percent?: number | null
}
</script>

<script setup lang="ts">
/**
 * Dividend-stock categories by market value (feature #253, sub-issue #269).
 *
 * Value-weighted donut + companion table over the fixed five categories. The
 * denominator is STOCK holdings only — cash, bonds and derivatives never reach
 * this component, so the weights are not diluted by non-stock assets. The
 * category assignment is user-edited upstream; this is presentation only.
 */
import { computed } from "vue"
import { formatCurrency, formatPercent } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { chartTitle, withSharedChart } from "./chartFormat"

const props = withDefaults(
  defineProps<{
    slices?: StockCategorySlice[]
    /** Currency of the slice values. */
    currency?: string
    /** Testid prefix (`${testid}-donut` / `${testid}-table`). */
    testid?: string
  }>(),
  { slices: () => [], currency: "", testid: "charting-stock-category-allocation" },
)

const rows = computed(() => props.slices ?? [])
const total = computed(() => rows.value.reduce((sum, s) => sum + (s.value ?? 0), 0))

function label(s: StockCategorySlice): string {
  return s.label ?? s.key
}

function percent(s: StockCategorySlice): number {
  if (typeof s.percent === "number" && Number.isFinite(s.percent)) return s.percent
  return total.value > 0 ? (s.value / total.value) * 100 : 0
}

// Fixed category order: balanced, high yield, high growth, very high growth,
// not classified. Colours are positional so a slice keeps its colour when a
// category appears or disappears.
const COLORS = ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#94a3b8"]

const donutOptions = computed(() => withSharedChart({
  chart: { type: "donut" as const, height: 320, toolbar: { show: false } },
  title: chartTitle("By Stock Category"),
  labels: rows.value.map(label),
  colors: COLORS,
  legend: { position: "bottom" as const },
  dataLabels: { enabled: false },
  fill: { type: "solid" as const },
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
}))
const donutSeries = computed(() => rows.value.map((s) => s.value))
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="rows.length">
      <div class="card p-6" :data-testid="`${testid}-donut`">
        <h2 class="sr-only">By Stock Category</h2>
        <component :is="'apexchart'" :options="donutOptions" :series="donutSeries" />
      </div>
      <CollapsibleSection title="Stock Category Weights" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Category</th>
              <th class="px-5 py-2.5 text-right font-medium">Value</th>
              <th class="px-5 py-2.5 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in rows" :key="s.key" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ label(s) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(percent(s)) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">
          Stocks only — cash, bonds and derivatives are excluded from this breakdown.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No stock categories for this scope.</p>
  </div>
</template>