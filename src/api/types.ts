export type * from "../../generated/api-types"

export interface AuthUser {
  id: string
  email: string
  language: string
  role: string
  isDemoUser: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

export interface AllocationSlice {
  name: string
  value: number
}

export interface PortfolioAllocation {
  totalValue: number
  bySector: AllocationSlice[]
  byAssetType: AllocationSlice[]
  byCurrency: AllocationSlice[]
}

export interface PortfolioDividendRow {
  symbol: string
  companyName: string
  date: string
  year: number
  amount: number
  currency: string
  type: string
}

export interface PortfolioDividends {
  totalDividends: number
  count: number
  items: PortfolioDividendRow[]
}

export interface PortfolioCalendarEvent {
  symbol: string
  companyName: string
  type: "earnings" | "exDividend" | "dividend"
  date: string
  title: string
  amount: number | null
  quarter: number | null
}

export interface PortfolioCalendar {
  upcoming: PortfolioCalendarEvent[]
  past: PortfolioCalendarEvent[]
  total: number
}

export interface PortfolioNews {
  data: Array<{
    id: string
    ticker: string
    article: { title: string; url: string }
    published_at: string
    sentiment?: { score: number; tone: string; confidence: string }
  }>
  total: number
}

export interface PortfolioCompareRow {
  symbol: string
  name: string
  quantity: number
  marketValue: number
  weight: number
  [key: string]: unknown
}

export interface PortfolioCompare {
  totalValue: number
  items: PortfolioCompareRow[]
}
