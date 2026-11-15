<script setup lang="ts">
/** Charting → Performance (feature #253, sub-issue #256/#272–#275). */
import { computed, watch } from "vue"
import { getChartPerformance } from "@/api/charting"
import { useChartScope } from "./useChartScope"
import { useChartData } from "./useChartData"

const scope = useChartScope()
const { data, loading, error, load } = useChartData(getChartPerformance)

watch(scope.scopeQuery, (q) => void load(q), { immediate: true })

const series = computed(() =>
  (data.value?.series ?? []).map((p) => ({ x: new Date(p.date).getTime(), y: p.value, invested: p.invested ?? undefined })),
)
const chartOptions = {
  chart: { type: "line", height: 320, zoom: { enabled: false } },
  xaxis: { type: "datetime" },
  stroke: { width: 2 },
  colors: ["#3b82f6", "#0ea5e9"],
}
const chartSeries = computed(() => {
  const out: { name: string; data: { x: number; y: number }[] }[] = [
    { name: "Value", data: series.value.map((p) => ({ x: p.x, y: p.y })) },
  ]
  const invested = series.value.filter((p) => p.invested != null)
  if (invested.length) out.push({ name: "Invested", data: invested.map((p) => ({ x: p.x, y: p.invested as number })) })
  return out
})
</script>

<template>
  <div class="space-y-3" data-testid="charting-performance">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load performance data.</p>
    <template v-else>
      <apexchart v-if="chartSeries[0].data.length" type="line" :options="chartOptions" :series="chartSeries" :height="320" />
      <p v-else class="text-sm text-slate-500">No performance data for this scope.</p>
      <div v-if="data" class="text-xs text-slate-500">
        Generation {{ data.coverage.generation }} · {{ data.coverage.status }}
      </div>
    </template>
  </div>
</template>