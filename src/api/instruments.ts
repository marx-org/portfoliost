import { http } from "./client"
import type { components } from "../../generated/api-types"
import type { ResearchPeers } from "./types"

type InstrumentsDetail = components["schemas"]["InstrumentDetail"]
type InstrumentsMetrics = components["schemas"]["InstrumentMetrics"]
type InstrumentsOverviewMetrics = components["schemas"]["InstrumentOverviewMetrics"]
type InstrumentsProfile = components["schemas"]["InstrumentProfile"]
type HistoryDaily = components["schemas"]["PriceHistory"]
type QuoteAapl = components["schemas"]["Quote"]
type IrEventsAapl = components["schemas"]["InvestorRelationEvent"][]

export interface InstrumentSearchResult {
  symbol: string
  name: string
  type: string
  exchange: string
  countryCode: string | null
  source: string
}

export interface InstrumentSearchResponse {
  count: number
  results: InstrumentSearchResult[]
}

export async function searchInstruments(query: string): Promise<InstrumentSearchResponse> {
  const q = new URLSearchParams({ q: query })
  return http.get<InstrumentSearchResponse>(`/api/instruments/search?${q}`)
}

export async function getInstrumentDetail(symbol: string): Promise<InstrumentsDetail> {
  return http.get<InstrumentsDetail>(`/api/instruments/${symbol}`)
}

export async function getInstrumentProfile(symbol: string): Promise<InstrumentsProfile> {
  return http.get<InstrumentsProfile>(`/api/instruments/${symbol}/profile`)
}

export async function getInstrumentMetrics(symbol: string): Promise<InstrumentsMetrics> {
  return http.get<InstrumentsMetrics>(`/api/instruments/${symbol}/metrics`)
}

export async function getInstrumentOverviewMetrics(symbol: string): Promise<InstrumentsOverviewMetrics> {
  return http.get<InstrumentsOverviewMetrics>(`/api/instruments/${symbol}/overview-metrics`)
}

export async function getQuote(symbol: string): Promise<QuoteAapl> {
  return http.get<QuoteAapl>(`/api/instruments/${symbol}/quote`)
}

export interface HistoryCompareSeries {
  name: string
  closePrices: number[]
  timestamps: number[]
}

export async function getHistoricalClose(symbol: string, date: string): Promise<number | null> {
  try {
    const res = await http.get<{ price: number | null }>(`/api/instruments/${symbol}/price?date=${date}`)
    return res.price ?? null
  } catch {
    return null
  }
}

export async function getHistory(
  symbol: string,
  resolution: "daily" | "monthly" = "daily",
  compare?: "spy" | "qqq" | "iwm",
): Promise<HistoryDaily & { compare?: HistoryCompareSeries }> {
  const q = new URLSearchParams({ resolution })
  if (compare) q.set("compare", compare)
  return http.get<HistoryDaily & { compare?: HistoryCompareSeries }>(`/api/instruments/${symbol}/history?${q}`)
}

export async function getEpsSurprises(symbol: string): Promise<unknown> {
  return http.get<unknown>(`/api/instruments/${symbol}/eps-surprises`)
}

export async function getInstrumentFundamentals(symbol: string): Promise<components["schemas"]["FundamentalsData"]> {
  return http.get<components["schemas"]["FundamentalsData"]>(`/api/instruments/${symbol}/fundamentals`)
}

export async function getInstrumentOwnership(symbol: string): Promise<components["schemas"]["OwnershipData"]> {
  return http.get<components["schemas"]["OwnershipData"]>(`/api/instruments/${symbol}/ownership`)
}

export async function getInstrumentDividends(symbol: string): Promise<components["schemas"]["DividendsData"]> {
  return http.get<components["schemas"]["DividendsData"]>(`/api/instruments/${symbol}/dividends`)
}

export async function getInstrumentCalendar(symbol: string): Promise<components["schemas"]["CalendarData"]> {
  return http.get<components["schemas"]["CalendarData"]>(`/api/instruments/${symbol}/calendar`)
}

export async function getInstrumentCompare(symbol: string): Promise<components["schemas"]["ResearchCompare"]> {
  return http.get<components["schemas"]["ResearchCompare"]>(`/api/instruments/${symbol}/compare`)
}

export async function getInstrumentPeers(symbol: string): Promise<ResearchPeers> {
  return http.get<ResearchPeers>(`/api/instruments/${symbol}/peers`)
}

export async function getInstrumentSeasonality(
  symbol: string,
  years = 5,
  metric = "avg",
): Promise<components["schemas"]["SeasonalityData"]> {
  const q = new URLSearchParams({ years: String(years), metric })
  return http.get<components["schemas"]["SeasonalityData"]>(`/api/instruments/${symbol}/seasonality?${q}`)
}

export async function getProjections(symbol: string): Promise<unknown> {
  return http.get<unknown>(`/api/instruments/${symbol}/projections`)
}

export async function getInvestorRelations(symbol: string): Promise<IrEventsAapl> {
  return http.get<IrEventsAapl>(`/api/instruments/${symbol}/investor-relations`)
}

type IRTranscript = components["schemas"]["IRTranscript"]

export async function getTranscript(symbol: string, eventId: string): Promise<IRTranscript> {
  return http.get<IRTranscript>(`/api/instruments/${symbol}/investor-relations/${eventId}/transcript`)
}

export interface NewsPageResponse {
  data: NewsArticle[]
  pagination: {
    count: number
    total_count: number
    has_next_page: boolean
    has_previous_page: boolean
    next_cursor: string | null
    previous_cursor: string | null
  }
}

export interface NewsArticle {
  id: string
  type: string
  metadata?: { source?: string; article_type?: string }
  ticker?: string
  content?: Record<string, unknown>
  article?: {
    title?: string
    url?: string
    source?: string
    description?: string
    image?: string
    published_at?: string
  }
  published_at: string
  sentiment?: string
  market?: unknown
}

export async function getTickerNews(symbol: string): Promise<NewsPageResponse> {
  return http.get<NewsPageResponse>(`/api/news/articles?ticker=${encodeURIComponent(symbol)}`)
}

export async function getAllNews(): Promise<NewsPageResponse> {
  return http.get<NewsPageResponse>(`/api/news/articles`)
}

export interface NewsStats {
  error: string | null
  data: {
    active: boolean
    id: string
    name: string
    type: string
    ticker: string
    inserted_at: string
    article_count: number
    last_fetched_at: string
    total_article_count: number
    total_analyzed_article_count: number
  }
}

export async function getNewsStats(ticker: string): Promise<NewsStats> {
  const q = new URLSearchParams({ ticker })
  return http.get<NewsStats>(`/api/news/stats?${q}`)
}
