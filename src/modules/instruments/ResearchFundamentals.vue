<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentFundamentals } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatCompact } from "@/utils/format"
import { formatFundamentalsCell as cell } from "./fundamentalsFormat"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const data = ref<components["schemas"]["FundamentalsData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentFundamentals(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load fundamentals"
  } finally {
    loading.value = false
  }
})

const income = computed(() => data.value?.financialHighlights.incomeStatement ?? [])
const balance = computed(() => data.value?.financialHighlights.balanceSheet ?? [])
const cashFlow = computed(() => data.value?.financialHighlights.cashFlow ?? [])

/**
 * §79.2 — what the three cards are denominated in, and where it came from.
 *
 * The statements used to render with no currency at all, so a GPW name in PLN
 * and a US name in USD looked identical. The label sits on the CARD rather than
 * in each cell, because repeating a symbol on thirty values is noise, not
 * clarity — and a per-cell symbol would also be wrong for the growth and margin
 * columns, which are ratios and carry no currency whatever.
 *
 * `estimated` is spelled out rather than reduced to "approx": the distinction is
 * between "the upstream said EUR" and "we resolved EUR from the venue", and a
 * reader comparing these numbers against a broker has to know which.
 */
const currencyLabel = computed(() => {
  const ccy = data.value?.currency
  if (!ccy) return "Currency unknown"
  if (data.value?.currencySource === "estimated") return `${ccy} (estimated)`
  if (data.value?.currencySource === "provider") return ccy
  return ccy
})

/** The named providers behind the three statements, or null when they agree. */
const sourceLabel = computed(() => {
  const sources = data.value?.sources
  if (!sources) return null
  const named = [sources.incomeStatement, sources.balanceSheet, sources.cashFlow].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  )
  // No attribution survived the hop (a body cached before the envelope existed),
  // or every statement came from the same place — neither is worth a marker.
  if (named.length === 0 || named.length === 3 && new Set(named).size === 1) return null
  return named
})

const trendChartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 280, toolbar: { show: false } },
  colors: ["#2563eb", "#16a34a"],
  series: [
    { name: "Revenue", data: income.value.map((r) => r.revenue) },
    { name: "Net Income", data: income.value.map((r) => r.netIncome) },
  ],
  xaxis: { categories: income.value.map((r) => String(r.year)) },
  plotOptions: { bar: { columnWidth: "45%", borderRadius: 3 } },
  dataLabels: { enabled: false },
  legend: { position: "top" as const },
  yaxis: { labels: { formatter: (v: number) => formatCompact(v) } },
}))

</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading fundamentals...</p>

    <template v-if="!loading && !error && data">
      <p
        v-if="sourceLabel"
        class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        data-testid="fundamentals-mixed-sources"
      >
        These statements come from more than one provider ({{ sourceLabel.join(", ") }}), so they may
        not share a currency or a basis.
      </p>

      <div class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Revenue vs Net Income - {{ symbol }}</h2>
        <component :is="'apexchart'" v-if="income.length" :options="trendChartOptions" :series="trendChartOptions.series" />
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">No income data available.</p>
      </div>

      <div class="card p-6">
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h2 class="text-base font-semibold">Income Statement</h2>
          <span class="shrink-0 text-xs text-slate-500 dark:text-slate-400" data-testid="fundamentals-currency">{{ currencyLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Year</th>
                <th class="py-2 pr-3 text-right">Revenue</th>
                <th class="py-2 pr-3 text-right">EBITDA</th>
                <th class="py-2 pr-3 text-right">EBIT</th>
                <th class="py-2 pr-3 text-right">Net Income</th>
                <th class="py-2 pr-3 text-right">Net Margin</th>
                <th class="py-2 pr-3 text-right">NI Growth</th>
                <th class="py-2 pr-3 text-right">EPS</th>
                <th class="py-2 pr-3 text-right">EPS Growth</th>
                <th class="py-2 pr-3 text-right">Shares (diluted)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in income" :key="r.year" class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-3 font-medium">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "revenue") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "ebitda") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "ebit") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "netIncome") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "netIncomeMargin") }}</td>
                <td class="py-2 pr-3 text-right" :class="r.netIncomeGrowth && r.netIncomeGrowth < 0 ? 'text-red-600 dark:text-red-400' : ''">{{ cell(r, "netIncomeGrowth") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "earningsPerShare") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "earningsPerShareGrowth") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "dilutedSharesOutstanding") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-6">
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h2 class="text-base font-semibold">Balance Sheet</h2>
          <span class="shrink-0 text-xs text-slate-500 dark:text-slate-400" data-testid="fundamentals-currency">{{ currencyLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Year</th>
                <th class="py-2 pr-3 text-right">Total Assets</th>
                <th class="py-2 pr-3 text-right">Total Liabilities</th>
                <th class="py-2 pr-3 text-right">Equity</th>
                <th class="py-2 pr-3 text-right">Cash & ST Inv</th>
                <th class="py-2 pr-3 text-right">Total Debt</th>
                <th class="py-2 pr-3 text-right">Net Debt</th>
                <th class="py-2 pr-3 text-right">Working Capital</th>
                <th class="py-2 pr-3 text-right">Retained Earnings</th>
                <th class="py-2 pr-3 text-right">Debt/Equity</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in balance" :key="r.year" class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-3 font-medium">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "totalAssets") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "totalLiabilities") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "shareholdersEquity") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "cashAndShortTermInvestments") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "totalDebt") }}</td>
                <td class="py-2 pr-3 text-right" :class="r.netDebt && r.netDebt < 0 ? 'text-green-600 dark:text-green-400' : ''">{{ cell(r, "netDebt") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "workingCapital") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "retainedEarnings") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "debtEquityRatio") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-6">
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h2 class="text-base font-semibold">Cash Flow</h2>
          <span class="shrink-0 text-xs text-slate-500 dark:text-slate-400" data-testid="fundamentals-currency">{{ currencyLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[880px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Year</th>
                <th class="py-2 pr-3 text-right">Operating CF</th>
                <th class="py-2 pr-3 text-right">Investing CF</th>
                <th class="py-2 pr-3 text-right">Financing CF</th>
                <th class="py-2 pr-3 text-right">Free Cash Flow</th>
                <th class="py-2 pr-3 text-right">FCF Growth</th>
                <th class="py-2 pr-3 text-right">FCF / Share</th>
                <th class="py-2 pr-3 text-right">CapEx</th>
                <th class="py-2 pr-3 text-right">Depreciation</th>
                <th class="py-2 pr-3 text-right">Dividends Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in cashFlow" :key="r.year" class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-3 font-medium">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "cashFlowFromOperatingActivities") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "cashFlowFromInvestingActivities") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "cashFlowFromFinancingActivities") }}</td>
                <td class="py-2 pr-3 text-right font-medium">{{ cell(r, "freeCashFlow") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "freeCashFlowGrowth") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "freeCashFlowPerShare") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "capitalExpenditures") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "depreciation") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "dividendPayment") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
