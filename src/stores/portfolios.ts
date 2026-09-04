import { defineStore } from "pinia"
import { ref } from "vue"
import * as portfoliosApi from "@/api/portfolios"
import type { PortfolioAnalytics, PortfolioDetail, PortfolioPositions, PortfolioSummaryMetrics, PortfoliosSummaries, PortfoliosTotalMetrics } from "@/api/types"

export const usePortfolioStore = defineStore("portfolios", () => {
  const portfolios = ref<PortfoliosSummaries>([])
  const totalMetrics = ref<PortfoliosTotalMetrics | null>(null)
  const detail = ref<PortfolioDetail | null>(null)
  const summaryMetrics = ref<PortfolioSummaryMetrics | null>(null)
  const positions = ref<PortfolioPositions>([])
  const analytics = ref<PortfolioAnalytics | null>(null)
  const analyticsTimeframe = ref<portfoliosApi.PortfolioAnalyticsTimeframe>("1Y")
  const analyticsBenchmarks = ref<string[]>(["SPY"])
  const analyticsReturnType = ref<portfoliosApi.PortfolioBenchmarkCalcType>("timeWeighted")
  const loading = ref(false)
  const analyticsLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [list, metrics] = await Promise.all([
        portfoliosApi.getPortfolios(),
        portfoliosApi.getPortfolioTotalMetrics(),
      ])
      portfolios.value = list
      totalMetrics.value = metrics
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load portfolios"
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [detailData, metrics, positionsData, analyticsData] = await Promise.all([
        portfoliosApi.getPortfolioDetail(id),
        portfoliosApi.getPortfolioSummaryMetrics(id),
        portfoliosApi.getPortfolioPositions(id),
        portfoliosApi.getPortfolioAnalytics(id, analyticsTimeframe.value, analyticsBenchmarks.value, analyticsReturnType.value),
      ])
      detail.value = detailData
      summaryMetrics.value = metrics
      positions.value = positionsData
      analytics.value = analyticsData
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load portfolio"
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchPositions(id: string): Promise<void> {
    try {
      positions.value = await portfoliosApi.getPortfolioPositions(id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load positions"
      throw err
    }
  }

  async function setTimeframe(timeframe: portfoliosApi.PortfolioAnalyticsTimeframe, id: string): Promise<void> {
    analyticsTimeframe.value = timeframe
    analyticsLoading.value = true
    try {
      analytics.value = await portfoliosApi.getPortfolioAnalytics(id, timeframe, analyticsBenchmarks.value, analyticsReturnType.value)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load analytics"
    } finally {
      analyticsLoading.value = false
    }
  }

  async function setBenchmarks(benchmarks: string[], id: string): Promise<void> {
    analyticsBenchmarks.value = [...benchmarks]
    analyticsLoading.value = true
    try {
      analytics.value = await portfoliosApi.getPortfolioAnalytics(id, analyticsTimeframe.value, benchmarks, analyticsReturnType.value)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load analytics"
    } finally {
      analyticsLoading.value = false
    }
  }

  async function setReturnType(calcType: portfoliosApi.PortfolioBenchmarkCalcType, id: string): Promise<void> {
    analyticsReturnType.value = calcType
    analyticsLoading.value = true
    try {
      analytics.value = await portfoliosApi.getPortfolioAnalytics(id, analyticsTimeframe.value, analyticsBenchmarks.value, calcType)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load analytics"
    } finally {
      analyticsLoading.value = false
    }
  }

  async function createPortfolio(input: { name: string; description?: string; strategy?: string; currency?: string; walletId?: string }): Promise<void> {
    await portfoliosApi.createPortfolio(input)
    await fetchAll()
  }

  function reset(): void {
    portfolios.value = []
    totalMetrics.value = null
    detail.value = null
    summaryMetrics.value = null
    positions.value = []
    analytics.value = null
    error.value = null
  }

  return {
    portfolios,
    totalMetrics,
    detail,
    summaryMetrics,
    positions,
    analytics,
    analyticsTimeframe,
    analyticsBenchmarks,
    analyticsReturnType,
    loading,
    analyticsLoading,
    error,
    fetchAll,
    fetchDetail,
    fetchPositions,
    setTimeframe,
    setBenchmarks,
    setReturnType,
    createPortfolio,
    reset,
  }
})
