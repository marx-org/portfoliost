import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const RAW_SRC = join(ROOT, "discovery", "raw")
const DATA_DIR = join(ROOT, "mocks", "shared", "data")

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG (mulberry32) seeded per symbol, so generated research data
// is stable across runs and identical on every restart.
// ─────────────────────────────────────────────────────────────────────────────
function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)]
const between = (rnd, lo, hi) => lo + rnd() * (hi - lo)
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d

const fmtMoney = (n) =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString("en-US")}`
const fmtNum = (n) => Math.round(n).toLocaleString("en-US")

// ─────────────────────────────────────────────────────────────────────────────
// Instrument catalog
// ─────────────────────────────────────────────────────────────────────────────
const SECTORS = ["Technology", "Communication Services", "Consumer Discretionary", "Financials", "Health Care", "Industrials", "Energy", "Utilities", "Consumer Staples", "Materials"]
const INDUSTRIES = ["Semiconductors", "Software - Infrastructure", "Software - Application", "Internet Content & Information", "Computer Hardware", "Consumer Electronics", "Asset Management", "Credit Services", "Packaged Foods", "Diagnostics & Research", "Communication Equipment", "Electronic Components", "Information Technology Services"]

const CATALOG = {
  AAPL: { name: "Apple Inc", sector: "Technology", industry: "Consumer Electronics", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  MSFT: { name: "Microsoft Corp", sector: "Technology", industry: "Software - Infrastructure", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  NVDA: { name: "NVIDIA Corp", sector: "Technology", industry: "Semiconductors", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  META: { name: "Meta Platforms Inc", sector: "Communication Services", industry: "Internet Content & Information", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  PLTR: { name: "Palantir Technologies Inc", sector: "Technology", industry: "Software - Infrastructure", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  CART: { name: "Maplebear Inc", sector: "Consumer Discretionary", industry: "Internet Content & Information", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  INTU: { name: "Intuit Inc", sector: "Technology", industry: "Software - Application", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  LRCX: { name: "Lam Research Corp", sector: "Technology", industry: "Semiconductors", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  AMAT: { name: "Applied Materials Inc", sector: "Technology", industry: "Semiconductors", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  ORCL: { name: "Oracle Corp", sector: "Technology", industry: "Software - Infrastructure", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  KLAC: { name: "KLA Corp", sector: "Technology", industry: "Semiconductors", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  TSLA: { name: "Tesla Inc", sector: "Consumer Discretionary", industry: "Auto Manufacturers", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  AMZN: { name: "Amazon.com Inc", sector: "Consumer Discretionary", industry: "Internet Content & Information", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  GOOGL: { name: "Alphabet Inc", sector: "Communication Services", industry: "Internet Content & Information", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  NFLX: { name: "Netflix Inc", sector: "Communication Services", industry: "Entertainment", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  AMD: { name: "Advanced Micro Devices Inc", sector: "Technology", industry: "Semiconductors", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  QCOM: { name: "QUALCOMM Inc", sector: "Technology", industry: "Semiconductors", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  TSMC: { name: "Taiwan Semiconductor Manufacturing", sector: "Technology", industry: "Semiconductors", country: "TW", exchange: "US", type: "STOCK", currency: "USD" },
  V: { name: "Visa Inc", sector: "Financials", industry: "Credit Services", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  KO: { name: "Coca-Cola Co", sector: "Consumer Staples", industry: "Beverages - Non-Alcoholic", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  JNJ: { name: "Johnson & Johnson", sector: "Health Care", industry: "Drug Manufacturers", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  JPM: { name: "JPMorgan Chase & Co", sector: "Financials", industry: "Banks - Diversified", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  BAC: { name: "Bank of America Corp", sector: "Financials", industry: "Banks - Diversified", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  WFC: { name: "Wells Fargo & Co", sector: "Financials", industry: "Banks - Diversified", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  GS: { name: "Goldman Sachs Group Inc", sector: "Financials", industry: "Capital Markets", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  RIVN: { name: "Rivian Automotive Inc", sector: "Consumer Discretionary", industry: "Auto Manufacturers", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  NIO: { name: "NIO Inc", sector: "Consumer Discretionary", industry: "Auto Manufacturers", country: "CN", exchange: "US", type: "STOCK", currency: "USD" },
  LCID: { name: "Lucid Group Inc", sector: "Consumer Discretionary", industry: "Auto Manufacturers", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  SNAP: { name: "Snap Inc", sector: "Communication Services", industry: "Internet Content & Information", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  DIS: { name: "Walt Disney Co", sector: "Communication Services", industry: "Entertainment", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  CMCSA: { name: "Comcast Corp", sector: "Communication Services", industry: "Entertainment", country: "US", exchange: "US", type: "STOCK", currency: "USD" },
  SPOT: { name: "Spotify Technology SA", sector: "Communication Services", industry: "Internet Content & Information", country: "LU", exchange: "US", type: "STOCK", currency: "USD" },
  SPY: { name: "SPDR S&P 500 ETF Trust", sector: "", industry: "Index Fund", country: "US", exchange: "US", type: "ETF", currency: "USD" },
  QQQ: { name: "Invesco QQQ Trust", sector: "", industry: "Index Fund", country: "US", exchange: "US", type: "ETF", currency: "USD" },
  IWM: { name: "iShares Russell 2000 ETF", sector: "", industry: "Index Fund", country: "US", exchange: "US", type: "ETF", currency: "USD" },
}

const BENCHMARKS = {
  SPY: { name: "SPDR S&P 500 ETF Trust", type: "ETF", currency: "USD" },
  QQQ: { name: "Invesco QQQ Trust", type: "ETF", currency: "USD" },
  IWM: { name: "iShares Russell 2000 ETF", type: "ETF", currency: "USD" },
}

// Base price per symbol (anchored to the real captured quotes so charts/prices
// stay consistent with the portfolio holdings captured from the live account).
const BASE_PRICE = {
  AAPL: 307.56, MSFT: 506.06, NVDA: 208.4, META: 740.0, PLTR: 185.3,
  CART: 47.9, INTU: 660.0, LRCX: 230.0, AMAT: 280.0, ORCL: 230.0, KLAC: 290.0,
  TSLA: 340.0, AMZN: 235.0, GOOGL: 198.0, NFLX: 990.0, AMD: 190.0, QCOM: 175.0,
  TSMC: 210.0, V: 360.0, KO: 72.0, JNJ: 165.0,
  JPM: 280.0, BAC: 50.0, WFC: 85.0, GS: 640.0,
  RIVN: 14.0, NIO: 6.0, LCID: 3.0, SNAP: 12.0, DIS: 120.0, CMCSA: 45.0, SPOT: 620.0,
  SPY: 600.0, QQQ: 530.0, IWM: 235.0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: copy raw captures
// ─────────────────────────────────────────────────────────────────────────────
function copyRawCaptures() {
  const dest = join(DATA_DIR, "raw")
  mkdirSync(dest, { recursive: true })
  const files = readdirSync(RAW_SRC).filter((f) => f.endsWith(".json"))
  for (const f of files) {
    copyFileSync(join(RAW_SRC, f), join(dest, f))
  }
  writeFileSync(join(dest, "SOURCE.md"),
`# Raw captures

