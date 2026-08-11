import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadResearch } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"

const created = new Map()
const createdPositions = new Map()

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
  const existing = loadRaw("portfolios_summaries.json").find((p) => p.id === id)
  if (existing) return existing
  const createdPortfolio = created.get(id)
  if (createdPortfolio) return createdPortfolio
  return null
}

function withDataFile(id, baseName, emptyName) {
  if (created.has(id)) return loadRaw(emptyName)
  return findPortfolio(id) ? loadRaw(baseName) : loadRaw(emptyName)
}

export function register(app) {
  app.get("/api/portfolios", (ctx) => {
    if (!requireAuth(ctx)) return
    const portfolios = loadRaw("portfolios_summaries.json")
    ctx.res.json(portfolios.concat([...created.values()]))
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
    ctx.res.json(loadRaw("portfolios_shares.json"))
  })

  app.get("/api/portfolios/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const all = loadRaw("portfolios_transactions.json")
    ctx.res.json(paginatePage(ctx.query.page, ctx.query.limit, all.items, all.total))
  })

  app.post("/api/portfolios", (ctx) => {
    if (!requireAuth(ctx)) return
    const { name, description, strategy = "GROWTH", currency = "USD", isPublic = false } = ctx.body || {}
    if (!name) {
      return ctx.res.status(422).json({ error: "ValidationError", message: "name is required", statusCode: 422 })
    }
    const id = uuid()
    const wallet = loadRaw("wallets.json")[0]
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
    createdPositions.delete(ctx.params.id)
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
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_positions.json", "empty_portfolio_positions.json"))
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
    const { symbol = "AAPL", quantity = 1, price, averageCostBasis = price } = ctx.body || {}
    const research = loadResearch(symbol)
    const template = withDataFile(ctx.params.id, "portfolio_positions.json", "empty_portfolio_positions.json")
    const base = (Array.isArray(template) && template[0]) || {
      companyName: research ? research.overview.name : symbol,
      assetType: "STOCK",
      instrumentCurrency: "USD",
      purchaseCurrency: "USD",
      sector: research ? research.overview.sector : "Technology",
      industry: research ? research.overview.industry : "",
      country: research ? research.overview.country : "US",
    }
    const currentPrice = price || (research ? research.basics.price : 100)
    const position = {
      ...base,
      id: uuid(),
      portfolioId: ctx.params.id,
      symbol,
      quantity,
      averageCostBasis: averageCostBasis ?? currentPrice,
      avgCostBasis: averageCostBasis ?? currentPrice,
      instrumentAvgCostBasis: averageCostBasis ?? currentPrice,
      totalCostBasis: round2(quantity * (averageCostBasis ?? currentPrice)),
      costBasis: round2(quantity * (averageCostBasis ?? currentPrice)),
      isOpen: true,
      openedAt: nowIso(),
      currentPrice,
      marketValue: round2(quantity * currentPrice),
      unrealizedGainLoss: round2(quantity * (currentPrice - (averageCostBasis ?? currentPrice))),
      dayChange: 0,
      dayChangePercent: 0,
      displayCurrency: "USD",
    }
    const list = createdPositions.get(ctx.params.id) || []
    list.push(position)
    createdPositions.set(ctx.params.id, list)
    ctx.res.status(201).json(position)
  })

  app.patch("/api/portfolios/:id/positions/:positionId", (ctx) => {
    if (!requireAuth(ctx)) return
    const list = createdPositions.get(ctx.params.id) || []
    const idx = list.findIndex((p) => p.id === ctx.params.positionId)
    if (idx < 0) return ctx.res.status(404).json({ error: "NotFound", message: "Position not found" })
    list[idx] = { ...list[idx], ...(ctx.body || {}) }
    ctx.res.json(list[idx])
  })

  app.delete("/api/portfolios/:id/positions/:positionId", (ctx) => {
    if (!requireAuth(ctx)) return
    const list = createdPositions.get(ctx.params.id) || []
    const idx = list.findIndex((p) => p.id === ctx.params.positionId)
    if (idx < 0) return ctx.res.status(404).json({ error: "NotFound", message: "Position not found" })
    const [removed] = list.splice(idx, 1)
    ctx.res.json({ ...removed, isOpen: false, closedAt: nowIso() })
  })

  app.get("/api/portfolios/:id/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const isCreated = findPortfolio(ctx.params.id) ? false : created.has(ctx.params.id)
    const data = isCreated
      ? loadRaw("empty_portfolio_transactions.json")
      : ctx.query.type === "dividend"
        ? loadRaw("portfolio_transactions_dividend.json")
        : loadRaw("portfolio_transactions_page.json")
    ctx.res.json(paginatePage(ctx.query.page, ctx.query.limit, data.items, data.total))
  })

  app.get("/api/portfolios/:id/transactions/export", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("portfolio_transactions_export.json"))
  })

  app.post("/api/portfolios/:id/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const body = ctx.body || {}
    const tx = {
      id: uuid(),
      portfolioId: ctx.params.id,
      type: body.type || "BUY",
      instrumentSymbol: body.symbol || "AAPL",
      quantity: body.quantity ?? 1,
      price: body.price ?? 100,
      totalAmount: round2((body.quantity ?? 1) * (body.price ?? 100)),
      currency: body.currency || "USD",
      createdAt: nowIso(),
    }
    ctx.res.status(201).json(tx)
  })

  app.get("/api/portfolios/:id/snapshot", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_snapshot.json", "empty_portfolio_snapshot.json"))
  })

  app.get("/api/portfolios/:id/risk-metrics", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(withDataFile(ctx.params.id, "portfolio_risk_metrics.json", "empty_portfolio_risk_metrics.json"))
  })
}

function round2(x) {
  return Math.round(x * 100) / 100
}
