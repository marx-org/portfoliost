<script setup lang="ts">
/**
 * Charting → Allocation (feature #253, sub-issue #256/#266–#271).
 *
 * Renders the shared `AllocationBreakdown` from the charting allocation dataset,
 * so this page and the per-portfolio Allocation tab are the same renderer. The
 * view may be mounted with a fixed scope (the portfolio tab) or read the shared
 * URL scope.
 */
import { computed, watch } from "vue"
import { getChartAllocation } from "@/api/charting"
import type { ChartScopeQuery } from "@/api/charting"
import AllocationBreakdown, { type AllocationSlice } from "@/components/AllocationBreakdown.vue"
import StockCategoryAllocationChart from "./StockCategoryAllocationChart.vue"
import LabelCostValueChart from "./LabelCostValueChart.vue"
import AssetTypeAllocationChart from "./AssetTypeAllocationChart.vue"
import SectorAllocationChart from "./SectorAllocationChart.vue"
import CurrencyAllocationChart from "./CurrencyAllocationChart.vue"
import HoldingsCompositionChart from "./HoldingsCompositionChart.vue"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const props = defineProps<{ scope?: ChartScopeQuery }>()

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartAllocation)

const activeScope = computed<ChartScopeQuery>(() => props.scope ?? scope.scopeQuery.value)
watch(activeScope, (q) => void load(q), { immediate: true })

const baseCurrency = computed(() => data.value?.currency ?? "")

type ChartSlice = {
  key: string
  label?: string
  value: number
  percent?: number | null
  sourceCurrency?: string | null
  unknown?: boolean
}

function toSlices(rows: ChartSlice[] | undefined): AllocationSlice[] {
  return (rows ?? []).map((r) => ({
    key: r.key,
    label: r.label ?? r.key,
    value: r.value ?? 0,
    percent: r.percent ?? null,
    // A slice may be reported in its own source currency (byCurrency rows).
    currency: r.sourceCurrency ?? baseCurrency.value,
    unknown: r.unknown,
  }))
}

const bySector = computed(() => toSlices(data.value?.bySector))
const byAssetType = computed(() => toSlices(data.value?.byAssetType))
const byCurrency = computed(() => toSlices(data.value?.byCurrency))
const byCategory = computed(() => toSlices(data.value?.byCategory))
const byCostBasis = computed(() => data.value?.byCostBasis ?? [])
const positions = computed(() => data.value?.positions ?? [])
const hasSlices = computed(
  () => bySector.value.length || byAssetType.value.length || byCurrency.value.length || byCategory.value.length,
)
</script>

<template>
  <div class="space-y-3" data-testid="charting-allocation">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load allocation data.</p>
    <template v-else>
      <AllocationBreakdown
        v-if="hasSlices"
        :by-sector="bySector"
        :by-asset-type="byAssetType"
        :by-currency="byCurrency"
        :currency="baseCurrency"
        testid="charting-allocation-breakdown"
        collapsible-tables
        :show-sector-donut="false"
      />
      <SectorAllocationChart
        v-if="bySector.length"
        :slices="bySector"
        :currency="baseCurrency"
        :show-table="false"
      />
      <StockCategoryAllocationChart
        v-if="byCategory.length"
        :slices="byCategory"
        :currency="baseCurrency"
      />
      <AssetTypeAllocationChart
        v-if="byAssetType.length"
        :slices="byAssetType"
        :currency="baseCurrency"
      />
      <CurrencyAllocationChart
        v-if="byCurrency.length"
        :slices="byCurrency"
        :currency="baseCurrency"
      />
      <HoldingsCompositionChart
        v-if="positions.length"
        :rows="positions"
        :currency="baseCurrency"
      />
      <LabelCostValueChart
        v-if="byCostBasis.length"
        :rows="byCostBasis"
        :currency="baseCurrency"
      />
      <p v-if="!hasSlices && !byCostBasis.length" class="text-sm text-slate-500">No allocation data for this scope.</p>
      <div v-if="data" class="text-xs text-slate-500">Generation {{ data.coverage.generation }} · {{ data.coverage.status }}</div>
    </template>
  </div>
</template>