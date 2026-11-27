<script lang="ts">
/**
 * One allocation slice, as the shared breakdown renders it.
 *
 * `value` is comparable (in the breakdown currency) EXCEPT for the by-currency
 * rows, where each row carries its own `currency` and `value` is in that
 * currency — the one breakdown that cannot be summed across rows.
 */
export interface AllocationSlice {
  key: string
  label?: string
  value: number
  /** Server-provided share of the total (0–100); when absent it is derived. */
  percent?: number | null
  /** The currency this row is denominated in; defaults to the breakdown currency. */
  currency?: string | null
  /** True when the classification is unknown rather than a real category. */
  unknown?: boolean
}
</script>

<script setup lang="ts">
/**
 * Shared allocation breakdown (feature #253, sub-issue #256).
 *
 * The single renderer for the sector donut and the by-sector / by-asset-type /
 * by-currency tables. The per-portfolio Allocation tab and the Charting →
 * Allocation page both mount this, so the presentation and the weight maths
 * live in one place — no parallel allocation function.
 */
import { computed } from "vue"
import { withSharedChart } from "@/utils/chartOptions"
import { formatCurrency, formatPercent } from "@/utils/format"
import CollapsibleSection from "./CollapsibleSection.vue"

const props = withDefaults(
  defineProps<{
    bySector?: AllocationSlice[]
    byAssetType?: AllocationSlice[]
    byCurrency?: AllocationSlice[]
    /** Base currency for the sector and asset-type values. */
    currency?: string
    /** Testid prefix (`${testid}-<field>`); defaults to "allocation". */
    testid?: string
    /** Render the companion tables inside collapsed sections (Charting). Off by
     * default so the per-portfolio Allocation tab is unchanged. */
    collapsibleTables?: boolean
    /** Render the sector donut. Charting hides it to use the taller, more
     * readable horizontal Sector Weights bar instead; the table stays. */
    showSectorDonut?: boolean
  }>(),
  {
    bySector: () => [],
    byAssetType: () => [],
    byCurrency: () => [],
    currency: "",
    testid: "allocation",
    collapsibleTables: false,
    showSectorDonut: true,
  },
)

function label(s: AllocationSlice): string {
  return s.label ?? s.key
}

/** The currency a row's value is denominated in. */
function rowCurrency(s: AllocationSlice): string {
  return s.currency ?? props.currency
}

/** The row's share of the total: the server's percent, or derived from values. */
function percent(s: AllocationSlice, all: AllocationSlice[]): number {
  if (typeof s.percent === "number" && Number.isFinite(s.percent)) return s.percent
  const total = all.reduce((sum, x) => sum + (x.value ?? 0), 0)
  return total > 0 ? (s.value / total) * 100 : 0
}

const sectorSlices = computed(() => props.bySector ?? [])
const assetSlices = computed(() => props.byAssetType ?? [])
const currencySlices = computed(() => props.byCurrency ?? [])

const donutOptions = computed(() => withSharedChart({
  chart: { type: "donut" as const, height: 320, toolbar: { show: false } },
  labels: sectorSlices.value.map(label),
  colors: ["var(--accent)", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b", "#ec4899"],
  legend: { position: "bottom" as const },
  dataLabels: { enabled: false },
  fill: { type: "solid" as const },
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
}))
const donutSeries = computed(() => sectorSlices.value.map((s) => s.value))
</script>

<template>
  <div class="space-y-6" :data-testid="testid">
    <div
      class="grid gap-6"
      :class="showSectorDonut ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'"
    >
      <div v-if="showSectorDonut" class="card p-6" :data-testid="`${testid}-donut`">
        <h2 class="mb-2 text-base font-semibold">By Sector</h2>
        <component :is="'apexchart'" v-if="donutSeries.length" :options="donutOptions" :series="donutSeries" />
        <p v-else class="text-sm text-muted">No allocation data.</p>
      </div>
      <component
        :is="collapsibleTables ? CollapsibleSection : 'div'"
        class="card overflow-hidden"
        :data-testid="`${testid}-by-sector`"
        :title="collapsibleTables ? 'Sector Weights' : undefined"
      >
        <div v-if="!collapsibleTables" class="border-b border-border px-5 py-3">
          <h2 class="text-base font-semibold">Sector Weights</h2>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted">
              <th class="px-5 py-2.5 font-medium">Sector</th>
              <th class="px-5 py-2.5 text-right font-medium">Value</th>
              <th class="px-5 py-2.5 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in sectorSlices" :key="s.key" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">{{ label(s) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value, rowCurrency(s)) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(percent(s, sectorSlices)) }}</td>
            </tr>
          </tbody>
        </table>
      </component>
    </div>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <component
        :is="collapsibleTables ? CollapsibleSection : 'div'"
        class="card overflow-hidden"
        :data-testid="`${testid}-by-asset-type`"
        :title="collapsibleTables ? 'By Asset Type' : undefined"
      >
        <div v-if="!collapsibleTables" class="border-b border-border px-5 py-3">
          <h2 class="text-base font-semibold">By Asset Type</h2>
        </div>
        <table class="w-full text-sm">
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in assetSlices" :key="s.key" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">{{ label(s) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value, rowCurrency(s)) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(percent(s, assetSlices)) }}</td>
            </tr>
          </tbody>
        </table>
      </component>
      <component
        :is="collapsibleTables ? CollapsibleSection : 'div'"
        class="card overflow-hidden"
        :data-testid="`${testid}-by-currency`"
        :title="collapsibleTables ? 'By Currency' : undefined"
      >
        <div v-if="!collapsibleTables" class="border-b border-border px-5 py-3">
          <h2 class="text-base font-semibold">By Currency</h2>
        </div>
        <table class="w-full text-sm">
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="s in currencySlices" :key="s.key" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">{{ label(s) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(s.value, rowCurrency(s)) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(percent(s, currencySlices)) }}</td>
            </tr>
          </tbody>
        </table>
      </component>
    </div>
  </div>
</template>