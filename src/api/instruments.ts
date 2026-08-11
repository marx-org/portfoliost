import { http } from "./client"
import type {
  HistoryDaily,
  InstrumentsDetail,
  InstrumentsMetrics,
  InstrumentsOverviewMetrics,
  InstrumentsProfile,
  IrEventsAapl,
  QuoteAapl,
} from "./types"

export interface InstrumentSearchResult {
  symbol: string
  name: string
  type: string
  exchange: string
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

export async function getHistory(symbol: string, resolution: "daily" | "monthly" = "daily"): Promise<HistoryDaily> {
  return http.get<HistoryDaily>(`/api/instruments/${symbol}/history?resolution=${resolution}`)
}

export async function getEpsSurprises(symbol: string): Promise<unknown> {
  return http.get<unknown>(`/api/instruments/${symbol}/eps-surprises`)
}

export async function getProjections(symbol: string): Promise<unknown> {
  return http.get<unknown>(`/api/instruments/${symbol}/projections`)
}

export async function getInvestorRelations(symbol: string): Promise<IrEventsAapl> {
  return http.get<IrEventsAapl>(`/api/instruments/${symbol}/investor-relations`)
}

export async function getTranscript(symbol: string, eventId: string): Promise<unknown> {
  return http.get<unknown>(`/api/instruments/${symbol}/investor-relations/${eventId}/transcript`)
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
