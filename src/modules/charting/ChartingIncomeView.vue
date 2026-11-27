<script setup lang="ts">
/** Charting → Income (feature #253, sub-issues #256–#265). */
import { computed, watch } from "vue"
import { getChartIncome } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"
import MonthlyIncomeChart from "./MonthlyIncomeChart.vue"
import CumulativeIncomeChart from "./CumulativeIncomeChart.vue"
import AnnualIncomeChart from "./AnnualIncomeChart.vue"
import AnnualIncomeAverageChart from "./AnnualIncomeAverageChart.vue"
import QuarterlyIncomeChart from "./QuarterlyIncomeChart.vue"
import QuarterlyIncomeGrowthChart from "./QuarterlyIncomeGrowthChart.vue"
import MonthlyPayerCountChart from "./MonthlyPayerCountChart.vue"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartIncome)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const currency = computed(() => data.value?.currency ?? "")
</script>

<template>
  <div class="space-y-3" data-testid="charting-income">
  <div class="page-header" data-testid="charting-income">
    <div>
      <p class="page-eyebrow"><span class="signal-dot" /> CHARTING</p>
      <h1 class="page-title">Income</h1>
    </div>
  </div>

    <p v-if="loading" class="text-sm text-muted">Loading…</p>
    <p v-else-if="error" class="text-sm text-danger">Failed to load income data.</p>
    <template v-else>
      <MonthlyIncomeChart />
      <CumulativeIncomeChart :points="data?.cumulative ?? []" :currency="currency" />
      <h3 class="text-sm font-medium text-muted">Annual totals</h3>
      <AnnualIncomeChart :points="data?.annual ?? []" :currency="currency" />
      <h3 class="text-sm font-medium text-muted">Quarterly receipts</h3>
      <QuarterlyIncomeChart :points="data?.quarterly ?? []" :currency="currency" />
      <h3 class="text-sm font-medium text-muted">Quarterly year-over-year growth</h3>
      <QuarterlyIncomeGrowthChart :points="data?.quarterly ?? []" :currency="currency" />
      <h3 class="text-sm font-medium text-muted">Dividend-payer coverage</h3>
      <MonthlyPayerCountChart :months="data?.payerCoverage ?? []" />
      <h3 class="text-sm font-medium text-muted">Annual-equivalent averages</h3>
      <AnnualIncomeAverageChart :points="data?.dailyAverageByYear ?? []" unit="day" :currency="currency" />
      <AnnualIncomeAverageChart :points="data?.monthlyAverageByYear ?? []" unit="month" :currency="currency" />
    </template>
  </div>
</template>