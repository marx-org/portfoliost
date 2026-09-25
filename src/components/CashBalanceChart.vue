<script setup lang="ts">
/**
 * Reusable cash balance area chart (§62) with a Recompute button.
 * Point shaping (e.g. `balance > 0` filters) stays in the parent — the
 * component renders exactly the points it gets.
 */
import { computed } from "vue"
import { formatDate } from "@/utils/format"

const props = withDefaults(
  defineProps<{
    points: Array<{ date: string; balance: number }>
    busy?: boolean
    height?: number
  }>(),
  { busy: false, height: 200 },
)

const emit = defineEmits<{ recompute: [] }>()

const chartOptions = computed(() => ({
  chart: { type: "area" as const, height: props.height, toolbar: { show: false } },
  colors: ["#16a34a"],
  series: [{ name: "Balance", data: props.points.map((p) => p.balance) }],
  xaxis: { categories: props.points.map((p) => formatDate(p.date)), labels: { show: false } },
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.3, opacityTo: 0 } },
}))

defineExpose({ chartOptions })
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <span />
      <button
        type="button"
        class="btn-secondary text-xs"
        data-testid="cash-chart-recompute"
        :disabled="busy"
        @click="emit('recompute')"
      >
        Recompute
      </button>
    </div>
    <component :is="'apexchart'" v-if="points.length" :options="chartOptions" :series="chartOptions.series" />
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No balance history available.</p>
  </div>
</template>
