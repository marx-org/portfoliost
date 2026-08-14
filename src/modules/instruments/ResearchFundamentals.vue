<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentFundamentals } from "@/api/instruments"
import type { ResearchFundamentals } from "@/api/types"
import { formatCompact } from "@/utils/format"
import { baseSymbol } from "@/utils/research"

const route = useRoute()
const symbol = baseSymbol(String(route.params.symbol))

const data = ref<ResearchFundamentals | null>(null)
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

function cell(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") {
    if (key.toLowerCase().includes("growth") || key === "netIncomeMargin" || key === "debtEquityRatio" || key === "freeCashFlowPerShare") {
      return `${v.toFixed(1)}%`
    }
    if (Math.abs(v) >= 1e6) return formatCompact(v)
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    return v.toFixed(2)
  }
  return String(v)
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading fundamentals...</p>

    <template v-if="!loading && !error && data">
      <div class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Revenue vs Net Income - {{ symbol }}</h2>
        <component :is="'apexchart'" v-if="income.length" :options="trendChartOptions" :series="trendChartOptions.series" />
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">No income data available.</p>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Income Statement</h2>
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
        <h2 class="mb-3 text-base font-semibold">Balance Sheet</h2>
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
        <h2 class="mb-3 text-base font-semibold">Cash Flow</h2>
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
