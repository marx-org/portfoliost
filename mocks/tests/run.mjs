import { spawn } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

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
  const summaryMetrics = await request(`/portfolios/${pid}/summary-metrics`, { token })
  check("portfolios.summary-metrics", summaryMetrics.status === 200 && "totalValue" in summaryMetrics.json, `got ${summaryMetrics.status}`)
  for (const tf of ["6M", "1Y", "2Y", "ALL"]) {
    const a = await request(`/portfolios/${pid}/analytics?timeframe=${tf}`, { token })
    check(`portfolios.analytics ${tf}`, a.status === 200 && a.json.performance && isObj(a.json.performance), `got ${a.status}`)
  }
  const aBench = await request(`/portfolios/${pid}/analytics?timeframe=ALL&benchmark=SPY`, { token })
  check("portfolios.analytics with benchmark", aBench.status === 200 && Array.isArray(aBench.json.benchmarks), `got ${aBench.status}`)
  const positions = await request(`/portfolios/${pid}/positions`, { token })
  check("portfolios.positions", positions.status === 200 && Array.isArray(positions.json) && positions.json.length === 10, `got ${positions.status} len ${positions.json && positions.json.length}`)
  check("portfolios.position fields", isObj(positions.json[0]) && hasKeys(positions.json[0], ["id", "symbol", "quantity", "averageCostBasis", "currentPrice", "marketValue"]), JSON.stringify(positions.json[0]).slice(0, 120))
  const bare = await request(`/portfolios/${pid}/positions/bare`, { token })
  check("portfolios.positions.bare", bare.status === 200, `got ${bare.status}`)
  const cfd = await request(`/portfolios/${pid}/positions/cfd-hints`, { token })
  check("portfolios.positions.cfd-hints", cfd.status === 200, `got ${cfd.status}`)
  const txs = await request(`/portfolios/${pid}/transactions?page=1&limit=10`, { token })
  check("portfolios.transactions", txs.status === 200 && txs.json.total === 10 && txs.json.items.length === 10, `got ${txs.status} total ${txs.json && txs.json.total}`)
  const txsPage = await request(`/portfolios/${pid}/transactions?page=2&limit=4`, { token })
  check("portfolios.transactions paginated", txsPage.status === 200 && txsPage.json.items.length === 4 && txsPage.json.page === 2, `len ${txsPage.json.items.length} page ${txsPage.json.page}`)
  const txsDiv = await request(`/portfolios/${pid}/transactions?type=dividend`, { token })
  check("portfolios.transactions dividend filter", txsDiv.status === 200 && txsDiv.json.total === 0, `got ${txsDiv.status} total ${txsDiv.json && txsDiv.json.total}`)
  const txsExport = await request(`/portfolios/${pid}/transactions/export?format=csv`, { token })
  check("portfolios.transactions export", txsExport.status === 200 && Array.isArray(txsExport.json.items), `got ${txsExport.status}`)
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
  const addPos = await request(`/portfolios/${cid}/positions`, { method: "POST", token, body: { symbol: "MSFT", quantity: 3, price: 500 } })
  check("portfolios.positions.create → 201", addPos.status === 201 && addPos.json.symbol === "MSFT", `got ${addPos.status}`)
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

  // ── Logos ───────────────────────────────────────────────────
  const logo = await fetch(`http://localhost:${PORT}/api/logos/AAPL`)
  check("logos placeholder svg", logo.status === 200 && logo.headers.get("content-type").includes("svg"), `got ${logo.status}`)

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
