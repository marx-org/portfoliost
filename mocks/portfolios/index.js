import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadResearch, normalize } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"

const created = new Map()
const positionsByPortfolio = new Map()
const newPortfolioIds = new Set()
const allTxs = new Map()
let txInited = false
let shares = null

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
  "6M": "portfolio_analytics_6M.json",
  "1Y": "portfolio_analytics_1Y.json",
  "2Y": "portfolio_analytics_2Y.json",
  ALL: "portfolio_analytics_all.json",
}

const EMPTY_BY_TIMEFRAME = {
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
  const existing = loadRaw("portfolios_summaries.json").find((p) => p.id === id)
  return existing || null
}

function withDataFile(id, baseName, emptyName) {
  if (newPortfolioIds.has(id)) return loadRaw(emptyName)
  return findPortfolio(id) ? loadRaw(baseName) : loadRaw(emptyName)
}

function positionsFor(id) {
  if (!positionsByPortfolio.has(id)) {
    const base = newPortfolioIds.has(id) ? [] : loadRaw("portfolio_positions.json")
    positionsByPortfolio.set(id, (Array.isArray(base) ? base : []).map((p) => ({ ...p })))
  }
  return positionsByPortfolio.get(id)
}

function heldPositions(id) {
  return positionsFor(id)
}

function allTransactions() {
  initTxs()
  const items = [...allTxs.values()]
  return { items, total: items.length }
}

function portfolioTransactions(id) {
  initTxs()
  const items = [...allTxs.values()].filter((t) => t.portfolioId === id)
  return { items, total: items.length }
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
    ctx.res.json([...byId.values()])
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
    ctx.res.json(transactionsPage(ctx, allTransactions()))
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
    const file = ctx.query.benchmark ? "portfolio_analytics_all_bench.json" : ANALYTICS_BY_TIMEFRAME[timeframe]
    const emptyFile = EMPTY_BY_TIMEFRAME[timeframe]
    ctx.res.json(withDataFile(ctx.params.id, file, emptyFile))
  })

  app.get("/api/portfolios/:id/positions", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(positionsFor(ctx.params.id))
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
    const tx = {
      id: uuid(),
      portfolioId: ctx.params.id,
      portfolioName: "",
      walletId: body.walletId ?? null,
      positionId: body.positionId ?? null,
      type: body.type || "BUY",
      instrumentSymbol: (body.symbol || "AAPL").toUpperCase(),
      instrumentName: body.instrumentName ?? null,
      quantity: body.quantity ?? 1,
      price: body.price ?? 100,
      fees: body.fees ?? 0,
      totalAmount: round2((body.quantity ?? 1) * (body.price ?? 100)),
      currency: body.currency || "USD",
      instrumentCurrency: body.instrumentCurrency || body.currency || "USD",
      assetType: body.assetType || "STOCK",
      exchangeRate: body.exchangeRate ?? 1,
      isGift: false,
      synthesizedOpeningLot: false,
      executedAt: body.executedAt || nowIso(),
      createdAt: nowIso(),
      displayCurrency: body.currency || "USD",
      convertedTotalAmount: round2((body.quantity ?? 1) * (body.price ?? 100)),
      convertedPrice: body.price ?? 100,
      convertedFees: body.fees ?? 0,
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
    const quantity = body.quantity ?? existing.quantity ?? 1
    const price = body.price ?? existing.price ?? 0
    const fees = body.fees ?? existing.fees ?? 0
    const updated = {
      ...existing,
      ...body,
      id: existing.id,
      portfolioId: existing.portfolioId,
      quantity,
      price,
      fees,
      totalAmount: round2(quantity * price),
      convertedTotalAmount: round2(quantity * price),
      convertedPrice: price,
      convertedFees: fees,
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
