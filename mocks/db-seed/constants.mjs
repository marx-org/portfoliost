// Fixed IDs for deterministic E2E snapshots (parity with mock data)
export const SEED_USER_ID = "00000000-0000-4000-8000-000000000001"
export const SEED_WALLET_ID = "1a1f2d68-686c-4f8b-ba34-a67846163275"
export const SEED_PORTFOLIO_ID = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"
export const SEED_SHARE_ID = "bff18fe0-bbb9-475f-b636-b3bd68a57d08"

/** Demo FX rates (EUR-based, approximate). */
export const DEMO_FX = {
  USD: 1.08, PLN: 4.3, GBP: 0.85, CHF: 0.93, JPY: 163.2, CZK: 24.9,
  SEK: 11.3, NOK: 11.8, DKK: 7.46, HUF: 393.0, CNY: 7.8, AUD: 1.65,
  CAD: 1.47, BGN: 1.96, BRL: 5.9, HKD: 8.43, IDR: 17300, ILS: 4.0,
  INR: 90.2, ISK: 148.7, KRW: 1470, MXN: 19.7, MYR: 5.05, NZD: 1.79,
  PHP: 62.4, RON: 4.97, SGD: 1.44, THB: 38.9, TRY: 36.8, ZAR: 19.6,
}

/** Plan §48.5d — days of demo FX history seeded into instruments.fx_rates. */
export const DEMO_FX_DAYS = 30

/**
 * Deterministic multi-day demo FX schedule (plan §48.5d — test-only fixture
 * per the §48.4 rule, never live rates): DEMO_FX_DAYS calendar days ending
 * `endDateIso` (default: today, UTC), each currency FLAT at its DEMO_FX
 * close. Flat keeps every resolved rate identical to the single-day fixture
 * (walk-back and exact-date lookups agree), so no existing e2e value
 * expectation shifts — the extra history only feeds the chart's
 * ?currency= conversion window (mocks run against the real instruments
 * service, whose price endpoints join instruments.fx_rates by date).
 */
export function demoFxSchedule(endDateIso = new Date().toISOString().slice(0, 10)) {
  const end = new Date(`${endDateIso}T00:00:00Z`)
  const rows = []
  for (let i = DEMO_FX_DAYS - 1; i >= 0; i--) {
    const rateDate = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    for (const [currency, rate] of Object.entries(DEMO_FX)) {
      rows.push({ rateDate, currency, rate })
    }
  }
  return rows
}

export const SEED_POSITIONS = [
  { id: "473eccd2-cb32-4433-99d8-a04ad6460223", symbol: "META", companyName: "Meta Platforms Inc", quantity: 22, averageCostBasis: 553.91, sector: "Communication Services", industry: "Media", country: "US" },
  // §36.4 — cross-currency (PLN) position so Top Performers is verified with a
  // non-USD instrument currency. P/L is computed live in PLN from the quote.
  { id: "5f1c2a3b-8d4e-4c7f-9a6b-2d4e6f8a0c1b", symbol: "SNT.WA", companyName: "Synektik Sa", quantity: 400, averageCostBasis: 100, instrumentCurrency: "PLN", sector: "Health Care", industry: "Medical Devices", country: "PL" },
  { id: "d5e732d3-cdbf-46e6-b3da-fa044a8071a3", symbol: "CART", companyName: "Maplebear Inc", quantity: 239, averageCostBasis: 43.305, sector: "Consumer Discretionary", industry: "Retail", country: "US" },
  { id: "6f5c0b6c-f8d3-4274-b2e3-3c97cd18abb4", symbol: "MSFT", companyName: "Microsoft Corp", quantity: 32, averageCostBasis: 461.91, sector: "Technology", industry: "Technology", country: "US" },
  { id: "a2547fe3-e56a-4ef5-9dfd-af5d453952da", symbol: "NVDA", companyName: "NVIDIA Corp", quantity: 64, averageCostBasis: 198.95, sector: "Technology", industry: "Semiconductors", country: "US" },
  { id: "e89fcd87-b81a-448c-8690-86f36ac9ee70", symbol: "PLTR", companyName: "Palantir Technologies Inc", quantity: 72, averageCostBasis: 122.74, sector: "Technology", industry: "Technology", country: "US" },
  { id: "28ef1a40-2ec6-4870-a8de-ec44a92380de", symbol: "INTU", companyName: "Intuit Inc", quantity: 30, averageCostBasis: 314.605, sector: "Technology", industry: "Technology", country: "US" },
  { id: "bbcfde5c-0bef-499c-9b54-261da4c6a1a6", symbol: "LRCX", companyName: "Lam Research Corp", quantity: 25, averageCostBasis: 292.13, sector: "Technology", industry: "Semiconductors", country: "US" },
  { id: "10cf0cb8-92a3-4624-bede-f2e6d482fd50", symbol: "AMAT", companyName: "Applied Materials Inc", quantity: 15, averageCostBasis: 505.965, sector: "Technology", industry: "Semiconductors", country: "US" },
  { id: "1a56570c-6bce-45bf-96b8-15e5e70ff7a4", symbol: "ORCL", companyName: "Oracle Corp", quantity: 56, averageCostBasis: 129.13, sector: "Technology", industry: "Technology", country: "US" },
  { id: "89d5af01-b423-44cd-a890-1e42d4f46065", symbol: "KLAC", companyName: "KLA Corp", quantity: 42, averageCostBasis: 181.765, sector: "Technology", industry: "Semiconductors", country: "US" },
]

