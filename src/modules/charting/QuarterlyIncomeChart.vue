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
import { formatCurrency } from "@/utils/format"

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
const chartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 340, toolbar: { show: false } },
  xaxis: { categories },
  colors: ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981"],
  legend: { position: "bottom" as const },
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
        <h2 class="mb-2 text-base font-semibold">Quarterly Receipts by Year</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <p v-if="partialLabel" class="text-xs text-slate-500" :data-testid="`${testid}-partial`">
        {{ partialLabel }} is year-to-date, not a full-quarter forecast.
      </p>
      <div class="card overflow-hidden" :data-testid="`${testid}-table`">
        <div class="border-b border-slate-200 px-5 py-3 dark:border-slate-700/60">
          <h2 class="text-base font-semibold">Quarterly Receipts</h2>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Quarter</th>
              <th class="px-5 py-2.5 text-right font-medium">Dividends</th>
              <th class="px-5 py-2.5 text-right font-medium">Interest</th>
              <th class="px-5 py-2.5 text-right font-medium">Options</th>
              <th class="px-5 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="r in rows" :key="r.quarter" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                {{ r.quarter }}<span v-if="r.quarter === currentQuarter" class="ml-1 text-xs text-slate-400">YTD</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.dividends ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.interest ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.options ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(r.total ?? 0, currency) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No quarterly income for this scope.</p>
  </div>
</template>