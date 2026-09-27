<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watchEffect } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioAnalytics, getPortfolioRiskMetrics, recomputePortfolio } from "@/api/portfolios"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import type { PortfolioPositions } from "@/api/types"
import { formatPercent, formatSignedCurrency } from "@/utils/format"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { storeToRefs } from "pinia"
import { getLatestRate } from "@/api/fx"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const riskMetrics = ref<Record<string, number | null> | null>(null)
const showCustomTimeframe = ref(false)
const backfillPending = ref(store.analytics?.backfillStatus === "pending")

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

const benchmarkOptions = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
  { symbol: "VTI", name: "Total Stock Market" },
  { symbol: "EFA", name: "EAFE" },
  { symbol: "AGG", name: "Aggregate Bond" },
]

const customizeOpen = ref(false)
const showAddBenchmark = ref(false)

// Draft state — local to the modal, only committed on Apply
const draftBenchmarks = ref<string[]>([])

const knownSymbols = new Set(benchmarkOptions.map((o) => o.symbol))
const customDraftBenchmarks = computed(() => draftBenchmarks.value.filter((s) => !knownSymbols.has(s)))

function openCustomize() {
  draftBenchmarks.value = [...store.analyticsBenchmarks]
  customizeOpen.value = true
}

function closeCustomize() {
  customizeOpen.value = false
}

function toggleDraftBenchmark(symbol: string) {
  const current = new Set(draftBenchmarks.value)
  if (current.has(symbol)) current.delete(symbol)
  else current.add(symbol)
  draftBenchmarks.value = [...current]
}

function removeDraftBenchmark(symbol: string) {
  draftBenchmarks.value = draftBenchmarks.value.filter((s) => s !== symbol)
}

function addBenchmark(symbol: string, _name: string) {
  showAddBenchmark.value = false
  const current = new Set(draftBenchmarks.value)
  current.add(symbol)
  draftBenchmarks.value = [...current]
}

async function applyCustomize() {
  customizeOpen.value = false
  const benchmarksChanged = JSON.stringify([...draftBenchmarks.value].sort()) !== JSON.stringify([...store.analyticsBenchmarks].sort())
  if (benchmarksChanged) {
    await store.setBenchmarks(draftBenchmarks.value, id)
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollDeadline = 0

function stopPolling() {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
}

function startPolling() {
  stopPolling()
  pollDeadline = Date.now() + 5 * 60 * 1000
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) { stopPolling(); return }
    try {
      const analytics = await getPortfolioAnalytics(id, store.analyticsTimeframe, store.analyticsBenchmarks, store.analyticsReturnType)
      store.analytics = analytics
      if (analytics.backfillStatus !== "pending") {
        backfillPending.value = false
        stopPolling()
      }
    } catch { stopPolling() }
  }, 5000)
}

onMounted(async () => {
  try {
    riskMetrics.value = (await getPortfolioRiskMetrics(id)) as Record<string, number | null> | null
  } catch {
    riskMetrics.value = null
  }
  if (store.analytics?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  }
})

onUnmounted(() => stopPolling())

async function changeTimeframe(timeframe: PortfolioAnalyticsTimeframe) {
  await store.setTimeframe(timeframe, id)
  if (store.analytics?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  } else {
    backfillPending.value = false
    stopPolling()
  }
}

const recomputeBusy = ref(false)

async function handleRecompute() {
  if (recomputeBusy.value) return
  recomputeBusy.value = true
  try {
    await recomputePortfolio(id)
    if (store.analytics) store.analytics.backfillStatus = "pending"
    backfillPending.value = true
    startPolling()
  } catch {
    // network error — stay idle; the user can retry
  } finally {
    recomputeBusy.value = false
  }
}

// Config-only options (no `series`) so a refresh takes the updateSeries() path
// and keeps the axis formatter — see PortfolioPerformanceChart §recompute repro.
const monthlySeries = computed(() => [
  {
    name: "Return %",
    data: (store.analytics?.performance?.monthlyReturns ?? []).map((m) => ({ x: m.month, y: m.returnPercent })),
  },
])
const monthlyOptions = {
  chart: { type: "bar" as const, toolbar: { show: false } },
  colors: ["#2563eb"],
  yaxis: {
    labels: { formatter: (v: number) => `${Math.round(v)}%` },
  },
  plotOptions: { bar: { columnWidth: "50%", borderRadius: 3 } },
  dataLabels: { enabled: false },
  tooltip: {
    y: { formatter: (v: number) => `${v.toFixed(2)}%` },
  },
}

const seriesValues = computed(() => (store.analytics?.performance?.timeSeries ?? []).map((p) => p.value ?? 0))

const currentDrawdownPercent = computed(() => {
  const values = seriesValues.value
  if (values.length < 2) return null
  const max = Math.max(...values)
  if (!max) return null
  return (values[values.length - 1] / max - 1) * 100
})

