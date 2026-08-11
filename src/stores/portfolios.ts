import { defineStore } from "pinia"
import { ref } from "vue"
import { http } from "@/api/client"
import type { PortfoliosSummaries, PortfoliosTotalMetrics } from "@/api/types"

export const usePortfolioStore = defineStore("portfolios", () => {
  const portfolios = ref<PortfoliosSummaries>([])
  const totalMetrics = ref<PortfoliosTotalMetrics | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [list, metrics] = await Promise.all([
        http.get<PortfoliosSummaries>("/api/portfolios"),
        http.get<PortfoliosTotalMetrics>("/api/portfolios/total-metrics"),
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

  return { portfolios, totalMetrics, loading, error, fetchAll }
})
