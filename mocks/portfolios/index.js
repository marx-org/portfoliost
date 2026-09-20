import { requireAuth } from "../lib/auth.js"
import { resolveFeeFx } from "../lib/demo-fx.js"
import { loadJson, loadRaw, loadResearch, normalize } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"
import { benchmarkSeries, benchmarkSymbols } from "./benchmarks.js"

const created = new Map()
const positionsByPortfolio = new Map()
const newPortfolioIds = new Set()
/** Portfolio ids whose history was force-rebuilt (POST /:id/recompute) — their
 *  analytics now serve the populated fixture even when they started empty. */
const recomputedIds = new Set()
const allTxs = new Map()
let txInited = false
let shares = null

function noPriceFixture() {
  return loadJson("no-price-portfolio.json")
}

function noPricePortfolio() {
  return noPriceFixture().portfolio
}

function allShares() {
  if (!shares) shares = JSON.parse(JSON.stringify(loadRaw("portfolios_shares.json")))
  return shares
}

function initTxs() {
  if (txInited) return
  for (const t of loadRaw("portfolios_transactions.json").items ?? []) allTxs.set(t.id, t)
  txInited = true
}

const ANALYTICS_BY_TIMEFRAME = {
  "1W": "portfolio_analytics_6M.json",
  "1M": "portfolio_analytics_6M.json",
  "3M": "portfolio_analytics_6M.json",
  "6M": "portfolio_analytics_6M.json",
  "1Y": "portfolio_analytics_1Y.json",
  "2Y": "portfolio_analytics_2Y.json",
  ALL: "portfolio_analytics_all.json",
}

const EMPTY_BY_TIMEFRAME = {
  "1W": "empty_portfolio_analytics.json",
  "1M": "empty_portfolio_analytics.json",
  "3M": "empty_portfolio_analytics.json",
  "6M": "empty_portfolio_analytics.json",
  "1Y": "empty_portfolio_analytics.json",
  "2Y": "empty_portfolio_analytics.json",
  ALL: "empty_portfolio_analytics.json",
}

function timelineFor(timeframe) {
  const t = String(timeframe || "1Y").toUpperCase()
  return ANALYTICS_BY_TIMEFRAME[t] ? t : "1Y"
}

function findPortfolio(id) {
  if (created.has(id)) return created.get(id)
  if (id === noPricePortfolio().id) return noPricePortfolio()
  const existing = loadRaw("portfolios_summaries.json").find((p) => p.id === id)
  return existing || null
}

function withDataFile(id, baseName, emptyName) {
  if (newPortfolioIds.has(id)) return loadRaw(emptyName)
  return findPortfolio(id) ? loadRaw(baseName) : loadRaw(emptyName)
}

function positionsFor(id) {
  if (!positionsByPortfolio.has(id)) {
    const np = noPricePortfolio()
    const base = id === np.id
      ? noPriceFixture().positions
      : newPortfolioIds.has(id)
        ? []
        : loadRaw("portfolio_positions.json")
    positionsByPortfolio.set(id, (Array.isArray(base) ? base : []).map((p) => ({ ...p })))
  }
  return positionsByPortfolio.get(id)
}

// Live price wins over the stored one — the holdings price column reflects the
// current quote (research data), never the (possibly stale/null) DB value.
function currentPriceFor(symbol) {
  const npQuote = noPriceFixture().quotes?.[normalize(symbol)]
  if (npQuote && typeof npQuote.currentPrice === "number") return npQuote.currentPrice
  const research = loadResearch(symbol)
  if (research && research.basics && typeof research.basics.price === "number") return research.basics.price
  const fallback = loadRaw("quote_aapl.json")
  return typeof fallback?.currentPrice === "number" ? fallback.currentPrice : 0
}

function enrichPosition(p) {
  const price = currentPriceFor(p.symbol) ?? 0
  const quantity = p.quantity ?? 0
  const avg = p.averageCostBasis ?? 0
  return {
    ...p,
    currentPrice: price,
    marketValue: round2(quantity * price),
    unrealizedGainLoss: round2(quantity * (price - avg)),
    percentageChange: avg ? round2(((price - avg) / avg) * 100) : 0,
  }
}

function enrichedPositions(id) {
  const list = positionsFor(id).map(enrichPosition)
  const total = list.reduce((s, p) => s + (p.marketValue || 0), 0)
  for (const p of list) {
    p.percentOfPortfolio = total ? round2(((p.marketValue || 0) / total) * 100) : 0
  }
  return list
}