These files are byte-for-byte copies of responses captured from the real Example service
API (https://app.example-service.ai) on 2026-08-11 against the authenticated account of
Demo User. Do not edit manually — run \`node scripts/regen-seed.mjs\` to refresh
them from \`discovery/raw/\`.
`)
  return files
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: research synthesis
// ─────────────────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function synthBasics(sym, rnd) {
  const cat = CATALOG[sym]
  const price = BASE_PRICE[sym]
  const prevClose = round(price / (1 + between(rnd, -0.025, 0.025)))
  const sharesOut = round(between(rnd, 0.5e9, 16e9), 0)
  const mcap = round(price * sharesOut)
  return { symbol: sym, name: cat.name, sector: cat.sector, industry: cat.industry, country: cat.country, exchange: cat.exchange, currency: cat.currency, price, prevClose, sharesOutstanding: sharesOut, marketCap: mcap }
}

function synthIncomeStatement(b, rnd, years = 4) {
  const rows = []
  const startYear = 2026
  let revenue = b.marketCap / between(rnd, 6, 10)
  for (let i = 0; i < years; i++) {
    const y = startYear - i
    const growth = 1 + between(rnd, 0.03, 0.25)
    revenue = round(revenue * growth)
    const netMargin = between(rnd, 0.08, 0.3)
    const netIncome = round(revenue * netMargin)
    const eps = round(netIncome / b.sharesOutstanding, 2)
    const ebitda = round(revenue * between(rnd, 0.2, 0.4))
    rows.push({
      year: y,
      revenue: round(revenue * between(rnd, 0.9, 1.1) + revenue * 0.2),
      ebit: round(revenue * between(rnd, 0.15, 0.35)),
      netIncome,
      netIncomeGrowth: i === 0 ? null : round(((netIncome / (netIncome / (1 + between(rnd, 0.05, 0.2)))) - 1) * 100),
      netIncomeMargin: round(netMargin * 100),
      earningsPerShare: eps,
      earningsPerShareGrowth: i === 0 ? null : round(between(rnd, 5, 30)),
      dilutedSharesOutstanding: b.sharesOutstanding,
      ebitda,
    })
  }
  return rows
}

