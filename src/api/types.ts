// Auto-generated types from OpenAPI spec (via openapi-typescript)
export type * from "../../generated/api-types"

// Re-export schemas under short names used by API modules and stores
import type { components } from "../../generated/api-types"
export type Schemas = components["schemas"]

// ─── Schema aliases used by stores and components ────────────
export type AuthUser = components["schemas"]["AuthUser"]
export type AuthResponse = components["schemas"]["AuthResponse"]
export type MeResponse = components["schemas"]["MeResponse"]
export type AuthMe = components["schemas"]["MeResponse"]
export type UserProfile = components["schemas"]["UserProfile"]
export type UserPreferences = components["schemas"]["UserPreferences"]
export type BillingPlans = components["schemas"]["BillingPlans"]
export type BillingSubscription = components["schemas"]["BillingSubscription"]
export type BillingEntitlements = components["schemas"]["BillingEntitlements"]

export type Portfolio = components["schemas"]["Portfolio"]
export type PortfolioDetail = components["schemas"]["PortfolioDetail"]
export type PortfolioSummaryMetrics = components["schemas"]["PortfolioSummaryMetrics"]
export type PortfolioAnalytics = components["schemas"]["PortfolioAnalytics"]
export type PortfolioPositions = components["schemas"]["Position"][]
export type PortfoliosSummaries = components["schemas"]["Portfolio"][]
export type PortfoliosTotalMetrics = components["schemas"]["PortfolioTotalMetrics"]
export type PortfolioAllocation = components["schemas"]["PortfolioSnapshot"]["allocation"]
export type PortfolioDividends = components["schemas"]["DividendsData"]
export type PortfolioCalendar = components["schemas"]["CalendarData"]
export type PortfolioNews = components["schemas"]["NewsArticleList"]
export type PortfolioCompare = components["schemas"]["PortfolioSnapshot"]
export type PortfolioTransactionsPage = { items: components["schemas"]["Transaction"][] }
export type PortfoliosTransactions = { items: components["schemas"]["Transaction"][]; total: number; page: number; limit: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }

export type PortfolioCash = components["schemas"]["PortfolioCash"]
export type PortfolioCashHistory = components["schemas"]["PortfolioCashHistory"]
export type PortfolioCashTransactionsPage = components["schemas"]["PageResponse"]
export type CashTransaction = components["schemas"]["CashTransaction"]
export type RecentCashTransaction = components["schemas"]["RecentCashTransaction"]
export type RecentCashTransactionsPage = components["schemas"]["RecentCashTransactionsPage"]
export type DepositCashRequest = components["schemas"]["DepositCashRequest"]
export type WithdrawCashRequest = components["schemas"]["WithdrawCashRequest"]
export type TransferCashRequest = components["schemas"]["TransferCashRequest"]

export type InstrumentDetail = components["schemas"]["InstrumentDetail"]
export type InstrumentMetrics = components["schemas"]["InstrumentMetrics"]
export type InstrumentOverviewMetrics = components["schemas"]["InstrumentOverviewMetrics"]
export type InstrumentProfile = components["schemas"]["InstrumentProfile"]
export type Quote = components["schemas"]["Quote"]
export type QuoteAapl = components["schemas"]["Quote"]
export type PriceHistory = components["schemas"]["PriceHistory"]
export type InstrumentsMetrics = components["schemas"]["InstrumentMetrics"]
export type InstrumentsOverviewMetrics = components["schemas"]["InstrumentOverviewMetrics"]
export type InstrumentsProfile = components["schemas"]["InstrumentProfile"]
export type IrEventsAapl = components["schemas"]["InvestorRelationEvent"][]
export type HoldingGroup = components["schemas"]["HoldingGroup"]

// ─── Manual type not yet in OpenAPI spec ─────────────────────

export interface ResearchPeers {
  symbol: string
  items: components["schemas"]["CompareRow"][]
}
