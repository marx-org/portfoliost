<script setup lang="ts">
/**
 * §83.6 — the cumulative (all-portfolios) Performance tab.
 *
 * Owns exactly what `PortfolioPerformanceTab.vue` owns for one portfolio: the
 * fetch, the timeframe, the display-currency conversion, the recompute fan-out
 * and the backfill poll. Everything visual is `PerformanceTabContent`, which is
 * the same component the per-portfolio tab mounts — so this page is not a second
 * performance screen, it is the same screen pointed at `/merged`.
 *
 * The one thing it cannot share is the TIMEFRAME state: `store.analyticsTimeframe`
 * is per-portfolio, and this view has no portfolio. Hence the local ref and the
 * `update:timeframe` emit.
 */
import { computed, onMounted, onUnmounted, ref } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"
import {
  getAllPositions,
  getMergedAnalytics,
  recomputePortfolio,
  type PortfolioAnalyticsTimeframe,
} from "@/api/portfolios"
import type { PortfolioAnalytics, PortfolioPositions } from "@/api/types"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import PerformanceTabContent from "@/components/PerformanceTabContent.vue"

const store = usePortfolioStore()

const analytics = ref<PortfolioAnalytics | null>(null)
const positions = ref<PortfolioPositions>([])
const timeframe = ref<PortfolioAnalyticsTimeframe>("ALL")
const selectedBenchmarks = ref<string[]>([])
const loading = ref(true)
const backfillPending = ref(false)
const busy = ref(false)

// §83.4 — `/merged` returns the Risk-tab numbers ON `performance`, so there is no
// second request here and no `/merged/risk-metrics` route. `PerformanceTabContent`
// still takes the same `riskMetrics` prop the per-portfolio wrapper fills from
// `/:id/risk-metrics`; on this tab it is read off the analytics payload instead.
//
// Only `maxDrawdown` crosses: the Drawdown card is the ONE risk number that
// travels (per D89, risk ratios stay on the Risk tab, and the aggregate has no
// Risk tab). Copying sharpe/sortino/calmar/volatility/winRate into this object
// would advertise a second transport for numbers nothing renders.
const riskFromAnalytics = computed(() => {
  const dd = analytics.value?.performance?.maxDrawdown
  return dd == null ? null : { maxDrawdown: dd }
})

let reqSeq = 0
async function refetch() {
  const seq = ++reqSeq
  loading.value = true
  try {
    const data = await getMergedAnalytics(timeframe.value, selectedBenchmarks.value)
    if (seq !== reqSeq) return // a stale response for an older timeframe — drop it
    analytics.value = data
    backfillPending.value = false
  } catch {
    if (seq !== reqSeq) return
    analytics.value = null
    backfillPending.value = false
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollDeadline = 0

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPolling() {
  stopPolling()
  pollDeadline = Date.now() + 5 * 60 * 1000
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) {
      stopPolling()
      return
    }
    try {
      const data = await getMergedAnalytics(timeframe.value, selectedBenchmarks.value)
      if (data.backfillStatus !== "pending") {
        analytics.value = data
        backfillPending.value = false
        stopPolling()
      }
    } catch {
      stopPolling()
    }
  }, 5000)
}

async function changeTimeframe(next: PortfolioAnalyticsTimeframe) {
  if (next === timeframe.value || loading.value) return
  timeframe.value = next
  await refetch()
  if (analytics.value?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  }
}

/**
 * Ten portfolios is ten writes from one button click. The behaviour is kept —
 * it is what the user asked for by clicking it — but the count goes in the label
 * so the cost is visible BEFORE it is paid, not discovered afterwards.
 */
async function handleRecompute() {
  if (busy.value) return
  busy.value = true
  backfillPending.value = true
  try {
    await Promise.all(store.portfolios.map((p) => recomputePortfolio(p.id)))
    await refetch()
    startPolling()
  } catch {
    // network error — stay idle; the user can retry
  } finally {
    busy.value = false
  }
}

async function changeBenchmarks(syms: string[]) {
  selectedBenchmarks.value = syms
  await refetch()
}

onMounted(async () => {
  // The performer cards need the cross-portfolio list (`/api/portfolios/positions`),
  // NOT `/held-stocks`, which aggregates by symbol and so cannot say which
  // portfolio a row came from. A failure here degrades two cards, not the page.
  void getAllPositions()
    .then((p) => {
      positions.value = p
    })
    .catch(() => {
      positions.value = []
    })
  // The aggregate base is what `analytics.performance` is denominated in, and
  // `/merged` does not report it (it is `total-metrics.baseCurrency`). This view
  // must therefore load it ITSELF: reading `store.totalMetrics` alone works only
  // when the user arrived from the Investments page, and on a hard reload of this
  // URL it is null — which is §67.2's bug exactly, native values plotted under
  // whatever the display currency happens to be.
  // `store.load()` (fetchAll) loads the list AND total-metrics together, so this
  // covers both needs above — it is the same call `InvestmentsView` makes.
  if (!store.portfolios.length || !store.totalMetrics) {
    void store.fetchAll().catch(() => {
      /* the recompute button's count degrades to 0; nothing else needs it */
    })
  }
  if (store.analytics?.backfillStatus === "pending") backfillPending.value = true
  await refetch()
  if (analytics.value?.backfillStatus === "pending") startPolling()
})

onUnmounted(() => stopPolling())
</script>

<template>
  <div>
    <InvestmentsTabs />

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">Cumulative performance</h1>
      <button
        type="button"
        class="btn-secondary text-xs"
        data-testid="total-perf-recompute"
        :disabled="busy || loading"
        @click="handleRecompute"
      >
        {{ busy ? "Recomputing…" : `Recompute all ${store.portfolios.length} portfolios` }}
      </button>
    </div>

    <PerformanceTabContent
      :analytics="analytics"
      :risk-metrics="riskFromAnalytics"
      :positions="positions"
      :base-currency="store.totalMetrics?.baseCurrency ?? ''"
      :selected-benchmarks="selectedBenchmarks"
      :timeframe="timeframe"
      :loading="loading"
      :backfill-pending="backfillPending"
      :recomputing="busy"
      testid="total"
      :fx-caveat="true"
      @update:timeframe="changeTimeframe"
      @update:selected-benchmarks="changeBenchmarks"
      @recompute="handleRecompute"
    />
  </div>
</template>