function synthBalanceSheet(b, rnd, years = 4) {
  const rows = []
  for (let i = 0; i < years; i++) {
    const assets = round(b.marketCap * between(rnd, 0.55, 0.9))
    const liabilities = round(assets * between(rnd, 0.45, 0.7))
    const equity = assets - liabilities
    const debt = round(assets * between(rnd, 0.1, 0.3))
    rows.push({
      year: 2026 - i,
      totalAssets: assets,
      totalLiabilities: liabilities,
      shareholdersEquity: equity,
      cash: round(assets * between(rnd, 0.05, 0.2)),
      cashAndShortTermInvestments: round(assets * between(rnd, 0.08, 0.25)),
      totalDebt: debt,
      netDebt: round(debt - assets * between(rnd, 0.05, 0.18)),
      workingCapital: round(assets * between(rnd, 0.02, 0.1)),
      totalCapitalization: round(equity + debt),
      retainedEarnings: round(equity * between(rnd, 0.5, 0.9)),
      debtEquityRatio: round(debt / equity, 2),
      longTermDebtToCapitalization: round(between(rnd, 0.15, 0.45), 2),
      totalDebtToCapitalization: round(between(rnd, 0.2, 0.5), 2),
    })
  }
  return rows
}

function synthCashFlow(b, rnd, years = 4) {
  const rows = []
  for (let i = 0; i < years; i++) {
    const ocf = round(b.marketCap * between(rnd, 0.12, 0.25))
    const capex = round(ocf * between(rnd, 0.15, 0.4))
    rows.push({
      year: 2026 - i,
      cashFlowFromOperatingActivities: ocf,
      cashFlowFromFinancingActivities: round(-ocf * between(rnd, 0.3, 0.7)),
      cashFlowFromInvestingActivities: round(-ocf * between(rnd, 0.2, 0.5)),
      freeCashFlow: round(ocf - capex),
      freeCashFlowGrowth: i === 0 ? null : round(between(rnd, -5, 30)),
      cashFlowFromOperatingActivitiesGrowth: i === 0 ? null : round(between(rnd, -5, 25)),
      freeCashFlowPerShare: round((ocf - capex) / b.sharesOutstanding, 2),
      capitalExpenditures: capex,
      depreciation: round(capex * between(rnd, 0.6, 1.2)),
      dividendPayment: round(-ocf * between(rnd, 0.05, 0.3)),
    })
  }
  return rows
}

function synthHolders(b, rnd, label) {
  const holdersCount = Math.round(between(rnd, 800, 6000))
  const pct = round(between(rnd, 5, 80), 2)
  return [{
    date: "2026-06-30",
    holdingPercentage: pct,
    holdersCount,
    sumOfCurrentPositions: round(b.sharesOutstanding * (pct / 100) * b.price, 0),
    sumOfCurrentPositionsValue: round(b.sharesOutstanding * (pct / 100) * b.price * 0.6, 0),
  }, {
    date: "2026-03-31",
    holdingPercentage: round(pct * between(rnd, 0.98, 1.03), 2),
    holdersCount: Math.round(holdersCount * between(rnd, 0.98, 1.02)),
    sumOfCurrentPositions: round(b.sharesOutstanding * (pct / 100) * b.price * between(rnd, 0.95, 1.05), 0),
    sumOfCurrentPositionsValue: round(b.sharesOutstanding * (pct / 100) * b.price * 0.6 * between(rnd, 0.95, 1.05), 0),
  }]
}