function heldPositions(id) {
  return enrichedPositions(id)
}

function enrichTx(tx) {
  if (tx.sector && tx.country) return tx
  const position = positionsFor(tx.portfolioId).find((p) => p.symbol === tx.instrumentSymbol)
  if (position && position.sector && position.country) {
    return { ...tx, sector: position.sector, country: position.country }
  }
  const research = loadResearch(tx.instrumentSymbol)
  if (research) {
    return {
      ...tx,
      sector: research.overview.sector || "Other",
      country: research.overview.country || "Other",
    }
  }
  return { ...tx, sector: tx.sector || "Other", country: tx.country || "Other" }
}

function allTransactions() {
  initTxs()
  const items = [...allTxs.values()].map(enrichTx)
  return { items, total: items.length }
}

function portfolioTransactions(id) {
  initTxs()
  const items = [...allTxs.values()].filter((t) => t.portfolioId === id).map(enrichTx)
  return { items, total: items.length }
}

function filterTransactionsBySymbol(items, symbol) {
  if (!symbol) return items
  const q = String(symbol).toUpperCase()
  return items.filter((t) => String(t.instrumentSymbol ?? "").toUpperCase() === q)
}

function filterTransactions(items, symbol) {
  const filtered = filterTransactionsBySymbol(items, symbol)
  return { items: filtered, total: filtered.length }
}

const TX_SORT_FIELDS = {
  symbol: "instrumentSymbol",
  date: "executedAt",
  portfolio: "portfolioName",
  type: "type",
  quantity: "quantity",
  price: "price",
  fees: "fees",
  amount: "totalAmount",
}

function sortTransactions(items, sortBy, sortOrder) {
  const field = TX_SORT_FIELDS[sortBy]
  if (!field) return items
  const dir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1
  return [...items].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
  })
}

function transactionsPage(ctx, data) {
  const sorted = sortTransactions(data.items, ctx.query.sortBy, ctx.query.sortOrder)
  return paginatePage(ctx.query.page, ctx.query.limit, sorted, data.total)
}

function sumBy(positions, field) {
  const totals = new Map()
  for (const p of positions) {
    const key = p[field] || "Other"
    totals.set(key, (totals.get(key) || 0) + (p.marketValue || 0))
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value: round2(value) }))
    .sort((a, b) => b.value - a.value)
}

