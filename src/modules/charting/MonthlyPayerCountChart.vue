<script setup lang="ts">
/**
 * Monthly dividend-payer coverage for current holdings (feature #253,
 * sub-issue #265).
 *
 * January–December counts of distinct currently-held stocks with a recorded
 * dividend in each month, from the shared scoped income dataset. The current
 * calendar year's current and later months are marked partial. Presentation
 * only — the counts live in wallets and use recorded dividends, not a provider
 * calendar.
 */
import { computed } from "vue"
import CollapsibleSection from "@/components/CollapsibleSection.vue"

type Month = { year: number; month: number; count: number; partial?: boolean }

const props = withDefaults(
  defineProps<{ months?: Month[]; testid?: string }>(),
  { months: () => [], testid: "charting-payer-coverage" },
)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const rows = computed(() => props.months ?? [])
const selectedYear = computed<number | null>(() => {
  const years = rows.value.map((m) => m.year)
  return years.length ? Math.max(...years) : null
})
const yearRows = computed(() =>
  selectedYear.value == null ? [] : rows.value.filter((m) => m.year === selectedYear.value),
)
const currentMonthKey = computed(() => {
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
})
const hasPartial = computed(() =>
  yearRows.value.some((m) => m.partial) ||
  (selectedYear.value === currentMonthKey.value.year && yearRows.value.some((m) => m.month >= currentMonthKey.value.month)),
)

const chartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 300 },
  xaxis: { categories: MONTHS },
  colors: ["#10b981"],
  tooltip: { y: { formatter: (v: number) => `${v} payer${v === 1 ? "" : "s"}` } },
}))
const chartSeries = computed(() => [
  {
    name: "Dividend payers",
    data: MONTHS.map((_, i) => yearRows.value.find((m) => m.month === i + 1)?.count ?? null),
  },
])
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="selectedYear != null">
      <div class="card p-6" :data-testid="`${testid}-chart`">
        <h2 class="mb-2 text-base font-semibold">Dividend Payers by Month — {{ selectedYear }}</h2>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <p v-if="hasPartial" class="text-xs text-slate-500" :data-testid="`${testid}-partial`">
        {{ selectedYear }} is in progress; the current and later months are year-to-date, not a full-year forecast.
      </p>
      <CollapsibleSection title="Dividend Payers" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-5 py-2.5 font-medium">Month</th>
              <th class="px-5 py-2.5 text-right font-medium">Payers</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="m in yearRows" :key="m.month" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                {{ MONTHS[m.month - 1] }}<span v-if="m.partial" class="ml-1 text-xs text-slate-400">YTD</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ m.count }}</td>
            </tr>
          </tbody>
        </table>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No dividend-payer data for this scope.</p>
  </div>
</template>