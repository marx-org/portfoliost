<script lang="ts">
/** One holding slice, as the shared allocation dataset reports it. */
export interface HoldingSlice {
  key: string
  label?: string
  value: number
  percent?: number | null
  unknown?: boolean
}
</script>

<script setup lang="ts">
/**
 * Current composition of all holdings (feature #253, sub-issue #271).
 *
 * Donut of the top holdings plus an "Other" slice, with the full sorted table
 * underneath so small holdings are never lost. Negative/signed balances (cash,
 * shorts) stay in the table and are excluded from the pie, and the footer says
 * so. Presentation only.
 */
import { computed } from "vue"
import { formatCurrency, formatPercent } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { chartTitle } from "./chartFormat"

const TOP_N = 8

const props = withDefaults(
  defineProps<{
    rows?: HoldingSlice[]
    /** Currency of the values. */
    currency?: string
    /** Testid prefix (`${testid}-donut` / `${testid}-table`). */
    testid?: string
  }>(),
  { rows: () => [], currency: "", testid: "charting-holdings-composition" },
)

const sorted = computed(() => [...(props.rows ?? [])].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
const positive = computed(() => sorted.value.filter((r) => (r.value ?? 0) > 0))
const top = computed(() => positive.value.slice(0, TOP_N))
const rest = computed(() => positive.value.slice(TOP_N))

function label(r: HoldingSlice): string {
  return r.label ?? r.key
}

const donutRows = computed(() => {
  const rows = top.value.map((r) => ({ key: r.key, label: label(r), value: r.value ?? 0 }))
  if (rest.value.length) {
    const other = rest.value.reduce((s, r) => s + (r.value ?? 0), 0)
    if (other !== 0) rows.push({ key: "__other__", label: "Other", value: other })
  }
  return rows
})
const total = computed(() => donutRows.value.reduce((s, r) => s + r.value, 0))

function percent(value: number): number {
  return total.value > 0 ? (value / total.value) * 100 : 0
}

const COLORS = ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b", "#ec4899", "#94a3b8"]

const donutOptions = computed(() => ({
  chart: { type: "donut" as const, height: 340, toolbar: { show: false } },
  title: chartTitle("Current Holdings"),
  labels: donutRows.value.map((r) => r.label),
  colors: COLORS,
  legend: { position: "bottom" as const },
  dataLabels: { enabled: false },
  tooltip: { y: { formatter: (v: number) => formatCurrency(v, props.currency) } },
}))
const donutSeries = computed(() => donutRows.value.map((r) => r.value))
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="sorted.length">
      <div class="card p-6" :data-testid="`${testid}-donut`">
        <h2 class="mb-2 text-base font-semibold">Current Holdings</h2>
        <component :is="'apexchart'" :options="donutOptions" :series="donutSeries" />
      </div>
      <CollapsibleSection title="Holdings" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Holding</th>
              <th class="px-5 py-2.5 text-right font-medium">Value</th>
              <th class="px-5 py-2.5 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in sorted" :key="r.key" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                {{ label(r) }}<span v-if="r.unknown" class="ml-1 text-xs text-amber-600">unknown</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.value, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">
                {{ r.value && r.value > 0 ? formatPercent(percent(r.value)) : "—" }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">
          Top {{ TOP_N }} plus Other in the donut; every holding is in the table. Negative balances are shown here, not in the pie.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No holdings for this scope.</p>
  </div>
</template>