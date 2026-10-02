<script setup lang="ts">
// §83.1 — the route wrapper. Everything below is what the tab cannot know: which
// portfolio it is, where the payload comes from, and when to re-fetch.
//
// The tab body itself is `components/PerformanceTabContent.vue`, mounted here for
// one portfolio and from `TotalPerformanceView.vue` for the whole account. This
// file keeps the §36/§48.6e state machine unchanged — timeframe fetch, 5s backfill
// poll, recompute — so the refactor is a move, not a rewrite.
import { onMounted, onUnmounted, ref } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioAnalytics, getPortfolioRiskMetrics, recomputePortfolio } from "@/api/portfolios"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import PerformanceTabContent from "@/components/PerformanceTabContent.vue"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const riskMetrics = ref<Record<string, number | null> | null>(null)
const backfillPending = ref(store.analytics?.backfillStatus === "pending")
const recomputeBusy = ref(false)

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
</script>

<template>
  <PerformanceTabContent
    :analytics="store.analytics"
    :risk-metrics="riskMetrics"
    :positions="store.positions"
    :base-currency="store.detail?.baseCurrency ?? ''"
    :selected-benchmarks="store.analyticsBenchmarks"
    :timeframe="store.analyticsTimeframe"
    :loading="store.analyticsLoading"
    :backfill-pending="backfillPending"
    :recomputing="recomputeBusy"
    @update:timeframe="changeTimeframe"
    @update:selected-benchmarks="(syms) => store.setBenchmarks(syms, id)"
    @recompute="handleRecompute"
  />
</template>