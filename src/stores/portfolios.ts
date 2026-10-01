import { defineStore } from "pinia"
import { computed, ref } from "vue"
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

  async function fetchPositions(id: string, labelIds?: string[]): Promise<void> {
    try {
      positions.value = await portfoliosApi.getPortfolioPositions(id, labelIds)
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

  // The benchmark overlay is computed server-side with the selected calculation
  // type, so changing the return type must refetch analytics (D50).
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

  async function createPortfolio(input: { name: string; description?: string; strategy?: string; currency?: string }): Promise<void> {
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

/**
 * §70.2 — per-portfolio price completeness/freshness, joined from the aggregate
 * `/total-metrics` breakdown.
 *
 * The breakdown already carries `unpricedPositions` / `priceAsOf` / `priceSource`
 * per portfolio (contracts v1.6.49), and it is fetched for the header anyway, so
 * the cards get this for free rather than each card issuing its own request.
 */
export function usePortfolioFreshness() {
  const store = usePortfolioStore()
  // Read `store.totalMetrics` INSIDE the computed. A Pinia setup store unwraps
  // refs on the instance, so `usePortfolioStore().totalMetrics` captured here
  // would be a one-time snapshot (null at setup) and the map would stay empty
  // forever — reading through the reactive proxy inside the computed is what
  // keeps it live.
  return computed(() => {
    const map = new Map<string, { unpriced: number; priceAsOf: string | null; fallback: boolean }>()
    for (const row of store.totalMetrics?.portfolioBreakdown ?? []) {
      map.set(row.id, {
        unpriced: row.unpricedPositions ?? 0,
        priceAsOf: row.priceAsOf ?? null,
        fallback: row.priceSource === "fallback",
      })
    }
    return map
  })
}

/**
 * §63.3 — the per-portfolio value a card must render, taken from the SAME
 * `/total-metrics` breakdown the headline is summed from.
 *
 * **Why the card cannot keep reading `portfolio.currentValue`.** That column is
 * written by the backfill from `value_snapshots` (bars), while the headline is
 * computed live from `positions.market_value` (quotes). They are two different
 * price sources for one number, so adding up the cards could never equal the
 * headline — measured in PROD 2026-10-01, the ten cards summed to 1,094,279.02
 * against a headline of 1,096,223.87, a 1,944.85 PLN gap on four portfolios
 * (IKE Marek +514.63, IBKR −2,698.17, IKE Beata +26.43, Equate+ +212.26). The
 * other six agreed only because they hold ≤1 instrument, where the two sources
 * happen to coincide.
 *
 * The breakdown row is the headline's own input, so rendering it makes the sum
 * reconcile *by construction* rather than by coincidence — which is what §68
 * intended and what the §63.3 unit test could not see, because the test seeds
 * both paths from the same number.
 *
 * `null` for a portfolio means "the breakdown has no row for it" (e.g. the
 * aggregate failed to resolve a base currency and returned an empty breakdown).
 * The card then falls back to the stored column rather than rendering nothing:
 * a stale number is better than no number, as long as it is not passed off as
 * the reconciled one.
 */
export interface PortfolioCardValue {
  /** The whole account in the AGGREGATE base currency, not the portfolio's own. */
  totalValue: number
  instrumentsValue: number
  cashValue: number
  totalInvested: number
  returnPercentage: number
}

export function usePortfolioValues() {
  const store = usePortfolioStore()
  return computed(() => {
    const map = new Map<string, PortfolioCardValue>()
    for (const row of store.totalMetrics?.portfolioBreakdown ?? []) {
      // §68.4 — the backend's own rule: return = (total − invested) / invested,
      // and 0 rather than a division by zero when nothing was put in. Derived here
      // for the same reason the aggregate derives it: two independent figures for
      // one ratio drift, and `returnPercentage` is optional in the contract, so
      // reading it alone would leave the card blank on a response that omits it.
      const invested = row.totalInvested
      const gain = row.totalValue - invested
      map.set(row.id, {
        totalValue: row.totalValue,
        instrumentsValue: row.instrumentsValue,
        cashValue: row.cashValue,
        totalInvested: invested,
        returnPercentage: row.returnPercentage ?? (invested > 0 ? (gain / invested) * 100 : 0),
      })
    }
    return map
  })
}

