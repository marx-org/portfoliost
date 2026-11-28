<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { getInstrumentSeasonality } from "@/api/instruments"
import { withSharedChart } from "@/utils/chartOptions"

const props = defineProps<{ symbol: string }>()
const { t } = useI18n()

const yearsOptions = [3, 5, 10, 20]
const metricOptions = ["avg", "med", "min", "max"] as const

const years = ref(5)
const metric = ref<(typeof metricOptions)[number]>("avg")
const loading = ref(false)
const error = ref<string | null>(null)
const monthly = ref<Array<{ month: string; return_pct: number | null }>>([])

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await getInstrumentSeasonality(props.symbol, years.value, metric.value)
    monthly.value = res.monthly_returns ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load seasonality"
  } finally {
    loading.value = false
  }
}

watch([years, metric], load, { immediate: true })

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 300, toolbar: { show: false } },
  colors: monthly.value.map((m) => ((m.return_pct ?? 0) >= 0 ? "var(--emerald)" : "var(--danger)")),
  series: [{ name: "Return", data: monthly.value.map((m) => m.return_pct ?? 0) }],
  xaxis: { categories: monthly.value.map((m) => m.month) },
  plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
  dataLabels: {
    enabled: true,
    formatter: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    offsetY: -6,
    style: { fontSize: "10px" },
  },
  yaxis: { labels: { formatter: (v: number) => `${v.toFixed(1)}%` } },
  fill: { type: "solid" as const },
}))
</script>

<template>
  <div class="card p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="card-title">{{ t("research.seasonality") }}</h2>
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <div class="flex overflow-hidden rounded-md border border-border">
          <button
            v-for="y in yearsOptions"
            :key="y"
            type="button"
            class="px-3 py-1.5 font-medium"
            :class="years === y ? 'bg-slate-800 text-white' : 'text-muted hover:bg-surface-2 dark:hover:bg-slate-800'"
            @click="years = y"
          >
            {{ y }}Y
          </button>
        </div>
        <div class="flex overflow-hidden rounded-md border border-border">
          <button
            v-for="m in metricOptions"
            :key="m"
            type="button"
            class="px-3 py-1.5 font-medium capitalize"
            :class="metric === m ? 'bg-slate-800 text-white' : 'text-muted hover:bg-surface-2 dark:hover:bg-slate-800'"
            @click="metric = m"
          >
            {{ m === "avg" ? "Avg" : m === "med" ? "Med" : m === "min" ? "Min" : "Max" }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">{{ t("research.loadingSeasonality") }}</p>
    <component
      :is="'apexchart'"
      v-else-if="monthly.length"
      :options="chartOptions"
      :series="chartOptions.series"
    />
    <p v-else class="text-sm text-muted">{{ t("research.noSeasonality") }}</p>
  </div>
</template>
