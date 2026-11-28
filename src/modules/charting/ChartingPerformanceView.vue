<script setup lang="ts">
/**
 * Charting → Performance (feature #253, sub-issue #256/#272–#275).
 *
 * Renders the SHARED `PortfolioPerformanceChart` (the same renderer the
 * per-portfolio Performance tab uses) from the charting performance dataset, so
 * there is one performance renderer rather than a second chart. The view may be
 * mounted with a fixed scope (the portfolio tab) or read the shared URL scope.
 */
import { computed, watch } from "vue"
import { useI18n } from "vue-i18n"
import { getChartPerformance } from "@/api/charting"
import type { ChartScopeQuery } from "@/api/charting"
import ValuationChart from "./ValuationChart.vue"
import ReturnsChart from "./ReturnsChart.vue"
import ProfitValueScatterChart from "./ProfitValueScatterChart.vue"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const props = defineProps<{ scope?: ChartScopeQuery }>()

const scope = useChartScope()
const { t } = useI18n()
const { data, loading, error, load } = useChartData(getChartPerformance)

const activeScope = computed<ChartScopeQuery>(() => props.scope ?? scope.scopeQuery.value)
watch(activeScope, (q) => void load(q), { immediate: true })

const points = computed(() => data.value?.series ?? [])
const currency = computed(() => data.value?.currency ?? "")
const benchmarks = computed(() => data.value?.benchmarks ?? [])

// Reuse the existing benchmark selection (S&P 500 / Nasdaq 100); the scope is
// carried in the URL like accounts/labels, so the page and the portfolio tab
// share the same renderer and the same benchmark engine.
const benchmarkOptions = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
] as const
</script>

<template>
  <div class="space-y-3" data-testid="charting-performance">
  <div class="page-header" data-testid="charting-performance">
    <div>
      <p class="page-eyebrow"><span class="signal-dot" /> {{ t("charting.eyebrow") }}</p>
      <h1 class="page-title">{{ t("charting.perfTitle") }}</h1>
    </div>
  </div>

    <p v-if="loading" class="text-sm text-muted">{{ t("charting.loading") }}</p>
    <p v-else-if="error" class="text-sm text-danger">{{ t("charting.perfLoadError") }}</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-3 text-xs text-muted" data-testid="charting-benchmark-bar">
        <span class="font-medium">{{ t("charting.benchmarks") }}</span>
        <label v-for="b in benchmarkOptions" :key="b.symbol" class="inline-flex items-center gap-1">
          <input
            type="checkbox"
            :checked="scope.selectedBenchmarks.value.includes(b.symbol)"
            :data-testid="`charting-benchmark-${b.symbol.toLowerCase()}`"
            @change="scope.toggleBenchmark(b.symbol)"
          />
          {{ b.name }}
        </label>
      </div>
      <ValuationChart
        v-if="points.length"
        :points="points"
        :currency="currency"
        :height="320"
        :benchmarks="benchmarks"
      />
      <ReturnsChart
        v-if="data?.quarterly?.length"
        :points="data.quarterly"
        :currency="currency"
      />
      <ProfitValueScatterChart
        v-if="data?.scatter?.length"
        :points="data.scatter"
        :currency="currency"
      />
      <p v-else class="text-sm text-muted">{{ t("charting.noPerfData") }}</p>
      <div v-if="data" class="text-xs text-muted">{{ t("charting.generation", { generation: data.coverage.generation, status: data.coverage.status }) }}</div>
    </template>
  </div>
</template>