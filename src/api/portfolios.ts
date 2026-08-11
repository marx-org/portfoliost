import { http } from "./client"
import type {
  PortfolioAnalytics1Y,
  PortfolioDetail,
  PortfolioPositions,
  PortfolioSummaryMetrics,
  PortfoliosSummaries,
  PortfoliosTotalMetrics,
  PortfolioTransactionsPage,
  PortfoliosTransactions,
} from "./types"

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

export type PortfolioAnalyticsTimeframe = "6M" | "1Y" | "2Y" | "ALL"

export async function getPortfolios(): Promise<PortfoliosSummaries> {
  return http.get<PortfoliosSummaries>("/api/portfolios")
}

export async function getPortfolioTotalMetrics(): Promise<PortfoliosTotalMetrics> {
  return http.get<PortfoliosTotalMetrics>("/api/portfolios/total-metrics")
}

export async function getPortfolioDetail(id: string): Promise<PortfolioDetail> {
  return http.get<PortfolioDetail>(`/api/portfolios/${id}`)
}

export async function getPortfolioSummaryMetrics(id: string): Promise<PortfolioSummaryMetrics> {
  return http.get<PortfolioSummaryMetrics>(`/api/portfolios/${id}/summary-metrics`)
}

export async function getPortfolioPositions(id: string): Promise<PortfolioPositions> {
  return http.get<PortfolioPositions>(`/api/portfolios/${id}/positions`)
}

export async function getPortfolioAnalytics(id: string, timeframe: PortfolioAnalyticsTimeframe = "1Y"): Promise<PortfolioAnalytics1Y> {
  return http.get<PortfolioAnalytics1Y>(`/api/portfolios/${id}/analytics?timeframe=${timeframe}`)
}

export async function getPortfolioTransactions(
  id: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<PortfolioTransactionsPage["items"][number]>> {
  return http.get<PaginatedResponse<PortfolioTransactionsPage["items"][number]>>(
    `/api/portfolios/${id}/transactions?page=${page}&limit=${limit}`,
  )
}

export async function getAllTransactions(page = 1, limit = 20): Promise<PortfoliosTransactions> {
  return http.get<PortfoliosTransactions>(`/api/portfolios/transactions?page=${page}&limit=${limit}`)
}

export async function createPortfolio(input: {
  name: string
  description?: string
  strategy?: string
  currency?: string
  isPublic?: boolean
}): Promise<PortfolioDetail> {
  return http.post<PortfolioDetail>("/api/portfolios", input)
}

export async function deletePortfolio(id: string): Promise<void> {
  return http.delete<void>(`/api/portfolios/${id}`)
}
