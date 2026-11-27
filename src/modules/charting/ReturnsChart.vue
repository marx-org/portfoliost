<script setup lang="ts">
/**
 * Quarterly returns with a TWR / Net-gain-change selector (feature #253,
 * sub-issue #274).
 *
 * Both modes share the same quarter boundaries and partial flags. TWR is the
 * canonical flow-neutral index between boundaries; Net-gain change is the
 * sheet-style \`100 * ((Vq − Cq) − (Vprev − Cprev)) / Vq\` with C = cumulative
 * EXTERNAL NET CONTRIBUTIONS (not remaining cost basis). A zero/unknown
 * denominator is undefined (no bar), never 0 or infinity.
 */
import { computed, ref } from "vue"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisTitle, chartTitle, withSharedChart } from "./chartFormat"

type Point = {
  quarter: string
  endingValue?: number
  cumulativeNetContributions?: number | null
  twr?: number | null
  netGainChange?: number | null
  partial?: boolean
}

const props = withDefaults(
  defineProps<{ points?: Point[]; currency?: string; testid?: string }>(),
  { points: () => [], currency: "", testid: "charting-quarterly-returns" },
)

type Mode = "twr" | "net_gain_change"
const mode = ref<Mode>("twr")

const rows = computed(() => props.points ?? [])
const metricLabel = computed(() => (mode.value === "twr" ? "TWR" : "Net-gain change / ending value"))
const values = computed(() =>
  rows.value.map((r) => (mode.value === "twr" ? r.twr ?? null : r.netGainChange ?? null)),
)

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 300 },
  title: chartTitle(`Quarterly Returns — ${metricLabel.value}`),
  xaxis: { categories: rows.value.map((r) => r.quarter), title: axisTitle("Quarter") },
  // ApexCharts prints each bar's raw float by default (`69.72577697`). Keep the
  // labels but round to a short percent (`69.7%`) — the values are already
  // percentages, so the raw float is both noisy and ambiguous about the unit.
  dataLabels: { formatter: (v: number) => percentAxis(v) },
  // Axis ticks need the same treatment: without a formatter they render as
  // `80.00000000`, `60.00000000`, … — meaningless trailing zeroes and no unit.
  yaxis: {
    title: axisTitle("Return (%)"),
    labels: { formatter: percentAxis },
  },
  colors: ["var(--accent)"],
  fill: { type: "solid" as const },
  tooltip: {
    y: { formatter: (v: number) => `${v > 0 ? "+" : ""}${v}%` },
  },
}))
const chartSeries = computed(() => [{ name: metricLabel.value, data: values.value }])

function percent(v: number | null | undefined): string {
  return v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`
}

/** Bar label / axis tick → compact percent: trim float noise, always show the unit. */
function percentAxis(v: number): string {
  return `${Number(v.toFixed(1))}%`
}
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="rows.length">
      <div class="flex items-center gap-2 text-xs" data-testid="`${testid}-modes`">
        <button
          type="button"
          class="btn-ghost text-xs"
          :class="mode === 'twr' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : ''"
          data-testid="charting-quarterly-returns-mode-twr"
          @click="mode = 'twr'"
        >
          TWR
        </button>
        <button
          type="button"
          class="btn-ghost text-xs"
          :class="mode === 'net_gain_change' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : ''"
          data-testid="charting-quarterly-returns-mode-net-gain"
          @click="mode = 'net_gain_change'"
        >
          Net-gain change
        </button>
      </div>
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="sr-only">Quarterly Returns — {{ metricLabel }}</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <p class="text-xs text-slate-500" data-testid="`${testid}-partial`">
        The current quarter is year-to-date. Undefined (zero/unknown denominator) is shown as —, never 0%.
      </p>
      <CollapsibleSection title="Quarterly Returns" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Quarter</th>
              <th class="px-5 py-2.5 text-right font-medium">Ending value</th>
              <th class="px-5 py-2.5 text-right font-medium">Net contributions</th>
              <th class="px-5 py-2.5 text-right font-medium">TWR</th>
              <th class="px-5 py-2.5 text-right font-medium">Net-gain change</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.quarter" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                {{ r.quarter }}<span v-if="r.partial" class="ml-1 text-xs text-slate-400">YTD</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.endingValue ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.cumulativeNetContributions ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ percent(r.twr) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ percent(r.netGainChange) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">
          TWR is flow-neutral; net-gain change is not volatility and uses cumulative external net contributions, not remaining cost basis.
        </p>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No quarterly returns for this scope.</p>
  </div>
</template>