const maxDrawdownPercent = computed(() => {
  const v = riskMetrics.value?.["maxDrawdown"]
  // Backend returns a negative fraction (e.g. -0.40); multiply by 100 to get
  // percentage. Do NOT negate — drawdown is inherently negative and is shown
  // in red alongside currentDrawdown which is also negative.
  return typeof v === "number" ? v * 100 : null
})

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

const performers = computed(() => {
  const open = store.positions.filter((p) => p.isOpen)
  const sorted = [...open].sort((a, b) => (b.unrealizedGainLoss ?? 0) - (a.unrealizedGainLoss ?? 0))
  return {
    top: sorted.slice(0, 5),
    bottom: [...sorted].reverse().slice(0, 5),
  }
})

// §36 — P/L is denominated in each position's instrumentCurrency. When that
// differs from the display currency, add a converted sub-line using the live
// rate via @marx2/contracts/fx (D27). Rates are fetched once per distinct
// instrument currency that differs from the display currency.
// §48.6e B3 — ref (not snapshot): switching the display currency in place
// must re-convert the chart + P/L sub-lines without a re-mount.
const displayStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayStore)

// instrumentCurrency -> rate (1 unit of instrumentCcy in displayCurrency)
const rateByCcy = ref<Record<string, number>>({})

watchEffect(() => {
  const wanted = new Set<string>()
  for (const p of performers.value.top) {
    const ccy = p.instrumentCurrency?.toUpperCase()
    if (ccy && ccy !== displayCurrency.value.toUpperCase()) wanted.add(ccy)
  }
  for (const ccy of wanted) {
    if (rateByCcy.value[ccy]) continue
    void (async () => {
      const rate = await getLatestRate(ccy, displayCurrency.value)
      if (rate && typeof rate.rate === "number" && rate.rate > 0) {
        rateByCcy.value = { ...rateByCcy.value, [ccy]: rate.rate }
      }
    })()
  }
})

/** P/L converted to the display currency (null when ccy matches or no rate). */
function convertedPnl(p: PortfolioPositions[number]): number | null {
  const ccy = p.instrumentCurrency?.toUpperCase()
  if (!ccy || p.unrealizedGainLoss == null) return null
  if (ccy === displayCurrency.value.toUpperCase()) return null
  const rate = rateByCcy.value[ccy]
  if (!rate) return null
  // getLatestRate(ccy, displayCurrency).rate is a direct 1 ccy = rate display
  return p.unrealizedGainLoss * rate
}

// §41.2/§48.6e B3 — the analytics series (and its benchmark overlays) are
// denominated in the portfolio BASE currency (wallets `baseCurrency` — NOT
// `currency`, which API-created portfolios default to USD while their
// positions declare a different base). Convert once per source currency via
// getLatestRate, then pass the converted series + :currency to the shared
// chart component.
const portfolioCcy = computed(() => {
  const d = store.detail
  return (d?.baseCurrency ?? "").toUpperCase()
})
//
// §67.2 — a FIFTH copy of the same conversion, also degrading an unresolvable
// pair to 1:1. Here that was worse than a rounding issue: the chart is labelled
// `:currency="displayCurrency"`, so an unresolvable pair plotted NATIVE
// portfolio-currency values under the display currency's symbol. The series
// still renders (values are left unscaled) but the LABEL now falls back to the
// portfolio's own currency via displayCurrencyOr() — §66.3's rule 2, which is
// what the composable exists to enforce.
const { rate: chartRate, displayCurrencyOr } = useDisplayConversion(() => portfolioCcy.value)
const chartCcy = computed(() => displayCurrencyOr() ?? undefined)

const chartSeries = computed(() => {
  const rate = chartRate.value ?? 1
  return (store.analytics?.performance?.timeSeries ?? []).map((p) => ({
    ...p,
    value: (p.value ?? 0) * rate,
    invested: p.invested != null ? p.invested * rate : null,
  }))
})

// Benchmark overlays share the portfolio base currency — same rate.
const chartBenchmarks = computed(() => {
  const rate = chartRate.value ?? 1
  return (store.analytics?.benchmarks ?? []).map((b) => ({
    ...b,
    timeSeries: (b.timeSeries ?? []).map((p) => ({ ...p, value: (p.value ?? 0) * rate })),
  }))
})
</script>

