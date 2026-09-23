import { spawn } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { DEMO_FX_DAYS, DEMO_RATES } from "../lib/demo-fx.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PORT = Number(process.env.TEST_PORT || 4099)
const BASE = `http://localhost:${PORT}/api`
const EMAIL = process.env.EXAMPLE_SERVICE_MOCK_EMAIL || "demo@example.com"
const PASSWORD = process.env.EXAMPLE_SERVICE_MOCK_PASSWORD || "example-service-mock"

let passed = 0
let failed = 0
const failures = []

function check(name, cond, detail = "") {
  if (cond) {
    passed++
  } else {
    failed++
    failures.push(`${name} ${detail}`)
    console.error(`  FAIL ${name} ${detail}`)
  }
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { accept: "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers["content-type"] = "application/json"
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

function isObj(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x)
}
function hasKeys(obj, keys) {
  return keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k))
}

async function main() {
  console.log(`[tests] starting mock on port ${PORT}...`)
  const child = spawn(process.execPath, [join(ROOT, "mocks", "gateway", "index.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  })

  let up = false
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`)
      if (r.ok) { up = true; break }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!up) {
    console.error("[tests] mock did not start")
    process.exit(1)
  }

  console.log("[tests] mock is up — running checks\n")

  // ── Auth ────────────────────────────────────────────────────
  const bad = await request("/auth/login", { method: "POST", body: { email: EMAIL, password: "wrong" } })
  check("auth.login rejects bad credentials", bad.status === 401, `got ${bad.status}`)

  const login = await request("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  check("auth.login returns 200", login.status === 200, `got ${login.status}`)
  check("auth.login returns access_token + user", isObj(login.json) && login.json.access_token && login.json.user, JSON.stringify(login.json || {}).slice(0, 120))
  const token = login.json.access_token

  const me = await request("/auth/me", { token })
  check("auth.me returns current user", me.status === 200 && me.json.user.email === EMAIL, `got ${me.status}`)

  const noAuth = await request("/portfolios")
  check("protected routes require auth", noAuth.status === 401, `got ${noAuth.status}`)

  const logoutLogin = await request("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  const logoutToken = logoutLogin.json.access_token
  const logoutRes = await request("/auth/logout", { method: "POST", token: logoutToken })
  check("auth.logout returns 204", logoutRes.status === 204, `got ${logoutRes.status}`)
  const afterLogout = await request("/auth/me", { token: logoutToken })
  check("auth.logout invalidates session", afterLogout.status === 401, `got ${afterLogout.status}`)

  // ── Users ───────────────────────────────────────────────────
  const profile = await request("/users/profile", { token })
  check("users.profile", profile.status === 200 && profile.json.email, `got ${profile.status}`)

  const prefs = await request("/users/preferences", { token })
  check("users.preferences", prefs.status === 200 && prefs.json.userId, `got ${prefs.status}`)

  for (const p of ["/users/preferences/custom-benchmarks", "/users/preferences/custom-timeframes", "/users/onboarding/status", "/users/onboarding/draft"]) {
    const r = await request(p, { token })
    check(`users${p}`, r.status === 200, `got ${r.status}`)
  }

  // ── Billing ─────────────────────────────────────────────────
  const plans = await request("/billing/plans", { token })
  check("billing.plans has BASIC + PREMIUM", plans.status === 200 && Array.isArray(plans.json.plans) && plans.json.plans.some((p) => p.tier === "PREMIUM"), `got ${plans.status}`)
  const sub = await request("/billing/subscription", { token })
  check("billing.subscription", sub.status === 200 && sub.json.planTier === "BASIC", `got ${sub.status}`)
  const ent = await request("/billing/entitlements", { token })
  check("billing.entitlements", ent.status === 200 && ent.json.features && isObj(ent.json.features), `got ${ent.status}`)

  // ── Notifications ───────────────────────────────────────────
  const notif = await request("/notifications", { token })
  check("notifications.list", notif.status === 200 && Array.isArray(notif.json.items) && "unreadCount" in notif.json, `got ${notif.status}`)
  const unread = await request("/notifications/unread-count", { token })
  check("notifications.unread-count", unread.status === 200 && "count" in unread.json, `got ${unread.status}`)
  const npref = await request("/notifications/preferences", { token })
  check("notifications.preferences", npref.status === 200 && "newsEnabled" in npref.json, `got ${npref.status}`)
  const nsym = await request("/notifications/symbols", { token })
  check("notifications.symbols", nsym.status === 200 && "totalEnabled" in nsym.json, `got ${nsym.status}`)

  // ── News ────────────────────────────────────────────────────
  const articles = await request("/news/articles", { token })
  check("news.articles", articles.status === 200 && Array.isArray(articles.json.data) && "pagination" in articles.json, `got ${articles.status}`)
  const articlesPaged = await request("/news/articles?limit=5", { token })
  check("news.articles respects limit", articlesPaged.json.data.length === 5, `len ${articlesPaged.json.data.length}`)
  const timeline = await request("/news/timeline", { token })
  check("news.timeline", timeline.status === 200 && Array.isArray(timeline.json.data), `got ${timeline.status}`)
  const ticker = await request("/news/articles?ticker=AAPL", { token })
  check("news.articles ticker filter", ticker.status === 200 && ticker.json.data.every((a) => a.ticker === "AAPL"), `got ${ticker.status}`)
  const contexts = await request("/news/market-contexts", { token })
  check("news.market-contexts", contexts.status === 200 && Array.isArray(contexts.json.data), `got ${contexts.status}`)
  const stats = await request("/news/stats?ticker=AAPL", { token })
  check("news.stats", stats.status === 200 && stats.json.data && stats.json.data.ticker === "AAPL", `got ${stats.status}`)
  const tracked = await request("/news/tracked-tickers", { token })
  check("news.tracked-tickers", tracked.status === 200 && tracked.json.data.tickers.length > 0, `got ${tracked.status}`)
  const channels = await request("/news/livestreams/channels", { token })
  check("news.livestreams.channels", channels.status === 200 && Array.isArray(channels.json) && channels.json.length > 0, `got ${channels.status}`)
  const live = await request("/news/livestreams/live", { token })
  check("news.livestreams.live", live.status === 200 && "isLive" in live.json, `got ${live.status}`)
  const insights = await request("/news/insights", { token })
  check("news.insights serves full data (not 403)", insights.status === 200, `got ${insights.status}`)

  // ── Instruments ─────────────────────────────────────────────
  const detail = await request("/instruments/AAPL", { token })
  check("instruments.detail", detail.status === 200 && detail.json.symbol === "AAPL", `got ${detail.status}`)
  const profile2 = await request("/instruments/AAPL/profile", { token })
  check("instruments.profile", profile2.status === 200 && profile2.json.ticker === "AAPL", `got ${profile2.status}`)
  const metrics = await request("/instruments/AAPL/metrics", { token })
  check("instruments.metrics", metrics.status === 200 && metrics.json.metrics && metrics.json.metrics.symbol, `got ${metrics.status}`)
  const ovm = await request("/instruments/AAPL/overview-metrics", { token })
  check("instruments.overview-metrics", ovm.status === 200 && "marketCap" in ovm.json && "peRatio" in ovm.json, `got ${ovm.status}`)
  const quote = await request("/instruments/AAPL/quote", { token })
  check("instruments.quote", quote.status === 200 && quote.json.symbol === "AAPL" && quote.json.currentPrice > 0, `got ${quote.status}`)
  const histDaily = await request("/instruments/AAPL/history?resolution=daily", { token })
  check("instruments.history daily", histDaily.status === 200 && Array.isArray(histDaily.json.timestamps) && histDaily.json.timestamps.length > 200, `got ${histDaily.status} len ${histDaily.json && histDaily.json.timestamps && histDaily.json.timestamps.length}`)
  const histMonthly = await request("/instruments/AAPL/history?resolution=monthly", { token })
  check("instruments.history monthly", histMonthly.status === 200 && histMonthly.json.timestamps.length > 200, `got ${histMonthly.status}`)
  const search = await request("/instruments/search?q=AAPL", { token })
  check("instruments.search", search.status === 200 && search.json.count > 0 && search.json.results[0].symbol.includes("AAPL"), `got ${search.status}`)
  const searchEmpty = await request("/instruments/search?q=ZZZQX", { token })
  check("instruments.search no results", searchEmpty.status === 200 && searchEmpty.json.count === 0, `got ${searchEmpty.status}`)

  // §47.5 — currency + currencySource on the instrument carriers:
  // SNT.WA = provider PLN, AMAT = estimated USD, AMD = unknown (null).
  const curPair = (r, path) => `${r.json.currency}/${r.json.currencySource}`
  const sntProfile = await request("/instruments/SNT.WA/profile", { token })
  check("instruments.currency SNT.WA profile provider/PLN", sntProfile.status === 200 && sntProfile.json.currency === "PLN" && sntProfile.json.currencySource === "provider", curPair(sntProfile, "profile"))
  const sntQuote = await request("/instruments/SNT.WA/quote", { token })
  check("instruments.currency SNT.WA quote provider/PLN", sntQuote.status === 200 && sntQuote.json.currency === "PLN" && sntQuote.json.currencySource === "provider", curPair(sntQuote, "quote"))
  const sntHist = await request("/instruments/SNT.WA/history?resolution=daily", { token })
  check("instruments.currency SNT.WA history provider/PLN", sntHist.status === 200 && sntHist.json.currency === "PLN" && sntHist.json.currencySource === "provider", curPair(sntHist, "history"))
  const amatProfile = await request("/instruments/AMAT/profile", { token })
  check("instruments.currency AMAT profile estimated/USD", amatProfile.status === 200 && amatProfile.json.currency === "USD" && amatProfile.json.currencySource === "estimated", curPair(amatProfile, "profile"))
  const amatQuote = await request("/instruments/AMAT/quote", { token })
  check("instruments.currency AMAT quote estimated/USD", amatQuote.status === 200 && amatQuote.json.currency === "USD" && amatQuote.json.currencySource === "estimated", curPair(amatQuote, "quote"))
  const amdProfile = await request("/instruments/AMD/profile", { token })
  check("instruments.currency AMD profile unknown/null", amdProfile.status === 200 && amdProfile.json.currency === null && amdProfile.json.currencySource === "unknown", curPair(amdProfile, "profile"))
  const amdQuote = await request("/instruments/AMD/quote", { token })
  check("instruments.currency AMD quote unknown/null", amdQuote.status === 200 && amdQuote.json.currency === null && amdQuote.json.currencySource === "unknown", curPair(amdQuote, "quote"))
  const amdHist = await request("/instruments/AMD/history?resolution=daily", { token })
  check("instruments.currency AMD history unknown/null", amdHist.status === 200 && amdHist.json.currency === null && amdHist.json.currencySource === "unknown", curPair(amdHist, "history"))
  const amdBars = await request("/instruments/AMD/price-bars", { token })
  check("instruments.currency AMD price-bars unknown/null", amdBars.status === 200 && amdBars.json.currency === null, curPair(amdBars, "price-bars"))

  // §48.5 — the price endpoints honor ?currency= against the deterministic
  // demo schedule (DEMO_FX_DAYS days flat at DEMO_RATES, ending at the
  // series' last date): converted tail, unconverted head, fxFrom floor.
  const sntNative = await request("/instruments/SNT.WA/price-bars", { token })
  const sntUsd = await request("/instruments/SNT.WA/price-bars?currency=USD", { token })
  check(
    "instruments.currency price-bars ?currency=USD shape",
    sntUsd.status === 200 && sntUsd.json.currency === "USD" && sntUsd.json.baseCurrency === "PLN" && typeof sntUsd.json.fxFrom === "string" && sntUsd.json.closes.length === sntNative.json.closes.length,
    `got ${sntUsd.status} ${JSON.stringify(sntUsd.json && { currency: sntUsd.json.currency, baseCurrency: sntUsd.json.baseCurrency, fxFrom: sntUsd.json.fxFrom })}`,
  )
  if (sntUsd.status === 200 && sntNative.status === 200) {
    const dates = sntNative.json.dates
    const from = new Date(new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() - (DEMO_FX_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
    const fxFromExpected = dates.find((d) => d >= from) ?? null
    check("instruments.currency price-bars fxFrom = first converted bar", sntUsd.json.fxFrom === fxFromExpected, `got ${sntUsd.json.fxFrom} want ${fxFromExpected}`)
    const last = dates.length - 1
    const rate = DEMO_RATES.USD / DEMO_RATES.PLN
    check("instruments.currency price-bars last close converted", Math.abs(sntUsd.json.closes[last] - sntNative.json.closes[last] * rate) < 1e-6, `got ${sntUsd.json.closes[last]} want ${sntNative.json.closes[last] * rate}`)
    check("instruments.currency price-bars pre-window bar stays native", sntUsd.json.closes[0] === sntNative.json.closes[0], `got ${sntUsd.json.closes[0]} want ${sntNative.json.closes[0]}`)
  }
  const sntSame = await request("/instruments/SNT.WA/price-bars?currency=PLN", { token })
  check(
    "instruments.currency price-bars same-currency short-circuit",
    sntSame.status === 200 && sntSame.json.currency === "PLN" && sntSame.json.baseCurrency === "PLN" && sntSame.json.fxFrom === null && JSON.stringify(sntSame.json.closes) === JSON.stringify(sntNative.json.closes),
    `got ${sntSame.status} fxFrom=${sntSame.json && sntSame.json.fxFrom}`,
  )
  const sntBtc = await request("/instruments/SNT.WA/price-bars?currency=BTC", { token })
  check("instruments.currency price-bars unsupported target → 400", sntBtc.status === 400, `got ${sntBtc.status}`)
  const amdUsd = await request("/instruments/AMD/price-bars?currency=USD", { token })
  check("instruments.currency price-bars unknown base → 400", amdUsd.status === 400, `got ${amdUsd.status}`)
  const sntHistUsd = await request("/instruments/SNT.WA/history?resolution=daily&compare=spy&currency=USD", { token })
  check(
    "instruments.currency history ?currency=USD + compare shares it",
    sntHistUsd.status === 200 && sntHistUsd.json.currency === "USD" && sntHistUsd.json.baseCurrency === "PLN" && typeof sntHistUsd.json.fxFrom === "string" && sntHistUsd.json.compare && sntHistUsd.json.compare.currency === "USD",
    `got ${sntHistUsd.status} ${JSON.stringify(sntHistUsd.json && { currency: sntHistUsd.json.currency, compare: sntHistUsd.json.compare && sntHistUsd.json.compare.currency, fxFrom: sntHistUsd.json.fxFrom })}`,
  )

  // premium endpoints served in full
  for (const p of ["/instruments/MSFT/fundamentals", "/instruments/MSFT/ownership", "/instruments/MSFT/dividends", "/instruments/MSFT/calendar", "/instruments/MSFT/seasonality", "/instruments/MSFT/eps-surprises", "/instruments/MSFT/projections", "/instruments/MSFT/price?date=2026-08-11"]) {
    const r = await request(p, { token })
    check(`premium${p}`, r.status === 200 && isObj(r.json), `got ${r.status}`)
  }
  const fund = await request("/instruments/AAPL/fundamentals", { token })
  check("premium.fundamentals has 3 statements", fund.json.financialHighlights && ["incomeStatement", "balanceSheet", "cashFlow"].every((k) => Array.isArray(fund.json.financialHighlights[k]) && fund.json.financialHighlights[k].length > 0), JSON.stringify(fund.json).slice(0, 160))
  const ownership = await request("/instruments/AAPL/ownership", { token })
  check("premium.ownership has 3 groups", ["institutional", "mutualFund", "insider"].every((k) => Array.isArray(ownership.json[k]) && ownership.json[k].length > 0), JSON.stringify(ownership.json).slice(0, 160))
  const dividends = await request("/instruments/AAPL/dividends", { token })
  check("premium.dividends history", Array.isArray(dividends.json.history) && dividends.json.history.length >= 8, `len ${dividends.json.history && dividends.json.history.length}`)
  // §36 — a WSE (Polish) instrument carries PLN dividends, not a USD default
  const sntDividends = await request("/instruments/SNT/dividends", { token })
  check("premium.dividends SNT is PLN", sntDividends.status === 200 && Array.isArray(sntDividends.json.history) && sntDividends.json.history.length > 0 && sntDividends.json.history.every((r) => r.currency === "PLN"), JSON.stringify(sntDividends.json).slice(0, 160))
  const projections = await request("/instruments/AAPL/projections", { token })
  check("premium.projections", projections.json.priceTarget && projections.json.recommendation, JSON.stringify(projections.json).slice(0, 160))
  const seasonality = await request("/instruments/AAPL/seasonality?years=5&metric=avg", { token })
  check("premium.seasonality 12 months", Array.isArray(seasonality.json.monthly_returns) && seasonality.json.monthly_returns.length === 12, `len ${seasonality.json.monthly_returns && seasonality.json.monthly_returns.length}`)

  const ir = await request("/instruments/AAPL/investor-relations", { token })
  check("instruments.investor-relations", ir.status === 200 && Array.isArray(ir.json) && ir.json.length > 0, `got ${ir.status}`)
  const transcript = await request("/instruments/AAPL/investor-relations/AAPL_3500094/transcript", { token })
  check("instruments.ir transcript", transcript.status === 200 && transcript.json.transcript, `got ${transcript.status}`)

  const compare = await request("/charting/compare?symbols=AAPL,MSFT,NVDA", { token })
  check("charting.compare", compare.status === 200 && Array.isArray(compare.json) && compare.json.length === 3, `got ${compare.status} len ${compare.json && compare.json.length}`)
  const presets = await request("/charting/presets", { token })
  check("charting.presets", presets.status === 200, `got ${presets.status}`)

  // ── Plan 34 — no-price asset classes ─────────────────────────
  const npList = await request("/portfolios", { token })
  const npPortfolio = npList.json.find((p) => p.name === "NoPrice")
  check("no-price portfolio seeded", Boolean(npPortfolio), `portfolios ${JSON.stringify((npList.json || []).map((p) => p.name))}`)
  if (npPortfolio) {
    const npPos = await request(`/portfolios/${npPortfolio.id}/positions`, { token })
    check("no-price positions seeded", npPos.status === 200 && Array.isArray(npPos.json) && npPos.json.length === 3, `got ${npPos.status} len ${npPos.json && npPos.json.length}`)
    check(
      "no-price positions current-price parity",
      npPos.json.every((p) =>
        p.country === "Other" &&
        p.currentPrice > 0 &&
        p.marketValue === Math.round(p.quantity * p.currentPrice * 100) / 100 &&
        p.unrealizedGainLoss === Math.round(p.quantity * (p.currentPrice - p.averageCostBasis) * 100) / 100
      ),
      JSON.stringify((npPos.json || []).map((p) => ({ symbol: p.symbol, cur: p.currentPrice, mv: p.marketValue, pl: p.unrealizedGainLoss }))).slice(0, 220),
    )
    for (const p of npPos.json || []) {
      const q = await request(`/instruments/${encodeURIComponent(p.symbol)}/quote`, { token })
      check(
        `no-price quote ${p.symbol}`,
        q.status === 200 && q.json.currentPrice === p.currentPrice && q.json.currency === p.instrumentCurrency,
        `got ${q.status} ${JSON.stringify(q.json || {}).slice(0, 120)}`,
      )
      const price = await request(`/instruments/${encodeURIComponent(p.symbol)}/price`, { token })
      check(
        `no-price price ${p.symbol}`,
        price.status === 200 && price.json.price === p.currentPrice && price.json.currency === p.instrumentCurrency,
        `got ${price.status} ${JSON.stringify(price.json || {}).slice(0, 120)}`,
      )
    }
  }

  // ── Portfolios ──────────────────────────────────────────────
  const portfolios = await request("/portfolios", { token })
  check("portfolios.list", portfolios.status === 200 && Array.isArray(portfolios.json) && portfolios.json.length >= 1, `got ${portfolios.status} len ${portfolios.json && portfolios.json.length}`)
  const pid = portfolios.json[0].id
  for (const [name, p] of [
    ["/portfolios/light", ""],
    ["/portfolios/merged", ""],
    ["/portfolios/merged/light", ""],
    ["/portfolios/total-metrics", ""],
    ["/portfolios/held-stocks", ""],
    ["/portfolios/shares", ""],
    ["/portfolios/transactions", ""],
  ]) {
    const r = await request(name, { token })
    check(`portfolios${name}`, r.status === 200, `got ${r.status}`)
  }
  const detail2 = await request(`/portfolios/${pid}`, { token })
  check("portfolios.detail", detail2.status === 200 && detail2.json.id === pid, `got ${detail2.status}`)
  const merged1Y = await request("/portfolios/merged?timeframe=1Y", { token })
  const mergedAll = await request("/portfolios/merged?timeframe=ALL", { token })
  const lastMerged1Y = (merged1Y.json?.performance?.timeSeries ?? []).filter((p) => p.value > 0).pop()
  const lastMergedAll = (mergedAll.json?.performance?.timeSeries ?? []).filter((p) => p.value > 0).pop()
  check(
    "portfolios.merged serves the analytics fixture for 1Y + ALL",
    merged1Y.status === 200 && Array.isArray(merged1Y.json.performance.timeSeries) && merged1Y.json.performance.timeSeries.length > 0 &&
    mergedAll.status === 200 && Array.isArray(mergedAll.json.performance.timeSeries) && mergedAll.json.performance.timeSeries.length > 0,
    `${merged1Y.status} ${mergedAll.status}`,
  )
  check(
    "portfolios.merged last value absolute scale (> 10000, not an index)",
    lastMerged1Y?.value > 10000 && lastMergedAll?.value > 10000,
    `1Y ${lastMerged1Y?.value} ALL ${lastMergedAll?.value}`,
  )
  const summaryMetrics = await request(`/portfolios/${pid}/summary-metrics`, { token })
  check("portfolios.summary-metrics", summaryMetrics.status === 200 && "totalValue" in summaryMetrics.json, `got ${summaryMetrics.status}`)
  for (const tf of ["1W", "1M", "3M", "6M", "1Y", "2Y", "ALL"]) {
    const a = await request(`/portfolios/${pid}/analytics?timeframe=${tf}`, { token })
    check(`portfolios.analytics ${tf}`, a.status === 200 && a.json.performance && isObj(a.json.performance), `got ${a.status}`)
  }
  const aBench = await request(`/portfolios/${pid}/analytics?timeframe=ALL&benchmark=SPY`, { token })
  check("portfolios.analytics with benchmark", aBench.status === 200 && Array.isArray(aBench.json.benchmarks), `got ${aBench.status}`)
  const aMultibench = await request(`/portfolios/${pid}/analytics?timeframe=1Y&benchmarks=SPY,QQQ,IWM`, { token })
  check(
    "portfolios.analytics plural benchmarks",
    aMultibench.status === 200 && (aMultibench.json.benchmarks || []).map((b) => b.symbol).join(",") === "SPY,QQQ,IWM",
    `got ${aMultibench.status} ${(aMultibench.json.benchmarks || []).map((b) => b.symbol)}`,
  )
  const aNoBench = await request(`/portfolios/${pid}/analytics?timeframe=1Y`, { token })
  check("portfolios.analytics default benchmarks empty", Array.isArray(aNoBench.json.benchmarks) && aNoBench.json.benchmarks.length === 0, `len ${(aNoBench.json.benchmarks || []).length}`)
  const positions = await request(`/portfolios/${pid}/positions`, { token })
  check("portfolios.positions", positions.status === 200 && Array.isArray(positions.json) && positions.json.length === 10, `got ${positions.status} len ${positions.json && positions.json.length}`)
  check("portfolios.position fields", isObj(positions.json[0]) && hasKeys(positions.json[0], ["id", "symbol", "quantity", "averageCostBasis", "currentPrice", "marketValue"]), JSON.stringify(positions.json[0]).slice(0, 120))
  check(
    "portfolios.positions live price derived (mv = qty × current, p/l = qty × (current − avg))",
    positions.json.every((p) => p.currentPrice > 0 && p.marketValue === Math.round(p.quantity * p.currentPrice * 100) / 100 && p.unrealizedGainLoss === Math.round(p.quantity * (p.currentPrice - p.averageCostBasis) * 100) / 100),
    `first ${positions.json[0]?.symbol} cur ${positions.json[0]?.currentPrice} mv ${positions.json[0]?.marketValue}`,
  )
  const seededPrice = positions.json[0]
  check(
    "portfolios.positions current price is live, not the stored one",
    seededPrice.currentPrice === 740 && seededPrice.marketValue === 16280 && seededPrice.unrealizedGainLoss === 4093.98,
    JSON.stringify({ symbol: seededPrice.symbol, cur: seededPrice.currentPrice, mv: seededPrice.marketValue, pl: seededPrice.unrealizedGainLoss }).slice(0, 160),
  )
  const bare = await request(`/portfolios/${pid}/positions/bare`, { token })
  check("portfolios.positions.bare", bare.status === 200, `got ${bare.status}`)
  const cfd = await request(`/portfolios/${pid}/positions/cfd-hints`, { token })
  check("portfolios.positions.cfd-hints", cfd.status === 200, `got ${cfd.status}`)
  const txs = await request(`/portfolios/${pid}/transactions?page=1&limit=10`, { token })
  check("portfolios.transactions", txs.status === 200 && txs.json.total === 10 && txs.json.items.length === 10, `got ${txs.status} total ${txs.json && txs.json.total}`)
  check(
    "portfolios.transactions enriched sector/country",
    txs.status === 200 && txs.json.items.every((t) => typeof t.sector === "string" && t.sector.length > 0 && typeof t.country === "string" && t.country.length > 0),
    `first sector ${txs.json.items[0] && txs.json.items[0].sector}`,
  )
  const txsPage = await request(`/portfolios/${pid}/transactions?page=2&limit=4`, { token })
  check("portfolios.transactions paginated", txsPage.status === 200 && txsPage.json.items.length === 4 && txsPage.json.page === 2, `len ${txsPage.json.items.length} page ${txsPage.json.page}`)
  const txsDiv = await request(`/portfolios/${pid}/transactions?type=dividend`, { token })
  check("portfolios.transactions dividend filter", txsDiv.status === 200 && txsDiv.json.total === 0, `got ${txsDiv.status} total ${txsDiv.json && txsDiv.json.total}`)
  const txsExport = await request(`/portfolios/${pid}/transactions/export?format=csv`, { token })
  check("portfolios.transactions export", txsExport.status === 200 && Array.isArray(txsExport.json.items), `got ${txsExport.status}`)
  const feedAll = await request("/portfolios/transactions?page=1&limit=100", { token })
  const feedMsft = await request("/portfolios/transactions?page=1&limit=100&instrumentSymbol=msft", { token })
  const expectedMsft = feedAll.json.items.filter((t) => t.instrumentSymbol === "MSFT").length
  check(
    "portfolios.transactions feed instrumentSymbol filter (case-insensitive)",
    feedMsft.status === 200 &&
      feedMsft.json.total === expectedMsft &&
      expectedMsft >= 1 &&
      feedMsft.json.items.every((t) => t.instrumentSymbol === "MSFT"),
    `got ${feedMsft.status} total ${feedMsft.json.total} expected ${expectedMsft}`,
  )
  const pidMsft = await request(`/portfolios/${pid}/transactions?page=1&limit=100&instrumentSymbol=msft`, { token })
  check(
    "portfolios.transactions per-portfolio instrumentSymbol filter (case-insensitive)",
    pidMsft.status === 200 && pidMsft.json.total === 1 && pidMsft.json.items[0].instrumentSymbol === "MSFT",
    `got ${pidMsft.status} total ${pidMsft.json.total}`,
  )
  const pidNone = await request(`/portfolios/${pid}/transactions?page=1&limit=100&instrumentSymbol=aapl`, { token })
  check("portfolios.transactions instrumentSymbol no match → empty", pidNone.status === 200 && pidNone.json.total === 0, `got ${pidNone.status} total ${pidNone.json.total}`)
  const snapshot = await request(`/portfolios/${pid}/snapshot`, { token })
  check("portfolios.snapshot", snapshot.status === 200 && snapshot.json.allocation && Array.isArray(snapshot.json.allocation.bySector), `got ${snapshot.status}`)
  const risk = await request(`/portfolios/${pid}/risk-metrics`, { token })
  check("portfolios.risk-metrics", risk.status === 200 && "sharpeRatio" in risk.json, `got ${risk.status}`)

  // ── Portfolios: mutation lifecycle ──────────────────────────
  const created = await request("/portfolios", { method: "POST", token, body: { name: "TEST_TMP", description: "created by contract tests", strategy: "GROWTH", currency: "USD" } })
  check("portfolios.create → 201", created.status === 201 && created.json.name === "TEST_TMP", `got ${created.status}`)
  const cid = created.json.id
  const createdGet = await request(`/portfolios/${cid}`, { token })
  check("portfolios.create persists (GET)", createdGet.status === 200 && createdGet.json.id === cid, `got ${createdGet.status}`)
  const emptyPos = await request(`/portfolios/${cid}/positions`, { token })
  check("portfolios empty portfolio positions", Array.isArray(emptyPos.json) && emptyPos.json.length === 0, `len ${emptyPos.json.length}`)
  const emptyAnalytics = await request(`/portfolios/${cid}/analytics?timeframe=1Y`, { token })
  check("portfolios empty portfolio analytics", emptyAnalytics.status === 200 && emptyAnalytics.json.performance, `got ${emptyAnalytics.status}`)
  const emptyPoints = emptyAnalytics.json.performance.timeSeries.filter((p) => p.value > 0)
  check("portfolios empty portfolio analytics starts empty", emptyPoints.length === 0, `nonzero points ${emptyPoints.length}`)
  const recalcMissing = await request(`/portfolios/00000000-0000-0000-0000-000000000000/recompute`, { method: "POST", token })
  check("portfolios.recompute unknown id → 404", recalcMissing.status === 404, `got ${recalcMissing.status}`)
  const recalc = await request(`/portfolios/${cid}/recompute`, { method: "POST", token })
  check("portfolios.recompute → pending", recalc.status === 200 && recalc.json.backfillStatus === "pending", `got ${recalc.status} ${JSON.stringify(recalc.json)}`)
  const refilled = await request(`/portfolios/${cid}/analytics?timeframe=1Y`, { token })
  const refilledPoints = (refilled.json?.performance?.timeSeries ?? []).filter((p) => p.value > 0)
  check("portfolios.recompute fills empty analytics", refilled.status === 200 && refilledPoints.length > 0, `nonzero points ${refilledPoints.length}`)
  const addPos = await request(`/portfolios/${cid}/positions`, { method: "POST", token, body: { symbol: "MSFT", quantity: 3, price: 500 } })
  check("portfolios.positions.create → 201", addPos.status === 201 && addPos.json.symbol === "MSFT", `got ${addPos.status}`)
  const msftRows = await request(`/portfolios/${cid}/positions`, { token })
  const msftRow = msftRows.json.find((p) => p.symbol === "MSFT")
  check(
    "portfolios.positions created row uses live price (not the typed 500)", 
    msftRow && msftRow.currentPrice === 506.06 && msftRow.marketValue === 1518.18 && msftRow.unrealizedGainLoss === 18.18,
    `got ${JSON.stringify(msftRow || {}).slice(0, 160)}`,
  )
  const addPosFull = await request(`/portfolios/${cid}/positions`, {
    method: "POST",
    token,
    body: { symbol: "INTC", quantity: 10, price: 120, fees: 12, feesType: "pct", walletId: "wallet-1", executedAt: "2026-08-01T00:00:00.000Z" },
  })
  check(
    "portfolios.positions.create persists walletId/fees/feesType/executedAt",
    addPosFull.status === 201 &&
      addPosFull.json.walletId === "wallet-1" &&
      addPosFull.json.fees === 12 &&
      addPosFull.json.feesType === "pct" &&
      addPosFull.json.openedAt === "2026-08-01T00:00:00.000Z" &&
      addPosFull.json.costBasis === 1212,
    `got ${addPosFull.status}`,
  )
  const delPos = await request(`/portfolios/${cid}/positions/${addPos.json.id}`, { method: "DELETE", token })
  check("portfolios.positions.delete", delPos.status === 200 && delPos.json.isOpen === false, `got ${delPos.status}`)
  const upd = await request(`/portfolios/${cid}`, { method: "PATCH", token, body: { name: "TEST_TMP_RENAMED" } })
  check("portfolios.update", upd.status === 200 && upd.json.name === "TEST_TMP_RENAMED", `got ${upd.status}`)
  const del = await request(`/portfolios/${cid}`, { method: "DELETE", token })
  check("portfolios.delete → 204", del.status === 204, `got ${del.status}`)
  const gone = await request(`/portfolios/${cid}`, { token })
  check("portfolios deleted portfolio", gone.status === 200, `got ${gone.status}`)

  // ── Wallets ─────────────────────────────────────────────────
  const wallets = await request("/wallets", { token })
  check("wallets.list", wallets.status === 200 && Array.isArray(wallets.json) && wallets.json.length >= 1, `got ${wallets.status}`)
  const walletId = wallets.json[0].id
  const totalBalance = await request("/wallets/total-balance", { token })
  check("wallets.total-balance", totalBalance.status === 200 && "totalBalance" in totalBalance.json, `got ${totalBalance.status}`)
  const balanceHistory = await request(`/wallets/${walletId}/balance-history?period=90d&resolution=day`, { token })
  check("wallets.balance-history", balanceHistory.status === 200 && Array.isArray(balanceHistory.json.data) && balanceHistory.json.data.length > 50, `got ${balanceHistory.status} len ${balanceHistory.json.data.length}`)
  const walletTx = await request(`/wallets/${walletId}/transactions`, { token })
  check("wallets.transactions", walletTx.status === 200, `got ${walletTx.status}`)
  const deposit = await request(`/wallets/${walletId}/deposits`, { method: "POST", token, body: { amount: 100, description: "Test deposit", transaction_date: "2026-08-12", currency: "USD" } })
  check("wallets.deposit new fields", deposit.status === 201 && deposit.json.transaction_date === "2026-08-12" && deposit.json.new_balance === 2016.6 && deposit.json.remaining_balance === 2016.6, `got ${deposit.status} ${JSON.stringify(deposit.json).slice(0, 120)}`)
  const withdraw = await request(`/wallets/${walletId}/withdrawals`, { method: "POST", token, body: { amount: 50, payment_method: "bank_transfer", transaction_date: "2026-08-12" } })
  check("wallets.withdraw payment method", withdraw.status === 201 && withdraw.json.payment_method === "bank_transfer" && withdraw.json.remaining_balance === 1966.6, `got ${withdraw.status} ${JSON.stringify(withdraw.json).slice(0, 120)}`)
  const otherWalletId = wallets.json[1] ? wallets.json[1].id : null
  const srcBalanceBefore = withdraw.json.remaining_balance ?? wallets.json.find((w) => w.id === walletId).balance
  if (otherWalletId) {
    const transfer = await request(`/wallets/${walletId}/transfers`, { method: "POST", token, body: { amount: 100, to_wallet_id: otherWalletId, fees: 2, fees_type: "fixed", transaction_date: "2026-08-12" } })
    check("wallets.transfer fees + dest", transfer.status === 201 && transfer.json.to_wallet_id === otherWalletId && transfer.json.fees === 2, `got ${transfer.status} ${JSON.stringify(transfer.json).slice(0, 120)}`)
    const destWallet = await request("/wallets", { token })
    const destUpdated = destWallet.json.find((w) => w.id === otherWalletId)
    check("wallets.transfer credits destination", destUpdated && destUpdated.balance > wallets.json.find((w) => w.id === otherWalletId).balance, `got ${JSON.stringify(destUpdated).slice(0, 120)}`)
    const srcUpdated = destWallet.json.find((w) => w.id === walletId)
    check("wallets.transfer debits source", srcUpdated && srcUpdated.balance === Math.round((srcBalanceBefore - 102) * 100) / 100, `got ${JSON.stringify(srcUpdated).slice(0, 120)}`)
  } else {
    const newWallet = await request("/wallets", { method: "POST", token, body: { name: "Transfer dest", currency: "USD" } })
    const destId = newWallet.json.id
    const transfer = await request(`/wallets/${walletId}/transfers`, { method: "POST", token, body: { amount: 100, to_wallet_id: destId, fees: 2, fees_type: "fixed", transaction_date: "2026-08-12" } })
    check("wallets.transfer fees + dest", transfer.status === 201 && transfer.json.to_wallet_id === destId && transfer.json.fees === 2, `got ${transfer.status} ${JSON.stringify(transfer.json).slice(0, 120)}`)
    const destWallet = await request("/wallets", { token })
    const destUpdated = destWallet.json.find((w) => w.id === destId)
    check("wallets.transfer credits destination", destUpdated && destUpdated.balance === 100, `got ${JSON.stringify(destUpdated).slice(0, 120)}`)
    const srcUpdated = destWallet.json.find((w) => w.id === walletId)
    check("wallets.transfer debits source", srcUpdated && srcUpdated.balance === Math.round((srcBalanceBefore - 102) * 100) / 100, `got ${JSON.stringify(srcUpdated).slice(0, 120)}`)
    const delWallet = await request(`/wallets/${destId}`, { method: "DELETE", token })
    check(
      "wallets.transfer dest wallet delete → 409 (has transactions)",
      delWallet.status === 409 && /cannot be deleted/.test(delWallet.json.message),
      `got ${delWallet.status} ${JSON.stringify(delWallet.json).slice(0, 80)}`,
    )
  }
  const emptyWall = await request("/wallets", { method: "POST", token, body: { name: "Empty deletable", currency: "USD" } })
  const emptyWallId = emptyWall.json.id
  const delEmpty = await request(`/wallets/${emptyWallId}`, { method: "DELETE", token })
  check("wallets.empty wallet delete → 204", delEmpty.status === 204, `got ${delEmpty.status}`)
  const delSeed = await request(`/wallets/${walletId}`, { method: "DELETE", token })
  check("wallets.seeded wallet delete → 409", delSeed.status === 409, `got ${delSeed.status}`)
  const recent = await request("/wallets/recent-transactions?page=1&limit=10&sortBy=date&sortOrder=desc", { token })
  check("wallets.recent-transactions", recent.status === 200 && isObj(recent.json) && Array.isArray(recent.json.data) && isObj(recent.json.meta), `got ${recent.status}`)
  check("wallets.recent-transactions fields", recent.status === 200 && hasKeys(recent.json.data[0], ["id", "walletId", "walletName", "type", "displayLabel", "amount", "date"]), JSON.stringify(recent.json.data && recent.json.data[0]).slice(0, 120))
  check("wallets.recent-transactions total", recent.status === 200 && recent.json.meta.total === 19, `total ${recent.json.meta && recent.json.meta.total}`)
  const recentPg = await request("/wallets/recent-transactions?page=2&limit=5&sortBy=date&sortOrder=desc", { token })
  check("wallets.recent-transactions paginated", recentPg.status === 200 && recentPg.json.meta.page === 2 && recentPg.json.data.length === 5, `len ${recentPg.json.data.length} page ${recentPg.json.meta.page}`)
  const recentSorted = await request("/wallets/recent-transactions?page=1&limit=11&sortBy=amount&sortOrder=asc", { token })
  const amounts = recentSorted.json.data.map((t) => Number(t.amount))
  check("wallets.recent-transactions sorted asc", recentSorted.status === 200 && amounts.every((v, i) => i === 0 || amounts[i - 1] <= v), `amounts ${amounts.join(",")}`)
  const investTx = recent.json.data.find((t) => t.type === "INVEST")
  const patched = await request(`/wallets/transactions/${investTx.id}`, { method: "PATCH", token, body: { type: "WITHDRAWAL", amount: 100 } })
  check("wallets.recent PATCH recomputes label", patched.status === 200 && patched.json.displayLabel === "Withdrawal" && patched.json.amount.startsWith("-"), `got ${patched.status} ${patched.json.displayLabel} ${patched.json.amount}`)
  const delTx = await request(`/wallets/transactions/${investTx.id}`, { method: "DELETE", token })
  check("wallets.recent DELETE", delTx.status === 204, `got ${delTx.status}`)
  const afterDelete = await request("/wallets/recent-transactions?page=1&limit=11&sortBy=date&sortOrder=desc", { token })
  check("wallets.recent DELETE tombstones", afterDelete.status === 200 && afterDelete.json.meta.total === 18 && !afterDelete.json.data.some((t) => t.id === investTx.id), `total ${afterDelete.json.meta.total}`)
  const seedTx = (await request(`/wallets/${walletId}/transactions`, { token })).json.items.find((t) => t.id.startsWith("seed-"))
  const patchedSeed = await request(`/wallets/transactions/${seedTx.id}`, { method: "PATCH", token, body: { type: "WITHDRAWAL", amount: 50, description: "Edited" } })
  check("wallets.detail PATCH returns signed recent shape", patchedSeed.status === 200 && patchedSeed.json.displayLabel === "Withdrawal", `got ${patchedSeed.status} ${patchedSeed.json.displayLabel}`)
  const detailPatched = (await request(`/wallets/${walletId}/transactions`, { token })).json.items.find((t) => t.id === seedTx.id)
  check(
    "wallets.detail reflects recent PATCH (amount abs + type)",
    detailPatched && detailPatched.type === "WITHDRAWAL" && Number(detailPatched.amount) === 50 && detailPatched.description === "Edited",
    `found ${detailPatched && JSON.stringify({ type: detailPatched.type, amount: detailPatched.amount, description: detailPatched.description })}`,
  )
  await request(`/wallets/transactions/${seedTx.id}`, { method: "DELETE", token })
  const detailDeleted = (await request(`/wallets/${walletId}/transactions`, { token })).json.items.some((t) => t.id === seedTx.id)
  check("wallets.detail reflects recent DELETE", !detailDeleted, `deleted tx still present`)

  // ── Watchlists ──────────────────────────────────────────────
  const wl = await request("/watchlists", { token })
  check("watchlists.list", wl.status === 200 && Array.isArray(wl.json), `got ${wl.status}`)
  const wlCreated = await request("/watchlists", { method: "POST", token, body: { name: "Test WL" } })
  check("watchlists.create", wlCreated.status === 201, `got ${wlCreated.status}`)
  const wlItem = await request(`/watchlists/${wlCreated.json.id}/items`, { method: "POST", token, body: { symbol: "AAPL" } })
  check("watchlists.add item", wlItem.status === 201 && wlItem.json.items.length === 1, `got ${wlItem.status} len ${wlItem.json.items.length}`)
  const wlRemove = await request(`/watchlists/${wlCreated.json.id}/items/AAPL`, { method: "DELETE", token })
  check("watchlists.remove item", wlRemove.status === 200 && wlRemove.json.items.length === 0, `got ${wlRemove.status}`)
  const wlDel = await request(`/watchlists/${wlCreated.json.id}`, { method: "DELETE", token })
  check("watchlists.delete", wlDel.status === 204, `got ${wlDel.status}`)

  // ── Settings: users ─────────────────────────────────────────
  const userProfile = await request("/users/profile", { token })
  check("users.profile", userProfile.status === 200 && "email" in userProfile.json && "firstName" in userProfile.json, `got ${userProfile.status}`)
  const profileUpd = await request("/users/profile", { method: "PATCH", token, body: { firstName: "Demo", lastName: "User" } })
  check("users.profile update", profileUpd.status === 200 && profileUpd.json.firstName === "Demo", `got ${profileUpd.status}`)
  const profileRefetch = await request("/users/profile", { token })
  check("users.profile persists", profileRefetch.json.firstName === "Demo", `got ${profileRefetch.json.firstName}`)
  const recentUpd = await request("/users/profile", { method: "PATCH", token, body: { recentSearches: ["MSFT", "AAPL"] } })
  check("users.profile recentSearches update", recentUpd.status === 200 && recentUpd.json.recentSearches[0] === "MSFT", `got ${recentUpd.status}`)
  const recentRefetch = await request("/users/profile", { token })
  check("users.profile recentSearches persists", Array.isArray(recentRefetch.json.recentSearches) && recentRefetch.json.recentSearches.join(",") === "MSFT,AAPL", `got ${JSON.stringify(recentRefetch.json.recentSearches)}`)
  const pwBad = await request("/users/change-password", { method: "POST", token, body: { newPassword: "short" } })
  check("users.change-password rejects weak", pwBad.status === 422, `got ${pwBad.status}`)
  const pwOk = await request("/users/change-password", { method: "POST", token, body: { newPassword: "Str0ngPass" } })
  check("users.change-password ok", pwOk.status === 200, `got ${pwOk.status}`)
  const clearData = await request("/users/clear-data", { method: "POST", token })
  check("users.clear-data → 204", clearData.status === 204, `got ${clearData.status}`)
  const delAccount = await request("/users/account", { method: "DELETE", token })
  check("users.delete account → 204", delAccount.status === 204, `got ${delAccount.status}`)

  // ── Settings: notifications ─────────────────────────────────
  const notifPrefs = await request("/notifications/preferences", { token })
  check("notifications.preferences", notifPrefs.status === 200 && "newsEnabled" in notifPrefs.json, `got ${notifPrefs.status}`)
  const notifPrefsUpd = await request("/notifications/preferences", { method: "PATCH", token, body: { newsEnabled: false } })
  check("notifications.preferences update", notifPrefsUpd.status === 200 && notifPrefsUpd.json.newsEnabled === false, `got ${notifPrefsUpd.status}`)
  const notifPrefsRefetch = await request("/notifications/preferences", { token })
  check("notifications.preferences persists", notifPrefsRefetch.json.newsEnabled === false, `got ${notifPrefsRefetch.json.newsEnabled}`)

  // ── Settings: portfolio shares ──────────────────────────────
  const shares = await request("/portfolios/shares", { token })
  check("portfolios.shares", shares.status === 200 && Array.isArray(shares.json) && shares.json.length === 1, `got ${shares.status} len ${shares.json.length}`)
  const shareId = shares.json[0].id
  const publicShare = await request(`/public/portfolios/${shareId}`)
  check("public.share view", publicShare.status === 200 && publicShare.json.portfolio.name === "Top10", `got ${publicShare.status}`)
  const shareDelete = await request(`/portfolios/shares/${shareId}`, { method: "DELETE", token })
  check("portfolios.shares delete → 204", shareDelete.status === 204, `got ${shareDelete.status}`)
  const publicGone = await request(`/public/portfolios/${shareId}`)
  check("public.share deleted → 404", publicGone.status === 404, `got ${publicGone.status}`)

  // ── Copilot + Misc ──────────────────────────────────────────
  const conv = await request("/conversations", { token })
  check("copilot.conversations", conv.status === 200 && Array.isArray(conv.json.data), `got ${conv.status}`)
  const convCreated = await request("/conversations", { method: "POST", token, body: { title: "Test chat" } })
  check("copilot.create conversation", convCreated.status === 201, `got ${convCreated.status}`)
  const models = await request("/chatbot/models", { token })
  check("copilot.models", models.status === 200 && Array.isArray(models.json.models) && models.json.models.length > 0, `got ${models.status}`)
  const fx = await request("/exchange-rates", { token })
  check("misc.exchange-rates", fx.status === 200 && fx.json.conversion_rates.USD === 1, `got ${fx.status}`)
  const snap = await request("/snaptrade/status", { token })
  check("misc.snaptrade.status", snap.status === 200 && "isRegistered" in snap.json, `got ${snap.status}`)

  // ── Fees & FX (fees-and-custom-fx §10.2 round-trips) ───────
  {
    const cur = await request("/currencies", { token })
    const okShape =
      cur.status === 200 &&
      Array.isArray(cur.json?.currencies) &&
      cur.json.currencies.length >= 10 &&
      cur.json.currencies.every((c) => c.code && typeof c.minorUnits === "number")
    check("feesfx.currencies registry", okShape, `got ${cur.status}`)

    const fxUsdEur = await request("/fx/latest?from=USD&to=EUR", { token })
    check(
      "feesfx.fx-latest direct pair",
      fxUsdEur.status === 200 && Math.abs(fxUsdEur.json.rate - 1 / 1.08) < 1e-9 && fxUsdEur.json.asOf === "2026-08-22",
      `got ${fxUsdEur.status} ${JSON.stringify(fxUsdEur.json).slice(0, 120)}`,
    )
    const fxEurUsd = await request("/fx/latest?from=EUR&to=USD&date=2026-08-27", { token })
    check(
      "feesfx.fx-latest date ignored (single demo close)",
      fxEurUsd.status === 200 && Math.abs(fxEurUsd.json.rate - 1.08) < 1e-9,
      `got ${fxEurUsd.status} ${fxEurUsd.json.rate}`,
    )
    const fxCross = await request("/fx/latest?from=PLN&to=GBP", { token })
    check(
      "feesfx.fx-latest cross pair",
      fxCross.status === 200 && Math.abs(fxCross.json.rate - 0.85 / 4.3) < 1e-9,
      `got ${fxCross.status} ${fxCross.json.rate}`,
    )
    const fxNoParams = await request("/fx/latest?from=USD", { token })
    check("feesfx.fx-latest missing to → 400", fxNoParams.status === 400, `got ${fxNoParams.status}`)
    const fxUnknown = await request("/fx/latest?from=BTC&to=USD", { token })
    check("feesfx.fx-latest unknown pair → 422", fxUnknown.status === 422, `got ${fxUnknown.status}`)

    const adminFx = await request("/admin/currencies/rates", { token })
    check(
      "adminfx.requires admin auth",
      adminFx.status === 200 && Array.isArray(adminFx.json?.items) && adminFx.json?.pagination?.total >= 10,
      `got ${adminFx.status} ${JSON.stringify(adminFx.json || {}).slice(0, 120)}`,
    )
    const adminFxUsd = await request("/admin/currencies/rates?quote_currency=usd", { token })
    check(
      "adminfx.quote filter case-insensitive",
      adminFxUsd.status === 200 &&
        adminFxUsd.json.items.length === 1 &&
        adminFxUsd.json.items[0].quoteCurrency === "USD",
      `got ${adminFxUsd.status} ${JSON.stringify(adminFxUsd.json || {}).slice(0, 120)}`,
    )

    const usdWalletsBefore = await request("/wallets", { token })
    const createW = await request("/wallets", {
      method: "POST",
      token,
      body: { name: "FX test wallet", currency: "EUR" },
    })
    check("feesfx.create EUR wallet", createW.status === 201 && createW.json.currency === "EUR", `got ${createW.status}`)
    const eurId = createW.json.id

    // deposit without fees echoes resolved defaults (feeCurrency = tx ccy)
    const dep = await request(`/wallets/${eurId}/deposits`, {
      method: "POST",
      token,
      body: { amount: 1000, description: "fx seed" },
    })
    check(
      "feesfx.deposit defaults feeCurrency + auto rate",
      dep.status === 201 &&
        dep.json.feeCurrency === "EUR" &&
        dep.json.rateSource === "automatic" &&
        Math.abs(dep.json.exchangeRate - 1.08) < 1e-9,
      JSON.stringify(dep.json || {}).slice(0, 160),
    )

    // withdrawal with pct fee materialized on the fly (2% of 100)
    const wd = await request(`/wallets/${eurId}/withdrawals`, {
      method: "POST",
      token,
      body: { amount: 100, fees: 2, fees_type: "pct", description: "pct fee" },
    })
    check(
      "feesfx.withdrawal pct fee settled",
      wd.status === 201 && Number(wd.json.fees_settled) === 2 && wd.json.new_balance === 898,
      JSON.stringify(wd.json || {}).slice(0, 200),
    )

    // foreign-currency fee settles via demo rates (10 USD fee into EUR wallet)
    const wdf = await request(`/wallets/${eurId}/withdrawals`, {
      method: "POST",
      token,
      body: { amount: 10, fees: 10, fees_type: "fixed", feeCurrency: "USD", description: "usd fee" },
    })
    // 10 USD = 10/1.08 EUR ≈ 9.2593; balance math uses the settled amount
    check(
      "feesfx.foreign fee converted",
      wdf.status === 201 && Math.abs(Number(wdf.json.fees_settled) - 10 / 1.08) < 1e-6,
      JSON.stringify({ settled: wdf.json?.fees_settled }).slice(0, 120),
    )

    // manual exchange rate is echoed verbatim
    const manual = await request(`/wallets/${eurId}/deposits`, {
      method: "POST",
      token,
      body: { amount: 1, rateSource: "manual", exchangeRate: 4.5 },
    })
    check(
      "feesfx.manual main rate echoed",
      manual.status === 201 && manual.json.rateSource === "manual" && manual.json.exchangeRate === 4.5,
      JSON.stringify(manual.json || {}).slice(0, 160),
    )

    // invalid manual rates → 422
    const bad = await request(`/wallets/${eurId}/deposits`, {
      method: "POST",
      token,
      body: { amount: 1, rateSource: "manual", exchangeRate: -3 },
    })
    check("feesfx.negative manual rate → 422", bad.status === 422, `got ${bad.status}`)
    const badFee = await request(`/wallets/${eurId}/withdrawals`, {
      method: "POST",
      token,
      body: { amount: 1, fees: 1, feeRateSource: "manual", feeExchangeRate: 0 },
    })
    check("feesfx.zero manual fee rate → 422", badFee.status === 422, `got ${badFee.status}`)

    // cross-currency transfer credits target at demo cross rate
    const usdCreate = await request("/wallets", {
      method: "POST",
      token,
      body: { name: "FX target USD", currency: "USD" },
    })
    const usdId = usdCreate.json.id
    const xfer = await request(`/wallets/${eurId}/transfers`, {
      method: "POST",
      token,
      body: { amount: 43, to_wallet_id: usdId, description: "cross" },
    })
    // 43 EUR -> USD at 1.08 = 46.44
    check(
      "feesfx.cross transfer credited at rate",
      xfer.status === 201 && Math.abs(Number(xfer.json.target_amount) - 46.44) < 1e-6,
      JSON.stringify({ target: xfer.json?.target_amount, fxr: xfer.json?.transfer_fx_rate }).slice(0, 140),
    )
    const usdTxs = await request(`/wallets/${usdId}/transactions`, { token })
    check(
      "feesfx.transfer dest leg recorded",
      usdTxs.status === 200 && usdTxs.json.items.some((t) => t.amount === 46.44 || t.amount === 46.440000000000005),
      `items ${(usdTxs.json?.items || []).length}`,
    )

    // cleanup: created wallets hold transactions, so delete is blocked (mirrors real module)
    for (const id of [eurId, usdId]) {
      const del = await request(`/wallets/${id}`, { method: "DELETE", token })
      check("feesfx.created wallet delete → 409 (has transactions)", del.status === 409, `got ${del.status}`)
    }

    // portfolio transaction with manual rate drives converted outputs
    const portfolios = await request("/portfolios", { token })
    const pid2 = portfolios.json[0].id
    const ptx = await request(`/portfolios/${pid2}/transactions`, {
      method: "POST",
      token,
      body: {
        type: "BUY",
        symbol: "PKN.WA",
        quantity: 1,
        price: 40,
        currency: "PLN",
        fees: 2,
        feeCurrency: "EUR",
        rateSource: "manual",
        exchangeRate: 0.25,
      },
    })
    check(
      "feesfx.portfolio tx manual rate converts totals",
      ptx.status === 201 &&
        ptx.json.rateSource === "manual" &&
        ptx.json.exchangeRate === 0.25 &&
        Math.abs(ptx.json.convertedTotalAmount - 10) < 1e-9 &&
        ptx.json.convertedFees > 0,
      JSON.stringify(ptx.json || {}).slice(0, 220),
    )
    await request(`/portfolios/${pid2}/transactions/${ptx.json.id}`, { method: "DELETE", token })
  }

  // ── Dividends end-to-end (§49.7) — real rows + net math + wallet credit ──
  {
    const allPortfolios = await request("/portfolios", { token })
    const divPid = allPortfolios.json[0].id
    const allWalletsList = await request("/wallets", { token })
    const divWalletId = allWalletsList.json[0].id

    const divTx = await request(`/portfolios/${divPid}/transactions`, {
      method: "POST",
      token,
      body: {
        type: "DIVIDEND",
        symbol: "MSFT",
        quantity: 1,
        price: 100,
        taxes: 20,
        notes: "Q2 payout",
        walletId: divWalletId,
        executedAt: "2026-09-01T00:00:00.000Z",
      },
    })
    check(
      "dividends.create nets totalAmount (gross − taxes) and stores taxes/notes",
      divTx.status === 201 &&
        divTx.json.type === "DIVIDEND" &&
        divTx.json.totalAmount === 80 &&
        divTx.json.taxes === 20 &&
        divTx.json.notes === "Q2 payout" &&
        divTx.json.convertedTotalAmount === 80,
      JSON.stringify(divTx.json || {}).slice(0, 220),
    )
    const divId = divTx.json.id

    const divFilter = await request(`/portfolios/${divPid}/transactions?type=dividend`, { token })
    check(
      "dividends.type filter returns runtime DIVIDEND rows",
      divFilter.status === 200 && divFilter.json.total === 1 && divFilter.json.items[0].id === divId,
      `got ${divFilter.status} total ${divFilter.json.total}`,
    )

    const divRows = await request(`/portfolios/${divPid}/dividends`, { token })
    const divRow = divRows.json.items?.[0]
    check(
      "dividends.endpoint aggregates real rows (gross/tax/net/notes)",
      divRows.status === 200 &&
        divRows.json.count === 1 &&
        divRow &&
        divRow.symbol === "MSFT" &&
        divRow.gross === 100 &&
        divRow.taxes === 20 &&
        divRow.amount === 80 &&
        divRow.notes === "Q2 payout",
      JSON.stringify(divRows.json || {}).slice(0, 220),
    )

    const divCashList = await request(`/wallets/${divWalletId}/transactions`, { token })
    const divCash = divCashList.json.items.find((t) => t.id === `pf-${divId}`)
    check(
      "dividends.wallet credited net with PORTFOLIO reference",
      divCash && divCash.amount === 80 && divCash.reference === `PORTFOLIO_DIVIDEND_MSFT_${divId.slice(0, 8)}`,
      JSON.stringify(divCash || {}).slice(0, 180),
    )

    const divPatched = await request(`/portfolios/${divPid}/transactions/${divId}`, {
      method: "PATCH",
      token,
      body: { taxes: 30, notes: "Q2 payout (revised)" },
    })
    check(
      "dividends.patch re-nets totalAmount and updates notes",
      divPatched.status === 200 && divPatched.json.totalAmount === 70 && divPatched.json.taxes === 30,
      JSON.stringify(divPatched.json || {}).slice(0, 220),
    )
    const divCashList2 = await request(`/wallets/${divWalletId}/transactions`, { token })
    const divCash2 = divCashList2.json.items.find((t) => t.id === `pf-${divId}`)
    check("dividends.patch wallet entry adjusted (net delta −10)", divCash2 && divCash2.amount === 70, JSON.stringify(divCash2 || {}).slice(0, 180))

    const divBad = await request(`/portfolios/${divPid}/transactions`, {
      method: "POST",
      token,
      body: { type: "DIVIDEND", symbol: "MSFT", quantity: 1, price: 100, taxes: 120 },
    })
    check("dividends.taxes > gross → 422", divBad.status === 422, `got ${divBad.status}`)

    await request(`/portfolios/${divPid}/transactions/${divId}`, { method: "DELETE", token })
    const divRowsAfter = await request(`/portfolios/${divPid}/dividends`, { token })
    check("dividends.delete → rows removed", divRowsAfter.status === 200 && divRowsAfter.json.count === 0, `count ${divRowsAfter.json.count}`)
  }

  // ── Import (§23) ────────────────────────────────────────────
  const importSource = "mock:tests"
  const wb = await request("/import/wallets/bootstrap", {
    method: "POST",
    token,
    body: { externalSource: importSource, wallets: [{ name: "MockImport", currency: "usd" }] },
  })
  check(
    "import.wallets.bootstrap creates tagged wallet",
    wb.status === 200 && wb.json.wallets?.[0]?.created === true && wb.json.wallets[0].currency === "USD",
    JSON.stringify(wb.json || {}).slice(0, 160),
  )
  const wb2 = await request("/import/wallets/bootstrap", {
    method: "POST",
    token,
    body: { externalSource: importSource, wallets: [{ name: "MockImport", currency: "usd" }] },
  })
  check(
    "import.wallets.bootstrap is idempotent",
    wb2.status === 200 &&
      wb2.json.wallets?.[0]?.created === false &&
      wb2.json.wallets[0].id === wb.json.wallets[0].id,
    JSON.stringify(wb2.json || {}).slice(0, 160),
  )

  const pb = await request("/import/portfolios/bootstrap", {
    method: "POST",
    token,
    body: { externalSource: importSource, name: "MockImportP", currency: "USD" },
  })
  check("import.portfolios.bootstrap creates", pb.status === 200 && pb.json.created === true && pb.json.id, JSON.stringify(pb.json || {}).slice(0, 160))

  const importTxBody = {
    source: { externalSource: importSource, spreadsheetId: "spr-mock", sheet: "tx" },
    transactions: [
      {
        externalId: "mock-1",
        walletName: "MockImport",
        executedAt: new Date().toISOString(),
        walletTx: { type: "DEPOSIT", amount: 100, currency: "USD" },
      },
    ],
  }
  const itx = await request("/import/transactions", { method: "POST", token, body: importTxBody })
  check(
    "import.transactions inserts + syncRun",
    itx.status === 200 && itx.json.inserted === 1 && itx.json.skipped === 0 && itx.json.syncRun?.status === "done",
    JSON.stringify(itx.json || {}).slice(0, 160),
  )
  const itx2 = await request("/import/transactions", { method: "POST", token, body: importTxBody })
  check(
    "import.transactions is idempotent by externalId",
    itx2.status === 200 && itx2.json.inserted === 0 && itx2.json.skipped === 1,
    JSON.stringify(itx2.json || {}).slice(0, 160),
  )

  const runs = await request(`/import/sync-runs?externalSource=${encodeURIComponent(importSource)}`, { token })
  check(
    "import.sync-runs lists filtered runs",
    runs.status === 200 && runs.json.total === 1 && runs.json.items?.[0]?.externalSource === importSource,
    JSON.stringify(runs.json || {}).slice(0, 160),
  )

  const delRun = await request(`/import/sync-runs/${runs.json.items[0].id}`, { method: "DELETE", token })
  check("import.sync-runs delete → 204", delRun.status === 204, `got ${delRun.status}`)
  const delMissing = await request("/import/sync-runs/99999", { method: "DELETE", token })
  check("import.sync-runs delete missing → 404", delMissing.status === 404, `got ${delMissing.status}`)

  const wipe = await request(`/import/source/${importSource}`, { method: "DELETE", token })
  check(
    "import.source wipe removes tagged data",
    wipe.status === 200 &&
      wipe.json.deleted?.wallets === 1 &&
      wipe.json.deleted.portfolios === 1 &&
      wipe.json.deleted.walletTransactions === 1 &&
      wipe.json.deleted.syncRuns === 0,
    JSON.stringify(wipe.json || {}).slice(0, 160),
  )
  const runsAfter = await request("/import/sync-runs", { token })
  check("import.sync-runs empty after run delete", runsAfter.json.total === 0, JSON.stringify(runsAfter.json || {}).slice(0, 120))
  const wb3 = await request("/import/wallets/bootstrap", {
    method: "POST",
    token,
    body: { externalSource: importSource, wallets: [{ name: "MockImport", currency: "usd" }] },
  })
  check("import.wallets.bootstrap re-creates after wipe", wb3.json.wallets?.[0]?.created === true, JSON.stringify(wb3.json || {}).slice(0, 120))

  const split = await fetch(`http://localhost:${PORT}/internal/apply-split`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol: "AAPL", factor: 2, effectiveDate: "2024-01-01" }),
  })
  const splitJson = await split.json()
  check(
    "internal.apply-split no-op shape",
    split.status === 200 && splitJson.updatedTransactions === 0 && splitJson.affectedPortfolios === 0,
    JSON.stringify(splitJson),
  )

  // ── 404 + errors ────────────────────────────────────────────
  const nope = await request("/does/not/exist", { token })
  check("unknown route → 404", nope.status === 404, `got ${nope.status}`)
  const unknownSym = await request("/instruments/ZZZ/fundamentals", { token })
  check("unknown symbol fundamentals → 404", unknownSym.status === 404, `got ${unknownSym.status}`)

  child.kill()

  console.log(`\n[tests] ${passed} passed, ${failed} failed`)
  if (failures.length) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
