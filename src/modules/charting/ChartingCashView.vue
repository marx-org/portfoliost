<script setup lang="ts">
/** Charting → Cash & funding (feature #253, sub-issues #256/#276–#277). */
import { computed, watch } from "vue"
import { useI18n } from "vue-i18n"
import { getChartCash } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"
import CashHistoryChart from "./CashHistoryChart.vue"
import AnnualContributionsChart from "./AnnualContributionsChart.vue"
import CumulativeContributionsChart from "./CumulativeContributionsChart.vue"

const scope = useChartScope()
const { t } = useI18n()
const { data, loading, error, load } = useChartData(getChartCash)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const currency = computed(() => data.value?.currency ?? "")
const series = computed(() => data.value?.series ?? [])
const contributions = computed(() => data.value?.annualContributions ?? [])
const cumulative = computed(() => data.value?.cumulativeContributions ?? [])
</script>

<template>
  <div class="space-y-3" data-testid="charting-cash">
  <div class="page-header" data-testid="charting-cash">
    <div>
      <p class="page-eyebrow"><span class="signal-dot" /> {{ t("charting.eyebrow") }}</p>
      <h1 class="page-title">{{ t("charting.cashTitle") }}</h1>
    </div>
  </div>

    <p v-if="loading" class="text-sm text-muted">{{ t("charting.loading") }}</p>
    <p v-else-if="error" class="text-sm text-danger">{{ t("charting.cashLoadError") }}</p>
    <template v-else>
      <CashHistoryChart :series="series" :currency="currency" />
      <AnnualContributionsChart :points="contributions" :currency="currency" />
      <CumulativeContributionsChart :series="cumulative" :currency="currency" />
      <div v-if="data" class="text-xs text-muted">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>