export function register(app) {
  app.get("/api/portfolios", (ctx) => {
    if (!requireAuth(ctx)) return
    const byId = new Map(loadRaw("portfolios_summaries.json").map((p) => [p.id, p]))
    for (const [id, p] of created) byId.set(id, p)
    const list = [...byId.values()]
    const np = noPricePortfolio()
    if (!list.some((p) => p.id === np.id)) list.push(np)
    ctx.res.json(list)
  })

  app.get("/api/portfolios/light", (ctx) => {
    if (!requireAuth(ctx)) return
    const portfolios = loadRaw("portfolios_summaries.json")
    const lights = portfolios.concat([...created.values()]).map((p) => ({
      id: p.id,
      name: p.name,
      currency: p.currency,
      totalValue: p.currentValue ?? 0,
      totalInvested: p.totalInvested ?? 0,
    }))
    ctx.res.json(lights.length ? lights : loadRaw("portfolios_summaries_light.json"))
  })

  app.get("/api/portfolios/merged", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("merged_portfolios.json"))
  })

  app.get("/api/portfolios/merged/light", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("merged_portfolios_light.json"))
  })

  app.get("/api/portfolios/total-metrics", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("portfolios_total_metrics.json"))
  })

  app.get("/api/portfolios/held-stocks", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("portfolios_held_stocks.json"))
  })

  app.get("/api/portfolios/shares", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(allShares())
  })

  app.post("/api/portfolios/shares", (ctx) => {
    if (!requireAuth(ctx)) return
    const { portfolioId, displayName = "" } = ctx.body || {}
    const portfolio = findPortfolio(portfolioId)
    if (!portfolio) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Portfolio not found", statusCode: 404 })
    }
    if (allShares().length >= 10) {
      return ctx.res.status(422).json({ error: "LimitReached", message: "You can have up to 10 active shares", statusCode: 422 })
    }
    const share = {
      id: uuid(),
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      displayName,
      createdAt: nowIso(),
      expiresAt: null,
      viewCount: 0,
      privacySettings: {
        benchmarks: ["SPY"],
        showValues: true,
        displayName,
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
      },
    }
    allShares().push(share)
    ctx.res.status(201).json(share)
  })

  app.delete("/api/portfolios/shares/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const idx = allShares().findIndex((s) => s.id === ctx.params.id)
    if (idx < 0) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Share not found", statusCode: 404 })
    }
    allShares().splice(idx, 1)
    ctx.res.status(204).end()
  })

  app.get("/api/public/portfolios/:shareId", (ctx) => {
    const share = allShares().find((s) => s.id === ctx.params.shareId)
    if (!share) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Shared portfolio not found", statusCode: 404 })
    }
    const portfolio = findPortfolio(share.portfolioId) || {}
    ctx.res.json({
      share,
      portfolio: {
        id: portfolio.id,
        name: share.portfolioName || portfolio.name,
        strategy: portfolio.strategy || "GROWTH",
        positions: positionsFor(share.portfolioId),
      },
    })
  })

  app.get("/api/portfolios/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    let data = allTransactions()
    if (ctx.query.instrumentSymbol) {
      data = filterTransactions(data.items, ctx.query.instrumentSymbol)
    }
    ctx.res.json(transactionsPage(ctx, data))
  })

  app.post("/api/portfolios", (ctx) => {
    if (!requireAuth(ctx)) return
    const { name, description, strategy = "GROWTH", currency = "USD", isPublic = false, walletId } = ctx.body || {}
    if (!name) {
      return ctx.res.status(422).json({ error: "ValidationError", message: "name is required", statusCode: 422 })
    }
    const id = uuid()
    const wallet = loadRaw("wallets.json").find((w) => w.id === walletId) || loadRaw("wallets.json")[0]
    const now = nowIso()
    const portfolio = {
      id,
      userId: ctx.user.id,
      name,
      description: description ?? null,
      strategy,
      type: "regular",
      currency,
      walletId: wallet ? wallet.id : null,
      totalInvested: 0,
      currentValue: 0,
      isPublic,
      isMarginEnabled: false,
      marginRate: null,
      maintenanceMarginRate: null,
      createdAt: now,
      updatedAt: now,
    }
    created.set(id, portfolio)
    newPortfolioIds.add(id)
    ctx.res.status(201).json(portfolio)
  })

  app.get("/api/portfolios/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const p = findPortfolio(ctx.params.id)
    if (p) return ctx.res.json(p)
    ctx.res.json(loadRaw("empty_portfolio_detail.json"))
  })

  app.patch("/api/portfolios/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const p = findPortfolio(ctx.params.id)
    const body = ctx.body || {}
    if (p) {
      const updated = { ...p, ...body, updatedAt: nowIso() }
      created.set(ctx.params.id, updated)
      return ctx.res.json(updated)
    }
    ctx.res.json({ ...loadRaw("empty_portfolio_detail.json"), ...body, updatedAt: nowIso() })
  })

  app.delete("/api/portfolios/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    created.delete(ctx.params.id)
    positionsByPortfolio.delete(ctx.params.id)
    ctx.res.status(204).end()
  })

  app.get("/api/portfolios/:id/summary-metrics", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_summary_metrics.json", "empty_portfolio_summary_metrics.json"))
  })

  app.get("/api/portfolios/:id/analytics", (ctx) => {
    if (!requireAuth(ctx)) return
    const timeframe = timelineFor(ctx.query.timeframe)
    const emptyFile = EMPTY_BY_TIMEFRAME[timeframe]
    const recomputed = recomputedIds.has(ctx.params.id)
    const base = recomputed
      ? loadRaw(ANALYTICS_BY_TIMEFRAME[timeframe])
      : withDataFile(ctx.params.id, ANALYTICS_BY_TIMEFRAME[timeframe], emptyFile)

    const benchParam = ctx.query.benchmarks ?? ctx.query.benchmark
    const wanted = benchParam
      ? String(benchParam).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : []
    const available = benchmarkSymbols()
    const symbols = wanted.filter((s) => available.includes(s))
    const benchmarks = symbols.map((s) => benchmarkSeries(s, timeframe))

    // A created portfolio starts with an empty backfill: the analytics call
    // reports `pending` (mirroring the real backend's n<2 auto-trigger) until
    // a recompute fills the series.
    const backfillStatus = !recomputed && newPortfolioIds.has(ctx.params.id) ? "pending" : undefined
    ctx.res.json({ ...base, ...(backfillStatus ? { backfillStatus } : {}), benchmarks })
  })

  app.post("/api/portfolios/:id/recompute", (ctx) => {
    if (!requireAuth(ctx)) return
    const id = ctx.params.id
    if (!findPortfolio(id) && !created.has(id)) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Portfolio not found", statusCode: 404 })
    }
    // The real backend enqueues a serialized delete+rebuild pass; the mock
    // just flips the flag so the next analytics call serves populated data.
    recomputedIds.add(id)
    ctx.res.json({ backfillStatus: "pending" })
  })

  app.get("/api/portfolios/:id/positions", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(enrichedPositions(ctx.params.id))
  })

  app.get("/api/portfolios/:id/positions/bare", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_positions_bare.json", "empty_portfolio_positions.json"))
  })

  app.get("/api/portfolios/:id/positions/cfd-hints", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_positions_cfd_hints.json", "empty_portfolio_positions.json"))
  })

  app.post("/api/portfolios/:id/positions", (ctx) => {
    if (!requireAuth(ctx)) return
    const body = ctx.body || {}
    const { symbol = "AAPL", quantity = 1, price, averageCostBasis = price, fees = 0 } = body
    const research = loadResearch(symbol)
    const assetType = String(body.assetType || "STOCK").toUpperCase()
    const base = {
      companyName: research ? research.overview.name : symbol,
      assetType,
      instrumentCurrency: "USD",
      purchaseCurrency: "USD",
      sector: research ? research.overview.sector : "Technology",
      industry: research ? research.overview.industry : "",
      country: research ? research.overview.country : "US",
    }
    const currentPrice = price || (research ? research.basics.price : 100)
    const feeAmount = Number(fees) || 0
    const costBasis = round2(quantity * (averageCostBasis ?? currentPrice) + feeAmount)
    const position = {
      ...base,
      assetType,
      id: uuid(),
      portfolioId: ctx.params.id,
      symbol,
      quantity,
      contractSize: body.contractSize ?? 100,
      direction: body.direction ?? (assetType === "CFD" ? "LONG" : null),
      optionType: body.optionType ?? null,
      strikePrice: body.strikePrice ?? null,
      expirationDate: body.expirationDate ?? null,
      averageCostBasis: averageCostBasis ?? currentPrice,
      avgCostBasis: round2(costBasis / quantity),
      instrumentAvgCostBasis: averageCostBasis ?? currentPrice,
      totalCostBasis: costBasis,
      costBasis,
      walletId: body.walletId ?? null,
      fees: feeAmount,
      feesType: body.feesType ?? "fixed",
      isOpen: true,
      openedAt: body.executedAt ?? body.openedAt ?? nowIso(),
      currentPrice,
      marketValue: round2(quantity * currentPrice),
      unrealizedGainLoss: round2(quantity * (currentPrice - (averageCostBasis ?? currentPrice))),
      dayChange: 0,
      dayChangePercent: 0,
      displayCurrency: "USD",
    }
    const list = positionsFor(ctx.params.id)
    list.push(position)
    ctx.res.status(201).json(position)
  })

  app.patch("/api/portfolios/:id/positions/:positionId", (ctx) => {
    if (!requireAuth(ctx)) return
    const list = positionsFor(ctx.params.id)
    const idx = list.findIndex((p) => p.id === ctx.params.positionId)
    if (idx < 0) return ctx.res.status(404).json({ error: "NotFound", message: "Position not found" })
    list[idx] = { ...list[idx], ...(ctx.body || {}) }
    ctx.res.json(list[idx])
  })

  app.delete("/api/portfolios/:id/positions/:positionId", (ctx) => {
    if (!requireAuth(ctx)) return
    const list = positionsFor(ctx.params.id)
    const idx = list.findIndex((p) => p.id === ctx.params.positionId)
    if (idx < 0) return ctx.res.status(404).json({ error: "NotFound", message: "Position not found" })
    const [removed] = list.splice(idx, 1)
    ctx.res.json({ ...removed, isOpen: false, closedAt: nowIso() })
  })

  app.get("/api/portfolios/:id/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    if (ctx.query.type === "dividend") return ctx.res.json(transactionsPage(ctx, loadRaw("portfolio_transactions_dividend.json")))
    let data = portfolioTransactions(ctx.params.id)
    if (ctx.query.positionId) {
      data = { items: data.items.filter((t) => t.positionId === ctx.query.positionId), total: 0 }
      data.total = data.items.length
    }
    if (ctx.query.instrumentSymbol) {
      data = filterTransactions(data.items, ctx.query.instrumentSymbol)
    }
    ctx.res.json(transactionsPage(ctx, data))
  })

  app.get("/api/portfolios/:id/transactions/export", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("portfolio_transactions_export.json"))
  })

  app.post("/api/portfolios/:id/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    initTxs()
    const body = ctx.body || {}
    const research = loadResearch(body.symbol || "AAPL")
    const currency = body.currency || "USD"
    const quantity = body.quantity ?? 1
    const price = body.price ?? 100
    // Fee/FX resolution (fees-and-custom-fx D28/D32); manual rates validated.
    const fx = resolveFeeFx(body, currency, {
      notional: quantity * price,
      displayRate: undefined,
    })
    if (fx.error) {
      return ctx.res.status(422).json({ error: "ValidationError", message: fx.error })
    }
    const { rateSource, exchangeRate } = fx.fields
    const tx = {
      id: uuid(),
      portfolioId: ctx.params.id,
      portfolioName: "",
      walletId: body.walletId ?? null,
      positionId: body.positionId ?? null,
      type: body.type || "BUY",
      instrumentSymbol: (body.symbol || "AAPL").toUpperCase(),
      instrumentName: body.instrumentName ?? null,
      sector: body.sector ?? (research ? research.overview.sector : "Other"),
      country: body.country ?? (research ? research.overview.country : "Other"),
      quantity,
      price,
      fees: Number(body.fees) || 0,
      feesType: fx.fields.feesType,
      feeCurrency: fx.fields.feeCurrency,
      feesSettled: Math.round(fx.feesSettled * 1e8) / 1e8,
      totalAmount: round2(quantity * price),
      currency,
      instrumentCurrency: body.instrumentCurrency || currency,
      assetType: body.assetType || "STOCK",
      exchangeRate,
      rateSource,
      isGift: false,
      synthesizedOpeningLot: false,
      executedAt: body.executedAt || nowIso(),
      createdAt: nowIso(),
      displayCurrency: "USD",
      convertedTotalAmount: round2(quantity * price * exchangeRate),
      convertedPrice: round2(price * exchangeRate),
      convertedFees:
        body.fees == null
          ? 0
          : round2(
              (fx.fields.feesType === "pct" ? (quantity * price * (Number(body.fees) || 0)) / 100 : Number(body.fees)) *
                (fx.fields.feeCurrency === currency ? 1 : fx.fields.feeExchangeRate ?? 1) *
                exchangeRate,
            ),
      convertedRealizedGainLoss: null,
    }
    allTxs.set(tx.id, tx)
    ctx.res.status(201).json(tx)
  })

  app.patch("/api/portfolios/:id/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    initTxs()
    const existing = allTxs.get(ctx.params.txId)
    if (!existing || existing.portfolioId !== ctx.params.id) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    }
    const body = ctx.body || {}
    const mergedBody = { ...existing, ...body }
    const quantity = body.quantity ?? existing.quantity ?? 1
    const price = body.price ?? existing.price ?? 0
    const fees = body.fees ?? existing.fees ?? 0
    const currency = existing.currency || "USD"
    const fx = resolveFeeFx(mergedBody, currency, { notional: quantity * price })
    if (fx.error) {
      return ctx.res.status(422).json({ error: "ValidationError", message: fx.error })
    }
    const updated = {
      ...existing,
      ...body,
      id: existing.id,
      portfolioId: existing.portfolioId,
      quantity,
      price,
      fees,
      feeCurrency: fx.fields.feeCurrency,
      feesSettled: Math.round(fx.feesSettled * 1e8) / 1e8,
      rateSource: fx.fields.rateSource,
      exchangeRate: fx.fields.exchangeRate,
      feeRateSource: fx.fields.feeRateSource,
      feeExchangeRate: fx.fields.feeExchangeRate,
      totalAmount: round2(quantity * price),
      convertedTotalAmount: round2(quantity * price * fx.fields.exchangeRate),
      convertedPrice: round2(price * fx.fields.exchangeRate),
      convertedFees: round2((Number(fees) || 0) * fx.fields.exchangeRate),
      updatedAt: nowIso(),
    }
    allTxs.set(ctx.params.txId, updated)
    ctx.res.json(updated)
  })

  app.delete("/api/portfolios/:id/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    initTxs()
    const existing = allTxs.get(ctx.params.txId)
    if (!existing || existing.portfolioId !== ctx.params.id) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    }
    allTxs.delete(ctx.params.txId)
    ctx.res.status(204).end()
  })

  app.get("/api/portfolios/:id/snapshot", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_snapshot.json", "empty_portfolio_snapshot.json"))
  })

  app.get("/api/portfolios/:id/risk-metrics", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_risk_metrics.json", "empty_portfolio_risk_metrics.json"))
  })

  app.get("/api/portfolios/:id/allocation", (ctx) => {
    if (!requireAuth(ctx)) return
    const positions = heldPositions(ctx.params.id)
    ctx.res.json({
      totalValue: round2(positions.reduce((s, p) => s + (p.marketValue || 0), 0)),
      bySector: sumBy(positions, "sector"),
      byAssetType: sumBy(positions, "assetType"),
      byCurrency: sumBy(positions, "instrumentCurrency"),
    })
  })

  app.get("/api/portfolios/:id/dividends", (ctx) => {
    if (!requireAuth(ctx)) return
    const positions = heldPositions(ctx.params.id)
    const rows = []
    for (const p of positions) {
      const research = loadResearch(p.symbol)
      const history = research?.dividends?.history ?? []
      for (const d of history) {
        rows.push({
          symbol: p.symbol,
          companyName: p.companyName,
          date: d.date,
          year: d.year,
          amount: d.amount,
          currency: d.currency || p.instrumentCurrency,
          type: d.type || "dividend",
        })
      }
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1))
    const total = rows.reduce((s, r) => s + (r.amount || 0), 0)
    ctx.res.json({
      totalDividends: round2(total),
      count: rows.length,
      items: rows,
    })
  })

  app.get("/api/portfolios/:id/calendar", (ctx) => {
    if (!requireAuth(ctx)) return
    const positions = heldPositions(ctx.params.id)
    const events = []
    for (const p of positions) {
      const calendar = loadResearch(p.symbol)?.calendar
      if (!calendar) continue
      for (const kind of ["earnings", "exDividend", "dividend"]) {
        for (const e of calendar[kind] || []) {
          events.push({
            symbol: p.symbol,
            companyName: p.companyName,
            type: kind,
            date: String(e.date),
            title: e.title || `${kind} ${e.date}`,
            amount: e.amount ?? null,
            quarter: e.quarter ?? null,
          })
        }
      }
    }
    events.sort((a, b) => (a.date < b.date ? -1 : 1))
    const today = new Date().toISOString().slice(0, 10)
    ctx.res.json({
      upcoming: events.filter((e) => e.date >= today),
      past: events.filter((e) => e.date < today).slice(0, 50),
      total: events.length,
    })
  })

  app.get("/api/portfolios/:id/news", (ctx) => {
    if (!requireAuth(ctx)) return
    const positions = heldPositions(ctx.params.id)
    const symbols = new Set(positions.map((p) => normalize(p.symbol)))
    const all = loadRaw("news_articles_all.json")
    const items = (all?.data ?? []).filter((a) => symbols.has(normalize(a.ticker)))
    ctx.res.json({ data: items, total: items.length })
  })

  app.get("/api/portfolios/:id/compare", (ctx) => {
    if (!requireAuth(ctx)) return
    const positions = heldPositions(ctx.params.id)
    const total = positions.reduce((s, p) => s + (p.marketValue || 0), 0)
    const rows = positions.map((p) => {
      const research = loadResearch(p.symbol)
      const compare = research?.compare ?? {}
      return {
        symbol: p.symbol,
        name: p.companyName,
        quantity: p.quantity,
        marketValue: round2(p.marketValue || 0),
        weight: total ? round2(((p.marketValue || 0) / total) * 100) : 0,
        ...compare,
      }
    })
    ctx.res.json({ totalValue: round2(total), items: rows })
  })
}

function round2(x) {
  return Math.round(x * 100) / 100
}