function synthInsiderTransactions(b, rnd) {
  const codes = [
    { c: "P", t: "Purchase", amount: between(rnd, 0.5, 5) },
    { c: "S", t: "Sale", amount: -between(rnd, 0.5, 20) },
    { c: "M", t: "Option Execute", amount: between(rnd, 0.1, 2) },
  ]
  const rows = []
  for (let i = 0; i < 10; i++) {
    const k = pick(rnd, codes)
    const shares = Math.round(between(rnd, 1000, 200000))
    rows.push({
      title: "Chief Executive Officer",
      transactionDate: `2026-0${Math.ceil(rnd() * 6) + 1}-${String(Math.ceil(rnd() * 27)).padStart(2, "0")}`,
      transactionCode: k.c,
      transactionText: k.t,
      transactionAmount: shares,
      transactionValue: round(shares * b.price * (k.amount > 0 ? 1 : 1), 0),
      filingDate: `2026-0${Math.ceil(rnd() * 6) + 1}-${String(Math.ceil(rnd() * 27)).padStart(2, "0")}`,
    })
  }
  return rows
}

function synthDividends(b, rnd) {
  const history = []
  const freq = pick(rnd, [4, 4, 4, 1])
  for (let i = 0; i < 24; i++) {
    const idx = 23 - i
    const date = new Date(Date.UTC(2026, 7, 15) - idx * Math.round(365 / freq) * 86400000)
    const row = {
      date: date.toISOString().slice(0, 10),
      year: date.getUTCFullYear(),
      amount: round(0.25 + between(rnd, 0, 0.15), 4),
      currency: b.currency,
      type: freq === 4 ? "quarterly" : "annual",
    }
    // §49.9 — recent rows carry a payment date (the four most recent have one,
    // older rows keep paymentDate null so the client's — path stays covered).
    if (idx < 4) row.paymentDate = new Date(date.getTime() + 4 * 86400000).toISOString().slice(0, 10)
    history.push(row)
  }
  return history
}

function synthCalendar(b, rnd) {
  const year = 2026
  const earnings = []
  for (let q = 1; q <= 4; q++) {
    earnings.push({ date: `${year}-${[1, 4, 7, 10][q - 1]}-${[29, 29, 30, 28][q - 1]}`, title: `Q${q} ${year} Earnings Call`, year, quarter: q })
  }
  const exDividend = []
  const dividend = []
  for (let i = 0; i < 4; i++) {
    const m = [2, 5, 8, 11][i]
    exDividend.push({ date: `${year}-${String(m).padStart(2, "0")}-10`, title: `Ex-Dividend ${MONTHS[m - 1]} ${year}`, year, amount: round(0.25 + between(rnd, 0, 0.1), 4) })
    dividend.push({ date: `${year}-${String(m + 1).padStart(2, "0")}-15`, title: `Dividend ${MONTHS[m]} ${year}`, year, amount: round(0.25 + between(rnd, 0, 0.1), 4) })
  }
  return { earnings, exDividend, dividend }
}

function synthProjections(b, rnd) {
  const priceTarget = {
    lastUpdated: "2026-08-01 00:00:00",
    low: round(b.price * between(rnd, 0.6, 0.85)),
    mean: round(b.price * between(rnd, 0.95, 1.25)),
    current: b.price,
    high: round(b.price * between(rnd, 1.3, 1.8)),
  }
  const rec = { strongBuy: Math.round(between(rnd, 10, 30)), buy: Math.round(between(rnd, 5, 20)), hold: Math.round(between(rnd, 3, 15)), sell: Math.round(between(rnd, 0, 5)), strongSell: Math.round(between(rnd, 0, 3)) }
  const earnings = { avg: round(b.price * 0.035, 2), high: round(b.price * 0.06, 2), low: round(b.price * 0.02, 2), mean: round(b.price * 0.037, 2), periods: ["Q4 2026", "Q1 2027", "Q2 2027"] }
  const revenue = { avg: round(b.marketCap / between(rnd, 7, 12), 0), high: round(b.marketCap / between(rnd, 6, 9), 0), low: round(b.marketCap / between(rnd, 10, 14), 0), mean: round(b.marketCap / between(rnd, 7.5, 11), 0), periods: ["Q4 2026", "Q1 2027", "Q2 2027"] }
  return { priceTarget, recommendation: { period: "2026-08-01", ...rec }, earnings, revenue }
}