export const SEED_TRANSACTIONS = [
  { id: "9a7220e0-4fda-4e1e-ba94-ce7d944ef447", positionId: "473eccd2-cb32-4433-99d8-a04ad6460223", instrumentSymbol: "META", instrumentName: "Meta Platforms Inc", quantity: 22, price: 553.91, totalAmount: 12186.02, sector: "Communication Services", country: "US" },
  { id: "6cc47a79-9924-49eb-9656-3d3d0f15d184", positionId: "d5e732d3-cdbf-46e6-b3da-fa044a8071a3", instrumentSymbol: "CART", instrumentName: "Maplebear Inc", quantity: 239, price: 43.305, totalAmount: 10349.895, sector: "Consumer Discretionary", country: "US" },
  { id: "6eb309da-c3f7-4b40-a3f8-9dd8f0e9335d", positionId: "6f5c0b6c-f8d3-4274-b2e3-3c97cd18abb4", instrumentSymbol: "MSFT", instrumentName: "Microsoft Corp", quantity: 32, price: 461.91, totalAmount: 14781.12, sector: "Technology", country: "US" },
  { id: "29d3487e-54d9-4ede-8268-3210f67cf9dc", positionId: "a2547fe3-e56a-4ef5-9dfd-af5d453952da", instrumentSymbol: "NVDA", instrumentName: "NVIDIA Corp", quantity: 64, price: 198.95, totalAmount: 12732.8, sector: "Technology", country: "US" },
  // §36.4 — PLN (cross-currency) position; totalAmount is in PLN.
  { id: "b81d4c6e-2f5a-4d9b-a7c3-6e0f1a2b3c4d", positionId: "5f1c2a3b-8d4e-4c7f-9a6b-2d4e6f8a0c1b", instrumentSymbol: "SNT.WA", instrumentName: "Synektik Sa", quantity: 400, price: 100, totalAmount: 40000, instrumentCurrency: "PLN", sector: "Health Care", country: "PL" },
  { id: "c34b04e5-5e1a-403b-bfb6-38633b34a547", positionId: "e89fcd87-b81a-448c-8690-86f36ac9ee70", instrumentSymbol: "PLTR", instrumentName: "Palantir Technologies Inc", quantity: 72, price: 122.74, totalAmount: 8837.28, sector: "Technology", country: "US" },
  { id: "5ad1db1f-74f8-4592-b0ab-8af317be383b", positionId: "28ef1a40-2ec6-4870-a8de-ec44a92380de", instrumentSymbol: "INTU", instrumentName: "Intuit Inc", quantity: 30, price: 314.605, totalAmount: 9438.15, sector: "Technology", country: "US" },
  { id: "412ea88e-186d-40e7-a7e5-f44ccf3608f4", positionId: "bbcfde5c-0bef-499c-9b54-261da4c6a1a6", instrumentSymbol: "LRCX", instrumentName: "Lam Research Corp", quantity: 25, price: 292.13, totalAmount: 7303.25, sector: "Technology", country: "US" },
  { id: "a7036197-c023-4604-b37b-6720241fb61d", positionId: "10cf0cb8-92a3-4624-bede-f2e6d482fd50", instrumentSymbol: "AMAT", instrumentName: "Applied Materials Inc", quantity: 15, price: 505.965, totalAmount: 7589.475, sector: "Technology", country: "US" },
  { id: "2335ab42-b5b6-4b26-9a4b-eb1cb52ce9a8", positionId: "1a56570c-6bce-45bf-96b8-15e5e70ff7a4", instrumentSymbol: "ORCL", instrumentName: "Oracle Corp", quantity: 56, price: 129.13, totalAmount: 7231.28, sector: "Technology", country: "US" },
  { id: "7c442c12-3799-48f3-ae7d-5d23d6731a36", positionId: "89d5af01-b423-44cd-a890-1e42d4f46065", instrumentSymbol: "KLAC", instrumentName: "KLA Corp", quantity: 42, price: 181.765, totalAmount: 7634.13, sector: "Technology", country: "US" },
]

export const SEED_SHARE_PRIVACY = JSON.stringify({
  benchmarks: ["SPY"],
  showValues: true,
  displayName: "",
  showHoldings: true,
  showPositions: true,
  positionsToHide: [],
  showMonthlyReturns: true,
  showAssetAllocation: true,
  showPerformanceChart: true,
  showPositionAllocation: true,
  showSectorDistribution: true,
  showTransactionHistory: true,
  showGeographicBreakdown: true,
  showIndustryDistribution: true,
  performanceChartReturnType: "twr",
})
