import { requireAuth } from "../lib/auth.js"
import { loadJson, loadRaw, loadResearch, loadUniverse, normalize, researchSymbols } from "../lib/data.js"
import { logoPath } from "../lib/data.js"

function noPriceQuoteFor(symbol) {
  const quote = noPriceFixture().quotes?.[normalize(symbol)]
  return quote && typeof quote.currentPrice === "number" ? quote : null
}

function noPriceFixture() {
  return loadJson("no-price-portfolio.json")
}

function getSymbol(ctx) {
  return normalize(ctx.params.symbol)
}

function quoteFrom(symbol, research) {
  const noPriceQuote = noPriceQuoteFor(symbol)
  if (noPriceQuote) return { ...noPriceQuote, symbol }
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
    description: (research.description ?? []).join("\n\n"),
  }
}

function metricsFor(symbol, research) {
  const base = loadRaw("instruments_metrics.json")
  if (!research) return base
  const m = research.metrics
  return {
    metrics: { symbol, metricType: "all", metric: { marketCapitalization: m.marketCap, enterpriseValue: m.enterpriseValue, peRatio: m.peRatio, pegRatio: m.pegRatio, psRatio: round2(m.marketCap / m.revenue), pbRatio: m.pbRatio, evToSales: m.evToSales, evToEBITDA: m.evToEbitda, dividendYield: m.dividendYield, dividendPerShare: m.dividendPerShare, payoutRatio: m.payoutRatio, grossMargin: m.grossMargin, operatingMargin: m.operatingMargin, netProfitMargin: m.netMargin } },
    priceTarget: { symbol, targetHigh: research.priceTarget.targetHigh, targetLow: research.priceTarget.targetLow, targetMean: research.priceTarget.targetMean, targetMedian: research.priceTarget.targetMedian, numberAnalysts: research.priceTarget.numberAnalysts, lastUpdated: research.priceTarget.lastUpdated },
    trailingValuation: { marketCap: m.marketCap, enterpriseValue: m.enterpriseValue, peRatio: m.peRatio, psRatio: round2(m.marketCap / m.revenue), pbRatio: m.pbRatio, evToSales: m.evToSales, evToEBITDA: m.evToEbitda, evToGrossProfit: m.evToGrossProfit, priceToFcf: m.pFcf, pegRatio: m.pegRatio, priceTarget: m.priceTarget, payoutRatio: m.payoutRatio, dividendPerShare: m.dividendPerShare, dpsGrowth5yr: m.dpsGrowth5yr, dividendYield: m.dividendYield },
    margins: { grossMargin: m.grossMargin, operatingMargin: m.operatingMargin, ebitdaMargin: m.ebitdaMargin, netProfitMargin: m.netMargin },
    capitalEfficiency: { returnOnAssets: m.roa, returnOnTotalAssets: m.rota, returnOnEquity: m.roe, assetTurnover: round2(m.revenue / (m.marketCap / m.roe * 100)), inventoryTurnover: round2(10 + m.roa) },
    financialHealth: { currentRatio: round2(0.8 + (m.roa / 100)), quickRatio: round2(0.7 + (m.roa / 100)) },
    perShare: { revenuePerShare: round2(m.revenue / m.sharesOutstanding), eps: m.ttmEps, bookValuePerShare: m.bookValuePerShare, tangibleBookValuePerShare: round2(m.bookValuePerShare * 0.8), cashPerShare: round2(m.cash / m.sharesOutstanding), operatingCashFlowPerShare: round2((m.netIncome * 1.3) / m.sharesOutstanding) },
  }
}

function overviewMetricsFor(symbol, research) {
  const base = loadRaw("instruments_overview_metrics.json")
  if (!research) return base
  return { ...research.metrics, symbol }
}

