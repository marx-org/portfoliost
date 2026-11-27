<script lang="ts">
/** One asset-type slice, as the shared allocation dataset reports it. */
export interface AssetTypeSlice {
  key: string
  label?: string
  value: number
  percent?: number | null
}
</script>

<script setup lang="ts">
/**
 * Asset-type proportions (feature #253, sub-issue #267).
 *
 * Donut + companion table over the canonical `positions.asset_type` values. The
 * same scoped aggregation the portfolio Allocation table uses; an unknown type
 * is exposed, never dropped. Cash is a ledger balance, not a position-day fact,
 * so it is not part of this position universe.
 */
import { computed } from "vue"
import { formatCurrency, formatPercent } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { chartTitle, withSharedChart } from "./chartFormat"

const props = withDefaults(
  defineProps<{
    slices?: AssetTypeSlice[]
    /** Currency of the slice values. */
    currency?: string
    /** Testid prefix (`${testid}-donut` / `${testid}-table`). */
    testid?: string
  }>(),
  { slices: () => [], currency: "", testid: "charting-asset-allocation" },
)

const rows = computed(() => props.slices ?? [])
const total = computed(() => rows.value.reduce((sum, s) => sum + (s.value ?? 0), 0))

function label(s: AssetTypeSlice): string {
  return s.label ?? s.key
}

function percent(s: AssetTypeSlice): number {
  if (typeof s.percent === "number" && Number.isFinite(s.percent)) return s.percent
  return total.value > 0 ? (s.value / total.value) * 100 : 0
}

const COLORS = ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b", "#ec4899"]

const donutOptions = computed(() => withSharedChart({
  chart: { type: "donut" as const, height: 320, toolbar: { show: false } },
  title: chartTitle("By Asset Type"),
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
        <h2 class="mb-2 text-base font-semibold">By Asset Type</h2>
        <component :is="'apexchart'" :options="donutOptions" :series="donutSeries" />
      </div>
      <CollapsibleSection title="Asset-Type Weights" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Asset type</th>
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
          Position asset types only — cash is a ledger balance, not a position.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No asset-type data for this scope.</p>
  </div>
</template>