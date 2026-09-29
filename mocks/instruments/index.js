import { requireAuth } from "../lib/auth.js"
import { loadJson, loadRaw, loadResearch, loadUniverse, normalize, researchSymbols } from "../lib/data.js"
import { logoPath } from "../lib/data.js"
import { convertSeriesAs, targetCurrencyParam } from "../lib/demo-fx.js"

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

/** §47.5 — the research fixture's currency + sourcing signal. A fixture may
 * declare `basics.currencySource` ("provider" | "estimated") explicitly;
 * otherwise a declared currency means "provider" and a missing one "unknown".
 * Non-research symbols fall back to the raw USD fixture (declared). */
function currencyInfo(research) {
  if (!research) return { currency: "USD", currencySource: "provider" }
  const basics = research.basics || {}
  const overview = research.overview || {}
  const currency = basics.currency ?? overview.currency ?? null
  const currencySource = basics.currencySource ?? (currency ? "provider" : "unknown")
  return { currency, currencySource }
}

function quoteFrom(symbol, research) {
  const noPriceQuote = noPriceQuoteFor(symbol)
  if (noPriceQuote) return { ...noPriceQuote, symbol, currencySource: noPriceQuote.currency ? "provider" : "unknown" }
  const q = loadRaw("quote_aapl.json")
  const ci = currencyInfo(research)
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
    currency: ci.currency,
    currencySource: ci.currencySource,
    regularMarketPrice: price,
  }
}

function detailFor(symbol, research) {
  const d = loadRaw("instruments_detail.json")
  const name = research ? research.overview.name : d.name
  const ci = currencyInfo(research)
  return {
    id: `${symbol}.US`,
    symbol,
    name,
    exchange: research ? research.overview.exchange : d.exchange,
    type: research ? research.overview.type : d.type,
    currency: ci.currency,
    currencySource: ci.currencySource,
  }
}