function historyFor(symbol, resolution, compare) {
  const base = resolution === "monthly" ? loadRaw("history_monthly.json") : loadRaw("history_daily.json")
  const research = loadResearch(symbol)
  // §36 — the series is denominated in the instrument's currency (research
  // fixture carries it; the shared raw fixture is a USD stand-in otherwise).
  const currency = research?.basics?.currency || research?.overview?.currency || base.currency || "USD"
  const h = { ...base, symbol, currency }
  if (!compare) return h
  const prices = base.closePrices
  if (!prices) return h
  let prev = 100
  const bench = prices.map((p, i) => {
    if (i === 0) return prev
    const instRet = (p - prices[i - 1]) / prices[i - 1]
    prev = prev * (1 + instRet * 0.6 + 0.0002)
    return round2(prev)
  })
  h.compare = { name: compare === "qqq" ? "Invesco QQQ" : compare === "iwm" ? "iShares Russell 2000" : "S&P 500 (proxy)", closePrices: bench, timestamps: base.timestamps, currency: "USD" }
  return h
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
    ctx.res.json(historyFor(symbol, ctx.query.resolution, ctx.query.compare))
  })

  app.get("/api/instruments/:symbol/fundamentals", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.fundamentals)
  })

  app.get("/api/instruments/:symbol/compare", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.compare)
  })

  app.get("/api/instruments/:symbol/peers", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    const sector = research.overview.sector
    const candidates = researchSymbols()
      .map((s) => loadResearch(s))
      .filter((r) => r && r.symbol !== symbol && (sector ? r.overview.sector === sector : true))
    const peers = candidates.slice(0, 4)
    ctx.res.json({ symbol, items: [research.compare, ...peers.map((p) => p.compare)] })
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
    const years = Number(ctx.query.years) || 5
    const metric = ctx.query.metric || "avg"
    const yearScale = years === 3 ? 0.8 : years === 10 ? 1.2 : years === 20 ? 1.45 : 1
    const metricShift = metric === "avg" ? 0 : metric === "med" ? -0.3 : metric === "min" ? -1.2 : metric === "max" ? 1.2 : 0
    const monthlyReturns = (research.seasonality.monthly_returns || []).map((m) => ({
      month: m.month,
      return_pct: round2(m.return_pct * yearScale + metricShift),
    }))
    ctx.res.json({ ...research.seasonality, years, metric, monthly_returns: monthlyReturns })
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
    const noPriceQuote = noPriceQuoteFor(symbol)
    if (noPriceQuote) {
      return ctx.res.json({
        symbol,
        date: ctx.query.date || new Date().toISOString().slice(0, 10),
        price: noPriceQuote.currentPrice,
        currency: noPriceQuote.currency || "USD",
      })
    }
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
    const IR_FORMS = /^(10-[KQ]|8-K|20-F|6-K)$/
    // Keep investor-relevant SEC forms (10-K/10-Q/8-K) and natty events;
    // map SEC report filings to the backend's press-release event shape.
    const mapped = []
    for (const e of events) {
      const base = { ...e, symbol }
      if (e.type === "filing" && e.title) {
        const formMatch = String(e.title).match(/Form\s+([\d-]+[A-Z]?)\s*\(/)
        const form = formMatch ? formMatch[1] : null
        if (!form || !IR_FORMS.test(form)) continue
        mapped.push({
          ...base,
          type: "press-release",
          formType: form,
          reportUrl: e.url ?? null,
          id: `${symbol}_${form}_${e.id}`,
        })
        continue
      }
      mapped.push(base)
    }
    ctx.res.json(mapped)
  })

  app.get("/api/instruments/:symbol/investor-relations/:eventId/transcript", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const eventId = String(ctx.params.eventId ?? "")
    const transcript = loadRaw("ir_transcript.json")
    const formMatch = eventId.match(/_([\d-]+[A-Z]?)_/)
    if (formMatch && /^10-[KQ]$|^8-K$/.test(formMatch[1])) {
      return ctx.res.json({
        id: eventId,
        symbol,
        year: Number(eventId.match(/_(\d{4})/)?.[1]) || null,
        quarter: null,
        title: `${symbol} - Management Discussion & Analysis`,
        time: null,
        participant: [],
        audio: null,
        transcript: [],
        body: `${symbol}'s Management Discussion & Analysis covers the company's financial condition and results of operations for the reported period, including revenue by category and geography, gross margin drivers, operating expenses, and liquidity. Demand for the company's products and services remained robust during the quarter, with the installed base of active devices reaching an all-time high.`,
      })
    }
    ctx.res.json(transcript)
  })
}
