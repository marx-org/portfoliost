import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadResearch, loadUniverse, normalize } from "../lib/data.js"
import { logoPath } from "../lib/data.js"

function getSymbol(ctx) {
  return normalize(ctx.params.symbol)
}

function quoteFrom(symbol, research) {
  const q = loadRaw("quote_aapl.json")
  const price = research ? research.basics.price : q.currentPrice
  const prevClose = research ? research.basics.prevClose : q.previousClose
  return {
    ...q,
    symbol,
    currentPrice: price,
    highPrice: price,
    lowPrice: price,
    openPrice: price,
    previousClose: prevClose,
    change: round2(price - prevClose),
    percentChange: round2(((price - prevClose) / prevClose) * 100),
    regularMarketPrice: price,
  }
}

function detailFor(symbol, research) {
  const d = loadRaw("instruments_detail.json")
  const name = research ? research.overview.name : d.name
  return {
    id: `${symbol}.US`,
    symbol,
    name,
    exchange: research ? research.overview.exchange : d.exchange,
    type: research ? research.overview.type : d.type,
    currency: research ? research.overview.currency : d.currency,
  }
}

function profileFor(symbol, research) {
  const p = loadRaw("instruments_profile.json")
  if (!research) return p
  return {
    ...p,
    ticker: symbol,
    name: research.overview.name,
    country: research.overview.country,
    exchange: research.overview.exchange,
    logo: `/logos/${symbol}.svg`,
    marketCapitalization: research.basics.marketCap / 1e6,
    marketcapUSD: research.basics.marketCap,
    shareOutstanding: research.basics.sharesOutstanding,
  }
}

function metricsFor(symbol, research) {
  const base = loadRaw("instruments_metrics.json")
  if (!research) return base
  const m = research.metrics
  return {
    metrics: { symbol, metricType: "all", metric: { marketCapitalization: m.marketCap, enterpriseValue: m.enterpriseValue, peRatio: m.peRatio, pegRatio: m.pegRatio, psRatio: round2(m.marketCap / m.revenue), pbRatio: m.pbRatio, evToSales: m.evToSales, evToEBITDA: m.evToEbitda, dividendYield: m.dividendYield, dividendPerShare: m.dividendPerShare, payoutRatio: m.payoutRatio, grossMargin: m.grossMargin, operatingMargin: m.operatingMargin, netProfitMargin: m.netMargin } },
    priceTarget: { symbol, targetHigh: research.priceTarget.targetHigh, targetLow: research.priceTarget.targetLow, targetMean: research.priceTarget.targetMean, targetMedian: research.priceTarget.targetMedian, numberAnalysts: research.priceTarget.numberAnalysts, lastUpdated: research.priceTarget.lastUpdated },
    trailingValuation: { marketCap: m.marketCap, enterpriseValue: m.enterpriseValue, peRatio: m.peRatio, psRatio: round2(m.marketCap / m.revenue), pbRatio: m.pbRatio, evToSales: m.evToSales, evToEBITDA: m.evToEbitda, dividendYield: m.dividendYield },
    margins: { grossMargin: m.grossMargin, operatingMargin: m.operatingMargin, ebitdaMargin: m.ebitdaMargin, netProfitMargin: m.netMargin },
    capitalEfficiency: { returnOnAssets: m.roa, returnOnEquity: m.roe, assetTurnover: round2(m.revenue / (m.marketCap / m.roe * 100)), inventoryTurnover: round2(10 + m.roa) },
    financialHealth: { currentRatio: round2(0.8 + (m.roa / 100)), quickRatio: round2(0.7 + (m.roa / 100)) },
    perShare: { revenuePerShare: round2(m.revenue / m.sharesOutstanding), eps: m.ttmEps, bookValuePerShare: m.bookValuePerShare, tangibleBookValuePerShare: round2(m.bookValuePerShare * 0.8), cashPerShare: round2(m.cash / m.sharesOutstanding), operatingCashFlowPerShare: round2((m.netIncome * 1.3) / m.sharesOutstanding) },
  }
}

function overviewMetricsFor(symbol, research) {
  const base = loadRaw("instruments_overview_metrics.json")
  if (!research) return base
  return { ...research.metrics, symbol }
}

function historyFor(symbol, resolution) {
  const base = resolution === "monthly" ? loadRaw("history_monthly.json") : loadRaw("history_daily.json")
  return { ...base, symbol }
}

function round2(x) {
  return Math.round(x * 100) / 100
}

export function register(app) {
  app.get("/api/instruments/search", (ctx) => {
    if (!requireAuth(ctx)) return
    const q = (ctx.query.q || ctx.query.query || "").toUpperCase().trim()
    const universe = loadUniverse()
    let results = universe.map((u) => ({ symbol: u.symbol, name: u.name, type: u.type, exchange: u.exchange, source: "FINNHUB" }))
    if (q) {
      results = results.filter((r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q))
    }
    ctx.res.json({ count: results.length, results })
  })

  app.get("/api/instruments/:symbol", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    ctx.res.json(detailFor(symbol, loadResearch(symbol)))
  })

  app.get("/api/instruments/:symbol/profile", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    ctx.res.json(profileFor(symbol, loadResearch(symbol)))
  })

  app.get("/api/instruments/:symbol/metrics", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    ctx.res.json(metricsFor(symbol, loadResearch(symbol)))
  })

  app.get("/api/instruments/:symbol/overview-metrics", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    ctx.res.json(overviewMetricsFor(symbol, loadResearch(symbol)))
  })

  app.get("/api/instruments/:symbol/quote", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    ctx.res.json(quoteFrom(symbol, loadResearch(symbol)))
  })

  app.get("/api/instruments/:symbol/history", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    ctx.res.json(historyFor(symbol, ctx.query.resolution))
  })

  app.get("/api/instruments/:symbol/fundamentals", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.fundamentals)
  })

  app.get("/api/instruments/:symbol/ownership", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.ownership)
  })

  app.get("/api/instruments/:symbol/dividends", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.dividends)
  })

  app.get("/api/instruments/:symbol/calendar", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.calendar)
  })

  app.get("/api/instruments/:symbol/seasonality", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json({ ...research.seasonality, years: Number(ctx.query.years) || 5, metric: ctx.query.metric || "avg" })
  })

  app.get("/api/instruments/:symbol/eps-surprises", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.epsSurprises)
  })

  app.get("/api/instruments/:symbol/projections", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.projections)
  })

  app.get("/api/instruments/:symbol/price", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    const price = research ? research.basics.price : loadRaw("quote_aapl.json").currentPrice
    ctx.res.json({
      symbol,
      date: ctx.query.date || new Date().toISOString().slice(0, 10),
      price,
      currency: research ? research.basics.currency : "USD",
    })
  })

  app.get("/api/instruments/:symbol/investor-relations", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const events = loadRaw("ir_events_aapl.json")
    ctx.res.json(events.map((e) => (symbol === "AAPL" ? e : { ...e, symbol })))
  })

  app.get("/api/instruments/:symbol/investor-relations/:eventId/transcript", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("ir_transcript.json"))
  })

  app.get("/logos/:symbol", (ctx) => {
    ctx.res.sendFile(logoPath(ctx.params.symbol))
  })

  app.get("/api/logos/:symbol", (ctx) => {
    ctx.res.sendFile(logoPath(ctx.params.symbol))
  })
}
