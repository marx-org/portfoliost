<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import { getChartingCompare, getChartingPresets, type ChartingPreset } from "@/api/charting"
import { researchRoute } from "@/utils/research"
import type { components } from "@/api/types"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import { COMPARE_METRICS } from "@/modules/instruments/compareMetrics"
import TickerBadge from "@/components/TickerBadge.vue"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisTitle, chartTitle, withSharedChart } from "./chartFormat"

type ResearchCompare = components["schemas"]["ResearchCompare"]

const MAX_STOCKS = 10

const selected = ref<string[]>([])
const metric = ref<keyof ResearchCompare>("peRatio")
const presets = ref<ChartingPreset[]>([])
const items = ref<ResearchCompare[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showSearch = ref(false)
const route = useRoute()
const { t } = useI18n()

const metricDef = computed(() => COMPARE_METRICS.find((m) => m.key === metric.value) ?? COMPARE_METRICS[0])

// The comparison axis mixes currencies and ratios, so the title names the
// metric and its unit rather than guessing one display currency.
const PERCENT_METRICS = new Set<keyof ResearchCompare>([
  "dividendYield",
  "revenueGrowth",
  "netMargin",
  "roe",
  "grossMargin",
  "operatingMargin",
  "fcfMargin",
])
const CURRENCY_METRICS = new Set<keyof ResearchCompare>(["price", "marketCap", "netIncome", "revenue"])
const metricAxisTitle = computed(() => {
  const unit = PERCENT_METRICS.has(metric.value)
    ? "%"
    : CURRENCY_METRICS.has(metric.value)
      ? "instrument currency"
      : "ratio"
  return `${metricDef.value.label} (${unit})`
})

const nameOf = (symbol: string) => items.value.find((r) => r.symbol === symbol)?.name ?? symbol

const chartSeries = computed(() => [
  {
    name: metricDef.value.label,
    data: items.value.map((r) => Number(r[metric.value])),
  },
])

const chartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 360, toolbar: { show: false } },
  title: chartTitle(t("charting.compareChartTitle")),
  colors: ["var(--accent)"],
  plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
  dataLabels: {
    enabled: true,
    formatter: (v: number) => metricDef.value.chartFmt(v),
    offsetY: -6,
    style: { fontSize: "10px" },
  },
  xaxis: { categories: items.value.map((r) => r.symbol), title: axisTitle(t("charting.compareAxisStock")) },
  yaxis: {
    title: axisTitle(metricAxisTitle.value),
    labels: { formatter: (v: number) => metricDef.value.chartFmt(v) },
  },
  fill: { type: "solid" as const },
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
    error.value = err instanceof Error ? err.message : t("charting.loadCompareError")
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
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> {{ t("charting.eyebrow") }}</p>
        <h1 class="page-title">
          {{ t("charting.stocks") }}
          <span class="ml-2 align-middle text-sm font-medium text-muted" data-testid="selected-counter">
            {{ t("charting.selectedCount", { count: selected.length, max: MAX_STOCKS }) }}
          </span>
        </h1>
        <p class="page-description">{{ t("charting.stocksDescription") }}</p>
      </div>
    </div>

    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="card-title">{{ t("charting.stocksToCompare") }}</h2>
        <div class="flex items-center gap-2">
          <button v-if="selected.length" type="button" class="btn-ghost text-xs" @click="selected = []">
            {{ t("charting.clear") }}
          </button>
          <button
            type="button"
            class="btn-secondary text-xs"
            :disabled="selected.length >= MAX_STOCKS"
            data-testid="add-stock"
            @click="showSearch = true"
          >
            {{ t("charting.addStock") }}
          </button>
        </div>
      </div>

      <div v-if="selected.length" class="flex flex-wrap gap-2">
        <span
          v-for="symbol in selected"
          :key="symbol"
          class="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm font-medium text-text"
          data-testid="stock-chip"
        >
          <!-- §85.4 — the symbol + name become a link. The pill and the sibling
               Remove button are untouched: this table's own e2e and unit specs
               assert on COUNTS of stock-chip / remove-stock rather than chip
               internals, which is what makes a wrap safe here and a DOM
               restructure unnecessary. No TickerBadge in the pill — a logo plate
               inside a rounded-full chip is not example-service's geometry. -->
          <router-link :to="researchRoute(symbol, route.fullPath)" class="min-w-0 truncate hover:underline">
            {{ symbol }}
            <span class="text-xs font-normal text-muted">{{ nameOf(symbol) }}</span>
          </router-link>
          <button
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded-full text-muted dark:text-muted hover:bg-border dark:hover:bg-slate-700/70 hover:text-text dark:hover:text-slate-200"
            :aria-label="t('charting.removeSymbol', { symbol })"
            data-testid="remove-stock"
            @click="removeStock(symbol)"
          >
            ✕
          </button>
        </span>
      </div>
      <p v-else class="text-sm text-muted">
        {{ t("charting.noStocks") }}
      </p>
    </div>

    <div class="card p-6">
      <h2 class="card-title mb-3">{{ t("charting.presets") }}</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in presets"
          :key="preset.name"
          type="button"
          class="rounded-lg border border-border px-3 py-2 text-left text-xs hover:border-accent hover:bg-accent-soft dark:hover:bg-accent-soft0/10"
          :data-testid="`preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`"
          @click="applyPreset(preset)"
        >
          <span class="block font-semibold text-text">{{ preset.name }}</span>
          <span v-if="preset.description" class="block text-muted">{{ preset.description }}</span>
        </button>
      </div>
    </div>

    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="card-title">{{ t("charting.fundamentalsComparison") }}</h2>
        <label class="flex items-center gap-2 text-xs text-muted">
          {{ t("charting.metric") }}
          <select v-model="metric" class="input w-auto" data-testid="metric-picker">
            <option v-for="m in COMPARE_METRICS" :key="m.key" :value="m.key">{{ m.label }}</option>
          </select>
        </label>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
      <p v-if="loading" class="text-sm text-muted">{{ t("charting.loadingCompare") }}</p>

      <div v-else-if="selected.length < 2" class="rounded-lg bg-surface-2 px-3 py-8 text-center text-sm text-muted">
        {{ t("charting.addTwoStocks") }}
      </div>

      <div v-else-if="items.length" data-testid="compare-chart">
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
        <CollapsibleSection variant="plain" :title="t('charting.fundamentalsComparison')" testid="charting-compare-table" class="mt-4">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
            <thead>
            <tr class="border-b border-border text-left text-xs tracking-wide text-muted">
              <!-- §85.4 — `uppercase` moved off the row: it is right for the
                   "Stock" label and wrong for a company name, which is the same
                   correction ResearchCompare.vue:48-51 already documents.
                   `r.symbol` is optional, so the v-if guards the nullable case. -->
              <th class="py-2 pr-3 uppercase">{{ t("charting.stockCol") }}</th>
              <th v-for="r in items" :key="r.symbol ?? r.name" class="px-3 py-2 text-right normal-case tracking-normal">
                <router-link
                  v-if="r.symbol"
                  :to="researchRoute(r.symbol, route.fullPath)"
                  class="inline-block"
                >
                  <TickerBadge size="sm" align="right" :symbol="r.symbol" :name="r.name" />
                </router-link>
                <TickerBadge v-else size="sm" align="right" :symbol="''" :name="r.name" />
              </th>
            </tr>
            </thead>
            <tbody>
              <tr class="border-b border-border">
                <td class="py-2 pr-3 text-muted">{{ metricDef.label }}</td>
                <td v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right font-medium text-text">
                  {{ metricDef.fmt(r) }}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </CollapsibleSection>
      </div>
    </div>

    <InstrumentSearchModal :open="showSearch" mode="add" :title="t('charting.addStockToChart')" @close="showSearch = false" @add="addStock" />
  </div>
</template>