function synthEPS(b, rnd) {
  const annual = []
  const quarterly = []
  for (let i = 0; i < 5; i++) {
    const y = 2026 - i
    const eps = round(b.price * between(rnd, 0.025, 0.05), 2)
    annual.push({ date: `${y}-12-31`, year: y, quarter: 4, eps, epsEstimate: round(eps * between(rnd, 0.92, 1.08), 2), epsDifference: round(between(rnd, -0.1, 0.4), 2), revenue: round(b.marketCap / between(rnd, 7, 12), 0), revenueEstimate: round(b.marketCap / between(rnd, 7, 12) * between(rnd, 0.95, 1.05), 0), revenueDifference: round(between(rnd, -0.2, 1), 2), surprise: round(between(rnd, -0.1, 0.5), 2), surprisePercent: round(between(rnd, -3, 12), 2), time: "after-hours" })
  }
  for (let i = 0; i < 6; i++) {
    const q = 3 - (i % 4)
    const y = 2026 - Math.floor(i / 4)
    const eps = round(b.price * between(rnd, 0.02, 0.045), 2)
    quarterly.push({ date: `${y}-${[3, 6, 9, 12][q - 1]}-30`, year: y, quarter: q, eps, epsEstimate: round(eps * between(rnd, 0.92, 1.08), 2), epsDifference: round(between(rnd, -0.1, 0.4), 2), revenue: round(b.marketCap / between(rnd, 28, 48), 0), revenueEstimate: round(b.marketCap / between(rnd, 28, 48) * between(rnd, 0.95, 1.05), 0), revenueDifference: round(between(rnd, -0.2, 1), 2), surprise: round(between(rnd, -0.1, 0.5), 2), surprisePercent: round(between(rnd, -3, 12), 2), time: "after-hours" })
  }
  return { annual, quarterly }
}

function synthSeasonality(b, rnd) {
  const monthlyReturns = MONTHS.map((month, i) => {
    const base = (i === 0 || i === 11 ? 1 : i < 5 ? -1 : 1) * between(rnd, 0.1, 1.5)
    return { month, return_pct: round(base + between(rnd, -0.3, 0.3), 2) }
  })
  return { symbol: b.symbol, years: 5, metric: "avg", monthly_returns: monthlyReturns }
}

function synthMetrics(b, rnd) {
  const growth = between(rnd, 0.05, 0.3)
  return {
    roa: round(between(rnd, 4, 40), 2),
    roe: round(between(rnd, 10, 150), 2),
    cash: round(b.marketCap * between(rnd, 0.01, 0.2), 0),
    pFcf: round(between(rnd, 10, 60), 2),
    roic: round(between(rnd, 5, 80), 2),
    rota: round(between(rnd, 4, 40), 2),
    isBank: false, ttmEps: round(b.price / between(rnd, 15, 45), 2), isMiner: false,
    netDebt: round(b.marketCap * between(rnd, -0.1, 0.2), 0),
    pbRatio: round(between(rnd, 3, 45), 2),
    peRatio: round(between(rnd, 15, 60), 2),
    revenue: round(b.marketCap / between(rnd, 6, 12), 0),
    pegRatio: round(between(rnd, 0.8, 3.5), 2),
    employees: Math.round(between(rnd, 5e3, 250e3)),
    evToSales: round(between(rnd, 2, 12), 2),
    fcfMargin: round(between(rnd, 10, 35), 2),
    forwardPe: round(between(rnd, 14, 50), 2),
    marketCap: b.marketCap,
    netIncome: round(b.marketCap / between(rnd, 15, 50), 0),
    netMargin: round(between(rnd, 8, 35), 2),
    evToEbitda: round(between(rnd, 8, 40), 2),
    grossMargin: round(between(rnd, 25, 70), 2),
    payoutRatio: round(between(rnd, 5, 50), 2),
    priceTarget: round(b.price * between(rnd, 0.95, 1.35)),
    dpsGrowth3yr: round(between(rnd, 0, 15), 2),
    dpsGrowth5yr: round(between(rnd, 0, 15), 2),
    ebitdaMargin: round(between(rnd, 15, 45), 2),
    epsGrowth3yr: round(between(rnd, 2, 25), 2),
    epsGrowth5yr: round(between(rnd, 5, 30), 2),
    epsGrowthFwd: round(between(rnd, 5, 30), 2),
    pretaxMargin: round(between(rnd, 8, 35), 2),
    dividendYield: round(between(rnd, 0, 3), 2),
    epsGrowth10yr: round(between(rnd, 8, 30), 2),
    epsLtGrowthEst: round(between(rnd, 8, 25), 2),
    forwardEvSales: round(between(rnd, 2, 12), 2),
    isConglomerate: false,
    ebitdaGrowthFwd: round(between(rnd, 5, 25), 2),
    enterpriseValue: round(b.marketCap * between(rnd, 0.95, 1.25), 0),
    evToGrossProfit: round(between(rnd, 8, 35), 2),
    isDepositLender: false,
    operatingMargin: round(between(rnd, 10, 45), 2),
    dividendPerShare: round(between(rnd, 0, 1.5), 2),
    reportingCadence: "quarterly",
    revenueGrowth3yr: round(between(rnd, 2, 25), 2),
    revenueGrowth5yr: round(between(rnd, 5, 30), 2),
    revenueGrowthFwd: round(between(rnd, 5, 30), 2),
    bookValuePerShare: round(b.price / between(rnd, 8, 30), 2),
    revenueGrowth10yr: round(between(rnd, 3, 25), 2),
    sharesOutstanding: b.sharesOutstanding,
    lifecycleStatus: "live",
    successorSymbol: null,
  }
}

