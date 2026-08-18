<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { getChartingCompare, getChartingPresets, type ChartingPreset } from "@/api/charting"
import type { components } from "@/api/types"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import { COMPARE_METRICS } from "@/modules/instruments/compareMetrics"

type ResearchCompare = components["schemas"]["ResearchCompare"]

const MAX_STOCKS = 10

const selected = ref<string[]>([])
const metric = ref<keyof ResearchCompare>("peRatio")
const presets = ref<ChartingPreset[]>([])
const items = ref<ResearchCompare[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showSearch = ref(false)

const metricDef = computed(() => COMPARE_METRICS.find((m) => m.key === metric.value) ?? COMPARE_METRICS[0])

const nameOf = (symbol: string) => items.value.find((r) => r.symbol === symbol)?.name ?? symbol

const chartSeries = computed(() => [
  {
    name: metricDef.value.label,
    data: items.value.map((r) => Number(r[metric.value])),
  },
])

const chartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 360, toolbar: { show: false } },
  colors: ["#2563eb"],
  plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
  dataLabels: {
    enabled: true,
    formatter: (v: number) => metricDef.value.chartFmt(v),
    offsetY: -6,
    style: { fontSize: "10px" },
  },
  xaxis: { categories: items.value.map((r) => r.symbol) },
  yaxis: { labels: { formatter: (v: number) => metricDef.value.chartFmt(v) } },
  grid: { borderColor: "#e2e8f0" },
}))

async function loadCompare() {
  if (selected.value.length < 2) {
    items.value = []
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const res = await getChartingCompare(selected.value)
    items.value = res
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load comparison"
    items.value = []
  } finally {
    loading.value = false
  }
}

function addStock(symbol: string) {
  const sym = symbol.toUpperCase()
  if (selected.value.includes(sym) || selected.value.length >= MAX_STOCKS) return
  selected.value = [...selected.value, sym]
}

function removeStock(symbol: string) {
  selected.value = selected.value.filter((s) => s !== symbol)
}

function applyPreset(preset: ChartingPreset) {
  selected.value = preset.symbols.slice(0, MAX_STOCKS)
  metric.value = preset.metric
}

watch(selected, loadCompare)

onMounted(async () => {
  await loadCompare()
  try {
    presets.value = await getChartingPresets()
  } catch {
    presets.value = []
  }
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Stocks
        <span class="ml-2 align-middle text-sm font-medium text-slate-500 dark:text-slate-400" data-testid="selected-counter">
          {{ selected.length }}/{{ MAX_STOCKS }} selected
        </span>
      </h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Compare fundamentals across stocks, or start from a popular preset.</p>
    </div>

    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-base font-semibold">Stocks to compare</h2>
        <div class="flex items-center gap-2">
          <button v-if="selected.length" type="button" class="btn-ghost text-xs" @click="selected = []">
            Clear
          </button>
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="selected.length >= MAX_STOCKS"
            data-testid="add-stock"
            @click="showSearch = true"
          >
            + Add stock
          </button>
        </div>
      </div>

      <div v-if="selected.length" class="flex flex-wrap gap-2">
        <span
          v-for="symbol in selected"
          :key="symbol"
          class="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 py-1 pl-3 pr-1 text-sm font-medium text-slate-800 dark:text-slate-200"
          data-testid="stock-chip"
        >
          {{ symbol }}
          <span class="text-xs font-normal text-slate-500 dark:text-slate-400">{{ nameOf(symbol) }}</span>
          <button
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/70 hover:text-slate-700 dark:hover:text-slate-200"
            :aria-label="`Remove ${symbol}`"
            data-testid="remove-stock"
            @click="removeStock(symbol)"
          >
            ✕
          </button>
        </span>
      </div>
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">
        No stocks added yet. Add at least two stocks to build a comparison chart.
      </p>
    </div>

    <div class="card p-6">
      <h2 class="mb-3 text-base font-semibold">Presets</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in presets"
          :key="preset.name"
          type="button"
          class="rounded-lg border border-slate-200 dark:border-slate-700/60 px-3 py-2 text-left text-xs hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10"
          :data-testid="`preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`"
          @click="applyPreset(preset)"
        >
          <span class="block font-semibold text-slate-800 dark:text-slate-200">{{ preset.name }}</span>
          <span v-if="preset.description" class="block text-slate-500 dark:text-slate-400">{{ preset.description }}</span>
        </button>
      </div>
    </div>

    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-base font-semibold">Fundamentals comparison</h2>
        <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          Metric
          <select v-model="metric" class="input w-auto" data-testid="metric-picker">
            <option v-for="m in COMPARE_METRICS" :key="m.key" :value="m.key">{{ m.label }}</option>
          </select>
        </label>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
      <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading comparison...</p>

      <div v-else-if="selected.length < 2" class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Add at least two stocks to see the comparison chart.
      </div>

      <div v-else-if="items.length" data-testid="compare-chart">
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
        <div class="mt-4 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Stock</th>
                <th v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right">{{ r.symbol }}</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-3 text-slate-600 dark:text-slate-300">{{ metricDef.label }}</td>
                <td v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right font-medium text-slate-800 dark:text-slate-200">
                  {{ metricDef.fmt(r) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <InstrumentSearchModal :open="showSearch" mode="add" title="Add Stock to Chart" @close="showSearch = false" @add="addStock" />
  </div>
</template>
