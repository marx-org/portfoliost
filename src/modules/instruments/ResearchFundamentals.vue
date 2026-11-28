<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { withSharedChart } from "@/utils/chartOptions"
import { useRoute } from "vue-router"
import { getInstrumentFundamentals } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatCompact } from "@/utils/format"
import { formatFundamentalsCell as cell } from "./fundamentalsFormat"

const route = useRoute()
const { t } = useI18n()
const symbol = String(route.params.symbol).toUpperCase()

const data = ref<components["schemas"]["FundamentalsData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentFundamentals(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("research.loadFundamentalsError")
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
  if (!ccy) return t("research.currencyUnknown")
  if (data.value?.currencySource === "estimated") return t("research.currencyEstimated", { ccy })
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

const trendChartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 280, toolbar: { show: false } },
  colors: ["var(--accent)", "var(--emerald)"],
  fill: { type: "solid" as const },
  series: [
    { name: t("research.revenue"), data: income.value.map((r) => r.revenue) },
    { name: t("research.netIncome"), data: income.value.map((r) => r.netIncome) },
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
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">{{ t("research.loadingFundamentals") }}</p>

    <template v-if="!loading && !error && data">
      <p
        v-if="sourceLabel"
        class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        data-testid="fundamentals-mixed-sources"
      >
        {{ t("research.mixedSources", { sources: sourceLabel.join(", ") }) }}
      </p>

      <div class="card p-6">
        <h2 class="card-title mb-4">{{ t("research.revenueVsNetIncome", { symbol }) }}</h2>
        <component :is="'apexchart'" v-if="income.length" :options="trendChartOptions" :series="trendChartOptions.series" />
        <p v-else class="text-sm text-muted">{{ t("research.noIncomeData") }}</p>
      </div>

      <div class="card p-6">
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h2 class="card-title">{{ t("research.incomeStatement") }}</h2>
          <span class="shrink-0 text-xs text-muted" data-testid="fundamentals-currency">{{ currencyLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.year") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.revenue") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.ebitda") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.ebit") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.netIncome") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.netMargin") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.niGrowth") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.eps") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.epsGrowth") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.sharesDiluted") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in income" :key="r.year" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "revenue") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "ebitda") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "ebit") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "netIncome") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "netIncomeMargin") }}</td>
                <td class="py-2 pr-3 text-right" :class="r.netIncomeGrowth && r.netIncomeGrowth < 0 ? 'text-danger' : ''">{{ cell(r, "netIncomeGrowth") }}</td>
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
          <h2 class="card-title">{{ t("research.balanceSheet") }}</h2>
          <span class="shrink-0 text-xs text-muted" data-testid="fundamentals-currency">{{ currencyLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.year") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.totalAssets") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.totalLiabilities") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.equity") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.cashStInv") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.totalDebt") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.netDebt") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.workingCapital") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.retainedEarnings") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.debtEquity") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in balance" :key="r.year" class="border-b border-border">
                <td class="py-2 pr-3 font-medium">{{ r.year }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "totalAssets") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "totalLiabilities") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "shareholdersEquity") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "cashAndShortTermInvestments") }}</td>
                <td class="py-2 pr-3 text-right">{{ cell(r, "totalDebt") }}</td>
                <td class="py-2 pr-3 text-right" :class="r.netDebt && r.netDebt < 0 ? 'text-emerald' : ''">{{ cell(r, "netDebt") }}</td>
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
          <h2 class="card-title">{{ t("research.cashFlow") }}</h2>
          <span class="shrink-0 text-xs text-muted" data-testid="fundamentals-currency">{{ currencyLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[880px] text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th class="py-2 pr-3">{{ t("research.year") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.operatingCF") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.investingCF") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.financingCF") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.freeCashFlow") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.fcfGrowth") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.fcfShare") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.capex") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.depreciation") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("research.dividendsPaid") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in cashFlow" :key="r.year" class="border-b border-border">
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