function synthCompare(entry, b) {
  return {
    symbol: b.symbol,
    name: b.name,
    price: b.price,
    marketCap: b.marketCap,
    peRatio: entry.peRatio,
    forwardPe: entry.forwardPe,
    pbRatio: entry.pbRatio,
    psRatio: round(b.marketCap / entry.revenue, 2),
    dividendYield: entry.dividendYield,
    revenueGrowth: entry.revenueGrowth3yr,
    netMargin: entry.netMargin,
    roe: entry.roe,
    grossMargin: entry.grossMargin,
    operatingMargin: entry.operatingMargin,
    evToEbitda: entry.evToEbitda,
    evToSales: entry.evToSales,
    fcfMargin: entry.fcfMargin,
    netIncome: entry.netIncome,
    revenue: entry.revenue,
    sharesOutstanding: entry.sharesOutstanding,
    currency: b.currency,
  }
}

function synthAiInsights(b, rnd) {
  return {
    symbol: b.symbol,
    generatedAt: new Date().toISOString(),
    summary: `${b.name} trades at a ${round(between(rnd, 10, 45), 1)}x forward P/E with ${round(between(rnd, 5, 25), 1)}% expected EPS growth. Balance sheet remains healthy with net debt to equity at ${round(between(rnd, 0.05, 0.4), 2)}.`,
    bullCase: [`Revenue growth is expected to continue at ${round(between(rnd, 5, 25), 1)}%`, `Margins are expanding with gross margin near ${round(between(rnd, 30, 60), 1)}%`, `Analyst price targets imply ${round(between(rnd, 5, 25), 1)}% upside`],
    bearCase: [`Valuation leaves little room for error at ${round(between(rnd, 20, 60), 1)}x P/E`, `Increased competition could pressure market share`, `Macro headwinds may compress multiple`],
    keyMetrics: [
      { label: "P/E ratio", value: round(between(rnd, 15, 60), 2), assessment: "Neutral" },
      { label: "EPS growth", value: `${round(between(rnd, 5, 30), 1)}%`, assessment: "Positive" },
      { label: "Free cash flow yield", value: `${round(between(rnd, 1, 8), 2)}%`, assessment: "Neutral" },
    ],
    sentiment: pick(rnd, ["bullish", "neutral", "neutral", "bullish"]),
  }
}

function synthDescription(b, m) {
  const tagline = `${b.name} is a ${b.sector} company specializing in ${b.industry}. The company is headquartered in ${b.country === "US" ? "the United States" : b.country} and trades on the ${b.exchange || "public"} exchange, with shares listed under the ticker ${b.symbol}.`
  const perf = `The company generated revenue of ${fmtMoney(m.revenue)} over the trailing twelve months, with a net margin of ${round(m.netMargin, 1)}%. It employs approximately ${fmtNum(m.employees)} people and carries a market capitalization of ${fmtMoney(m.marketCap)}, making it one of the larger businesses in the ${b.industry} space.`
  const yieldLine = m.dividendYield > 0 ? ` The current dividend yield is ${round(m.dividendYield, 2)}%.` : ""
  const outlook = `Analysts covering the company see fair value around a mean target of ${fmtMoney(m.priceTarget)}, versus a last price of ${fmtMoney(b.price)}.${yieldLine}`
  return [tagline, perf, outlook]
}

