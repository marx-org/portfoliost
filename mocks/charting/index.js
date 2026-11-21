import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadResearch } from "../lib/data.js"
import { isKnownAccount } from "../lib/accounts.js"

// ── Shared investment-charting mock (feature #253) ──────────────────────────
// The datasets are deterministic so the mock, unit and e2e tests agree. Scope
// is real: an account set AND any selected label (OR); empty/absent = All.
// Invalid/foreign IDs never silently broaden the scope (422), and a scope that
// matches nothing reports `status: "empty"` rather than inventing zeroes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Accounts the charting mock treats as real. The seeded Top10 and any portfolio
// created through the API are registered in lib/accounts.js; the two `1111…`/
// `2222…` fixtures stay known because the mock's own test suite
// (mocks/tests/run.mjs) scopes against them. A well-formed but foreign id
// (e.g. 9999…) is still unknown, so the scope reports `coverage:"empty"` — that
// contract is asserted by both run.mjs and charting-monthly-income.spec.ts.
const EXTRA_KNOWN_ACCOUNTS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
const KNOWN_LABELS = new Set([
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
])

// Cost basis vs market value per label (#270). The scope label filter (OR)
// narrows these independent groups.
const LABEL_COST_VALUE = [
  { key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "Core", costBasis: 180, value: 210 },
  { key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", label: "Growth", costBasis: 30, value: 90 },
]

const CATEGORY_CODES = new Set([
  "balanced",
  "high_yield",
  "high_growth",
  "very_high_growth",
  "not_classified",
])

function parseScope(ctx) {
  const split = (v) =>
    (v || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  const accounts = split(ctx.query.accounts)
  const labels = split(ctx.query.labels)
  const bad = [...accounts, ...labels].filter((id) => !UUID_RE.test(id))
  if (bad.length) return { error: `malformed id: ${bad[0]}` }
  const currency = (ctx.query.currency || "USD").toUpperCase()
  return {
    scope: {
      accountIds: accounts,
      labelIds: labels,
      currency,
      from: ctx.query.from || null,
      to: ctx.query.to || null,
    },
  }
}

function scopeMatchesNothing(accounts) {
  return accounts.length > 0 && accounts.every((id) => !isKnownAccount(id) && !EXTRA_KNOWN_ACCOUNTS.includes(id))
}

function coverageFor(nothing) {
  return {
    generation: 7,
    asOf: "2026-11-15T00:00:00.000Z",
    status: nothing ? "empty" : "complete",
    partial: false,
    currentPeriod: !nothing,
    stale: false,
    missing: [],
  }
}

function incomeData(scope) {
  const currency = scope.currency
  const nothing = scopeMatchesNothing(scope.accountIds)
  if (nothing) {
    return {
      currency,
      scope,
      coverage: coverageFor(true),
      monthly: [],
      cumulative: [],
      annual: [],
      quarterly: [],
      dailyAverageByYear: [],
      monthlyAverageByYear: [],
      payerCoverage: [],
    }
  }
  return {
    currency,
    scope,
    coverage: coverageFor(false),
    monthly: [
      { period: "2026-01", dividends: 120.5, interest: 8.25, options: 40, total: 168.75, partial: false },
      { period: "2026-02", dividends: 0, interest: 8.1, options: 0, total: 8.1, partial: false },
      { period: "2026-03", dividends: 210.75, interest: 9.4, options: -25, total: 195.15, partial: false },
      { period: "2026-04", dividends: 95.2, interest: 8.8, options: 0, total: 104, partial: true },
    ],
    cumulative: [
      { date: "2026-01-31", dividends: 120.5, interest: 8.25, options: 40, total: 168.75, openingBalance: 0 },
      { date: "2026-02-28", dividends: 120.5, interest: 16.35, options: 40, total: 176.85, openingBalance: 0 },
      { date: "2026-03-31", dividends: 331.25, interest: 25.75, options: 15, total: 372, openingBalance: 0 },
    ],
    annual: [
      { year: 2025, dividends: 1500, interest: 90, options: 120, total: 1710, priorYearTotal: null, yoyChangePercent: null },
      { year: 2026, dividends: 426.45, interest: 26.45, options: 15, total: 467.9, priorYearTotal: 1710, yoyChangePercent: -72.6 },
    ],
    quarterly: [
      { quarter: "2025-Q1", dividends: 300, interest: 0, options: 0, total: 300, priorYearQuarterTotal: null, yoyChangePercent: null },
      { quarter: "2025-Q2", dividends: 400, interest: 0, options: 0, total: 400, priorYearQuarterTotal: null, yoyChangePercent: null },
      { quarter: "2025-Q3", dividends: 510, interest: 0, options: 0, total: 510, priorYearQuarterTotal: null, yoyChangePercent: null },
      { quarter: "2025-Q4", dividends: 500, interest: 0, options: 0, total: 500, priorYearQuarterTotal: null, yoyChangePercent: null },
      { quarter: "2026-Q1", dividends: 331.25, interest: 25.75, options: 15, total: 372, priorYearQuarterTotal: 300, yoyChangePercent: 24 },
      { quarter: "2026-Q2", dividends: 0, interest: 0, options: 0, total: 0, priorYearQuarterTotal: 400, yoyChangePercent: -100 },
      { quarter: "2026-Q3", dividends: 95.2, interest: 0.7, options: 0, total: 95.9, priorYearQuarterTotal: 510, yoyChangePercent: -81.2 },
    ],
    dailyAverageByYear: [
      { year: 2025, basis: "days", divisor: 365, amount: 1710 / 365, partial: false },
      { year: 2026, basis: "days", divisor: 365, amount: 467.9 / 365, partial: true },
    ],
    monthlyAverageByYear: [
      { year: 2025, basis: "months", divisor: 12, amount: 1710 / 12, partial: false },
      { year: 2026, basis: "months", divisor: 12, amount: 467.9 / 12, partial: true },
    ],
    payerCoverage: [
      { year: 2026, month: 1, count: 6, partial: false },
      { year: 2026, month: 2, count: 0, partial: false },
      { year: 2026, month: 3, count: 4, partial: false },
    ],
  }
}

function allocationData(scope) {
  const currency = scope.currency
  const nothing = scopeMatchesNothing(scope.accountIds)
  const slice = (key, label, value, extra = {}) => ({ key, label, value, percent: null, sourceCurrency: null, sourceValue: null, unknown: false, ...extra })
  if (nothing) {
    return { currency, scope, coverage: coverageFor(true), byCurrency: [], byAssetType: [], bySector: [], byCategory: [], byLabel: [], byCostBasis: [], positions: [] }
  }
  const total = 300
  const pct = (v) => Math.round((v / total) * 1000) / 10
  return {
    currency,
    scope,
    coverage: coverageFor(false),
    byCurrency: [
      slice("USD", "USD", 180, { percent: pct(180) }),
      slice("PLN", "PLN", 120, { percent: pct(120), sourceCurrency: "PLN", sourceValue: 120 }),
    ],
    byAssetType: [slice("STOCK", "Stock", 220, { percent: pct(220) }), slice("CASH", "Cash", 80, { percent: pct(80) })],
    bySector: [slice("TECHNOLOGY", "Technology", 160, { percent: pct(160) }), slice("FINANCIALS", "Financials", 60, { percent: pct(60) })],
    byCategory: [
      slice("high_yield", "High yield", 140, { percent: pct(140) }),
      slice("not_classified", "Not classified", 80, { percent: pct(80) }),
    ],
    byLabel: [slice("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Core", 200, { percent: pct(200) }), slice("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Growth", 100, { percent: pct(100) })],
    byCostBasis: LABEL_COST_VALUE.filter((r) => !scope.labelIds.length || scope.labelIds.includes(r.key)).map((r) => ({
      key: r.key,
      label: r.label,
      costBasis: r.costBasis,
      value: r.value,
      percentCost: null,
      percentValue: null,
      unknown: false,
    })),
    positions: [
      slice("AAPL.US", "Apple Inc.", 120, { percent: pct(120) }),
      slice("MSFT.US", "Microsoft Corp.", 100, { percent: pct(100) }),
    ],
  }
}

function performanceData(scope) {
  const currency = scope.currency
  const nothing = scopeMatchesNothing(scope.accountIds)
  if (nothing) {
    return { currency, scope, coverage: coverageFor(true), series: [], quarterly: [], scatter: [], benchmarks: [] }
  }
  return {
    currency,
    scope,
    coverage: coverageFor(false),
    series: [
      { date: "2026-01-01", value: 1000, invested: 1000, capitalBasis: 1000, cumulativeIncome: 0, cumulativeOptions: 0, unpricedValue: 0, carriedValue: 0, twr: 0, mwr: 0, simple: 0 },
      { date: "2026-02-01", value: 1040, invested: 1000, capitalBasis: 1000, cumulativeIncome: 50, cumulativeOptions: 10, unpricedValue: 0, carriedValue: 0, twr: 0.04, mwr: 0.039, simple: 0.04 },
    ],
    quarterly: [
      { quarter: "2025-Q4", endingValue: 1000, cumulativeNetContributions: 1000, twr: null, netGainChange: null, partial: false },
      { quarter: "2026-Q1", endingValue: 1040, cumulativeNetContributions: 1000, twr: 4, netGainChange: 4, partial: true },
    ],
    scatter: [
      { symbol: "AAPL.US", name: "Apple Inc.", marketValue: 120, totalProfit: 30, realized: 5, unrealized: 20, dividends: 5 },
      { symbol: "MSFT.US", name: "Microsoft Corp.", marketValue: 100, totalProfit: -10, realized: 0, unrealized: -10, dividends: 0 },
    ],
    benchmarks: [
      { symbol: "SPY", name: "S&P 500", returnPercent: 4, volatility: 12, timeSeries: [{ date: "2026-01-01", value: 100 }, { date: "2026-02-01", value: 104 }], absoluteTimeSeries: [{ date: "2026-01-01", value: 1000 }, { date: "2026-02-01", value: 1040 }] },
      { symbol: "QQQ", name: "Nasdaq 100", returnPercent: 6, volatility: 16, timeSeries: [{ date: "2026-01-01", value: 100 }, { date: "2026-02-01", value: 106 }], absoluteTimeSeries: [{ date: "2026-01-01", value: 1000 }, { date: "2026-02-01", value: 1060 }] },
    ],
  }
}

function cashData(scope) {
  const currency = scope.currency
  const nothing = scopeMatchesNothing(scope.accountIds)
  if (nothing) {
    return { currency, scope, coverage: coverageFor(true), balanceHistory: [], annualContributions: [] }
  }
  return {
    currency,
    scope,
    coverage: coverageFor(false),
    balanceHistory: [
      { date: "2026-01-01", balance: 80 },
      { date: "2026-02-01", balance: 95 },
      { date: "2026-03-01", balance: 72.5 },
    ],
    annualContributions: [
      { year: 2025, contributions: 1200, withdrawals: 0, net: 1200, partial: false },
      { year: 2026, contributions: 300, withdrawals: 100, net: 200, partial: true },
    ],
    cumulativeContributions: [
      { key: "pf-1", label: "Main brokerage", points: [
        { date: "2025-01-01", net: 1200, contributions: 1200, withdrawals: 0, unknown: false },
        { date: "2026-01-01", net: 1400, contributions: 1500, withdrawals: 100, unknown: false },
      ] },
      { key: "__total__", label: "Total", points: [
        { date: "2025-01-01", net: 1200, contributions: 1200, withdrawals: 0, unknown: false },
        { date: "2026-01-01", net: 1400, contributions: 1500, withdrawals: 100, unknown: false },
      ] },
    ],
  }
}

const STOCK_CATEGORIES = [
  { symbol: "AAPL.US", instrumentCurrency: "USD", name: "Apple Inc.", category: "high_growth", updatedAt: "2026-11-01T00:00:00.000Z" },
  { symbol: "MSFT.US", instrumentCurrency: "USD", name: "Microsoft Corp.", category: "balanced", updatedAt: "2026-11-02T00:00:00.000Z" },
]

export function register(app) {
  const presets = (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("charting_presets.json"))
  }
  app.get("/charting/presets", presets)
  app.get("/api/charting/presets", presets)

  const compare = (ctx) => {
    if (!requireAuth(ctx)) return
    const requested = (ctx.query.symbols || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const symbols = requested.length ? requested : ["AAPL"]
    const rows = symbols
      .map((symbol) => {
        const research = loadResearch(symbol)
        if (!research) return null
        return research.compare
      })
      .filter(Boolean)
    ctx.res.json(rows)
  }
  app.get("/charting/compare", compare)
  app.get("/api/charting/compare", compare)

  // GET /api/portfolios/charting/{income,allocation,performance,cash}
  const dataset =
    (build) =>
    (ctx) => {
      if (!requireAuth(ctx)) return
      const parsed = parseScope(ctx)
      if (parsed.error) return ctx.res.json({ error: "ValidationError", message: parsed.error }, 422)
      ctx.res.json(build(parsed.scope))
    }
  app.get("/api/portfolios/charting/income", dataset(incomeData))
  app.get("/api/portfolios/charting/allocation", dataset(allocationData))
  app.get("/api/portfolios/charting/performance", dataset(performanceData))
  app.get("/api/portfolios/charting/cash", dataset(cashData))

  // GET /api/portfolios/charting/stock-categories
  app.get("/api/portfolios/charting/stock-categories", (ctx) => {
    if (!requireAuth(ctx)) return
    const parsed = parseScope(ctx)
    if (parsed.error) return ctx.res.json({ error: "ValidationError", message: parsed.error }, 422)
    const nothing = scopeMatchesNothing(parsed.scope.accountIds)
    ctx.res.json(nothing ? [] : STOCK_CATEGORIES)
  })

  // PUT /api/portfolios/charting/stock-categories
  app.put("/api/portfolios/charting/stock-categories", (ctx) => {
    if (!requireAuth(ctx)) return
    const body = ctx.body || {}
    const symbol = String(body.symbol || "").trim()
    const instrumentCurrency = String(body.instrumentCurrency || "").toUpperCase()
    const category = String(body.category || "")
    if (!symbol || instrumentCurrency.length !== 3 || !CATEGORY_CODES.has(category)) {
      return ctx.res.json({ error: "ValidationError", message: "invalid category assignment" }, 422)
    }
    const existing = STOCK_CATEGORIES.find((a) => a.symbol === symbol && a.instrumentCurrency === instrumentCurrency)
    const assignment = existing || { symbol, instrumentCurrency, name: symbol }
    assignment.category = category
    assignment.updatedAt = new Date().toISOString()
    if (!existing) STOCK_CATEGORIES.push(assignment)
    ctx.res.json(assignment)
  })
}