<template>
  <div class="space-y-6">
    <div class="card p-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">Performance Chart: {{ chartCcy }}</h2>
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="tf in timeframes"
            :key="tf.value"
            type="button"
            class="btn-secondary text-xs"
            :class="store.analyticsTimeframe === tf.value ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
            :aria-pressed="store.analyticsTimeframe === tf.value"
            :disabled="store.analyticsLoading"
            @click="changeTimeframe(tf.value)"
          >
            {{ tf.label }}
          </button>
          <button type="button" class="btn-secondary text-xs" data-testid="perf-controls-customize" :disabled="store.analyticsLoading" @click="openCustomize">
            Customize
          </button>
        </div>
      </div>
      <PortfolioPerformanceChart
        :time-series="chartSeries"
        :benchmarks="chartBenchmarks"
        :currency="chartCcy"
        :backfill-pending="backfillPending || recomputeBusy"
        :recomputing="recomputeBusy || backfillPending"
        :gap-symbols="store.analytics?.gapSymbols ?? null"
        :loading="store.analyticsLoading"
        :height="300"
        @recompute="handleRecompute"
      />
    </div>

    <div class="card p-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">Drawdown</h2>
        <button type="button" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline" @click="showCustomTimeframe = !showCustomTimeframe">
          {{ showCustomTimeframe ? "Hide custom timeframe" : "Add custom timeframe" }}
        </button>
      </div>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Max Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">{{ formatPercent(maxDrawdownPercent, 2, true) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Current Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">{{ formatPercent(currentDrawdownPercent, 2, true) }}</dd>
        </div>
      </dl>
      <p v-if="showCustomTimeframe" class="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Custom timeframe support is coming soon. Pick one of the built-in ranges above instead.
      </p>
    </div>

    <div class="card p-6">
      <h2 class="mb-3 text-base font-semibold">Returns Chart</h2>
      <component :is="'apexchart'" v-if="monthlySeries[0].data.length" :options="monthlyOptions" :series="monthlySeries" height="220" />
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">No monthly data available.</p>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Top Performers</h2>
        <p v-if="!performers.top.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.top" :key="p.id" class="flex items-center justify-between py-2 text-sm">
            <div>
              <span class="font-medium text-slate-900 dark:text-slate-100">{{ p.symbol }}</span>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ p.companyName }}</p>
            </div>
            <div class="text-right">
              <p class="font-medium tabular-nums" :class="gainClass(p.unrealizedGainLoss)">{{ formatSignedCurrency(p.unrealizedGainLoss, p.instrumentCurrency) }}</p>
              <p class="text-xs tabular-nums" :class="gainClass(p.percentageChange)">
                <span v-if="convertedPnl(p) != null" class="opacity-70">{{ formatSignedCurrency(convertedPnl(p), displayCurrency) }}&nbsp;</span>
                {{ formatPercent(p.percentageChange) }}
              </p>
            </div>
          </li>
        </ul>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Bottom Performers</h2>
        <p v-if="!performers.bottom.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.bottom" :key="p.id" class="flex items-center justify-between py-2 text-sm">
            <div>
              <span class="font-medium text-slate-900 dark:text-slate-100">{{ p.symbol }}</span>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ p.companyName }}</p>
            </div>
            <div class="text-right">
              <p class="font-medium tabular-nums" :class="gainClass(p.unrealizedGainLoss)">{{ formatSignedCurrency(p.unrealizedGainLoss, p.instrumentCurrency) }}</p>
              <p class="text-xs tabular-nums" :class="gainClass(p.percentageChange)">
                <span v-if="convertedPnl(p) != null" class="opacity-70">{{ formatSignedCurrency(convertedPnl(p), displayCurrency) }}&nbsp;</span>
                {{ formatPercent(p.percentageChange) }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <div v-if="customizeOpen" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" @click.self="closeCustomize">
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Chart controls">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Chart controls</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="closeCustomize">✕</button>
      </div>

      <div class="space-y-5">
        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Benchmarks</p>
            <button
              type="button"
              class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              data-testid="perf-controls-add-benchmark"
              @click="showAddBenchmark = true"
            >
              Add Custom
            </button>
          </div>
          <div class="space-y-2">
            <label v-for="opt in benchmarkOptions" :key="opt.symbol" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                :checked="draftBenchmarks.includes(opt.symbol)"
                @change="toggleDraftBenchmark(opt.symbol)"
              />
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ opt.name }}</span>
              <span class="ml-auto text-xs text-slate-400">{{ opt.symbol }}</span>
            </label>
          </div>
          <div v-if="customDraftBenchmarks.length" class="mt-2 space-y-1">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Custom</p>
            <div v-for="sym in customDraftBenchmarks" :key="sym" class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ sym }}</span>
              <button type="button" class="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" aria-label="Remove benchmark" @click="removeDraftBenchmark(sym)">Remove</button>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="perf-controls-benchmarks">
            Selected: {{ draftBenchmarks.length ? draftBenchmarks.join(", ") : "None" }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Positions</p>
          <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
            {{ store.positions.length ? `${store.positions.length} selected` : "All selected" }}
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="closeCustomize">Cancel</button>
        <button type="button" class="btn-primary" @click="applyCustomize">Apply</button>
      </div>
    </div>
  </div>

  <InstrumentSearchModal :open="showAddBenchmark" mode="add" title="Add Custom Benchmark" @close="showAddBenchmark = false" @add="addBenchmark" />
</template>