function profileFor(symbol, research) {
  const p = loadRaw("instruments_profile.json")
  const ci = currencyInfo(research)
  if (!research) return { ...p, currencySource: ci.currencySource }
  return {
    ...p,
    ticker: symbol,
    name: research.overview.name,
    country: research.overview.country,
    countryCode:
      typeof research.overview.country === "string" && /^[A-Za-z]{2}$/.test(research.overview.country)
        ? research.overview.country.toUpperCase()
        : null,
    // §61.8 — asset class for the shared identity block (TickerBadge).
    assetType: research.overview.type ?? null,
    exchange: research.overview.exchange,
    logo: `/logos/${symbol}.svg`,
    marketCapitalization: research.basics.marketCap / 1e6,
    marketcapUSD: research.basics.marketCap,
    shareOutstanding: research.basics.sharesOutstanding,
    description: (research.description ?? []).join("\n\n"),
    currency: ci.currency,
    currencySource: ci.currencySource,
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

function historyFor(symbol, resolution, compare, targetCcy) {
  const base = resolution === "monthly" ? loadRaw("history_monthly.json") : loadRaw("history_daily.json")
  const ci = currencyInfo(loadResearch(symbol))
  // §36 — the series is denominated in the instrument's currency; §47.5 — the
  // sourcing signal rides along (null currency = unknown, never a USD guess).
  const h = { ...base, symbol, currency: ci.currency, currencySource: ci.currencySource, baseCurrency: ci.currency, fxFrom: null }
  const dates = (base.timestamps || []).map((t) => new Date(t * 1000).toISOString().slice(0, 10))
  // Plan §48.5 — ?currency= converts closes against the demo FX schedule
  // (floor semantics; mirrors the real instruments service).
  if (targetCcy && ci.currency && targetCcy !== ci.currency) {
    const cc = convertSeriesAs(dates, base.closePrices || [], ci.currency, targetCcy)
    const ch = convertSeriesAs(dates, base.highPrices || [], ci.currency, targetCcy)
    const cl = convertSeriesAs(dates, base.lowPrices || [], ci.currency, targetCcy)
    const co = convertSeriesAs(dates, base.openPrices || [], ci.currency, targetCcy)
    h.closePrices = cc.converted
    h.highPrices = ch.converted
    h.lowPrices = cl.converted
    h.openPrices = co.converted
    h.currency = targetCcy
    h.fxFrom = cc.fxFrom
  }
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
  const benchCurrency = targetCcy && ci.currency && targetCcy !== ci.currency ? targetCcy : "USD"
  let benchPrices = bench
  if (benchCurrency !== "USD") {
    benchPrices = convertSeriesAs(dates, bench, "USD", benchCurrency).converted
  }
  h.compare = { name: compare === "qqq" ? "Invesco QQQ" : compare === "iwm" ? "iShares Russell 2000" : "S&P 500 (proxy)", closePrices: benchPrices, timestamps: base.timestamps, currency: benchCurrency }
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
    const target = targetCurrencyParam(ctx.query.currency)
    if (target.status) return ctx.res.status(target.status).json({ error: "BadRequest", message: target.message })
    // Plan §48.5 — an unresolvable base never converts (the real service
    // answers 200 unconverted for /history; the floor is surfaced via fxFrom).
    ctx.res.json(historyFor(symbol, ctx.query.resolution, ctx.query.compare, target.value))
  })

  // §45.6 — the cached daily close series (price-bars). Derived from the daily
  // history fixture (timestamps → ISO dates, 1:1 closes) so the SPA's
  // "price-bars now, full history in background" flow has an instant source.
  app.get("/api/instruments/:symbol/price-bars", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const target = targetCurrencyParam(ctx.query.currency)
    if (target.status) return ctx.res.status(target.status).json({ error: "BadRequest", message: target.message })
    const base = loadRaw("history_daily.json")
    const ci = currencyInfo(loadResearch(symbol))
    // Plan §48.5 — ?currency= converts against the demo FX schedule; the real
    // service 400s when the base currency is unknown (cannot convert).
    if (target.value && !ci.currency) {
      return ctx.res.status(400).json({ error: "BadRequest", message: "base currency unknown; cannot convert" })
    }
    const dates = (base.timestamps || []).map((t) => new Date(t * 1000).toISOString().slice(0, 10))
    let closes = base.closePrices || []
    let currency = ci.currency
    let fxFrom = null
    if (target.value && ci.currency && target.value !== ci.currency) {
      const cc = convertSeriesAs(dates, closes, ci.currency, target.value)
      closes = cc.converted
      currency = target.value
      fxFrom = cc.fxFrom
    }
    ctx.res.json({ symbol, timeframe: "daily", stale: false, currency, baseCurrency: ci.currency, fxFrom, dates, closes })
  })

  app.get("/api/instruments/:symbol/fundamentals", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(research.fundamentals)
  })

  // §61.4 — the compare rows carry the instrument identity the shared
  // TickerBadge needs. Derived from the seeded research profile; null (never
  // guessed) when that profile does not carry a country.
  function withIdentity(research) {
    const ov = research?.overview ?? {}
    const cc = typeof ov.country === "string" && /^[A-Za-z]{2}$/.test(ov.country) ? ov.country.toUpperCase() : null
    return { ...research.compare, countryCode: cc, assetType: ov.type ?? null }
  }

  app.get("/api/instruments/:symbol/compare", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    ctx.res.json(withIdentity(research))
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
    ctx.res.json({ symbol, items: [withIdentity(research), ...peers.map((p) => withIdentity(p))] })
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
    // §49.6 — research /dividends carries a never-null currency + source (§47.4)
    const ci = currencyInfo(research)
    return ctx.res.json({
      ...research.dividends,
      currency: ci.currency ?? "USD",
      currencySource: ci.currencySource,
      history: (research.dividends.history || []).map((r) => ({ ...r, currency: r.currency ?? ci.currency ?? "USD" })),
    })
  })

  app.get("/api/instruments/:symbol/calendar", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = getSymbol(ctx)
    const research = loadResearch(symbol)
    if (!research) return ctx.res.status(404).json({ error: "NotFound", message: `Unknown symbol ${symbol}` })
    // §49.6 — the calendar currency is the resolved instrument currency (never null)
    const ci = currencyInfo(research)
    return ctx.res.json({ ...research.calendar, currency: ci.currency ?? "USD" })
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
    const ci = currencyInfo(research)
    const price = research ? research.basics.price : loadRaw("quote_aapl.json").currentPrice
    ctx.res.json({
      symbol,
      date: ctx.query.date || new Date().toISOString().slice(0, 10),
      price,
      currency: ci.currency,
      currencySource: ci.currencySource,
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
