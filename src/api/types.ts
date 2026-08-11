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

export interface ResearchSeasonality {
  symbol: string
  years: number
  metric: string
  monthly_returns: { month: string; return_pct: number }[]
}

export interface ResearchFundamentals {
  financialHighlights: {
    incomeStatement: Array<{
      year: number
      revenue: number
      ebit: number
      netIncome: number
      netIncomeGrowth: number | null
      netIncomeMargin: number
      earningsPerShare: number
      earningsPerShareGrowth: number | null
      dilutedSharesOutstanding: number
      ebitda: number
    }>
    balanceSheet: Array<{
      year: number
      totalAssets: number
      totalLiabilities: number
      shareholdersEquity: number
      cash: number
      cashAndShortTermInvestments: number
      totalDebt: number
      netDebt: number
      workingCapital: number
      retainedEarnings: number
      debtEquityRatio: number
    }>
    cashFlow: Array<{
      year: number
      cashFlowFromOperatingActivities: number
      cashFlowFromFinancingActivities: number
      cashFlowFromInvestingActivities: number
      freeCashFlow: number
      freeCashFlowGrowth: number | null
      freeCashFlowPerShare: number
      capitalExpenditures: number
      depreciation: number
      dividendPayment: number
    }>
  }
}

export interface ResearchOwnership {
  institutional: ResearchHolderRow[]
  mutualFund: ResearchHolderRow[]
  insider?: ResearchHolderRow[]
  insiderTransactions?: ResearchInsiderTransaction[]
}

export interface ResearchInsiderTransaction {
  title: string
  transactionDate: string
  transactionCode: string
  transactionText: string
  transactionAmount: number
  transactionValue: number
  filingDate: string
}

export interface ResearchHolderRow {
  date: string
  holdingPercentage: number
  holdersCount: number
  sumOfCurrentPositions: number
  sumOfCurrentPositionsValue: number
}

export interface ResearchDividendRow {
  date: string
  year: number
  amount: number
  currency: string
  type: string
}

export interface ResearchDividends {
  history: ResearchDividendRow[]
}

export interface ResearchCalendar {
  earnings: Array<{ date: string; title?: string; year: number; quarter: number }>
  exDividend: Array<{ date: string; title?: string; year: number; amount: number }>
  dividend: Array<{ date: string; title?: string; year: number; amount: number }>
}

export interface ResearchCompare {
  symbol: string
  name: string
  price: number
  marketCap: number
  peRatio: number
  forwardPe: number
  pbRatio: number
  psRatio: number
  dividendYield: number
  revenueGrowth: number
  netMargin: number
  roe: number
  grossMargin: number
  operatingMargin: number
  evToEbitda: number
  evToSales: number
  fcfMargin: number
  netIncome: number
  revenue: number
  sharesOutstanding: number
  currency: string
}

export interface ResearchPeers {
  symbol: string
  items: ResearchCompare[]
}