function synthResearch(sym) {
  const rnd = mulberry32(hashString(sym))
  const b = synthBasics(sym, rnd)
  const metrics = synthMetrics(b, rnd)
  return {
    symbol: sym,
    basics: b,
    overview: { ...CATALOG[sym], symbol: sym, ...b },
    description: synthDescription(b, metrics),
    metrics,
    compare: synthCompare(metrics, b),
    fundamentals: {
      financialHighlights: {
        incomeStatement: synthIncomeStatement(b, rnd),
        balanceSheet: synthBalanceSheet(b, rnd),
        cashFlow: synthCashFlow(b, rnd),
      },
    },
    ownership: {
      institutional: synthHolders(b, rnd, "institutional"),
      mutualFund: synthHolders(b, rnd, "mutualFund"),
      insider: synthHolders(b, rnd, "insider"),
      insiderTransactions: synthInsiderTransactions(b, rnd),
    },
    dividends: { history: synthDividends(b, rnd) },
    calendar: synthCalendar(b, rnd),
    projections: synthProjections(b, rnd),
    seasonality: synthSeasonality(b, rnd),
    epsSurprises: synthEPS(b, rnd),
    aiInsights: synthAiInsights(b, rnd),
    priceTarget: {
      symbol: sym, targetHigh: round(b.price * between(rnd, 1.3, 1.8)), targetLow: round(b.price * 0.7),
      targetMean: round(b.price * 1.1), targetMedian: round(b.price * 1.08), numberAnalysts: Math.round(between(rnd, 15, 50)), lastUpdated: "2026-08-01 00:00:00",
    },
  }
}

function synthUniverse() {
  const universe = []
  for (const [sym, cat] of Object.entries(CATALOG)) {
    universe.push({ symbol: sym, name: cat.name, type: cat.type, exchange: cat.exchange, currency: cat.currency, sector: cat.sector, industry: cat.industry, source: "FINNHUB" })
  }
  return universe
}

function synthBenchmarks() {
  const out = {}
  for (const [sym, meta] of Object.entries(BENCHMARKS)) {
    const rnd = mulberry32(hashString(sym))
    const b = synthBasics(sym, rnd)
    out[sym] = { symbol: sym, name: meta.name, type: meta.type, currency: meta.currency, price: b.price, prevClose: b.prevClose, marketCap: b.marketCap }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder logo SVGs (user decision: placeholder logos)
// ─────────────────────────────────────────────────────────────────────────────
function synthLogos() {
  const dir = join(DATA_DIR, "logos")
  mkdirSync(dir, { recursive: true })
  const hues = [210, 250, 150, 20, 275, 190, 0, 45, 90, 300]
  let i = 0
  for (const sym of Object.keys(CATALOG)) {
    const hue = hues[i++ % hues.length]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="hsl(${hue},55%,42%)"/><text x="32" y="41" font-family="Helvetica,Arial,sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${sym.slice(0, 3)}</text></svg>`
    writeFileSync(join(dir, `${sym}.svg`), svg)
  }
  return Object.keys(CATALOG).length
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true })

const rawFiles = copyRawCaptures()

const researchDir = join(DATA_DIR, "research")
mkdirSync(researchDir, { recursive: true })
const symbols = Object.keys(CATALOG)
for (const sym of symbols) {
  writeFileSync(join(researchDir, `${sym}.json`), JSON.stringify(synthResearch(sym), null, 2))
}
writeFileSync(join(DATA_DIR, "universe.json"), JSON.stringify(synthUniverse(), null, 2))
writeFileSync(join(DATA_DIR, "benchmarks.json"), JSON.stringify(synthBenchmarks(), null, 2))
const logos = synthLogos()

console.log(`Seed regenerated → ${DATA_DIR}`)
console.log(`  raw captures copied:   ${rawFiles.length} files`)
console.log(`  research bundles:      ${symbols.length} symbols`)
console.log(`  universe catalog:      ${symbols.length} instruments`)
console.log(`  benchmarks:            ${Object.keys(BENCHMARKS).length}`)
console.log(`  placeholder logos:     ${logos}`)
