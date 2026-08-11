<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { getInstrumentSeasonality } from "@/api/instruments"

const props = defineProps<{ symbol: string }>()

const yearsOptions = [3, 5, 10, 20]
const metricOptions = ["avg", "med", "min", "max"] as const

const years = ref(5)
const metric = ref<(typeof metricOptions)[number]>("avg")
const loading = ref(false)
const error = ref<string | null>(null)
const monthly = ref<Array<{ month: string; return_pct: number }>>([])

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await getInstrumentSeasonality(props.symbol, years.value, metric.value)
    monthly.value = res.monthly_returns
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load seasonality"
  } finally {
    loading.value = false
  }
}

watch([years, metric], load, { immediate: true })

const chartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 300, toolbar: { show: false } },
  colors: monthly.value.map((m) => (m.return_pct >= 0 ? "#16a34a" : "#dc2626")),
  series: [{ name: "Return", data: monthly.value.map((m) => m.return_pct) }],
  xaxis: { categories: monthly.value.map((m) => m.month) },
  plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
  dataLabels: {
    enabled: true,
    formatter: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    offsetY: -6,
    style: { fontSize: "10px" },
  },
  yaxis: { labels: { formatter: (v: number) => `${v.toFixed(1)}%` } },
  grid: { borderColor: "#e2e8f0" },
}))
</script>

<template>
  <div class="card p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-base font-semibold">Seasonality</h2>
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <div class="flex overflow-hidden rounded-md border border-slate-300">
          <button
            v-for="y in yearsOptions"
            :key="y"
            type="button"
            class="px-3 py-1.5 font-medium"
            :class="years === y ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="years = y"
          >
            {{ y }}Y
          </button>
        </div>
        <div class="flex overflow-hidden rounded-md border border-slate-300">
          <button
            v-for="m in metricOptions"
            :key="m"
            type="button"
            class="px-3 py-1.5 font-medium capitalize"
            :class="metric === m ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="metric = m"
          >
            {{ m === "avg" ? "Avg" : m === "med" ? "Med" : m === "min" ? "Min" : "Max" }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading seasonality...</p>
    <component
      :is="'apexchart'"
      v-else-if="monthly.length"
      :options="chartOptions"
      :series="chartOptions.series"
    />
    <p v-else class="text-sm text-slate-500">No seasonality data available.</p>
  </div>
</template>
