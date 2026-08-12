import { http } from "./client"
import type {
  PortfolioAllocation,
  PortfolioAnalytics1Y,
  PortfolioCalendar,
  PortfolioCompare,
  PortfolioDetail,
  PortfolioDividends,
  PortfolioNews,
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

export interface CreatePortfolioPositionInput {
  symbol: string
  quantity: number
  price?: number
  averageCostBasis?: number
  assetType?: string
  contractSize?: number
  direction?: string
  optionType?: string
  strikePrice?: number
  expirationDate?: string
  openedAt?: string
}

export async function createPortfolioPosition(
  id: string,
  input: CreatePortfolioPositionInput,
): Promise<PortfolioPositions[number]> {
  return http.post<PortfolioPositions[number]>(`/api/portfolios/${id}/positions`, input)
}

export async function updatePortfolioPosition(
  id: string,
  positionId: string,
  input: Partial<PortfolioPositions[number]>,
): Promise<PortfolioPositions[number]> {
  return http.patch<PortfolioPositions[number]>(`/api/portfolios/${id}/positions/${positionId}`, input)
}

export async function removePortfolioPosition(id: string, positionId: string): Promise<PortfolioPositions[number]> {
  return http.delete<PortfolioPositions[number]>(`/api/portfolios/${id}/positions/${positionId}`)
}

export async function createPortfolioTransaction(
  id: string,
  input: { type: string; symbol: string; quantity: number; price: number; currency?: string },
): Promise<PortfolioTransactionsPage["items"][number]> {
  return http.post<PortfolioTransactionsPage["items"][number]>(`/api/portfolios/${id}/transactions`, input)
}

export async function updatePortfolioTransaction(
  id: string,
  txId: string,
  input: Partial<PortfolioTransactionsPage["items"][number]>,
): Promise<PortfolioTransactionsPage["items"][number]> {
  return http.patch<PortfolioTransactionsPage["items"][number]>(`/api/portfolios/${id}/transactions/${txId}`, input)
}

export async function deletePortfolioTransaction(id: string, txId: string): Promise<void> {
  return http.delete<void>(`/api/portfolios/${id}/transactions/${txId}`)
}

export async function getPortfolioAnalytics(id: string, timeframe: PortfolioAnalyticsTimeframe = "1Y"): Promise<PortfolioAnalytics1Y> {
  return http.get<PortfolioAnalytics1Y>(`/api/portfolios/${id}/analytics?timeframe=${timeframe}`)
}

export async function getPortfolioTransactions(
  id: string,
  page = 1,
  limit = 20,
  positionId?: string,
): Promise<PaginatedResponse<PortfolioTransactionsPage["items"][number]>> {
  const position = positionId ? `&positionId=${encodeURIComponent(positionId)}` : ""
  return http.get<PaginatedResponse<PortfolioTransactionsPage["items"][number]>>(
    `/api/portfolios/${id}/transactions?page=${page}&limit=${limit}${position}`,
  )
}

export async function getPortfolioAllocation(id: string): Promise<PortfolioAllocation> {
  return http.get<PortfolioAllocation>(`/api/portfolios/${id}/allocation`)
}

export async function getPortfolioDividends(id: string): Promise<PortfolioDividends> {
  return http.get<PortfolioDividends>(`/api/portfolios/${id}/dividends`)
}

export async function getPortfolioCalendar(id: string): Promise<PortfolioCalendar> {
  return http.get<PortfolioCalendar>(`/api/portfolios/${id}/calendar`)
}

export async function getPortfolioNews(id: string): Promise<PortfolioNews> {
  return http.get<PortfolioNews>(`/api/portfolios/${id}/news`)
}

export async function getPortfolioCompare(id: string): Promise<PortfolioCompare> {
  return http.get<PortfolioCompare>(`/api/portfolios/${id}/compare`)
}

export async function getPortfolioRiskMetrics(id: string): Promise<unknown> {
  return http.get<unknown>(`/api/portfolios/${id}/risk-metrics`)
}

export async function getAllTransactions(
  page = 1,
  limit = 10,
  sortBy = "date",
  sortOrder: "asc" | "desc" = "desc",
): Promise<PortfoliosTransactions> {
  return http.get<PortfoliosTransactions>(
    `/api/portfolios/transactions?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
  )
}

export async function createPortfolio(input: {
  name: string
  description?: string
  strategy?: string
  currency?: string
  isPublic?: boolean
  walletId?: string
}): Promise<PortfolioDetail> {
  return http.post<PortfolioDetail>("/api/portfolios", input)
}

export async function updatePortfolio(id: string, input: Partial<PortfolioDetail>): Promise<PortfolioDetail> {
  return http.patch<PortfolioDetail>(`/api/portfolios/${id}`, input)
}

export async function deletePortfolio(id: string): Promise<void> {
  return http.delete<void>(`/api/portfolios/${id}`)
}

export interface PortfolioShare {
  id: string
  portfolioId: string
  portfolioName: string
  displayName: string
  createdAt: string
  expiresAt: string | null
  viewCount: number
  privacySettings: {
    showValues: boolean
    showHoldings: boolean
    showPositions: boolean
    showPerformanceChart: boolean
    showTransactionHistory: boolean
    showAssetAllocation: boolean
    showSectorDistribution: boolean
    showGeographicBreakdown: boolean
    showIndustryDistribution: boolean
    performanceChartReturnType: string
    [key: string]: unknown
  }
}

export async function getPortfolioShares(): Promise<PortfolioShare[]> {
  return http.get<PortfolioShare[]>("/api/portfolios/shares")
}

export async function createPortfolioShare(input: {
  portfolioId: string
  displayName?: string
}): Promise<PortfolioShare> {
  return http.post<PortfolioShare>("/api/portfolios/shares", input)
}

export async function deletePortfolioShare(id: string): Promise<void> {
  return http.delete<void>(`/api/portfolios/shares/${id}`)
}

export interface PublicPortfolioShare {
  share: PortfolioShare
  portfolio: {
    id: string
    name: string
    strategy: string
    positions: Array<{ symbol: string; quantity: number; marketValue: number; currentPrice: number }>
  }
}

export async function getPublicPortfolioShare(shareId: string): Promise<PublicPortfolioShare> {
  return http.get<PublicPortfolioShare>(`/api/public/portfolios/${shareId}`)
}
